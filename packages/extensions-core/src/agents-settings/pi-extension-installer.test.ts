import { describe, it, expect } from "vitest";
import {
  isForeignPiExtension,
  isPiExtensionInstalled,
  needsPiExtensionRefresh,
} from "./pi-extension-installer";

const spec = { marker: "silo-managed-agent-hook" };
const siloSource = `// Silo session tracking (getsilo.dev)\n// Marker: ${spec.marker}\nexport default function () {}\n`;

describe("isPiExtensionInstalled", () => {
  it("recognizes a file carrying Silo's marker", () => {
    expect(isPiExtensionInstalled(siloSource, spec)).toBe(true);
  });

  it("treats an older Silo file as installed, not as missing", () => {
    // Version skew must not present as "not installed" — drift-refresh is what
    // updates it, and a redundant install prompt would be misleading.
    const older = `// Marker: ${spec.marker}\nexport default function () { /* v1 */ }\n`;
    expect(isPiExtensionInstalled(older, spec)).toBe(true);
  });

  it("does not claim a file we don't own", () => {
    expect(isPiExtensionInstalled("export default () => {};", spec)).toBe(
      false,
    );
    expect(isPiExtensionInstalled(null, spec)).toBe(false);
    expect(isPiExtensionInstalled(undefined, spec)).toBe(false);
  });
});

describe("needsPiExtensionRefresh", () => {
  it("is true when our own file has drifted from the current source", () => {
    const older = `// Marker: ${spec.marker}\nexport default function () { /* v1 */ }\n`;
    expect(needsPiExtensionRefresh(older, siloSource, spec)).toBe(true);
  });

  it("is false when the file already matches", () => {
    expect(needsPiExtensionRefresh(siloSource, siloSource, spec)).toBe(false);
  });

  it("is false when nothing is installed", () => {
    expect(needsPiExtensionRefresh(null, siloSource, spec)).toBe(false);
  });

  it("never rewrites a file Silo doesn't own", () => {
    const theirs = "export default function () { /* mine */ }\n";
    expect(needsPiExtensionRefresh(theirs, siloSource, spec)).toBe(false);
  });
});

describe("isForeignPiExtension", () => {
  it("flags a path collision with someone else's file", () => {
    expect(isForeignPiExtension("export default () => {};", spec)).toBe(true);
  });

  it("is false for our own file and for a free path", () => {
    expect(isForeignPiExtension(siloSource, spec)).toBe(false);
    expect(isForeignPiExtension(null, spec)).toBe(false);
  });
});
