/**
 * Inline document for the website workspace's Local Web Viewer pane.
 * Kept in-bundle (iframe srcDoc) so the docs homepage doesn't need to
 * host or fetch ink-preview.html.
 */
export const INK_PREVIEW_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>My Site</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        color: #e7e9ee;
        background: #121319;
      }
      nav {
        display: flex;
        align-items: center;
        gap: 20px;
        padding: 18px 28px;
        border-bottom: 1px solid #26283333;
      }
      .logo {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 800;
        font-size: 18px;
        letter-spacing: -0.02em;
        margin-right: auto;
      }
      /* Same dashed/diagonal-stripe placeholder language as .hero-art below,
         just logomark-sized — the wordmark's icon hasn't been designed yet
         either. */
      .logo-mark {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
        border: 1.5px dashed #33364d;
        border-radius: 5px;
        background: repeating-linear-gradient(
          135deg,
          #16171f,
          #16171f 4px,
          #1a1c24 4px,
          #1a1c24 8px
        );
      }
      nav a {
        color: #9a9daa;
        text-decoration: none;
        font-size: 14px;
      }
      .theme-toggle {
        border: 1px solid #33364066;
        background: #1b1d25;
        border-radius: 3px;
        width: 26px;
        height: 26px;
        display: grid;
        place-items: center;
        font-size: 13px;
        margin-left: 4px;
        color: #9a9daa;
        cursor: default;
      }
      main {
        max-width: 780px;
        margin: 0 auto;
        padding: 56px 28px 80px;
      }
      /* Full size — the headline stays a real hero. What keeps it from
         competing with the page's actual hero above it is that the copy
         itself unmistakably reads as a placeholder nobody has replaced yet,
         not that it's been shrunk into insignificance. */
      h1 {
        font-size: 44px;
        line-height: 1.1;
        margin: 0 0 16px;
        letter-spacing: -0.01em;
        color: #f5f6fa;
      }
      .lede {
        font-size: 16px;
        line-height: 1.6;
        color: #9a9daa;
        max-width: 480px;
        margin: 0 0 28px;
      }
      .cta-row {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 8px;
      }
      .cta {
        background: #f5f6fa;
        color: #121319;
        border: 0;
        border-radius: 6px;
        padding: 11px 20px;
        font-size: 14px;
        font-weight: 600;
      }
      .todo {
        font-family: ui-monospace, "SF Mono", Menlo, monospace;
        font-size: 11px;
        color: #f2c464;
        background: #3a2f1233;
        border: 1px dashed #6b532b;
        border-radius: 4px;
        padding: 3px 8px;
      }
      .hero-art {
        margin-top: 44px;
        height: 260px;
        border: 2px dashed #33364d;
        border-radius: 10px;
        display: grid;
        place-items: center;
        color: #5c5f6e;
        font-size: 13px;
        letter-spacing: 0.04em;
        background: repeating-linear-gradient(
          135deg,
          #16171f,
          #16171f 10px,
          #1a1c24 10px,
          #1a1c24 20px
        );
      }
      .row {
        display: flex;
        gap: 16px;
        margin-top: 40px;
      }
      .card {
        flex: 1;
        border: 1px solid #262833;
        border-radius: 8px;
        padding: 16px;
      }
      .card .bar {
        height: 8px;
        border-radius: 4px;
        background: #262833;
        margin-bottom: 8px;
      }
      .card .bar.short { width: 60%; }
    </style>
  </head>
  <body>
    <nav>
      <span class="logo">
        <span class="logo-mark" aria-hidden="true"></span>
        My Site
      </span>
      <a href="#">Product</a>
      <a href="#">Docs</a>
      <a href="#">Pricing</a>
      <span class="theme-toggle" title="dark mode toggle — in progress">◐</span>
    </nav>
    <main>
      <h1>Hero headline goes here</h1>
      <p class="lede">
        Replace this paragraph with real copy before launch.
      </p>
      <div class="cta-row">
        <button class="cta">Download for Mac</button>
        <span class="todo">TODO: contrast pass — #214</span>
      </div>
      <div class="hero-art">hero mock — pending final art</div>
      <div class="row">
        <div class="card">
          <div class="bar short"></div>
          <div class="bar"></div>
          <div class="bar" style="width: 80%"></div>
        </div>
        <div class="card">
          <div class="bar short"></div>
          <div class="bar"></div>
          <div class="bar" style="width: 70%"></div>
        </div>
        <div class="card">
          <div class="bar short"></div>
          <div class="bar"></div>
          <div class="bar" style="width: 90%"></div>
        </div>
      </div>
    </main>
  </body>
</html>
`;
