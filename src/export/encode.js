import { createResampler } from './resample.js';
import { createPngEncoder } from './png.js';
import { mapSource, FORMATS } from './maps.js';
import { buildMeta } from './meta.js';
import { NATIVE_RES } from '../generation/defaults.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const STRIP = 256;

// Returns [{ name, blob }] for one (map, res, format) request.
export async function encodeMap(key, res, fmt, maps, cfg, quality, onRow) {
  const src = mapSource(key, maps, cfg);
  const exact = res === NATIVE_RES;
  const name = `${key}_${res}${exact ? '' : '_resampled'}`;
  const next = createResampler(src.field, NATIVE_RES, res, src.mode);
  const row = new Float32Array(res);
  const files = [];

  if (fmt === 'bin') {
    const parts = [];
    if (exact && key !== 'water') {
      const a = src.native ?? src.field;
      parts.push(new Uint8Array(a.buffer, a.byteOffset, a.byteLength).slice());
      onRow(res);
    } else {
      const Ctor = src.binType === 'u8' ? Uint8Array : src.binType === 'i8' ? Int8Array : Float32Array;
      for (let y0 = 0; y0 < res; y0 += STRIP) {
        const rows = Math.min(STRIP, res - y0);
        const buf = new Ctor(rows * res);
        for (let r = 0; r < rows; r++) {
          next(y0 + r, row);
          if (src.binType === 'u8') for (let i = 0; i < res; i++) buf[r * res + i] = src.unit(row[i]);
          else if (src.binType === 'i8') for (let i = 0; i < res; i++) buf[r * res + i] = Math.round(row[i]);
          else buf.set(row, r * res);
        }
        parts.push(new Uint8Array(buf.buffer));
        onRow(rows);
      }
    }
    files.push({ name: `${name}.bin`, blob: new Blob(parts, { type: 'application/octet-stream' }) });
    const fmtName = src.binType === 'u8' ? 'uint8' : src.binType === 'i8' ? 'int8' : 'float32-le';
    files.push(meta(key, res, cfg, maps, exact, { format: fmtName, file: `${name}.bin` }, `${name}.json`));
    return files;
  }

  if (fmt === 'png' || fmt === 'png16') {
    const deep = fmt === 'png16';
    const ch = src.rgb ? 3 : 1;
    const enc = createPngEncoder(res, res, ch, deep ? 16 : 8);
    const bytes = new Uint8Array(res * ch * (deep ? 2 : 1));
    for (let y = 0; y < res; y++) {
      next(y, row);
      if (src.rgb) {
        for (let i = 0; i < res; i++) bytes.set(src.rgb(row[i]), i * 3);
      } else if (deep) {
        for (let i = 0; i < res; i++) {
          const v = Math.round(clamp01(src.unit(row[i])) * 65535);
          bytes[i * 2] = v >> 8;
          bytes[i * 2 + 1] = v & 255;
        }
      } else {
        for (let i = 0; i < res; i++) bytes[i] = Math.round(clamp01(src.unit(row[i])) * 255);
      }
      enc.row(bytes);
      if ((y & 63) === 63) onRow(64);
    }
    onRow(res & 63);
    files.push({ name: `${name}${deep ? '_16bit' : ''}.png`, blob: enc.end() });
    if (deep || key === 'height') files.push(meta(key, res, cfg, maps, exact, { encoding: deep ? 'uint16 = (h-min)/(max-min)*65535' : 'uint8 = (h-min)/(max-min)*255' }, `${name}${deep ? '_16bit' : ''}.json`));
    return files;
  }

  // JPG / WebP: canvas encoders, filled strip by strip.
  const canvas = new OffscreenCanvas(res, res);
  const ctx = canvas.getContext('2d');
  for (let y0 = 0; y0 < res; y0 += STRIP) {
    const rows = Math.min(STRIP, res - y0);
    const img = new ImageData(res, rows);
    const d = img.data;
    for (let r = 0; r < rows; r++) {
      next(y0 + r, row);
      for (let i = 0; i < res; i++) {
        const o = (r * res + i) * 4;
        if (src.rgb) {
          const c = src.rgb(row[i]);
          d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2];
        } else {
          d[o] = d[o + 1] = d[o + 2] = Math.round(clamp01(src.unit(row[i])) * 255);
        }
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, y0);
    onRow(rows);
  }
  const type = fmt === 'jpg' ? 'image/jpeg' : 'image/webp';
  const blob = await canvas.convertToBlob({ type, quality });
  canvas.width = canvas.height = 1;
  files.push({ name: `${name}.${FORMATS[fmt].ext}`, blob });
  return files;
}

function meta(key, res, cfg, maps, exact, extra, name) {
  const m = buildMeta(key, res, cfg, key === 'height' || key === 'water' ? maps.stats : null, exact, extra);
  return { name, blob: new Blob([JSON.stringify(m, null, 2)], { type: 'application/json' }) };
}
