/**
 * Step 1: Transcribe the audio file with Deepgram Nova-3.
 *
 * Reads:  public/audio.ogg  (or AUDIO_PATH env)
 * Writes: data/transcript.json
 */

import { config as loadEnv } from "dotenv";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { transcribeFile } from "./lib/deepgram.js";

const ROOT = path.resolve(import.meta.dirname, "..");
loadEnv({ path: path.join(ROOT, ".env") });

async function main() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    console.error("DEEPGRAM_API_KEY not set — add it to .env");
    process.exit(1);
  }

  const audioPath = process.env.AUDIO_PATH ?? path.join(ROOT, "public", "audio.ogg");
  const outDir = path.join(ROOT, "data");
  const outPath = path.join(outDir, "transcript.json");

  const info = await stat(audioPath).catch(() => null);
  if (!info) {
    console.error(`Audio not found at ${audioPath}`);
    console.error("Copy your file there: cp ~/Downloads/<name>.ogg public/audio.ogg");
    process.exit(1);
  }

  const ext = path.extname(audioPath).toLowerCase();
  const contentType =
    ext === ".ogg" || ext === ".opus"
      ? "audio/ogg"
      : ext === ".wav"
        ? "audio/wav"
        : ext === ".mp3"
          ? "audio/mpeg"
          : ext === ".m4a"
            ? "audio/mp4"
            : "application/octet-stream";

  console.log(`[1-transcribe] Audio: ${audioPath}`);
  console.log(`[1-transcribe] Size:  ${(info.size / 1_048_576).toFixed(1)} MB`);
  console.log(`[1-transcribe] Type:  ${contentType}`);
  console.log(`[1-transcribe] Submitting to Deepgram (this can take ~5-10 min for 2hr audio)...`);

  const keyterms = (process.env.DEEPGRAM_KEYTERMS ?? "Farcaster,Warpcast")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  console.log(`[1-transcribe] Keyterms: ${keyterms.join(", ")}`);

  const start = Date.now();
  const data = await transcribeFile({ audioPath, apiKey, contentType, keyterms });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  await mkdir(outDir, { recursive: true });
  await writeFile(outPath, JSON.stringify(data, null, 2));

  const duration = data.metadata?.duration ?? 0;
  const channel = data.results?.channels?.[0];
  const lang = channel?.detected_language ?? "?";
  const utterances = data.results?.utterances ?? [];
  const words = channel?.alternatives?.[0]?.words ?? [];
  const speakers = new Set(words.map((w) => w.speaker).filter((s) => s !== undefined));

  console.log(`[1-transcribe] Done in ${elapsed}s.`);
  console.log(`[1-transcribe] Duration:  ${(duration / 60).toFixed(1)} min`);
  console.log(`[1-transcribe] Language:  ${lang}`);
  console.log(`[1-transcribe] Utterances: ${utterances.length}`);
  console.log(`[1-transcribe] Words:     ${words.length}`);
  console.log(`[1-transcribe] Speakers:  ${speakers.size}`);
  console.log(`[1-transcribe] Wrote:     ${path.relative(ROOT, outPath)}`);
  console.log(`\nNext: npm run intros`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
