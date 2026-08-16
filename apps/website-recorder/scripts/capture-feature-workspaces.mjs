/**
 * Headless driver for the in-browser vignette recorder.
 * Opens /recorder.html, records the Navigator · workspaces preset, writes
 * assets into `@silo-code/website` (homepage Vite imports).
 *
 * Usage:
 *   pnpm --filter @silo-code/website-recorder capture:feature-workspaces
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
  webm: path.join(websiteAssets, "feature-workspaces.webm"),
  png: path.join(websiteAssets, "feature-workspaces.png"),
};

const FPS = 30;
/**
 * navigatorDemoScript (demo-config.ts) clicks website → docs → api → website.
 *
 * Two *different* timing mechanisms are in play here, easy to conflate (an
 * earlier version of this comment did):
 *
 * - The DOM content (which workspace row is highlighted, panel contents) is
 *   captured from the *real*, live demo — VignetteRecorder.startRecording
 *   cues by busy-waiting rangeStartMs of actual wall-clock time, then
 *   captures screenshots for rangeEnd-rangeStart more. This is subject to
 *   real timer jitter: the same click has landed anywhere from ~9.1s to past
 *   9.9s of real capture time across different runs, and the center dock's
 *   webview can still be visibly mid-load a couple hundred ms after that.
 * - The cursor overlay is composited afterward, deterministically —
 *   capture.ts's frameAtOutputTime calls `planScriptSeek(script,
 *   rangeStartMs + t)` for every output frame, a pure function of
 *   rangeStartMs and the (evenly-spaced, jitter-free) output timeline. It
 *   does not depend on how the live capture actually went.
 *
 * That means rangeStartMs (RANGE.startMs) can reliably skip the cursor's
 * ~1.4s top-entry glide — confirmed empirically (probe-start-offset.mjs,
 * deleted): frame 0 with startMs=2430 shows the cursor already resting on
 * "website", no entrance. 2430 sits mid-way through that step's own ~260ms
 * click-flash window ([2300,2560), see the step timeline below) — well past
 * the entrance, and "website" is the default-active workspace regardless of
 * whether this (redundant) click has already fired, so there's no DOM-jitter
 * risk on the start side the way there is at the end.
 *
 * endMs stays at the "navigator" preset's own default (presets.ts) rather
 * than trimming similarly tight around the *final* click — that click is a
 * real, jittery DOM transition (unlike the first, redundant one), and
 * trimming close around it risks capturing the still-loading state a slower
 * run produces. The cost is asymmetry: the cursor is visible at the start
 * (no longer an entrance-from-top) but faded to absent by the end (script
 * fully complete). A cursor appearing at the loop point reads as far less
 * jarring than one flying in from off-screen, which is what this fixes.
 *
 * Full step timeline (afterMs + holdMs + SCRIPT_CLICK_RELEASE_MS=260 each):
 *   website  arrive@600  click@2300  settle@2560
 *   docs     arrive@2960 click@4760  settle@5020
 *   api      arrive@5420 click@7220  settle@7480
 *   website  arrive@7880 click@9680  settle@9940
 */
const RANGE = { startMs: 2_430, endMs: 11_000 };
const CROP = { x: 0.0, y: 0.08, w: 0.28, h: 0.84 };

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
        id: "vp-capture-feature-workspaces",
        name: "feature-workspaces",
        updatedAt: new Date().toISOString(),
        presetId: "navigator",
        suggestedFilename: "feature-workspaces",
        fps: 30,
        // Trimmed to a self-looping range (see RANGE above) rather than
        // masking a hard cut with a fade/dim wrap — the content already
        // returns to its starting pose, so a bookend would just add a
        // visible dark flash that wasn't there before.
        loopBookendMode: "none",
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
      .selectOption({ label: "Navigator · workspaces" });
    await page.fill(
      '.vignette-field:has(span:text-is("FPS (output)")) input',
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
