import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const roots = new WeakMap<Element, Root>();

/** Mount the marketing homepage into `el`, replacing any SSG SEO shell children. */
export function mountHomepage(el: HTMLElement): () => void {
  el.classList.add("silo-home");
  // Drop the no-JS shell styling once React owns the node.
  el.classList.remove("silo-home-shell");

  const existing = roots.get(el);
  if (existing) {
    existing.unmount();
    roots.delete(el);
  }

  const root = createRoot(el);
  roots.set(el, root);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

  return () => {
    const current = roots.get(el);
    if (current === root) {
      current.unmount();
      roots.delete(el);
    }
  };
}

export function unmountHomepage(el: HTMLElement): void {
  const root = roots.get(el);
  if (!root) return;
  root.unmount();
  roots.delete(el);
}
