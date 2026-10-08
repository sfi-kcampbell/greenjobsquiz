/**
 * Identifies an uploaded image from its bytes (never the file name or the
 * browser's claimed type) and reads its dimensions from the header. Only
 * raster formats: SVG can carry scripts, so it's never accepted.
 */
export type ImageType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";
export type ImageInfo = { contentType: ImageType; width: number; height: number };

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION = 20_000;

const ascii = (b: Uint8Array, start: number, end: number) => String.fromCharCode(...b.subarray(start, end));
const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);

function png(b: Uint8Array): ImageInfo | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !sig.every((v, i) => b[i] === v) || ascii(b, 12, 16) !== "IHDR") return null;
  return { contentType: "image/png", width: u32be(b, 16), height: u32be(b, 20) };
}

function gif(b: Uint8Array): ImageInfo | null {
  if (b.length < 10 || !["GIF87a", "GIF89a"].includes(ascii(b, 0, 6))) return null;
  return { contentType: "image/gif", width: u16le(b, 6), height: u16le(b, 8) };
}

function jpeg(b: Uint8Array): ImageInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  // Walk the segments to a start-of-frame marker (SOF0–SOF15, not DHT/JPG/DAC).
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const length = u16be(b, i + 2);
    if (length < 2) return null;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { contentType: "image/jpeg", height: u16be(b, i + 5), width: u16be(b, i + 7) };
    }
    i += 2 + length;
  }
  return null;
}

function webp(b: Uint8Array): ImageInfo | null {
  if (b.length < 30 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 12) !== "WEBP") return null;
  const chunk = ascii(b, 12, 16);
  if (chunk === "VP8X") return { contentType: "image/webp", width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  if (chunk === "VP8 " && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
    return { contentType: "image/webp", width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (chunk === "VP8L" && b[20] === 0x2f) {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { contentType: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** The image's type and size, or null if it isn't a PNG, JPEG, WebP or GIF we can read. */
export function imageInfo(bytes: Uint8Array): ImageInfo | null {
  const info = png(bytes) ?? jpeg(bytes) ?? gif(bytes) ?? webp(bytes);
  if (!info) return null;
  const ok = (n: number) => Number.isInteger(n) && n > 0 && n <= MAX_DIMENSION;
  return ok(info.width) && ok(info.height) ? info : null;
}
