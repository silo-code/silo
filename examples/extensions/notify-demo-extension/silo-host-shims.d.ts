// Ambient shims so `tsc` can typecheck this extension against Silo's *live*
// source (the `@silo-code/sdk` path alias in tsconfig.json) before the monorepo
// ships `@silo-code/sdk` as a published package with bundled declarations.
//
// The SDK barrel re-exports from host modules that use a few Vite-only features
// (worker imports, CSS side-effect imports, `import.meta.env`). These declares
// satisfy the type graph; none of it affects the built bundle (react +
// @silo-code/sdk are external, and esbuild handles JSX/CSS directly). Delete this
// file once `@silo-code/sdk` is a real dependency.

declare module "*?worker" {
  const WorkerConstructor: { new (): Worker };
  export default WorkerConstructor;
}

declare module "*.css" {}
declare module "*.png" {
  const url: string;
  export default url;
}

interface ImportMeta {
  readonly env: Record<string, unknown> & {
    readonly DEV: boolean;
    readonly PROD: boolean;
  };
}
