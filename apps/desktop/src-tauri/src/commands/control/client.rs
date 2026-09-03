//! The Control API's client half (RFC 0034 R1, R7).
//!
//! Runs in `main.rs` **before Tauri init**, immediately after the existing
//! `local_flag_response` check — the same seam ADR 0047 established for Local
//! mode. That placement is what keeps a Control command from touching
//! `tauri-plugin-single-instance`, focusing a window, or waking a cold instance.
//!
//! [`control_request`] is pure and returns `None` for every invocation that is
//! not Control mode, so the existing Forward path is untouched (R12).
//!
//! Two rules the rendering keeps, because an agent's whole ability to script
//! this rests on them:
//!
//! - **`--json` puts the envelope on stdout and nothing else** — no warnings, no
//!   progress, no log lines — so one read parses cleanly.
//! - **A human-mode failure writes nothing to stdout**, so `x=$(silo …)`
//!   captures an empty string rather than an error message.

use std::io::{BufRead, BufReader, Write};
use std::time::{Duration, Instant};

use interprocess::local_socket::traits::Stream as _;
use interprocess::local_socket::Stream;

use super::disk_read;
use super::envelope::{Envelope, ErrorCode};
use super::status::{Status, Webview};

/// The client's own read deadline. Deliberately longer than the listener's
/// 5s webview deadline so a `timeout` normally arrives as a real envelope from
/// the instance rather than as the client's own guess.
const CLIENT_TIMEOUT: Duration = Duration::from_secs(8);

/// How long `--launch` waits for a launched (or still-starting) instance to
/// report `webview: "ready"`. A cold start has to build a window and boot a
/// webview; 30s is slow enough not to fail a loaded machine and short enough
/// that a wedged launch does not hang a script forever.
const LAUNCH_DEADLINE: Duration = Duration::from_secs(30);

/// Gap between readiness polls while `--launch` waits.
const LAUNCH_POLL: Duration = Duration::from_millis(250);

/// A parsed Control-mode invocation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ControlRequest {
    pub command: Command,
    pub args: serde_json::Value,
    /// The calling shell's canonicalized working directory.
    pub cwd: String,
    pub json: bool,
    pub launch: bool,
}

/// Which Control command was invoked.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Command {
    /// `silo status` — one `status` op.
    Status,
    /// `silo ws list` — disk rows, optionally annotated by `ws.live`.
    WsList,
    /// `silo agent run` — one `agent.run` op.
    AgentRun,
}

impl Command {
    /// The registry op this command sends, if any.
    fn op(self) -> Option<&'static str> {
        match self {
            Command::Status => Some("status"),
            Command::WsList => Some("ws.live"),
            Command::AgentRun => Some("agent.run"),
        }
    }
}

/// Parse an `argv` + `cwd` pair into a Control-mode request.
///
/// `None` means "not Control mode" — every Forward and Local invocation, so the
/// caller falls through to the existing dispatch untouched (R12). Mirrors
/// `resolve_cli_request`'s style: pure, canonicalizes `cwd` the same way, and
/// never panics on a malformed flag.
pub fn control_request(argv: &[String], cwd: &str) -> Option<ControlRequest> {
    // `--` forces path interpretation of everything after it (ADR 0047), so
    // `silo -- ws` opens a folder named `ws` and never reaches Control mode.
    if argv.iter().any(|a| a == "--") {
        return None;
    }

    let mut pos = argv.iter().skip(1).filter(|a| !a.starts_with('-'));
    let first = pos.next()?;
    let verb = pos.next();

    let command = match (first.as_str(), verb.map(String::as_str)) {
        ("status", _) => Command::Status,
        ("ws", Some("list")) => Command::WsList,
        ("agent", Some("run")) => Command::AgentRun,
        // `silo ws` and every other `ws` verb are a usage report, not a Control
        // request — handled by `resolve_cli_request`, which owns the reserved
        // nouns. Same for `silo agent <other>`.
        _ => return None,
    };

    let cwd = super::super::cli::canonical_cwd(cwd);
    let args = match command {
        Command::Status | Command::WsList => serde_json::json!({}),
        Command::AgentRun => {
            let mut args = serde_json::Map::new();
            if let Some(profile) = super::super::cli::flag_value(argv, "--profile") {
                args.insert("profileId".into(), profile.into());
            }
            if let Some(ws) = super::super::cli::workspace_flag(argv, &cwd) {
                args.insert("ws".into(), ws.into());
            }
            if let Some(prompt) = super::super::cli::flag_value(argv, "--prompt") {
                args.insert("prompt".into(), prompt.into());
            }
            serde_json::Value::Object(args)
        }
    };

    Some(ControlRequest {
        command,
        args,
        cwd,
        json: has_flag(argv, "--json"),
        launch: has_flag(argv, "--launch"),
    })
}

