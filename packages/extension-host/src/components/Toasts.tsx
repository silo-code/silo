import { useSnapshot } from "valtio";
import { Info, Warning, XCircle, X, type Icon } from "@phosphor-icons/react";
import {
  toastStore,
  dismissToast,
  runToastAction,
} from "../extension-host/ui-service";
import "./Toasts.css";

// Host-rendered chrome for `ctx.ui.notify`. Renders the toast list (host-shell
// state in ui-service.ts) stacked in the bottom-right corner: a leading status
// icon, an optional bold title over the message, a close button, and any action
// buttons. Each toast either auto-dismisses on a timer (set when pushed) or
// stays until dismissed (errors / toasts with actions). Extensions never touch
// this — they call `ctx.ui.notify`.

const LEVEL_ICON: Record<"info" | "warn" | "error", Icon> = {
  info: Info,
  warn: Warning,
  error: XCircle,
};

export function Toasts() {
  const snap = useSnapshot(toastStore);
  if (snap.toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {snap.toasts.map((t) => {
        const LevelIcon = LEVEL_ICON[t.level];
        return (
          <div key={t.id} className={`toast toast-${t.level}`}>
            <LevelIcon className="toast-icon" weight="fill" aria-hidden />
            <div className="toast-content">
              {t.title && <div className="toast-title">{t.title}</div>}
              <div className="toast-message">{t.message}</div>
              {t.actions && (
                <div className="toast-actions">
                  {t.actions.map((a, i) => (
                    <button
                      key={i}
                      type="button"
                      className="silo-button"
                      onClick={() => runToastAction(t.id, i)}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="toast-close"
              onClick={() => dismissToast(t.id)}
              title="Dismiss"
              aria-label="Dismiss"
            >
              <X aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
