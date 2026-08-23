// Terminal identity in the session environment (RFC 0028) — the carrier that
// gets it from the app to the shell.
//
// The app re-execs its own binary to become a session daemon, so the session's
// environment has to cross a process boundary. It travels as one JSON blob in
// a single carrier variable, which the daemon parses and then *removes from its
// own environment* before forking the shell.
//
// Two alternatives were weighed and rejected (RFC 0028 → "Design"):
//
// - **Plain inheritance.** Simplest, and it's how the app-wide constants
//   (`SILO_PTY_NS`, `SILO_DATA_DIR`, `SILO_CONFIG_ROOT`) already reach the
//   daemon. But those are the same for every session; identity is per-session,
//   and a daemon carrying `SILO_TERMINAL_ID` is one a process-tree walk can
//   misread one level too high.
// - **Repeated `--env KEY=VAL` argv.** argv is where a *command* belongs, not a
//   bag of variables, and it would become the daemon's visible command line.
//
// Note what removal buys and what it doesn't: `remove_var` clears the variable
// from the effective environment (`getenv` stops answering, children stop
// inheriting — both verified), but it does not scrub the string from the
// initial environment block, so `ps eww` on the daemon still shows it. That's
// true of every env var on the platform. This is a transport, never a place to
// put a secret.

use std::collections::HashMap;

/// The single variable the environment map rides in across the re-exec.
pub const SESSION_ENV_CARRIER: &str = "SILO_SESSION_ENV";

/// Serialize a session environment for transport. Infallible in practice (a
/// string→string map always encodes); an encoding failure degrades to "no
/// environment" rather than failing the spawn, because a terminal that opens
/// without identity is far better than one that doesn't open.
pub fn encode_session_env(env: &HashMap<String, String>) -> String {
    serde_json::to_string(env).unwrap_or_else(|_| "{}".to_string())
}

/// Parse a carrier payload. Returns `None` for anything unusable, so a
/// malformed blob costs identity, not the session.
pub fn decode_session_env(payload: &str) -> Option<HashMap<String, String>> {
    serde_json::from_str::<HashMap<String, String>>(payload)
        .ok()
        .filter(|m| !m.is_empty())
}

/// Read the carrier out of this process's environment and remove it, so the
/// daemon does not pass its own copy down to the shell (the shell gets the
/// decoded map applied directly) or hold per-session facts a tree walk could
/// find. Call once, early, in the daemon entry point.
pub fn take_session_env() -> Option<HashMap<String, String>> {
    let raw = std::env::var(SESSION_ENV_CARRIER).ok()?;
    std::env::remove_var(SESSION_ENV_CARRIER);
    decode_session_env(&raw)
}

/// Put Silo's own bin directory at the front of `PATH` so the bundled `silo`
/// command resolves inside Silo's terminals with nothing to install.
///
/// **This does not guarantee first position in the shell that finally runs.**
/// Sessions run a login shell, which re-derives `PATH`: `path_helper` rebuilds
/// it from `/etc/paths` and profile scripts prepend their own entries. Measured
/// on a developer machine, a directory prepended before `zsh -l` came back 14th
/// of 33 — present, but behind everything the profile added. `SILO_BIN` exists
/// precisely so consumers can address the binary absolutely instead of relying
/// on lookup order (RFC 0028).
///
/// A `PATH` the caller put in the session environment wins over the daemon's
/// inherited one — the caller asked for that search order, so the prepend goes
/// in front of *their* `PATH`, not silently in place of it.
pub fn apply_bin_path(env: &mut HashMap<String, String>, inherited_path: Option<&str>) {
    let Some(bin) = env.get("SILO_BIN").cloned() else {
        return;
    };
    if bin.is_empty() {
        return;
    }
    let base = env
        .get("PATH")
        .map(String::as_str)
        .or(inherited_path)
        .filter(|p| !p.is_empty());
    let path = match base {
        Some(existing) => format!("{bin}{PATH_SEP}{existing}"),
        None => bin,
    };
    env.insert("PATH".to_string(), path);
}

/// `PATH` entry separator for this platform. Windows uses `;`; joining with a
/// colon there produces one unusable mega-entry rather than a search list.
const PATH_SEP: &str = if cfg!(windows) { ";" } else { ":" };

#[cfg(test)]
mod tests {
    use super::*;