/// Whether a bare flag appears in argv.
fn has_flag(argv: &[String], name: &str) -> bool {
    argv.iter().skip(1).any(|a| a == name)
}

/// Reject what the client can judge **without an instance** (R4).
///
/// The boundary is syntactic vs. referential: a missing required flag or a
/// `--ws` value that is neither an existing path nor a `ws_`-prefixed id is
/// `invalid-args`, decided here with no connection attempt. Whether a
/// syntactically valid name actually *exists* is always the instance's answer,
/// and is `not-found`.
pub fn validate(req: &ControlRequest) -> Result<(), Envelope> {
    let bad = |msg: &str| Err(Envelope::err(ErrorCode::InvalidArgs, msg));

    if let Some(profile) = req.args.get("profileId").and_then(|v| v.as_str()) {
        if profile.trim().is_empty() {
            return bad("--profile needs a profile id");
        }
    }
    if let Some(ws) = req.args.get("ws").and_then(|v| v.as_str()) {
        // `workspace_flag` has already resolved a folder to an absolute path,
        // so what arrives here is either a `ws_` id or a path. A path that does
        // not exist is a typo the client can catch; an id's existence is not.
        if !ws.starts_with("ws_") && !std::path::Path::new(ws).exists() {
            return bad(&format!(
                "--ws \"{ws}\" is neither an existing folder nor a ws_ id"
            ));
        }
    }
    if let Some(prompt) = req.args.get("prompt").and_then(|v| v.as_str()) {
        if prompt.is_empty() {
            return bad("--prompt needs some text");
        }
        // Bounded here rather than at the listener's size cap, so an oversized
        // prompt is `invalid-args` (the caller's mistake) instead of `internal`.
        if prompt.len() > MAX_PROMPT_BYTES {
            return bad(&format!(
                "--prompt is {} bytes, over the {MAX_PROMPT_BYTES}-byte limit",
                prompt.len()
            ));
        }
    }
    if req.command == Command::WsList && req.launch {
        // `ws list` is Disk-read: it already answers with no app running, so
        // `--launch` could only mean "start Silo as a side effect of a read",
        // which R7 exists to forbid.
        return bad("`ws list` reads from disk and takes no --launch");
    }
    Ok(())
}

/// Prompt ceiling. Comfortably below the listener's 64 KiB request cap, leaving
/// room for the rest of the envelope.
const MAX_PROMPT_BYTES: usize = 32 * 1024;

/// Run a Control command to completion and return the process exit code.
///
/// Every path through this returns an exit code from the closed vocabulary —
/// there is no arm that exits 0 without an answer.
pub fn run(req: &ControlRequest) -> i32 {
    if let Err(envelope) = validate(req) {
        return render(req, &envelope);
    }
    let envelope = match req.command {
        Command::WsList => ws_list(req),
        _ => send(req),
    };
    render(req, &envelope)
}

/// One request, one response.
fn send(req: &ControlRequest) -> Envelope {
    let op = match req.command.op() {
        Some(op) => op,
        None => return Envelope::err(ErrorCode::Internal, "command sends no operation"),
    };

    if req.launch {
        if let Err(envelope) = ensure_running() {
            return envelope;
        }
    }
    request(op, &req.args, &req.cwd)
}

