import type { ReactNode } from "react";

// Inline SVG icons. Sized via currentColor + em so they scale with font.
export const ICON_CHEV_DOWN: ReactNode = (
  <svg viewBox="0 0 16 16" width="0.85em" height="0.85em" aria-hidden="true">
    <path
      d="M3 6l5 5 5-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
export const ICON_CHEV_RIGHT: ReactNode = (
  <svg viewBox="0 0 16 16" width="0.85em" height="0.85em" aria-hidden="true">
    <path
      d="M6 3l5 5-5 5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
export const ICON_OPEN: ReactNode = (
  <svg viewBox="0 0 16 16" width="0.95em" height="0.95em" aria-hidden="true">
    <path
      d="M3 2.5h6.5L13 6v7.5a.5.5 0 01-.5.5h-9a.5.5 0 01-.5-.5V3a.5.5 0 01.5-.5z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
    <path
      d="M9.5 2.5V6H13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
);
export const ICON_UNDO: ReactNode = (
  <svg viewBox="0 0 16 16" width="0.95em" height="0.95em" aria-hidden="true">
    <path
      d="M3 7h7a3 3 0 010 6H7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M5.5 4L3 6.5 5.5 9"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
export const ICON_PLUS: ReactNode = (
  <svg viewBox="0 0 16 16" width="0.95em" height="0.95em" aria-hidden="true">
    <path
      d="M8 3v10M3 8h10"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);
export const ICON_MINUS: ReactNode = (
  <svg viewBox="0 0 16 16" width="0.95em" height="0.95em" aria-hidden="true">
    <path
      d="M3 8h10"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);
export const ICON_CHECK: ReactNode = (
  <svg viewBox="0 0 16 16" width="0.95em" height="0.95em" aria-hidden="true">
    <path
      d="M3 8.5l3 3 7-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
export const ICON_PUSH: ReactNode = (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path
      d="M8 11V3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M5 6l3-3 3 3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3 13h10"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);
// Vertical mirror of ICON_PUSH: a bar at the top (the remote) with an arrow
// pulling down from it.
export const ICON_PULL: ReactNode = (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path
      d="M3 3h10"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M8 5v8"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M5 10l3 3 3-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
