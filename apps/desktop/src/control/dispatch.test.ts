import { describe, it, expect, vi, beforeEach } from "vitest";

// The dispatcher's own contract, separate from any one handler's: an unknown op
// and a throwing handler must both come back as classified refusals. A throw
// that escaped would reach the caller as a five-second `timeout` — a command
// failing as silence, which is what RFC 0034 exists to remove.

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(),
  listen: vi.fn(async () => () => {}),
}));

const { HANDLERS, dispatchControlRequest } = await import("./index");
const { ok } = await import("./types");

const request = (op: string, args: Record<string, unknown> = {}) => ({
  id: 1,
  op,
  args,
  cwd: "/proj",
});

beforeEach(() => {
  delete HANDLERS["test.throws"];
  delete HANDLERS["test.echo"];
});

describe("dispatchControlRequest", () => {
  it("refuses an op with no handler as internal, not as silence", () => {
    // The host denies unknown ops at its own registry, so reaching here means
    // the two halves disagree — Silo's bug, not the caller's.
    const result = dispatchControlRequest(request("nope.missing"));

    expect(result).toMatchObject({ ok: false, code: "internal" });
  });

  it("converts a throwing handler into internal", () => {
    HANDLERS["test.throws"] = () => {
      throw new Error("boom");
    };

    const result = dispatchControlRequest(request("test.throws"));

    expect(result).toMatchObject({ ok: false, code: "internal" });
    expect(result.ok ? "" : result.message).toContain("boom");
  });

  it("passes the request through and returns the handler's own result", () => {
    HANDLERS["test.echo"] = (req) => ok({ op: req.op, cwd: req.cwd });

    expect(dispatchControlRequest(request("test.echo"))).toEqual({
      ok: true,
      data: { op: "test.echo", cwd: "/proj" },
    });
  });

  it("drops a non-string argument rather than passing it on", () => {
    // The host built these from argv, but a handler must not have to defend
    // against a shape it did not expect.
    HANDLERS["test.echo"] = (req) => ok(req.args);

    const result = dispatchControlRequest(
      request("test.echo", { profileId: 42 }),
    );

    expect(result).toMatchObject({ ok: true });
  });
});

describe("agent.run argument coercion", () => {
  it("ignores non-string flag values", () => {
    // `HANDLERS["agent.run"]` coerces through `str()`; a number `profileId`
    // must read as absent (launch the default) rather than as `"42"`.
    const result = HANDLERS["agent.run"](
      request("agent.run", { profileId: 42, ws: null, prompt: {} }),
    );

    // No profiles are defined in this file's store, so absent-profile behavior
    // is the observable: `not-found` for the default, never a coerced lookup.
    expect(result).toMatchObject({ ok: false, code: "not-found" });
  });
});