/// `silo ws list` — the disk rows are the answer; `ws.live` only annotates them
/// (R10).
fn ws_list(req: &ControlRequest) -> Envelope {
    let (disk, warnings) = disk_read::read_workspaces();
    for warning in &warnings {
        // stderr, never stdout: `--json` stdout has to stay parseable (R1).
        eprintln!("silo ws list: {warning}");
    }

    // A refused connect, an unready instance, or an op failure all degrade to
    // the disk-only answer rather than failing the listing.
    let live = request("ws.live", &serde_json::json!({}), &req.cwd);
    let overlay = live.data.as_ref().filter(|_| live.ok);

    let rows: Vec<serde_json::Value> = disk
        .iter()
        .map(|ws| {
            let mut row = serde_json::json!({
                "id": ws.id,
                "name": ws.name,
                "folder": ws.folder,
            });
            if let Some(entry) = overlay
                .and_then(|d| d.get("workspaces"))
                .and_then(|w| w.get(&ws.id))
            {
                row["open"] = entry.get("open").cloned().unwrap_or(serde_json::Value::Null);
                row["active"] = entry
                    .get("active")
                    .cloned()
                    .unwrap_or(serde_json::Value::Null);
            }
            row
        })
        .collect();

    Envelope::ok(serde_json::json!({
        // Says whether the annotation was applied, so a consumer can tell "not
        // open" from "unknown because nothing was running" (R10).
        "live": overlay.is_some(),
        "workspaces": rows,
    }))
}

/// Connect, send one request, read one response.
fn request(op: &str, args: &serde_json::Value, cwd: &str) -> Envelope {
    let stream = match connect() {
        Ok(s) => s,
        Err(envelope) => return envelope,
    };
    let _ = stream.set_recv_timeout(Some(CLIENT_TIMEOUT));
    let _ = stream.set_send_timeout(Some(CLIENT_TIMEOUT));

    let line = serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "op": op,
        "args": args,
        "cwd": cwd,
    })
    .to_string();

    let mut out = &stream;
    if out.write_all(line.as_bytes()).is_err() || out.write_all(b"\n").is_err() {
        return Envelope::err(ErrorCode::Internal, "could not send the request to Silo");
    }
    let _ = out.flush();

    let mut response = String::new();
    match BufReader::new(&stream).read_line(&mut response) {
        Ok(0) => Envelope::err(ErrorCode::Internal, "Silo closed the connection"),
        Ok(_) => parse_response(response.trim()),
        Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => Envelope::err(
            ErrorCode::Timeout,
            format!("Silo did not answer within {}s", CLIENT_TIMEOUT.as_secs()),
        ),
        Err(e) => Envelope::err(ErrorCode::Internal, format!("could not read a reply: {e}")),
    }
}

/// A response the client cannot parse is `internal` — never a crash and never a
/// silent success (R3).
fn parse_response(line: &str) -> Envelope {
    match serde_json::from_str::<Envelope>(line) {
        Ok(envelope) => envelope,
        Err(e) => Envelope::err(
            ErrorCode::Internal,
            format!("could not parse Silo's reply: {e}"),
        ),
    }
}

/// Open a connection, or the envelope explaining why not.
fn connect() -> Result<Stream, Envelope> {
    let name = super::paths::name().map_err(|e| {
        Envelope::err(
            ErrorCode::Internal,
            format!("could not resolve Silo's control socket: {e}"),
        )
    })?;
    Stream::connect(name).map_err(|_| {
        Envelope::err(
            ErrorCode::NotRunning,
            "Silo is not running. Start it, or pass --launch to start it now.",
        )
    })
}

/// What a `status` probe found.
///
/// The middle case is the whole reason this is not a `bool`: an instance that is
/// **listening but not yet ready** must be *waited on*, never launched again
/// (R7). The socket is bound at process start, so a mid-startup instance answers
/// `status` for the entire time its webview is still coming up — a window of
/// seconds during which "not ready" and "not running" look identical to a caller
/// that only asks "can it serve me yet?".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Liveness {
    /// Nothing is listening on this identity's socket.
    Absent,
    /// An instance is alive, but its webview cannot serve ops yet.
    Starting,
    /// An instance is alive and serving.
    Ready,
}

