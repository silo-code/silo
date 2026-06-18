import { describe, it, expect } from "vitest";
import {
  inferNpmName,
  defaultPath,
  renderIndexTsx,
  renderPackageJson,
} from "./scaffold.js";

const input = {
  id: "dave.clock",
  name: "Clock",
  description: "Shows the time",
  publisher: "Dave",
};

describe("inferNpmName", () => {
  it("prepends silo- and replaces dots with dashes", () => {
    expect(inferNpmName("dave.clock")).toBe("silo-dave-clock");
  });

  it("handles a single-segment id", () => {
    expect(inferNpmName("myclock")).toBe("silo-myclock");
  });

  it("handles multiple dot segments", () => {
    expect(inferNpmName("acme.tools.git")).toBe("silo-acme-tools-git");
  });
});

describe("defaultPath", () => {
  it("returns /tmp/silo-ext/<id>", () => {
    expect(defaultPath("dave.clock")).toBe("/tmp/silo-ext/dave.clock");
  });
});

describe("renderIndexTsx", () => {
  it("contains the extension id", () => {
    expect(renderIndexTsx(input)).toContain('"dave.clock"');
  });

  it("contains the display name", () => {
    expect(renderIndexTsx(input)).toContain('"Clock"');
  });

  it("contains the description", () => {
    expect(renderIndexTsx(input)).toContain('"Shows the time"');
  });

  it("exports an Extension constant", () => {
    expect(renderIndexTsx(input)).toContain(
      "export const extension: Extension",
    );
  });

  it("imports Extension type from @silo-code/sdk", () => {
    expect(renderIndexTsx(input)).toContain('@silo-code/sdk"');
  });

  it("has an activate function", () => {
    expect(renderIndexTsx(input)).toContain("activate(ctx)");
  });
});

describe("renderPackageJson", () => {
  it("is valid JSON", () => {
    expect(() => JSON.parse(renderPackageJson(input))).not.toThrow();
  });

  it("sets silo.id", () => {
    const pkg = JSON.parse(renderPackageJson(input));
    expect(pkg.silo.id).toBe("dave.clock");
  });

  it("sets silo.main to dist/index.js", () => {
    const pkg = JSON.parse(renderPackageJson(input));
    expect(pkg.silo.main).toBe("dist/index.js");
  });

  it("sets silo.publisher", () => {
    const pkg = JSON.parse(renderPackageJson(input));
    expect(pkg.silo.publisher).toBe("Dave");
  });

  it("derives an npm-safe name from the id", () => {
    const pkg = JSON.parse(renderPackageJson(input));
    expect(pkg.name).toBe("silo-dave-clock");
  });

  it("sets description", () => {
    const pkg = JSON.parse(renderPackageJson(input));
    expect(pkg.description).toBe("Shows the time");
  });

  it("has a build script that runs esbuild", () => {
    const pkg = JSON.parse(renderPackageJson(input));
    expect(pkg.scripts.build).toContain("esbuild src/index.tsx");
    expect(pkg.scripts.build).toContain("--outfile=dist/index.js");
  });

  it("has a dev script that adds --watch", () => {
    const pkg = JSON.parse(renderPackageJson(input));
    expect(pkg.scripts.dev).toContain("--watch");
  });

  it("has a pack script that builds then runs npm pack", () => {
    const pkg = JSON.parse(renderPackageJson(input));
    expect(pkg.scripts.pack).toBe("npm run build && npm pack");
  });

  it("includes files array with dist and package.json", () => {
    const pkg = JSON.parse(renderPackageJson(input));
    expect(pkg.files).toContain("dist");
    expect(pkg.files).toContain("package.json");
  });

  it("includes esbuild and sdk as devDependencies", () => {
    const pkg = JSON.parse(renderPackageJson(input));
    expect(pkg.devDependencies["esbuild"]).toBeDefined();
    expect(pkg.devDependencies["@silo-code/sdk"]).toBeDefined();
    expect(pkg.devDependencies["react"]).toBeDefined();
    expect(pkg.devDependencies["@types/react"]).toBeDefined();
  });

  it("ends with a newline", () => {
    expect(renderPackageJson(input)).toMatch(/\n$/);
  });
});
