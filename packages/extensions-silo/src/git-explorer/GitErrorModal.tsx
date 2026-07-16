import { useState } from "react";
import { CopySimple } from "@phosphor-icons/react";

// The body of the "View details" modal behind a git failure toast (see
// GitView's `notifyError`). Pulled out of GitView.tsx so the "Copied" button
// feedback can use local state — the inline `showModal` render prop it used
// to live in isn't a component, so it can't call hooks.

/** The "View details" modal body for a git failure: full output + copy/close. */
export function GitErrorModal({
  detail,
  onClose,
}: {
  detail: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(detail);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <pre className="git-error-detail">{detail}</pre>
      <div className="silo-modal-actions">
        <button
          type="button"
          className="silo-button git-error-copy-button"
          onClick={handleCopy}
        >
          <CopySimple size={14} />
          {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" className="silo-button-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </>
  );
}