/// Whether `--launch` should start a process, given what the probe found.
///
/// Only [`Liveness::Absent`] does. [`Liveness::Starting`] is the case this
/// function exists to get right: an instance that is alive but whose webview has
/// not registered yet must be **waited on**, never launched again. Spawning
/// there would hand a Control invocation to `tauri-plugin-single-instance`,
/// which raises the still-starting window and forwards argv the Forward path
/// does not understand — a visible side effect from what the caller asked to be
/// a wait.
fn should_spawn(found: Liveness) -> bool {
    matches!(found, Liveness::Absent)
}

/// `--launch`: make sure a **ready** instance exists (R7).
///
/// Polls readiness, not socket existence, so a request is never delivered to an
/// instance whose webview cannot yet answer it — and an instance that is already
/// running but mid-startup is waited on rather than duplicated.
fn ensure_running() -> Result<(), Envelope> {
    let found = probe()?;
    if found == Liveness::Ready {
        return Ok(());
    }
    if should_spawn(found) {
        if let Err(e) = spawn_app() {
            return Err(Envelope::err(
                ErrorCode::Failed,
                format!("could not launch Silo: {e}"),
            ));
        }
    }

    let deadline = Instant::now() + LAUNCH_DEADLINE;
    while Instant::now() < deadline {
        std::thread::sleep(LAUNCH_POLL);
        if probe()? == Liveness::Ready {
            return Ok(());
        }
    }
    Err(Envelope::err(
        ErrorCode::Timeout,
        format!(
            "Silo did not become ready within {}s",
            LAUNCH_DEADLINE.as_secs()
        ),
    ))
}

/// Ask the socket what is there.
///
/// An error other than `not-running` stops the wait rather than burning the
/// deadline: a malformed reply or a socket-level failure is not something more
/// waiting will fix.
fn probe() -> Result<Liveness, Envelope> {
    let envelope = request("status", &serde_json::json!({}), "");
    if !envelope.ok {
        let code = envelope.error.as_ref().map(|e| e.code);
        return match code {
            Some(ErrorCode::NotRunning) => Ok(Liveness::Absent),
            _ => Err(envelope),
        };
    }
    let status: Status = match envelope
        .data
        .clone()
        .map(serde_json::from_value)
        .transpose()
    {
        Ok(Some(s)) => s,
        _ => {
            return Err(Envelope::err(
                ErrorCode::Internal,
                "could not read Silo's status reply",
            ))
        }
    };
    Ok(match status.webview {
        Webview::Ready => Liveness::Ready,
        Webview::Starting => Liveness::Starting,
    })
}

/// Start the platform's **app entry point**, detached.
///
/// The macOS `.app` bundle rather than the inner binary, so the launched
/// instance is a normal, window-server-registered app — running
/// `Silo.app/Contents/MacOS/silo` directly produces a process the Dock and the
/// window server treat as a stray CLI tool.
fn spawn_app() -> std::io::Result<()> {
    let exe = std::env::current_exe()?;

    #[cfg(target_os = "macos")]
    {
        // `…/Silo.app/Contents/MacOS/silo` → `…/Silo.app`. A bare `cargo run`
        // binary has no bundle above it; fall through to exec'ing it directly.
        if let Some(bundle) = exe.ancestors().find(|p| {
            p.extension().and_then(|s| s.to_str()) == Some("app")
        }) {
            return std::process::Command::new("/usr/bin/open")
                .arg("-a")
                .arg(bundle)
                .spawn()
                .map(|_| ());
        }
    }

    std::process::Command::new(exe)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map(|_| ())
}

