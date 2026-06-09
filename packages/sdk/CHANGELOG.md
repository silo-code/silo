# @silo-code/sdk

## 0.6.0

### Minor Changes

- 33c28ed: First publishable release of the public extension SDK. `@silo-code/sdk` now ships
  a real build (`dist/` with JS + bundled `.d.ts` declarations) so external
  extension authors can `npm i -D @silo-code/sdk` and compile against the types,
  with the example extensions consuming it as a real dependency.
