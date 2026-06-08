/**
 * Mirror data/{transcript,profiles}.json → public/data/ so Remotion's
 * staticFile-based fetch can serve them in both Studio and render.
 *
 * Wired as a post-hook on transcribe/pfps/fixup; also runnable as `npm run sync`.
 */

import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const FILES = ["transcript.json", "profiles.json", "waveform.json", "waveform.bin"];

async function main() {
  const dataDir = path.join(ROOT, "data");
  const publicDataDir = path.join(ROOT, "public", "data");
  await mkdir(publicDataDir, { recursive: true });

  for (const f of FILES) {
    const src = path.join(dataDir, f);
    const dst = path.join(publicDataDir, f);
    const info = await stat(src).catch(() => null);
    if (!info) {
      console.log(`[sync] ${f}: missing in data/, skipping`);
      continue;
    }
    await copyFile(src, dst);
    console.log(`[sync] ${f}: ${(info.size / 1024).toFixed(1)} KB → public/data/`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
