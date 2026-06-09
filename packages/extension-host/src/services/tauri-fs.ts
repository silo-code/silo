import { invoke } from "@tauri-apps/api/core";

export interface FileMeta {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modifiedMs: number;
}

interface RawFileMeta {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified_ms: number;
}

export function fsReadText(path: string): Promise<string> {
  return invoke<string>("fs_read_text", { path });
}

export function fsReadBytes(path: string): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("fs_read_bytes", { path });
}

export function fsWriteText(path: string, content: string): Promise<void> {
  return invoke<void>("fs_write_text", { path, content });
}

export function fsCreateDir(path: string): Promise<void> {
  return invoke<void>("fs_create_dir", { path });
}

export function fsPathExists(path: string): Promise<boolean> {
  return invoke<boolean>("fs_path_exists", { path });
}

export function fsRename(oldPath: string, newPath: string): Promise<void> {
  return invoke<void>("fs_rename", { oldPath, newPath });
}

export function fsCopyDir(src: string, dst: string): Promise<void> {
  return invoke<void>("fs_copy_dir", { src, dst });
}

export function fsDelete(path: string): Promise<void> {
  return invoke<void>("fs_delete", { path });
}

export function fsReveal(path: string): Promise<void> {
  return invoke<void>("fs_reveal", { path });
}

export async function fsReadDir(path: string): Promise<FileMeta[]> {
  const raw = await invoke<RawFileMeta[]>("fs_read_dir", { path });
  return raw.map((r) => ({
    name: r.name,
    path: r.path,
    isDir: r.is_dir,
    size: r.size,
    modifiedMs: r.modified_ms,
  }));
}
