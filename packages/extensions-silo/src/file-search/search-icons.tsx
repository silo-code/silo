import type { ReactNode } from "react";

// Inline SVG icons, sized in em so they track the font.
export const ICON_CHEV_DOWN: ReactNode = (
  <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true">
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

export const ICON_CHEV_UP: ReactNode = (
  <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true">
    <path
      d="M3 10l5-5 5 5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const ICON_CHEV_RIGHT: ReactNode = (
  <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true">
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

export const ICON_FILE: ReactNode = (
  <svg viewBox="0 0 16 16" width="1.1em" height="1.1em" aria-hidden="true">
    <path
      d="M4 2h5l3 3v9H4z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
    <path
      d="M9 2v3h3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
);
