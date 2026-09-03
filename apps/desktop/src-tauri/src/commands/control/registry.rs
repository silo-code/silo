//! The Control API's **closed** operation allowlist (RFC 0034 R5, R6).
//!
//! The channel exposes named ops and nothing else. A name not in [`OPS`] is
//! refused with `denied` before anything is emitted to the webview, so the host
//! gaining a new capability never silently gains the channel a new op. This
//! table *is* the security boundary — the socket's file mode says *who* may
//! speak, and this says *what* they may ask for.
//!
//! ## Admission rules for a new op
//!
//! 1. **It declares a tier.** [`Tier::Read`] observes; [`Tier::Mutate`] changes
//!    the running app. The label is documentation and audit surface, not a
//!    runtime gate: there is only one principal on the other side of a `0600`
//!    socket, so a second gate would restrict the user from themselves.
//! 2. **It must not require user confirmation.** ADR 0047 rule 7 says an agent
//!    cannot answer a modal, so an op that cannot complete without asking the
//!    user is *not admitted here*. Shipping a `--yes` flag and a `confirms`
//!    column no op sets would be an untested path with no caller; admitting the
//!    first such op is an amendment to RFC 0034 and to ADR 0047, not a flag
//!    added in advance.
//! 3. **It answers through the envelope.** No op builds its own response shape.
//!
//! Extensions never reach this table. They have `ctx`.

/// Whether an op observes the running app or changes it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tier {
    Read,
    Mutate,
}

/// Where an op is answered.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Answerer {
    /// Answered in Rust, without touching the webview — so it still works when
    /// the webview is wedged (R9).
    Host,
    /// Round-tripped through the webview's control dispatcher.
    Webview,
}

/// One entry in the allowlist.
#[derive(Debug, Clone, Copy)]
pub struct Op {
    pub name: &'static str,
    pub tier: Tier,
    pub answered_by: Answerer,
}

/// Every op the Control API accepts.
///
/// | Op          | Tier   | Answered by | Backing command               |
/// | ----------- | ------ | ----------- | ----------------------------- |
/// | `status`    | read   | host        | `silo status`                 |
/// | `ws.live`   | read   | webview     | `silo ws list` (live overlay) |
/// | `agent.run` | mutate | webview     | `silo agent run`              |
pub const OPS: &[Op] = &[
    Op {
        name: "status",
        tier: Tier::Read,
        answered_by: Answerer::Host,
    },
    Op {
        name: "ws.live",
        tier: Tier::Read,
        answered_by: Answerer::Webview,
    },
    Op {
        name: "agent.run",
        tier: Tier::Mutate,
        answered_by: Answerer::Webview,
    },
];

/// Look an op up by name. `None` is a `denied`, never a passthrough.
pub fn lookup(name: &str) -> Option<&'static Op> {
    OPS.iter().find(|op| op.name == name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_ops_are_not_in_the_table() {
        assert!(lookup("status").is_some());
        assert!(lookup("agent.run").is_some());
        // The shapes an attacker or a stale client would reach for.
        assert!(lookup("").is_none());
        assert!(lookup("Status").is_none());
        assert!(lookup("terminal.write").is_none());
        assert!(lookup("eval").is_none());
        assert!(lookup("../status").is_none());
    }

    #[test]
    fn every_op_name_is_unique() {
        let names: std::collections::HashSet<_> = OPS.iter().map(|op| op.name).collect();
        assert_eq!(names.len(), OPS.len(), "duplicate op name in OPS");
    }

    #[test]
    fn op_names_are_lowercase_dotted() {
        // The wire names are a published contract; keeping them to one shape
        // means a client never has to guess about case or separators.
        for op in OPS {
            assert!(!op.name.is_empty());
            assert!(
                op.name
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c == '.' || c.is_ascii_digit()),
                "{} is not lowercase-dotted",
                op.name
            );
        }
    }

    #[test]
    fn status_is_the_only_host_answered_op() {
        // `status` is host-answered *because* it must work when the webview does
        // not (R9). Anything else answered host-side would be a second such
        // claim, and should be a deliberate change to this test.
        let host: Vec<_> = OPS
            .iter()
            .filter(|op| op.answered_by == Answerer::Host)
            .map(|op| op.name)
            .collect();
        assert_eq!(host, vec!["status"]);
    }

    #[test]
    fn mutating_ops_are_named_and_few() {
        // The mutate tier is the audit surface: growing it should be visible in
        // a diff of this assertion, not only in the table above.
        let mutate: Vec<_> = OPS
            .iter()
            .filter(|op| op.tier == Tier::Mutate)
            .map(|op| op.name)
            .collect();
        assert_eq!(mutate, vec!["agent.run"]);
    }
}
