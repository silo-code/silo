<script setup>
import DefaultTheme from "vitepress/theme";
import { onMounted, onBeforeUnmount } from "vue";
const { Layout } = DefaultTheme;

// Theme toggle for the live `.silo-demo` component examples (Design System
// docs). Independent of VitePress's own site dark/light toggle: one shared
// `data-silo-demo-theme` attribute on <html>, persisted to localStorage, so
// every example on every page stays in sync. See silo-demos.css for the
// token blocks this attribute switches between, and config.ts for the inline
// head script that applies a stored preference before first paint.
const STORAGE_KEY = "silo-demo-theme";

const SUN_ICON =
  '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="3.2" stroke="currentColor" stroke-width="1.3"/><path d="M8 1.3v1.6M8 13.1v1.6M14.7 8h-1.6M2.9 8H1.3M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1M12.7 12.7l-1.1-1.1M4.4 4.4L3.3 3.3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
const MOON_ICON =
  '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.5 9.7A5.8 5.8 0 1 1 6.3 2.5a4.6 4.6 0 0 0 7.2 7.2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';

function currentDemoTheme() {
  return document.documentElement.getAttribute("data-silo-demo-theme") ===
    "dark"
    ? "dark"
    : "light";
}

function paintToggle(button, theme) {
  button.innerHTML = theme === "dark" ? MOON_ICON : SUN_ICON;
  button.setAttribute(
    "aria-label",
    theme === "dark"
      ? "Switch example theme to light"
      : "Switch example theme to dark",
  );
}

function toggleDemoTheme() {
  const next = currentDemoTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-silo-demo-theme", next);
  localStorage.setItem(STORAGE_KEY, next);
  document
    .querySelectorAll(".silo-demo-theme-toggle")
    .forEach((button) => paintToggle(button, next));
}

function injectToggles() {
  const theme = currentDemoTheme();
  document.querySelectorAll(".silo-demo").forEach((demo) => {
    if (demo.querySelector(":scope > .silo-demo-theme-toggle")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "silo-demo-theme-toggle";
    paintToggle(button, theme);
    button.addEventListener("click", toggleDemoTheme);
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
