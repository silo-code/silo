//! `pty-host` — standalone test/dogfood CLI for the session host (mirrors the
//! original spike). The library is the product surface; this binary just drives
//! it from a terminal without the Silo app.

use pty_host::{client, daemon};

fn usage() -> ! {
    eprintln!(
        "pty-host — PTY session host (test CLI)\n\n\
         USAGE:\n\
         \x20 pty-host [-n <ns>] new <name> [-- cmd args...]   create + attach (default cmd: $SHELL -l)\n\
         \x20 pty-host [-n <ns>] attach <name>                 reattach to a session\n\
         \x20 pty-host [-n <ns>] fg <name>                     print the live foreground process\n\
         \x20 pty-host [-n <ns>] list                          list sessions\n\
         \x20 pty-host [-n <ns>] kill <name>                   force-terminate a session\n\n\
         \x20 -n, --namespace <ns>   app-identity namespace (default: prod; e.g. dev).\n\
         \x20                        Overrides SILO_PTY_NS; isolates which app's sessions you see.\n\n\
         Inside an attached session, Ctrl-] detaches."
    );
    std::process::exit(2);
}

fn main() {
    // Resolve the session namespace: an explicit -n/--namespace flag wins, else
    // an inherited SILO_PTY_NS, else "prod". Apply it via the env the lib reads.
    let default_ns = std::env::var("SILO_PTY_NS")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "prod".to_string());
    let (ns, args) = split_namespace(std::env::args().collect(), default_ns);
    std::env::set_var("SILO_PTY_NS", &ns);

    let result = match args.get(1).map(|s| s.as_str()) {
        Some("new") => {
            let name = match args.get(2) {
                Some(n) => n.clone(),
                None => usage(),
            };
            let cmd = parse_command(&args);
            let cwd = std::env::current_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| "/".to_string());
            match daemon::spawn_detached(&name, cmd, cwd, 80, 24) {
                Ok(()) => client::attach(&name),
                Err(e) => Err(e),
            }
        }
        Some("attach") => match args.get(2) {
            Some(n) => client::attach(n),
            None => usage(),
        },
        Some("fg") => match args.get(2) {
            Some(n) => client::fg(n),
            None => usage(),
        },
        Some("kill") => match args.get(2) {
            Some(n) => client::kill(n),
            None => usage(),
        },
        Some("list") => client::list(),
        _ => usage(),
    };
    if let Err(e) = result {
        eprintln!("pty-host: {e}");
        std::process::exit(1);
    }
}

/// Everything after `--` is the command; otherwise default to a login shell.
fn parse_command(args: &[String]) -> Vec<String> {
    if let Some(pos) = args.iter().position(|a| a == "--") {
        let rest: Vec<String> = args[pos + 1..].to_vec();
        if !rest.is_empty() {
            return rest;
        }
    }
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    vec![shell, "-l".to_string()]
}

/// Pull `-n <ns>` / `--namespace <ns>` / `--namespace=<ns>` out of argv,
/// returning the chosen namespace (or `default_ns` if absent) and argv with the
/// flag removed. Flags after a `--` are left untouched (they belong to the spawned
/// command).
fn split_namespace(args: Vec<String>, default_ns: String) -> (String, Vec<String>) {
    let mut ns = default_ns;
    let mut out = Vec::with_capacity(args.len());
    let mut passthrough = false;
    let mut i = 0;
    while i < args.len() {
        let a = &args[i];
        if passthrough {
            out.push(a.clone());
            i += 1;
            continue;
        }
        match a.as_str() {
            "--" => {
                passthrough = true;
                out.push(a.clone());
                i += 1;
            }
            "-n" | "--namespace" => {
                if i + 1 < args.len() {
                    ns = args[i + 1].clone();
                    i += 2;
                } else {
                    i += 1;
                }
            }
            s if s.starts_with("--namespace=") => {
                ns = s["--namespace=".len()..].to_string();
                i += 1;
            }
            _ => {
                out.push(a.clone());
                i += 1;
            }
        }
    }
    (ns, out)
}

#[cfg(test)]
mod tests {
    use super::split_namespace;

    fn v(parts: &[&str]) -> Vec<String> {
        parts.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn default_when_no_flag() {
        let (ns, rest) = split_namespace(v(&["pty-host", "list"]), "prod".into());
        assert_eq!(ns, "prod");
        assert_eq!(rest, v(&["pty-host", "list"]));
    }

    #[test]
    fn short_and_long_flag() {
        let (ns, rest) = split_namespace(v(&["pty-host", "-n", "dev", "list"]), "prod".into());
        assert_eq!(ns, "dev");
        assert_eq!(rest, v(&["pty-host", "list"]));

        let (ns, rest) =
            split_namespace(v(&["pty-host", "--namespace", "dev", "list"]), "prod".into());
        assert_eq!(ns, "dev");
        assert_eq!(rest, v(&["pty-host", "list"]));

        let (ns, _) = split_namespace(v(&["pty-host", "--namespace=dev", "list"]), "prod".into());
        assert_eq!(ns, "dev");
    }

    #[test]
    fn flag_before_subcommand_args_is_extracted() {
        let (ns, rest) =
            split_namespace(v(&["pty-host", "-n", "dev", "kill", "silo-abc"]), "prod".into());
        assert_eq!(ns, "dev");
        assert_eq!(rest, v(&["pty-host", "kill", "silo-abc"]));
    }

    #[test]
    fn flags_after_double_dash_are_left_for_the_command() {
        // `new foo -- tool -n x` — the inner -n belongs to `tool`, not us.
        let (ns, rest) = split_namespace(
            v(&["pty-host", "new", "foo", "--", "tool", "-n", "x"]),
            "prod".into(),
        );
        assert_eq!(ns, "prod");
        assert_eq!(rest, v(&["pty-host", "new", "foo", "--", "tool", "-n", "x"]));
    }
}
