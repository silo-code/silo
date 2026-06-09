---
status: accepted
date: 2026-06-01
---

# 0012. Dev-only automation RPC for driving the real app

## Context

macOS WKWebView has no WebDriver or CDP, so there was no way to drive the real
running app (Monaco, xterm) from a test/agent. Synthetic OS input is blocked by
Accessibility TCC; a Chromium browser stand-in would pass tests for the wrong
reasons.

## Decision

A **localhost-only HTTP RPC server** (`127.0.0.1:7878`, **dev builds only**) that
operates the live app and taps source-of-truth APIs (the Monaco event timeline,
editor focus state). Every request must carry **both** an `X-Silo-Automation`
header **and** a loopback `Host` (defeats cross-origin requests + DNS rebinding).
Compiled out of release entirely via a Cargo `automation` feature + a frontend
`DEV` guard.

## Consequences

- Trustworthy integration testing against the real WKWebView + Monaco + xterm;
  immune to focus-routing bugs that DOM-scraping would hit.
- Zero release footprint; dev-only.
- Another surface to maintain.

## Alternatives considered

- **WebDriver / CDP** (unavailable on WKWebView), **synthetic OS input**
  (TCC-blocked), **a Chromium stand-in** (wrong engine) — all rejected.

## References

- `docs/AUTOMATION.md`.
