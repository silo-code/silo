// Re-export shim (ADR 0037): GitAPI and its supporting types now live in the
// published `@silo-code/git-api` package so third-party and other first-party
// extensions can type-import them too (see that package for the actual
// definitions and docs). Kept here so the existing internal imports across
// this package (`from "./git-api"` / `from "../git/git-api"`) don't all need
// to change in the same commit — new code should import directly from
// `@silo-code/git-api` instead of through this path.
export * from "@silo-code/git-api";
