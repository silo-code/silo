// esbuild bundles .css files as plain strings when loader: { ".css": "text" } is set.
declare module "*.css" {
  const content: string;
  export default content;
}
