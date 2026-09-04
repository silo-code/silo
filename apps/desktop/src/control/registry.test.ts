import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The Control API's allowlist has two halves that must not drift: the Rust
// registry decides what the socket accepts, and `HANDLERS` decides what the
// webview can answer. An op in one and not the other is a silent hole —
// registered-but-unhandled times out after five seconds with no explanation,
// handled-but-unregistered is dead code the socket will always deny.
//
// So this reads the Rust table rather than restating it. A duplicated list in
// TypeScript would be a third thing to keep in sync, which is the problem.

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(),
  listen: vi.fn(async () => () => {}),
}));

const { HANDLERS } = await import("./index");

// Vitest runs with `apps/desktop` as its working directory (see
// `vitest.config.ts`); `import.meta.url` is not a file URL under the Vite
// transform, so the path is resolved from there.
const REGISTRY_RS = resolve(
  process.cwd(),
  "src-tauri/src/commands/control/registry.rs",
);

/** Every `Op { name, tier, answered_by }` entry in the Rust table. */
function rustOps(): { name: string; tier: string; answeredBy: string }[] {
  const source = readFileSync(REGISTRY_RS, "utf8");
  // Only the `OPS` table itself, so the doc comment's markdown table and the
  // test module below it are not scanned.
  const table = source.slice(
    source.indexOf("pub const OPS"),
    source.indexOf("pub fn lookup"),
  );
  const entries = [
    ...table.matchAll(
      /name:\s*"([^"]+)",\s*tier:\s*Tier::(\w+),\s*answered_by:\s*Answerer::(\w+)/g,
    ),
  ];
  return entries.map(([, name, tier, answeredBy]) => ({
    name,
    tier: tier.toLowerCase(),
    answeredBy: answeredBy.toLowerCase(),
  }));
}

describe("the Control op allowlist", () => {
  it("parses the Rust table (guards the parser itself)", () => {
    // If the table's formatting changes enough to break the regex, every
    // assertion below would vacuously pass. This is the tripwire for that.
    const ops = rustOps();
    expect(ops.length).toBeGreaterThanOrEqual(3);
    expect(ops.map((o) => o.name)).toContain("status");
    for (const op of ops) {
      expect(["read", "mutate"]).toContain(op.tier);
      expect(["host", "webview"]).toContain(op.answeredBy);
    }
  });

  it("gives every webview-answered op a handler", () => {
    const expected = rustOps()
      .filter((op) => op.answeredBy === "webview")
      .map((op) => op.name)
      .sort();

    expect(Object.keys(HANDLERS).sort()).toEqual(expected);
  });

  it("does not handle host-answered ops", () => {
    // `status` is answered in Rust *because* it must work when the webview does
    // not (R9). A handler here would be dead code that also implied otherwise.
    for (const op of rustOps().filter((o) => o.answeredBy === "host")) {
      expect(HANDLERS[op.name]).toBeUndefined();
    }
  });
});
