<script setup>
import DefaultTheme from "vitepress/theme";
import { onMounted, onBeforeUnmount } from "vue";
const { Layout } = DefaultTheme;

// Theme picker for the live `.silo-demo` component examples (Design System
// docs). Independent of VitePress's own site dark/light toggle: one shared
// `data-silo-demo-theme` attribute on <html>, persisted to localStorage, so
// every example on every page stays in sync. See silo-demos.css for the
// token blocks this attribute switches between, and config.ts for the inline
// head script that applies a stored preference before first paint.
//
// Covers all of Silo's bundled theme presets (packages/extension-host/src/
// layout/presets.ts + packages/extensions-silo/src/theme-presets/index.ts),
// not just Light/Dark — a button on each demo opens a shared menu listing
// every preset.
const STORAGE_KEY = "silo-demo-theme";

const THEMES = [
  { id: "light", name: "Light", accent: "#0078d4" },
  { id: "dark", name: "Dark", accent: "#a0a0a0" },
  { id: "gruvbox-dark", name: "Gruvbox Dark", accent: "#83a598" },
  { id: "high-contrast-dark", name: "High Contrast Dark", accent: "#a0a0a0" },
  {
    id: "high-contrast-light",
    name: "High Contrast Light",
    accent: "#0078d4",
  },
  { id: "solarized-dark", name: "Solarized Dark", accent: "#cb4b16" },
  { id: "solarized-light", name: "Solarized Light", accent: "#d25f26" },
  { id: "tokyo-night", name: "Tokyo Night", accent: "#7aa2f7" },
];

function currentDemoTheme() {
  const id = document.documentElement.getAttribute("data-silo-demo-theme");
  return THEMES.some((t) => t.id === id) ? id : "light";
}

function paintToggle(button) {
  const theme = THEMES.find((t) => t.id === currentDemoTheme());
  button.innerHTML = `<span class="silo-demo-theme-swatch" style="background:${theme.accent}"></span>`;
  button.setAttribute("aria-label", `Change example theme (${theme.name})`);
}

function paintAllToggles() {
  document.querySelectorAll(".silo-demo-theme-toggle").forEach(paintToggle);
}

let menuEl = null;

function paintMenu() {
  if (!menuEl) return;
  const theme = currentDemoTheme();
  menuEl.querySelectorAll(".silo-demo-theme-menu-item").forEach((item) => {
    const active = item.dataset.themeId === theme;
    item.setAttribute("aria-checked", String(active));
    item.classList.toggle("is-active", active);
  });
}

function selectTheme(id) {
  document.documentElement.setAttribute("data-silo-demo-theme", id);
  localStorage.setItem(STORAGE_KEY, id);
  paintAllToggles();
  paintMenu();
}

function closeMenu() {
  if (menuEl) menuEl.hidden = true;
  document.removeEventListener("mousedown", handleOutsideClick, true);
  document.removeEventListener("keydown", handleMenuKeydown, true);
}

function handleOutsideClick(event) {
  if (
    menuEl &&
    !menuEl.contains(event.target) &&
    !event.target.closest(".silo-demo-theme-toggle")
  ) {
    closeMenu();
  }
}

function handleMenuKeydown(event) {
  if (event.key === "Escape") closeMenu();
}

function ensureMenu() {
  if (menuEl) return menuEl;
  menuEl = document.createElement("div");
  menuEl.className = "silo-demo-theme-menu";
  menuEl.setAttribute("role", "menu");
  menuEl.hidden = true;
  THEMES.forEach((theme) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "silo-demo-theme-menu-item";
    item.setAttribute("role", "menuitemradio");
    item.dataset.themeId = theme.id;
    item.innerHTML = `<span class="silo-demo-theme-menu-swatch" style="background:${theme.accent}"></span><span>${theme.name}</span>`;
    item.addEventListener("click", () => {
      selectTheme(theme.id);
      closeMenu();
    });
    menuEl.appendChild(item);
  });
  document.body.appendChild(menuEl);
  return menuEl;
}

function openMenu(anchor) {
  const menu = ensureMenu();
  paintMenu();
  menu.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const top = rect.bottom + window.scrollY + 4;
  const maxLeft =
    window.scrollX +
    document.documentElement.clientWidth -
    menu.offsetWidth -
    8;
  const left = Math.min(
    rect.right + window.scrollX - menu.offsetWidth,
    maxLeft,
  );
  menu.style.top = `${top}px`;
  menu.style.left = `${Math.max(left, window.scrollX + 8)}px`;
  document.addEventListener("mousedown", handleOutsideClick, true);
  document.addEventListener("keydown", handleMenuKeydown, true);
}

function injectToggles() {
  document.querySelectorAll(".silo-demo").forEach((demo) => {
    if (demo.querySelector(":scope > .silo-demo-theme-toggle")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "silo-demo-theme-toggle";
    button.setAttribute("aria-haspopup", "menu");
    paintToggle(button);
    button.addEventListener("click", () => openMenu(button));
    demo.appendChild(button);
  });
}

let observer;
let scheduled = false;
function scheduleInject() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    injectToggles();
  });
}

onMounted(() => {
  injectToggles();
  observer = new MutationObserver(scheduleInject);
  observer.observe(document.body, { childList: true, subtree: true });
});

onBeforeUnmount(() => {
  observer?.disconnect();
  closeMenu();
  menuEl?.remove();
  menuEl = null;
});
</script>

<template>
  <Layout>
    <template #home-features-before>
      <div class="demo-video">
        <video autoplay loop muted playsinline>
          <source src="/demo.mp4" type="video/mp4" />
        </video>
      </div>
    </template>
  </Layout>
</template>

<style>
.demo-video {
  padding: 0 24px;
  margin: 2rem 0 3.5rem;
  box-sizing: border-box;
}
@media (min-width: 640px) {
  .demo-video {
    padding: 0 48px;
  }
}
@media (min-width: 960px) {
  .demo-video {
    padding: 0 64px;
  }
}
.demo-video video {
  max-width: 1152px;
  width: 100%;
  display: block;
  margin: 0 auto;
  border-radius: 8px;
}
</style>
