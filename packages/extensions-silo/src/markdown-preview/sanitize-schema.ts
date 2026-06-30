import { defaultSchema } from "rehype-sanitize";

// Remove the protocol filter on `src` so relative/absolute local image paths
// pass through to the custom <img> renderer, which loads them via readBytes.
// All other protocol filters (href → http/https/mailto) are preserved.
const { src: _srcProtocol, ...protocolsWithoutSrc } =
  (defaultSchema.protocols ?? {}) as Record<string, string[]>;

export const GITHUB_SANITIZE_SCHEMA = {
  ...defaultSchema,
  protocols: protocolsWithoutSrc,
  // remark-gfm emits <input type="checkbox" disabled> for task list items.
  attributes: {
    ...defaultSchema.attributes,
    input: ["type", "checked", "disabled"],
  },
};