/// Print the answer and return the exit code.
fn render(req: &ControlRequest, envelope: &Envelope) -> i32 {
    if req.json {
        // The envelope and nothing else, so a single read parses cleanly (R1).
        print!("{}", envelope.to_line());
        return envelope.exit_code();
    }

    match &envelope.error {
        // stdout stays empty on a failure, so `x=$(silo …)` captures "" rather
        // than an error message (R1).
        Some(err) => eprintln!("silo: {}", err.message),
        None => {
            let text = render_human(req.command, envelope.data.as_ref());
            if !text.is_empty() {
                print!("{text}");
            }
        }
    }
    envelope.exit_code()
}

/// Human-readable rendering of a successful `data` payload.
fn render_human(command: Command, data: Option<&serde_json::Value>) -> String {
    let Some(data) = data else {
        return String::new();
    };
    match command {
        Command::Status => serde_json::from_value::<Status>(data.clone())
            .map(|s| super::status::render(&s))
            .unwrap_or_default(),
        Command::WsList => render_ws_table(data),
        Command::AgentRun => {
            let terminal = data
                .get("terminalId")
                .and_then(|v| v.as_str())
                .unwrap_or("?");
            let workspace = data
                .get("workspaceName")
                .and_then(|v| v.as_str())
                .or_else(|| data.get("workspaceId").and_then(|v| v.as_str()))
                .unwrap_or("?");
            format!("Started {terminal} in {workspace}\n")
        }
    }
}

