// Minimal streaming PNG encoder (gray 8/16-bit, RGB 8-bit). Rows go straight into a
// zlib stream, so large images never exist as one raw buffer.
import { Zlib } from 'fflate';

const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c >>> 0;
}
function crc32(bytes, crc = 0xffffffff) {
  for (let i = 0; i < bytes.length; i++) crc = CRC[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return crc;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  v.setUint32(8 + data.length, (crc32(out.subarray(4, 8 + data.length)) ^ 0xffffffff) >>> 0);
  return out;
}

// channels: 1 (gray) or 3 (RGB); depth: 8 or 16. Call row(Uint8Array) `h` times, then end().
export function createPngEncoder(w, h, channels, depth) {
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr[8] = depth;
  ihdr[9] = channels === 3 ? 2 : 0;
  parts.push(chunk('IHDR', ihdr));
  const z = new Zlib({ level: 6 });
  z.ondata = (d) => d.length && parts.push(chunk('IDAT', d));
  const stride = w * channels * (depth / 8);
  const line = new Uint8Array(stride + 1);
  return {
    row(bytes) {
      line[0] = 0;
      line.set(bytes.subarray(0, stride), 1);
      z.push(line.slice());
    },
    end() {
      z.push(new Uint8Array(0), true);
      parts.push(chunk('IEND', new Uint8Array(0)));
      return new Blob(parts, { type: 'image/png' });
    },
  };
}
