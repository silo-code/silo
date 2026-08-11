/// <reference types="vite/client" />

declare module "*.webm" {
  const src: string;
  export default src;
}

declare module "*.mp4" {
  const src: string;
  export default src;
}
