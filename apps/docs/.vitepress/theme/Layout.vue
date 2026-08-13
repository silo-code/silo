<script setup>
import DefaultTheme from "vitepress/theme";
import { Content, useRoute } from "vitepress";
import { computed, nextTick, onBeforeUnmount, onMounted, watch } from "vue";
import {
  HOME_FONTS_STYLESHEET,
  buildHomeFontHead,
} from "@silo-code/website/seo";
import GitHubStars from "./GitHubStars.vue";
import "./home-shell.css";

const { Layout } = DefaultTheme;
const route = useRoute();

const isHome = computed(
  () => route.path === "/" || route.path === "/index.html",
);

/**
 * transformHead only runs at SSG build time. In `docs:dev` the SPA shell has
 * an empty <head>, and we removed the styles.css @import — so inject the
 * homepage font links as soon as we know we're on `/`.
 */
function ensureHomeFonts() {
  if (typeof document === "undefined") return;
  if (document.querySelector(`link[href="${HOME_FONTS_STYLESHEET}"]`)) return;
  for (const tuple of buildHomeFontHead()) {
    const [, attrs] = tuple;
    const link = document.createElement("link");
    for (const [key, value] of Object.entries(attrs)) {
      if (value === "") link.setAttribute(key, "");
      else link.setAttribute(key, value);
    }
    document.head.appendChild(link);
  }
}

watch(
  isHome,
  (home) => {
    if (home) ensureHomeFonts();
  },
  { immediate: true },
);

/** @type {null | (() => void)} */
let unmountHome = null;

async function mountHome() {
  unmountHome?.();
  unmountHome = null;
  await nextTick();
  const el = document.getElementById("silo-home");
  if (!el) return;
  // CSS first (hero background + hide below-fold shell), then the React
  // chunk — keeps first paint styled and avoids bundling React into docs
  // routes / the VitePress SSR graph.
  await import("@silo-code/website/styles.css");
  const { mountHomepage } = await import("@silo-code/website");
  unmountHome = mountHomepage(el);
}

function teardownHome() {
  unmountHome?.();
  unmountHome = null;
}

watch(
  isHome,
  (home) => {
    if (typeof window === "undefined") return;
    if (home) void mountHome();
    else teardownHome();
  },
  { flush: "post" },
);

onMounted(() => {
  if (isHome.value) void mountHome();
});

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
let openAnchor = null;

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
  openAnchor?.classList.remove("is-open");
  openAnchor = null;
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
  if (openAnchor && openAnchor !== anchor)
    openAnchor.classList.remove("is-open");
  openAnchor = anchor;
  anchor.classList.add("is-open");
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
  if (isHome.value) return;
  injectToggles();
  observer = new MutationObserver(scheduleInject);
  observer.observe(document.body, { childList: true, subtree: true });
});

watch(isHome, (home) => {
  if (home) {
    observer?.disconnect();
    observer = undefined;
    closeMenu();
    return;
  }
  injectToggles();
  if (!observer) {
    observer = new MutationObserver(scheduleInject);
    observer.observe(document.body, { childList: true, subtree: true });
  }
});

onBeforeUnmount(() => {
  teardownHome();
  observer?.disconnect();
  closeMenu();
  menuEl?.remove();
  menuEl = null;
});
</script>

<template>
  <div v-if="isHome" class="silo-marketing-home">
    <Content />
  </div>
  <Layout v-else>
    <template #nav-bar-content-after>
      <GitHubStars />
    </template>
    <template #nav-screen-content-after>
      <GitHubStars />
    </template>
  </Layout>
</template>

<style>
/* Standout "★ Star on GitHub" styles used to live on the VitePress home
   hero; the marketing homepage is now React. Kept empty of home-only rules
   so docs chrome stays untouched. */
</style>