    fn map(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn carrier_round_trips() {
        let env = map(&[("SILO", "1"), ("SILO_TERMINAL_ID", "t_abc")]);
        let decoded = decode_session_env(&encode_session_env(&env)).unwrap();
        assert_eq!(decoded, env);
    }

    #[test]
    fn round_trip_survives_awkward_values() {
        // Spaces, quotes, newlines, and `=` all appear in real env values
        // (a workspace path with a space, a shell snippet). JSON handles them;
        // a naive `KEY=VAL` split would not.
        let env = map(&[
            ("SILO_WORKSPACE_PATH", "/Users/x/My Projects/a=b"),
            ("WEIRD", "line1\nline2 \"quoted\""),
        ]);
        let decoded = decode_session_env(&encode_session_env(&env)).unwrap();
        assert_eq!(decoded, env);
    }

    #[test]
    fn malformed_payload_costs_identity_not_the_session() {
        assert!(decode_session_env("not json").is_none());
        assert!(decode_session_env("[\"an\",\"array\"]").is_none());
        assert!(decode_session_env("{\"k\":3}").is_none());
    }

    #[test]
    fn empty_map_decodes_to_none() {
        assert!(decode_session_env("{}").is_none());
    }

    /// `take_session_env` mutates the process environment, so it can't run
    /// concurrently with another test doing the same.
    static ENV_GUARD: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn taking_the_carrier_decodes_it_and_removes_it_from_our_own_env() {
        let _g = ENV_GUARD.lock().unwrap_or_else(|e| e.into_inner());
        let env = map(&[("SILO_TERMINAL_ID", "t_abc")]);
        std::env::set_var(SESSION_ENV_CARRIER, encode_session_env(&env));

        let taken = take_session_env().expect("carrier present");
        assert_eq!(taken, env);
        // The daemon must not keep per-session identity around: a process-tree
        // walk that found the carrier on the daemon would read it as if the
        // daemon itself were the terminal.
        assert!(
            std::env::var(SESSION_ENV_CARRIER).is_err(),
            "carrier must be removed from the daemon's own environment"
        );
    }

    #[test]
    fn no_carrier_means_no_session_env() {
        let _g = ENV_GUARD.lock().unwrap_or_else(|e| e.into_inner());
        std::env::remove_var(SESSION_ENV_CARRIER);
        assert!(take_session_env().is_none());
    }

    #[test]
    fn bin_dir_goes_to_the_front_of_an_existing_path() {
        let mut env = map(&[("SILO_BIN", "/app/bin")]);
        apply_bin_path(&mut env, Some(&format!("/usr/bin{PATH_SEP}/bin")));
        assert_eq!(
            env.get("PATH").unwrap(),
            &format!("/app/bin{PATH_SEP}/usr/bin{PATH_SEP}/bin")
        );
    }

    #[test]
    fn a_caller_supplied_path_wins_over_the_inherited_one() {
        // `ctx.process.spawn({ env: { PATH } })` is a legitimate ask; the
        // prepend must go in front of what the caller chose, not replace it
        // with whatever the daemon happened to inherit.
        let mut env = map(&[("SILO_BIN", "/app/bin"), ("PATH", "/custom/bin")]);
        apply_bin_path(&mut env, Some("/usr/bin"));
        assert_eq!(
            env.get("PATH").unwrap(),
            &format!("/app/bin{PATH_SEP}/custom/bin")
        );
    }

    #[test]
    fn bin_dir_becomes_the_whole_path_when_nothing_is_inherited() {
        let mut env = map(&[("SILO_BIN", "/app/bin")]);
        apply_bin_path(&mut env, None);
        assert_eq!(env.get("PATH").unwrap(), "/app/bin");

        let mut env = map(&[("SILO_BIN", "/app/bin")]);
        apply_bin_path(&mut env, Some(""));
        assert_eq!(env.get("PATH").unwrap(), "/app/bin");
    }

    #[test]
    fn no_bin_dir_leaves_path_alone() {
        let mut env = map(&[("SILO", "1")]);
        apply_bin_path(&mut env, Some("/usr/bin"));
        assert!(!env.contains_key("PATH"));

        // An empty SILO_BIN must not produce a leading-separator PATH, which
        // the shell reads as "the current directory" — it leaves PATH alone.
        let mut env = map(&[("SILO_BIN", ""), ("PATH", "/custom/bin")]);
        apply_bin_path(&mut env, Some("/usr/bin"));
        assert_eq!(env.get("PATH").unwrap(), "/custom/bin");
    }
}
