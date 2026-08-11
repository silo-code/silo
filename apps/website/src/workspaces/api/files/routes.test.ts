import { describe, expect, it } from "vitest";
import { rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("blocks the request once the window fills up", () => {
    const limiter = rateLimit({ windowMs: 1000, max: 2 });
    const calls: number[] = [];
    const next = () => calls.push(1);

    const req = { ip: "1.2.3.4" } as never;
    const res = {
      status: () => res,
      json: () => res,
      setHeader: () => res,
    } as never;

    limiter(req, res, next);
    limiter(req, res, next);
    limiter(req, res, next);

    expect(calls.length).toBe(2);
  });
});
