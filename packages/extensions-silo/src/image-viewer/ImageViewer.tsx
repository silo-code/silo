import { useEffect, useState } from "react";
import type { EditorProps, ExtensionContext } from "@silo-code/sdk";
import "./ImageViewer.css";

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
  avif: "image/avif",
};

function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export function ImageViewer({
  filePath,
  ctx,
}: EditorProps & { ctx: ExtensionContext }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath) {
      setError("Image viewer requires a file path.");
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    setUrl(null);
    setError(null);
    ctx.files
      .readBytes(filePath)
      .then((bytes) => {
        if (cancelled) return;
        const blob = new Blob([bytes], { type: mimeFromPath(filePath) });
        createdUrl = URL.createObjectURL(blob);
        setUrl(createdUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [filePath]);

  return (
    <div className="image-viewer">
      {error ? (
        <div className="placeholder error">Failed: {error}</div>
      ) : url ? (
        <img src={url} alt={filePath ?? ""} />
      ) : (
        <div className="placeholder">Loading…</div>
      )}
    </div>
  );
}
