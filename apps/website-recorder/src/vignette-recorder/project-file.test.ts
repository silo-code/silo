import { describe, expect, it } from "vitest";
import {
  createProject,
  deleteProject,
  ensureProjectLibrary,
  getActiveProjectId,
  loadLibrary,
  parseProjectFile,
  projectDownloadName,
  renameProject,
  serializeProjectFile,
  slugifyFilename,
  upsertProject,
  type ProjectPresetSeed,
  type StorageLike,
  type VignetteProject,
} from "./project-file";

function memoryStorage(seed: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const toastPreset: ProjectPresetSeed = {
  id: "worktree-toast",
  label: "Git · worktree toast",
  suggestedFilename: "feature-git",
  defaultCrop: { x: 0.55, y: 0.42, w: 0.43, h: 0.55 },
  defaultRangeMs: { startMs: 3500, endMs: 10500 },
  durationMs: 20_000,
};

const navPreset: ProjectPresetSeed = {
  id: "navigator",
  label: "Navigator",
  suggestedFilename: "feature-workspaces",
  defaultCrop: { x: 0, y: 0.08, w: 0.28, h: 0.84 },
  durationMs: 30_000,
};

describe("slugifyFilename", () => {
  it("slugifies display names", () => {
    expect(slugifyFilename("Feature Git")).toBe("feature-git");
    expect(slugifyFilename("  ")).toBe("vignette");
  });
});

describe("createProject / serialize / parse", () => {
  it("round-trips a project file", () => {
    const project = createProject({
      name: "feature-git",
      preset: toastPreset,
      fps: 30,
      loopBookendMode: "dim",
      zoomSegments: [
        {
          id: "z1",
          startMs: 4000,
          endMs: 5000,
          scale: 1.6,
          focus: { x: 0.4, y: 0.5 },
          ease: "none",
        },
      ],
    });
    const text = serializeProjectFile(project);
    const parsed = parseProjectFile(text, (id) =>
      id === toastPreset.id ? toastPreset.durationMs : 10_000,
    );
    expect(parsed.name).toBe("feature-git");
    expect(parsed.presetId).toBe("worktree-toast");
    expect(parsed.loopBookendMode).toBe("dim");
    expect(parsed.zoomSegments).toHaveLength(1);
    expect(parsed.zoomSegments[0].scale).toBe(1.6);
    expect(projectDownloadName(parsed)).toBe("feature-git.silo-vignette.json");
  });

  it("preserves zoom segments that sit before In", () => {
    const project = createProject({
      name: "pre-zoom",
      preset: toastPreset,
      range: { startMs: 5000, endMs: 9000 },
      zoomSegments: [
        {
          id: "pre",
          startMs: 2000,
          endMs: 4500,
          scale: 1.55,
          focus: { x: 0.8, y: 0.4 },
          ease: "in",
        },
      ],
    });
    expect(project.zoomSegments).toHaveLength(1);
    expect(project.zoomSegments[0].startMs).toBe(2000);
    expect(project.zoomSegments[0].endMs).toBe(4500);
    expect(project.range.startMs).toBe(5000);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseProjectFile("{", () => 1000)).toThrow(/valid JSON/);
  });

  it("clamps crop and range", () => {
    const project = createProject({
      name: "x",
      preset: toastPreset,
      crop: { x: -1, y: 2, w: 5, h: 5 },
      range: { startMs: -100, endMs: 99_000 },
    });
    expect(project.crop.x).toBeGreaterThanOrEqual(0);
    expect(project.crop.w).toBeLessThanOrEqual(1);
    expect(project.range.endMs).toBeLessThanOrEqual(toastPreset.durationMs);
  });
});

describe("project library", () => {
  it("upserts, renames, and deletes", () => {
    const storage = memoryStorage();
    const project = createProject({ name: "One", preset: toastPreset });
    upsertProject(project, storage);
    expect(loadLibrary(storage)).toHaveLength(1);

    const renamed = renameProject(project.id, "Two", storage);
    expect(renamed?.name).toBe("Two");
    expect(renamed?.suggestedFilename).toBe("two");

    deleteProject(project.id, storage);
    expect(loadLibrary(storage)).toHaveLength(0);
  });

  it("seeds from legacy per-preset settings when library is empty", () => {
    const storage = memoryStorage({
      "silo-vignette-crop:worktree-toast": JSON.stringify({
        x: 0.1,
        y: 0.2,
        w: 0.5,
        h: 0.5,
      }),
      "silo-vignette-range:worktree-toast": JSON.stringify({
        startMs: 3500,
        endMs: 9000,
      }),
      "silo-vignette-zoom:worktree-toast": JSON.stringify({
        version: 2,
        segments: [
          {
            id: "z-legacy",
            startMs: 4000,
            endMs: 5000,
            scale: 2,
            focus: { x: 0.5, y: 0.5 },
            ease: "in",
          },
        ],
      }),
    });

    const { projects, activeId } = ensureProjectLibrary(
      [toastPreset, navPreset],
      storage,
    );
    expect(projects.length).toBeGreaterThanOrEqual(1);
    const git = projects.find((p) => p.presetId === "worktree-toast");
    expect(git?.crop).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 });
    expect(git?.range).toEqual({ startMs: 3500, endMs: 9000 });
    expect(git?.zoomSegments).toHaveLength(1);
    expect(activeId).toBe(projects[0].id);
    expect(getActiveProjectId(storage)).toBe(activeId);
  });

  it("creates a default project when nothing is stored", () => {
    const storage = memoryStorage();
    const { projects } = ensureProjectLibrary([toastPreset], storage);
    expect(projects).toHaveLength(1);
    expect(projects[0].suggestedFilename).toBe("feature-git");
  });
});

describe("createProject naming", () => {
  it("uses the project name for the suggested filename", () => {
    const project = createProject({
      name: "My Cool Clip",
      preset: toastPreset,
    });
    expect(project.suggestedFilename).toBe("my-cool-clip");
  });
});

describe("normalize via upsert", () => {
  it("keeps an updatedAt on write", () => {
    const storage = memoryStorage();
    const project = createProject({ name: "A", preset: toastPreset });
    const before = project.updatedAt;
    const [saved] = upsertProject(project, storage);
    expect(saved.updatedAt >= before).toBe(true);
  });
});
