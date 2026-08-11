/**
 * Headless driver for the in-browser vignette recorder.
 * Opens /recorder.html, records the worktree-toast In→Out range, writes assets
 * into `@silo-code/website` (homepage Vite imports).
 *
 * Usage:
 *   pnpm --filter @silo-code/website-recorder capture:feature-git
 */
import { createServer } from "vite";
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";

const root = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(root, "..");
const websiteAssets = path.resolve(pkgRoot, "../website/src/assets");

const OUT = {
  webm: path.join(websiteAssets, "feature-git.webm"),
  png: path.join(websiteAssets, "feature-git.png"),
};

const FPS = 30;
/** First toast show/hold window on the worktree-toast preset. */
const RANGE = { startMs: 3500, endMs: 10500 };
const CROP = { x: 0.55, y: 0.42, w: 0.43, h: 0.55 };

async function main() {
  const server = await createServer({
    root: pkgRoot,
    configFile: path.join(pkgRoot, "vite.config.ts"),
    server: { host: "127.0.0.1", port: 5179, strictPort: true },
  });
  await server.listen();
  const addr = server.httpServer?.address();
  const port = typeof addr === "object" && addr ? addr.port : 5179;
  const url = `http://127.0.0.1:${port}/recorder.html`;
  console.log(`Recorder at ${url}`);

  await new Promise((r) => setTimeout(r, 400));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });

  await page.addInitScript(
    ({ crop, range }) => {
      // Clear any prior library so this capture is deterministic.
      const project = {
        version: 1,
        id: "vp-capture-feature-git",
        name: "feature-git",
        updatedAt: new Date().toISOString(),
        presetId: "worktree-toast",
        suggestedFilename: "feature-git",
        fps: 30,
        loopBookendMode: "fade",
        crop,
        range,
        zoomSegments: [],
      };
      localStorage.setItem(
        "silo-vignette-projects",
        JSON.stringify({ version: 1, projects: [project] }),
      );
      localStorage.setItem("silo-vignette-active-project", project.id);
    },
    { crop: CROP, range: RANGE },
  );

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("[data-vignette-root]", { timeout: 30_000 });

    await page
      .locator('.vignette-field:has(span:text-is("Preset")) select')
      .selectOption({ label: "Git · worktree toast" });
    await page.fill(
      '.vignette-field:has(span:text-is("FPS")) input',
      String(FPS),
    );

    await page.getByRole("button", { name: "Size 719×391" }).click();
    await page.getByTitle("Record In→Out").click();

    await page.waitForFunction(
      () => {
        const err = document.querySelector(".vignette-error");
        if (err?.textContent) return `error:${err.textContent}`;
        const status = document.querySelector(".vignette-status");
        const text = status?.textContent ?? "";
        if (text.startsWith("Done")) return `done:${text}`;
        if (text === "Cancelled") return "cancelled";
        return null;
      },
      undefined,
      { timeout: 180_000 },
    );

    const outcome = await page.evaluate(() => {
      const err = document.querySelector(".vignette-error");
      if (err?.textContent) return `error:${err.textContent}`;
      return document.querySelector(".vignette-status")?.textContent ?? "";
    });
    if (outcome.startsWith("error:") || outcome === "Cancelled") {
      throw new Error(`Recording failed: ${outcome}`);
    }
    console.log(outcome);

    const buffers = await page.evaluate(async () => {
      const video = document.querySelector(".vignette-preview-video");
      const poster = document.querySelector(".vignette-preview-poster");
      if (
        !(video instanceof HTMLVideoElement) ||
        !(poster instanceof HTMLImageElement)
      ) {
        throw new Error("Preview media missing after record");
      }
      const [webm, png] = await Promise.all([
        fetch(video.src).then((r) => r.arrayBuffer()),
        fetch(poster.src).then((r) => r.arrayBuffer()),
      ]);
      return {
        webm: Array.from(new Uint8Array(webm)),
        png: Array.from(new Uint8Array(png)),
      };
    });

    const webmBuf = Buffer.from(buffers.webm);
    const pngBuf = Buffer.from(buffers.png);
    if (webmBuf.byteLength < 5_000) {
      throw new Error(
        `WebM too small (${webmBuf.byteLength} bytes) — capture failed`,
      );
    }

    await fs.mkdir(path.dirname(OUT.webm), { recursive: true });
    await fs.writeFile(OUT.webm, webmBuf);
    await fs.writeFile(OUT.png, pngBuf);
    console.log(`Wrote ${OUT.webm} (${webmBuf.byteLength} bytes)`);
    console.log(`Wrote ${OUT.png} (${pngBuf.byteLength} bytes)`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
