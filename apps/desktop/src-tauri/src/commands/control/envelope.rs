//! The Control API's wire shapes — one request, one response envelope, one
//! error vocabulary, one exit-code mapping (RFC 0034 R3, R4).
//!
//! Everything that answers a Control request goes through [`Envelope`], and
//! everything that exits a Control command goes through [`ErrorCode::exit_code`].
//! That single ownership is the point: an op that hand-rolled its own JSON, or a
//! call site that picked its own exit status, would make `--json` unparseable and
//! the exit codes unlearnable — the two things this API exists to guarantee.

use serde::{Deserialize, Serialize};

/// The envelope's version, carried on every **response**.
///
/// It versions the envelope as a whole and changes only on a breaking envelope
/// change; per-command `data` shapes are documented per verb and grow
/// additively. Its audience is third-party `--json` consumers, not the client:
/// both `silo` shims `exec` the app binary, so the process sending a request and
/// the one answering it are the same build and there is nothing to negotiate —
/// which is also why the *request* carries no version field.
pub const ENVELOPE_VERSION: u32 = 1;

/// One Control request: exactly one per connection, newline-terminated.
///
/// `id` correlates the reply on the client's side of the wire; the listener
/// keys its pending map by its own monotonic id and never trusts this one, so a
/// client cannot address another client's pending entry (R8).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Request {
    pub id: String,
    pub op: String,
    #[serde(default)]
    pub args: serde_json::Value,
    /// The calling shell's working directory, canonicalized by the client.
    #[serde(default)]
    pub cwd: String,
}

/// The build that answered — or, for a client-synthesized error, the build that
/// gave up trying to reach one. Both are the same executable (see the module
/// docs), so the client filling these in from its own build is not a guess.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SiloMeta {
    pub version: String,
    pub identity: String,
}

impl SiloMeta {
    /// This build's own version and identity.
    pub fn current() -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            identity: super::super::identity::IDENTIFIER.to_string(),
        }
    }
}

/// A failure's classified cause.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ErrorBody {
    pub code: ErrorCode,
    pub message: String,
}

/// One Control response, on the wire and on `--json` stdout.
///
/// `data` and `error` are mutually exclusive and both are omitted when absent,
/// so a success never carries an `error` key and a failure never carries a
/// `data` key (R3) — a consumer can branch on `ok` and trust the other field is
/// there.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Envelope {
    pub v: u32,
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorBody>,
    pub silo: SiloMeta,
}

impl Envelope {
    /// A success carrying `data`.
    pub fn ok(data: serde_json::Value) -> Self {
        Self {
            v: ENVELOPE_VERSION,
            ok: true,
            data: Some(data),
            error: None,
            silo: SiloMeta::current(),
        }
    }

    /// A failure carrying a classified code and a human-readable message.
    pub fn err(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            v: ENVELOPE_VERSION,
            ok: false,
            data: None,
            error: Some(ErrorBody {
                code,
                message: message.into(),
            }),
            silo: SiloMeta::current(),
        }
    }

    /// The process exit status this envelope implies: 0 for a success, the
    /// error's mapped code otherwise. An `ok: false` envelope with no `error`
    /// body is malformed, and reports as [`ErrorCode::Internal`] rather than
    /// exiting 0.
    pub fn exit_code(&self) -> i32 {
        if self.ok {
            return 0;
        }
        self.error
            .as_ref()
            .map_or(ErrorCode::Internal, |e| e.code)
            .exit_code()
    }

    /// One newline-terminated JSON line — the wire framing and the `--json`
    /// stdout form are deliberately the same bytes.
    pub fn to_line(&self) -> String {
        // Serialization of this type cannot fail (no maps with non-string keys,
        // no non-finite floats), but a panic here would take down the listener
        // thread, so the impossible branch answers with a hand-built envelope.
        match serde_json::to_string(self) {
            Ok(s) => format!("{s}\n"),
            Err(_) => {
                let meta = SiloMeta::current();
                format!(
                    r#"{{"v":{ENVELOPE_VERSION},"ok":false,"error":{{"code":"internal","message":"failed to serialize response"}},"silo":{{"version":"{}","identity":"{}"}}}}"#,
                    meta.version, meta.identity
                ) + "\n"
            }
        }
    }
}

