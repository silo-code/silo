export interface CliArgs {
  id?: string;
  path?: string;
  name?: string;
  publisher?: string;
  description?: string;
}

const KNOWN = new Set(["id", "path", "name", "publisher", "description"]);

/**
 * Parse `--key value` and `--key=value` flags from an argv array.
 * Unknown flags are silently ignored.
 */
export function parseArgs(argv: string[]): CliArgs {
  const result: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;

    const eqIdx = arg.indexOf("=");
    let key: string;
    let value: string | undefined;

    if (eqIdx !== -1) {
      key = arg.slice(2, eqIdx);
      value = arg.slice(eqIdx + 1);
    } else {
      key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        value = next;
        i++;
      }
    }

    if (!KNOWN.has(key) || value === undefined) continue;
    (result as Record<string, string>)[key] = value;
  }
  return result;
}