/// `silo ws list` without `--json`: a readable table of the same data (R10).
///
/// The `STATE` column is omitted entirely when no instance annotated the rows,
/// because a column of blanks reads as "none of these are open" rather than as
/// "nothing was running to ask".
fn render_ws_table(data: &serde_json::Value) -> String {
    let live = data.get("live").and_then(|v| v.as_bool()).unwrap_or(false);
    let rows = data
        .get("workspaces")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    if rows.is_empty() {
        return "No workspaces.\n".to_string();
    }

    let cell = |row: &serde_json::Value, key: &str| {
        row.get(key)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };
    let state = |row: &serde_json::Value| match (
        row.get("active").and_then(|v| v.as_bool()),
        row.get("open").and_then(|v| v.as_bool()),
    ) {
        (Some(true), _) => "active".to_string(),
        (_, Some(true)) => "open".to_string(),
        (_, Some(false)) => "closed".to_string(),
        _ => String::new(),
    };

    let id_w = rows
        .iter()
        .map(|r| cell(r, "id").len())
        .chain(std::iter::once(2))
        .max()
        .unwrap_or(2);
    let name_w = rows
        .iter()
        .map(|r| cell(r, "name").len())
        .chain(std::iter::once(4))
        .max()
        .unwrap_or(4);

    let mut out = String::new();
    for row in &rows {
        let line = if live {
            format!(
                "{:<id_w$}  {:<name_w$}  {:<6}  {}\n",
                cell(row, "id"),
                cell(row, "name"),
                state(row),
                cell(row, "folder"),
            )
        } else {
            format!(
                "{:<id_w$}  {:<name_w$}  {}\n",
                cell(row, "id"),
                cell(row, "name"),
                cell(row, "folder"),
            )
        };
        out.push_str(line.trim_end());
        out.push('\n');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn argv(args: &[&str]) -> Vec<String> {
        std::iter::once("silo".to_string())
            .chain(args.iter().map(|s| s.to_string()))
            .collect()
    }

    fn parse(args: &[&str]) -> Option<ControlRequest> {
        control_request(&argv(args), "/")
    }

    #[test]
    fn recognizes_every_control_verb() {
        assert_eq!(parse(&["status"]).unwrap().command, Command::Status);
        assert_eq!(parse(&["ws", "list"]).unwrap().command, Command::WsList);
        assert_eq!(parse(&["agent", "run"]).unwrap().command, Command::AgentRun);
    }

    #[test]
    fn returns_none_for_every_forward_and_local_invocation() {
        // Forward mode and the reserved-noun usage reports stay with
        // `resolve_cli_request` — Control mode must not shadow them (R12).
        assert!(parse(&[]).is_none());
        assert!(parse(&["/some/path"]).is_none());
        assert!(parse(&["install", "acme.weather"]).is_none());
        assert!(parse(&["uninstall", "acme.weather"]).is_none());
        assert!(parse(&["agent"]).is_none());
        assert!(parse(&["agent", "list"]).is_none());
        assert!(parse(&["ws"]).is_none());
        assert!(parse(&["ws", "open"]).is_none());
        assert!(parse(&["--help"]).is_none());
    }

    #[test]
    fn double_dash_still_forces_a_path() {
        // `silo -- ws` opens a folder named `ws`; it must not become `ws list`.
        assert!(control_request(&argv(&["--", "ws"]), "/").is_none());
        assert!(control_request(&argv(&["--", "status"]), "/").is_none());
        assert!(control_request(&argv(&["--", "ws", "list"]), "/").is_none());
    }

    #[test]
    fn parses_flags_in_both_forms() {
        let req = parse(&["agent", "run", "--profile", "claude", "--json"]).unwrap();
        assert_eq!(req.args["profileId"], serde_json::json!("claude"));
        assert!(req.json);
        assert!(!req.launch);

        let req = parse(&["agent", "run", "--profile=codex", "--launch"]).unwrap();
        assert_eq!(req.args["profileId"], serde_json::json!("codex"));
        assert!(req.launch);
        assert!(!req.json);
    }

    #[test]
    fn a_ws_id_passes_through_and_a_folder_is_resolved() {
        let req = control_request(&argv(&["agent", "run", "--ws", "ws_abc"]), "/").unwrap();
        assert_eq!(req.args["ws"], serde_json::json!("ws_abc"));

        // A relative folder resolves against the forwarding shell's cwd.
        let tmp = std::env::temp_dir();
        let req = control_request(
            &argv(&["agent", "run", "--ws", "."]),
            &tmp.to_string_lossy(),
        )
        .unwrap();
        assert!(req.args["ws"].as_str().unwrap().starts_with('/'));
    }

    #[test]
    fn a_prompt_is_carried_verbatim() {
        // Opaque to this layer — RFC 0033 owns sanitizing and delivery.
        let req = parse(&["agent", "run", "--prompt", "fix the build"]).unwrap();
        assert_eq!(req.args["prompt"], serde_json::json!("fix the build"));
    }

    #[test]
    fn status_and_ws_list_send_no_arguments() {
        assert_eq!(parse(&["status"]).unwrap().args, serde_json::json!({}));
        assert_eq!(parse(&["ws", "list"]).unwrap().args, serde_json::json!({}));
    }

    #[test]
    fn a_malformed_ws_is_invalid_args_without_connecting() {
        // Syntactic: neither an existing folder nor a `ws_` id (R4). Decided
        // here, so no socket is touched.
        let req = ControlRequest {
            command: Command::AgentRun,
            args: serde_json::json!({ "ws": "/definitely/not/here" }),
            cwd: "/".into(),
            json: false,
            launch: false,
        };
        let err = validate(&req).expect_err("a nonexistent folder is rejected locally");
        assert_eq!(err.error.unwrap().code, ErrorCode::InvalidArgs);
    }

    #[test]
    fn a_well_formed_unknown_name_is_not_rejected_locally() {
        // Referential: whether `ws_nope` exists is the instance's answer
        // (`not-found`), never the client's guess.
        let req = ControlRequest {
            command: Command::AgentRun,
            args: serde_json::json!({ "ws": "ws_nope", "profileId": "claude" }),
            cwd: "/".into(),
            json: false,
            launch: false,
        };
        assert!(validate(&req).is_ok());
    }

    #[test]
    fn empty_flag_values_are_invalid_args() {
        for args in [
            serde_json::json!({ "profileId": "   " }),
            serde_json::json!({ "prompt": "" }),
        ] {
            let req = ControlRequest {
                command: Command::AgentRun,
                args,
                cwd: "/".into(),
                json: false,
                launch: false,
            };
            let err = validate(&req).expect_err("an empty value is a usage error");
            assert_eq!(err.error.unwrap().code, ErrorCode::InvalidArgs);
        }
    }

    #[test]
    fn an_oversized_prompt_is_invalid_args_not_internal() {
        // Over the cap it is the caller's mistake, so it must not arrive as
        // "Silo is broken" from the listener's size check.
        let req = ControlRequest {
            command: Command::AgentRun,
            args: serde_json::json!({ "prompt": "x".repeat(MAX_PROMPT_BYTES + 1) }),
            cwd: "/".into(),
            json: false,
            launch: false,
        };
        let err = validate(&req).unwrap_err();
        assert_eq!(err.error.unwrap().code, ErrorCode::InvalidArgs);
        assert!(MAX_PROMPT_BYTES < 64 * 1024, "must fit the listener's cap");
    }

    #[test]
    fn ws_list_rejects_launch() {
        let req = parse(&["ws", "list", "--launch"]).unwrap();
        let err = validate(&req).expect_err("a Disk-read command takes no --launch");
        assert_eq!(err.error.unwrap().code, ErrorCode::InvalidArgs);
    }

    #[test]
    fn launch_starts_a_process_only_when_nothing_is_listening() {
        // The middle case is the one that matters: an instance whose socket is
        // bound but whose webview has not registered yet is *starting*, and
        // `--launch` must wait for it rather than spawn a second process (R7).
        // The socket binds at process start, so this window is every cold
        // launch's first few seconds — not a rare race.
        assert!(should_spawn(Liveness::Absent));
        assert!(!should_spawn(Liveness::Starting));
        assert!(!should_spawn(Liveness::Ready));
    }

    #[test]
    fn a_starting_instance_is_not_the_same_as_no_instance() {
        // Guards the distinction itself: collapsing these two into one "not
        // ready" answer is what made `--launch` duplicate a starting app.
        assert_ne!(Liveness::Starting, Liveness::Absent);
        assert_ne!(Liveness::Starting, Liveness::Ready);
    }

    #[test]
    fn every_command_maps_to_a_registered_op() {
        // The client cannot ask for something the allowlist would deny.
        for command in [Command::Status, Command::WsList, Command::AgentRun] {
            let op = command.op().expect("every command sends an op");
            assert!(
                super::super::registry::lookup(op).is_some(),
                "{op} is not in the registry"
            );
        }
    }

    #[test]
    fn ws_table_omits_the_state_column_when_nothing_annotated_it() {
        // A column of blanks would read as "none of these are open" rather than
        // "nothing was running to ask" (R10).
        let data = serde_json::json!({
            "live": false,
            "workspaces": [{ "id": "ws_1", "name": "Silo", "folder": "/src/silo" }],
        });
        let table = render_ws_table(&data);
        assert!(table.contains("ws_1"), "{table}");
        assert!(table.contains("/src/silo"), "{table}");
        assert!(!table.contains("open"), "{table}");
        assert!(!table.contains("closed"), "{table}");
    }

    #[test]
    fn ws_table_shows_state_when_annotated() {
        let data = serde_json::json!({
            "live": true,
            "workspaces": [
                { "id": "ws_1", "name": "Silo", "folder": "/s", "open": true, "active": true },
                { "id": "ws_2", "name": "Docs", "folder": "/d", "open": true, "active": false },
                { "id": "ws_3", "name": "Old",  "folder": "/o", "open": false, "active": false },
            ],
        });
        let table = render_ws_table(&data);
        assert!(table.contains("active"), "{table}");
        assert!(table.contains("open"), "{table}");
        assert!(table.contains("closed"), "{table}");
    }

    #[test]
    fn ws_table_says_so_when_there_are_none() {
        let data = serde_json::json!({ "live": true, "workspaces": [] });
        assert_eq!(render_ws_table(&data), "No workspaces.\n");
    }

    #[test]
    fn agent_run_reports_the_terminal_it_created() {
        let text = render_human(
            Command::AgentRun,
            Some(&serde_json::json!({ "terminalId": "t_9", "workspaceName": "Silo" })),
        );
        assert!(text.contains("t_9"), "{text}");
        assert!(text.contains("Silo"), "{text}");
    }
}
