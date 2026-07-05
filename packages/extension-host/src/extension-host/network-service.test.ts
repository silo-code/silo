import { describe, it, expect, beforeEach, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { getNetworkService } from "./network-service";

const svc = getNetworkService();

/** Build the `[u32 LE meta length][meta JSON][body]` frame net_fetch_bytes emits. */
function frame(meta: object, body: Uint8Array): ArrayBuffer {
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
  const out = new Uint8Array(4 + metaBytes.length + body.length);
  new DataView(out.buffer).setUint32(0, metaBytes.length, true);
  out.set(metaBytes, 4);
  out.set(body, 4 + metaBytes.length);
  return out.buffer;
}

const argOf = (cmd: string) =>
  invokeMock.mock.calls.find((c) => c[0] === cmd)![1];

beforeEach(() => {
  invokeMock.mockReset();
});

describe("NetworkService binary bodies (B14)", () => {
  it("sends a string body as `body`, not `bodyBytes`", async () => {
    invokeMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: "ok",
      finalUrl: "u",
    });
    await svc.fetch("http://x", { method: "POST", body: "hello" });
    expect(argOf("net_fetch").body).toBe("hello");
    expect(argOf("net_fetch").bodyBytes).toBeUndefined();
  });

  it("sends a Uint8Array body as a `bodyBytes` number array", async () => {
    invokeMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: "",
      finalUrl: "u",
    });
    await svc.fetch("http://x", {
      method: "PUT",
      body: new Uint8Array([1, 2, 255]),
    });
    expect(argOf("net_fetch").bodyBytes).toEqual([1, 2, 255]);
    expect(argOf("net_fetch").body).toBeUndefined();
  });

  it("fetchBytes decodes the framed response into status/headers/body", async () => {
    const body = new Uint8Array([137, 80, 78, 71]); // PNG magic
    invokeMock.mockResolvedValueOnce(
      frame(
        {
          status: 200,
          headers: { "content-type": "image/png" },
          finalUrl: "http://x/logo.png",
        },
        body,
      ),
    );
    const res = await svc.fetchBytes("http://x/logo.png");
    expect(res.status).toBe(200);
    expect(res.headers).toEqual({ "content-type": "image/png" });
    expect(res.finalUrl).toBe("http://x/logo.png");
    expect(new Uint8Array(res.body)).toEqual(body);
  });

  it("fetchBytes forwards a binary request body as bodyBytes", async () => {
    invokeMock.mockResolvedValueOnce(
      frame({ status: 204, headers: {}, finalUrl: "u" }, new Uint8Array()),
    );
    await svc.fetchBytes("http://x", {
      method: "POST",
      body: new Uint8Array([9, 9]).buffer,
    });
    expect(argOf("net_fetch_bytes").bodyBytes).toEqual([9, 9]);
  });

  it("wraps a failed fetchBytes in a NetworkError carrying the url", async () => {
    invokeMock.mockRejectedValueOnce("boom");
    await expect(svc.fetchBytes("http://x/err")).rejects.toMatchObject({
      name: "NetworkError",
      url: "http://x/err",
    });
  });
});
