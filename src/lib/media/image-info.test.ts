import { describe, expect, it } from "vitest";
import { imageInfo } from "./image-info";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >> 8) & 255];
const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];

describe("imageInfo", () => {
  it("reads PNG", () => {
    const b = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], be32(13), "IHDR", be32(640), be32(480), [8, 6, 0, 0, 0]);
    expect(imageInfo(b)).toEqual({ contentType: "image/png", width: 640, height: 480 });
  });

  it("reads GIF", () => {
    expect(imageInfo(bytes("GIF89a", le16(32), le16(16), [0, 0, 0]))).toEqual({ contentType: "image/gif", width: 32, height: 16 });
  });

  it("reads JPEG, skipping segments before the frame header", () => {
    const app0 = [0xff, 0xe0, ...be16(16), ...new Array(14).fill(0)];
    const sof0 = [0xff, 0xc0, ...be16(17), 8, ...be16(300), ...be16(1200), 3, ...new Array(9).fill(0)];
    expect(imageInfo(bytes([0xff, 0xd8], app0, sof0))).toEqual({ contentType: "image/jpeg", width: 1200, height: 300 });
  });

  it("reads WebP (extended, lossy and lossless)", () => {
    const vp8x = bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8X", [10, 0, 0, 0], [0, 0, 0, 0], le24(799), le24(599), [0, 0]);
    expect(imageInfo(vp8x)).toEqual({ contentType: "image/webp", width: 800, height: 600 });
    const lossy = bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8 ", [0, 0, 0, 0], [0, 0, 0], [0x9d, 0x01, 0x2a], le16(320), le16(200), [0, 0]);
    expect(imageInfo(lossy)).toEqual({ contentType: "image/webp", width: 320, height: 200 });
    const w = 100 - 1;
    const h = 50 - 1;
    const bits = w | (h << 14);
    const lossless = bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8L", [0, 0, 0, 0], [0x2f], [bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >> 24) & 255], [0, 0, 0, 0, 0]);
    expect(imageInfo(lossless)).toEqual({ contentType: "image/webp", width: 100, height: 50 });
  });

  it("refuses SVG, HTML, garbage and absurd sizes", () => {
    expect(imageInfo(bytes('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'))).toBeNull();
    expect(imageInfo(bytes("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(imageInfo(new Uint8Array(100))).toBeNull();
    expect(imageInfo(new Uint8Array())).toBeNull();
    expect(imageInfo(bytes("GIF89a", le16(0), le16(16), [0]))).toBeNull();
    const huge = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], be32(13), "IHDR", be32(50_000), be32(10), [0]);
    expect(imageInfo(huge)).toBeNull();
  });
});
