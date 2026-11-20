import { encodeMap } from './encode.js';
import { Zip, ZipPassThrough } from 'fflate';

self.onmessage = async ({ data: { jobs, maps, cfg, quality, zip, zipName } }) => {
  try {
    const total = jobs.reduce((s, j) => s + j.res, 0);
    let done = 0;
    const onRow = (n) => {
      done += n;
      self.postMessage({ type: 'progress', t: Math.min(1, done / total) });
    };
    let files = [];
    for (const j of jobs) {
      self.postMessage({ type: 'status', text: `${j.map} · ${j.res}px · ${j.fmt}` });
      files.push(...(await encodeMap(j.map, j.res, j.fmt, maps, cfg, quality, onRow)));
    }
    files.push({ name: 'mapforge-preset.json', blob: new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' }) });
    if (zip) files = [{ name: zipName, blob: await zipFiles(files) }];
    else files = files.filter((f) => f.name !== 'mapforge-preset.json');
    self.postMessage({ type: 'done', files });
  } catch (e) {
    self.postMessage({ type: 'error', error: String(e?.stack ?? e) });
  }
};

// Stored (no compression): images are already compressed and raw floats barely shrink.
async function zipFiles(files) {
  const parts = [];
  let finish;
  const done = new Promise((r) => (finish = r));
  const z = new Zip((err, chunk, final) => {
    if (err) throw err;
    parts.push(chunk);
    if (final) finish();
  });
  for (const f of files) {
    const entry = new ZipPassThrough(f.name);
    z.add(entry);
    const reader = f.blob.stream().getReader();
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      entry.push(value);
    }
    entry.push(new Uint8Array(0), true);
  }
  z.end();
  await done;
  return new Blob(parts, { type: 'application/zip' });
}
