export interface ScaffoldInput {
  id: string;
  name: string;
  description: string;
  publisher: string;
}

/** Derive an npm-safe package name from a dot-namespaced extension id. */
export function inferNpmName(id: string): string {
  return "silo-" + id.replace(/\./g, "-");
}

/** Default output directory for an extension id. */
export function defaultPath(id: string): string {
  return `/tmp/silo-ext/${id}`;
}

/** Generate the contents of `src/index.tsx`. */
export function renderIndexTsx(input: ScaffoldInput): string {
  return `import type { Extension } from "@silo-code/sdk";

export const extension: Extension = {
  id: "${input.id}",
  manifest: {
    name: "${input.name}",
    description: "${input.description}",
    version: "0.1.0",
  },
  activate(ctx) {
    // Register contributions here.
    // See https://silo.run/api for the full ctx API.
  },
};
`;
}

const ESBUILD_FLAGS = [
  "--bundle",
  "--format=esm",
  "--platform=browser",
  "--target=es2020",
  "--jsx=automatic",
  "--external:react",
  "--external:react/jsx-runtime",
  "--external:@silo-code/sdk",
  "--outfile=dist/index.js",
].join(" ");

/** Generate the contents of `package.json`. */
export function renderPackageJson(input: ScaffoldInput): string {
  return (
    JSON.stringify(
      {
        name: inferNpmName(input.id),
        version: "0.1.0",
        description: input.description,
        files: ["dist", "package.json"],
        scripts: {
          build: `esbuild src/index.tsx ${ESBUILD_FLAGS}`,
          dev: `esbuild src/index.tsx ${ESBUILD_FLAGS} --watch`,
          pack: "npm run build && npm pack",
        },
        silo: {
          id: input.id,
          main: "dist/index.js",
          publisher: input.publisher,
        },
        devDependencies: {
          "@silo-code/sdk": "latest",
          esbuild: "latest",
          react: "latest",
          "@types/react": "latest",
        },
      },
      null,
      2,
    ) + "\n"
  );
}
