import { describe, expect, it } from "vitest";
import { pickDownloadAsset, type ReleaseAsset } from "./download-url";

const assets: ReleaseAsset[] = [
  {
    name: "latest.json",
    browser_download_url: "https://example.com/latest.json",
  },
  {
    name: "Silo_0.44.1_aarch64.dmg",
    browser_download_url: "https://example.com/arm.dmg",
  },
  {
    name: "Silo_0.44.1_x64.dmg",
    browser_download_url: "https://example.com/intel.dmg",
  },
  {
    name: "Silo_aarch64.app.tar.gz",
    browser_download_url: "https://example.com/arm.tar.gz",
  },
  {
    name: "Silo_0.44.1_x64-setup.exe",
    browser_download_url: "https://example.com/setup.exe",
  },
  {
    name: "Silo_0.44.1_amd64.AppImage",
    browser_download_url: "https://example.com/appimage",
  },
  {
    name: "Silo_0.44.1_amd64.deb",
    browser_download_url: "https://example.com/deb",
  },
  {
    name: "Silo_0.44.1_x64-setup.exe.sig",
    browser_download_url: "https://example.com/setup.exe.sig",
  },
];

describe("pickDownloadAsset", () => {
  it("picks the Apple Silicon dmg, not the updater tarball", () => {
    expect(
      pickDownloadAsset(assets, { platform: "mac", macArch: "arm" })
        ?.browser_download_url,
    ).toBe("https://example.com/arm.dmg");
  });

  it("picks the Intel Mac dmg", () => {
    expect(
      pickDownloadAsset(assets, { platform: "mac", macArch: "x64" })
        ?.browser_download_url,
    ).toBe("https://example.com/intel.dmg");
  });

  it("picks the Windows setup exe, not the .sig", () => {
    expect(
      pickDownloadAsset(assets, { platform: "windows" })?.browser_download_url,
    ).toBe("https://example.com/setup.exe");
  });

  it("prefers AppImage on Linux", () => {
    expect(
      pickDownloadAsset(assets, { platform: "linux" })?.browser_download_url,
    ).toBe("https://example.com/appimage");
  });
});
