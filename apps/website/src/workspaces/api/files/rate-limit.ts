import type { NextFunction, Request, Response } from "express";

type Options = { windowMs: number; max: number };

// In-memory only — good enough for a single instance, swap for Redis once we scale out.
export function rateLimit({ windowMs, max }: Options) {
  const hits = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip ?? "unknown";
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

    if (recent.length >= max) {
      res.setHeader("Retry-After", Math.ceil(windowMs / 1000));
      return res.status(429).json({ error: "rate_limited" });
    }

    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