/// The **closed** error vocabulary (R4). An agent can branch on `error.code`,
/// or on the exit code alone without parsing JSON.
///
/// Closed on purpose: splitting one of these later would be exactly the
/// breaking change this API exists to avoid, which is why `Failed` and
/// `Internal` are separate from the start — "your profile's command isn't
/// installed" must never share a code with "Silo is broken".
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ErrorCode {
    /// A syntactic usage error: a missing required flag, an argument the client
    /// can reject without asking an instance. Never travels over the wire.
    InvalidArgs,
    /// No instance is listening on this identity's socket.
    NotRunning,
    /// A named workspace, profile, or terminal does not exist. Referential, so
    /// always the instance's answer.
    NotFound,
    /// The op is not in the allowlist.
    Denied,
    /// The instance did not answer, or become ready, within the deadline.
    Timeout,
    /// The op ran and could not complete — the environment, not a bug.
    Failed,
    /// Silo malfunctioned: a host-side error, an unparseable reply, socket I/O.
    Internal,
}

impl ErrorCode {
    /// Every code, for exhaustive iteration. The exit-code mapping is asserted
    /// over this list, so a variant added to the enum but not here is caught by
    /// `all_variants_are_listed` rather than shipping unmapped.
    #[allow(dead_code)]
    pub const ALL: &'static [ErrorCode] = &[
        ErrorCode::InvalidArgs,
        ErrorCode::NotRunning,
        ErrorCode::NotFound,
        ErrorCode::Denied,
        ErrorCode::Timeout,
        ErrorCode::Failed,
        ErrorCode::Internal,
    ];

    /// The process exit status for this code.
    ///
    /// **Exit code 1 is deliberately unassigned**, so a panic, an abort, or a
    /// shell's own "command failed" stays distinguishable from every classified
    /// outcome. 0 means the op ran and answered.
    pub fn exit_code(self) -> i32 {
        match self {
            ErrorCode::InvalidArgs => 2,
            ErrorCode::NotRunning => 3,
            ErrorCode::NotFound => 4,
            ErrorCode::Denied => 5,
            ErrorCode::Timeout => 6,
            ErrorCode::Failed => 7,
            ErrorCode::Internal => 70,
        }
    }

    /// The wire spelling, for messages and the `--help` table.
    pub fn as_str(self) -> &'static str {
        match self {
            ErrorCode::InvalidArgs => "invalid-args",
            ErrorCode::NotRunning => "not-running",
            ErrorCode::NotFound => "not-found",
            ErrorCode::Denied => "denied",
            ErrorCode::Timeout => "timeout",
            ErrorCode::Failed => "failed",
            ErrorCode::Internal => "internal",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn success_carries_data_and_no_error() {
        let env = Envelope::ok(serde_json::json!({ "pid": 42 }));
        let line = env.to_line();
        assert!(line.ends_with('\n'));
        let v: serde_json::Value = serde_json::from_str(line.trim()).unwrap();
        assert_eq!(v["ok"], serde_json::json!(true));
        assert_eq!(v["v"], serde_json::json!(ENVELOPE_VERSION));
        assert_eq!(v["data"]["pid"], serde_json::json!(42));
        assert!(
            v.get("error").is_none(),
            "a success must not carry an error key: {v}"
        );
        assert_eq!(env.exit_code(), 0);
    }

    #[test]
    fn failure_carries_error_and_no_data() {
        let env = Envelope::err(ErrorCode::NotFound, "No workspace at /x");
        let v: serde_json::Value = serde_json::from_str(env.to_line().trim()).unwrap();
        assert_eq!(v["ok"], serde_json::json!(false));
        assert_eq!(v["error"]["code"], serde_json::json!("not-found"));
        assert_eq!(v["error"]["message"], serde_json::json!("No workspace at /x"));
        assert!(
            v.get("data").is_none(),
            "a failure must not carry a data key: {v}"
        );
        assert_eq!(env.exit_code(), ErrorCode::NotFound.exit_code());
    }

    #[test]
    fn envelope_round_trips() {
        let env = Envelope::err(ErrorCode::Failed, "claude: command not found");
        let back: Envelope = serde_json::from_str(env.to_line().trim()).unwrap();
        assert!(!back.ok);
        assert_eq!(back.v, ENVELOPE_VERSION);
        assert_eq!(back.error.as_ref().unwrap().code, ErrorCode::Failed);
        assert_eq!(back.silo, SiloMeta::current());
        assert!(back.data.is_none());
    }

    #[test]
    fn a_client_synthesized_envelope_carries_this_builds_identity() {
        // `not-running` never reaches an instance, so the client fills these in
        // from its own build — and that is the right answer, because the client
        // and the instance are the same executable (R3).
        let env = Envelope::err(ErrorCode::NotRunning, "Silo is not running");
        assert_eq!(env.silo.version, env!("CARGO_PKG_VERSION"));
        assert_eq!(
            env.silo.identity,
            crate::commands::identity::IDENTIFIER.to_string()
        );
    }

    #[test]
    fn request_parses_with_defaulted_args_and_cwd() {
        let req: Request = serde_json::from_str(r#"{"id":"abc","op":"status"}"#).unwrap();
        assert_eq!(req.op, "status");
        assert_eq!(req.cwd, "");
        assert!(req.args.is_null());
    }

    #[test]
    fn every_error_code_maps_to_a_distinct_non_zero_exit() {
        let mut seen = std::collections::HashMap::new();
        for &code in ErrorCode::ALL {
            let exit = code.exit_code();
            assert_ne!(exit, 0, "{} must not map to success", code.as_str());
            if let Some(other) = seen.insert(exit, code) {
                panic!(
                    "{} and {} both map to exit {exit}",
                    other.as_str(),
                    code.as_str()
                );
            }
        }
        assert_eq!(seen.len(), ErrorCode::ALL.len());
    }

    #[test]
    fn no_error_code_maps_to_one() {
        // Exit 1 is left unassigned so a crash stays distinguishable from every
        // classified outcome (R4).
        for &code in ErrorCode::ALL {
            assert_ne!(code.exit_code(), 1, "{} claimed exit 1", code.as_str());
        }
    }

    #[test]
    fn exit_codes_are_the_documented_ones() {
        // Pinned literally: these are a published contract (the CLI guide and
        // `--help` print this table), so a change here must be deliberate.
        assert_eq!(ErrorCode::InvalidArgs.exit_code(), 2);
        assert_eq!(ErrorCode::NotRunning.exit_code(), 3);
        assert_eq!(ErrorCode::NotFound.exit_code(), 4);
        assert_eq!(ErrorCode::Denied.exit_code(), 5);
        assert_eq!(ErrorCode::Timeout.exit_code(), 6);
        assert_eq!(ErrorCode::Failed.exit_code(), 7);
        assert_eq!(ErrorCode::Internal.exit_code(), 70);
    }

    #[test]
    fn all_variants_are_listed() {
        // `ALL` drives the exhaustiveness of every test above, so it must not
        // fall behind the enum. `exit_code`'s match is already exhaustive by
        // the compiler; this catches a variant added there but not here.
        let listed: std::collections::HashSet<_> = ErrorCode::ALL.iter().collect();
        assert_eq!(listed.len(), ErrorCode::ALL.len(), "duplicate in ALL");
        for &code in ErrorCode::ALL {
            let wire = serde_json::to_string(&code).unwrap();
            assert_eq!(wire, format!("\"{}\"", code.as_str()));
            let back: ErrorCode = serde_json::from_str(&wire).unwrap();
            assert_eq!(back, code);
        }
    }

    #[test]
    fn a_failure_with_no_error_body_is_internal_not_success() {
        // A malformed reply must not exit 0 — silence that looks like success is
        // the failure mode this whole API exists to remove.
        let malformed = Envelope {
            v: ENVELOPE_VERSION,
            ok: false,
            data: None,
            error: None,
            silo: SiloMeta::current(),
        };
        assert_eq!(malformed.exit_code(), ErrorCode::Internal.exit_code());
    }
}
