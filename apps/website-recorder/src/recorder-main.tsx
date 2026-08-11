import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { VignetteRecorder } from "./vignette-recorder/VignetteRecorder";
import "@silo-code/website/styles.css";
import "./vignette-recorder/vignette-recorder.css";

const rootEl = document.getElementById("root")!;
rootEl.classList.add("silo-home");

createRoot(rootEl).render(
  <StrictMode>
    <VignetteRecorder />
  </StrictMode>,
);
