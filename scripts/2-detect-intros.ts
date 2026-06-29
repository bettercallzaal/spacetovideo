/**
 * Step 2: Detect host intro events and build guest segments.
 *
 * Reads:  data/transcript.json, public/audio.ogg
 * Writes: data/intros.json + data/samples/intro_N.mp3
 *
 * Strategy:
 *   1. Pick the host = the diarization speaker_id with the largest total duration.
 *   2. Walk utterances; whenever the host says an intro prompt, capture the
 *      next 1-3 non-host utterances as the guest's intro response.
 *   3. Define a guest segment from this prompt's start to the next prompt's
 *      start (capped at 5 minutes).
 *   4. Slice a 15-second sample MP3 from the guest's response window for review.
 *
 * The human then edits data/intros.json, filling in `username` for each guest
 * they recognize. Empty username = skip in step 3.
 */

import { config as loadEnv } from "dotenv";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import type { DeepgramResponse, DeepgramUtterance } from "./lib/deepgram.js";
import { extractCandidateName, matchesHostPrompt } from "./lib/intro-patterns.js";
import { sliceAudio } from "./lib/ffmpeg.js";

const ROOT = path.resolve(import.meta.dirname, "..");
loadEnv({ path: path.join(ROOT, ".env") });
const SEGMENT_CAP_MS = 5 * 60 * 1000;
const SAMPLE_DURATION_SEC = 15;

type IntroEntry = {
  id: number;
  start_ms: number;
  end_ms: number;
  host_speaker_id: number | null;
  host_prompt: string;
  candidate_name: string | null;
  candidate_raw: string;
  context_snippet: string;
  sample_audio: string;
  // Fill in `username` for Farcaster users; leave blank to render with the
  // default warplet. Use `display_name` to label off-platform guests
  // (e.g. "Jellyfish", "Duck"); blank → falls back to candidate_name → "Anonymous".
  username: string;
  display_name: string;
};

function findHostSpeaker(utterances: DeepgramUtterance[]): number | null {
  const totals = new Map<number, number>();
  for (const u of utterances) {
    if (u.speaker === undefined) continue;
    const dur = (u.end - u.start) * 1000;
    totals.set(u.speaker, (totals.get(u.speaker) ?? 0) + dur);
  }
  if (totals.size === 0) return null;
  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function pickGuestResponseUtterances(
  utterances: DeepgramUtterance[],
  fromIndex: number,
  hostSpeaker: number | null,
  maxCount = 3,
): DeepgramUtterance[] {
  const out: DeepgramUtterance[] = [];
  for (let i = fromIndex; i < utterances.length && out.length < maxCount; i++) {
    const u = utterances[i];
    if (hostSpeaker !== null && u.speaker === hostSpeaker) {
      if (out.length === 0) continue; // skip continued host preamble
      break;
    }
    out.push(u);
  }
  return out;
}

async function main() {
  const transcriptPath = path.join(ROOT, "data", "transcript.json");
  const audioPath = process.env.AUDIO_PATH ?? path.join(ROOT, "public", "audio.ogg");

  const txt = await readFile(transcriptPath, "utf8").catch(() => null);
  if (!txt) {
    console.error(`Missing ${transcriptPath}. Run \`npm run transcribe\` first.`);
    process.exit(1);
  }
  if (!(await stat(audioPath).catch(() => null))) {
    console.error(`Missing audio at ${audioPath}.`);
    process.exit(1);
  }

  const data: DeepgramResponse = JSON.parse(txt);
  const utterances = data.results?.utterances ?? [];
  if (utterances.length === 0) {
    console.error("Transcript has no utterances. Re-run transcribe with utterances=true.");
    process.exit(1);
  }

  const hostSpeaker = findHostSpeaker(utterances);
  console.log(`[2-intros] Host speaker_id: ${hostSpeaker ?? "(unknown)"}`);
  console.log(`[2-intros] Total utterances: ${utterances.length}`);

  const samplesDir = path.join(ROOT, "data", "samples");
  await mkdir(samplesDir, { recursive: true });

  // Find host prompts
  const promptIndices: number[] = [];
  for (let i = 0; i < utterances.length; i++) {
    const u = utterances[i];
    if (hostSpeaker !== null && u.speaker !== hostSpeaker) continue;
    if (matchesHostPrompt(u.transcript)) {
      promptIndices.push(i);
    }
  }
  console.log(`[2-intros] Host intro prompts found: ${promptIndices.length}`);

  // This script is for a ROVING-HOST walkaround, where the host repeatedly asks "who are you?".
  // A hosted Space / AMA has few or no such prompts (the host introduces one guest, then audience
  // members just start talking). Detecting that here and routing to the right tool saves a wasted
  // run that silently produces an empty/static video. See ZAO research doc 916.
  const speakerCount = new Set(utterances.map((u) => u.speaker).filter((s) => s !== undefined)).size;
  if (promptIndices.length === 0 || (speakerCount >= 3 && promptIndices.length < speakerCount - 1)) {
    console.warn(
      `\n[2-intros] WARNING: only ${promptIndices.length} host intro prompt(s) across ${speakerCount} speakers.\n` +
      `  This looks like a hosted Space / AMA, not a roving-host walkaround.\n` +
      `  Intro detection will miss most or all guests, and the render will sit on the host card.\n` +
      `  Use the hosted-Space path instead:\n` +
      `    1) HOST_USERNAME=<real-handle> npm run suggest-speakers   # mines name-drops -> a draft speaker map\n` +
      `    2) fill SPEAKER_TO_USERNAME in scripts/build-speaker-intros.ts, then run it\n` +
      `    3) HOST_USERNAME=<real-handle> npm run pfps\n` +
      `  Note: HOST_USERNAME must be the real Farcaster handle (e.g. zaal, not a display name).\n`,
    );
  }

  const intros: IntroEntry[] = [];
  for (let p = 0; p < promptIndices.length; p++) {
    const idx = promptIndices[p];
    const prompt = utterances[idx];
    const responses = pickGuestResponseUtterances(utterances, idx + 1, hostSpeaker);
    const responseText = responses.map((u) => u.transcript).join(" ").trim();
    const candidate = extractCandidateName(responseText);

    const startMs = Math.round(prompt.start * 1000);
    const nextPrompt = promptIndices[p + 1];
    const naturalEnd =
      nextPrompt !== undefined
        ? Math.round(utterances[nextPrompt].start * 1000)
        : Math.round((data.metadata?.duration ?? 0) * 1000);
    const endMs = Math.min(naturalEnd, startMs + SEGMENT_CAP_MS);

    const responseStartSec = responses[0]?.start ?? prompt.end;
    const sampleRel = path.join("data", "samples", `intro_${intros.length}.mp3`);
    const sampleAbs = path.join(ROOT, sampleRel);
    try {
      await sliceAudio({
        inputPath: audioPath,
        startSec: Math.max(0, responseStartSec - 0.5),
        durationSec: SAMPLE_DURATION_SEC,
        outputPath: sampleAbs,
      });
    } catch (err) {
      console.warn(`[2-intros] ffmpeg slice failed for intro ${intros.length}: ${(err as Error).message}`);
    }

    const contextStart = Math.max(0, idx - 1);
    const contextEnd = Math.min(utterances.length, idx + 4);
    const contextSnippet = utterances
      .slice(contextStart, contextEnd)
      .map((u) => `[${u.speaker ?? "?"}] ${u.transcript}`)
      .join("\n");

    intros.push({
      id: intros.length,
      start_ms: startMs,
      end_ms: endMs,
      host_speaker_id: hostSpeaker,
      host_prompt: prompt.transcript.trim(),
      candidate_name: candidate,
      candidate_raw: responseText.slice(0, 240),
      context_snippet: contextSnippet,
      sample_audio: sampleRel,
      username: "",
      display_name: "",
    });
  }

  const outPath = path.join(ROOT, "data", "intros.json");
  await writeFile(outPath, JSON.stringify(intros, null, 2));

  console.log(`\n[2-intros] Wrote ${intros.length} intros → ${path.relative(ROOT, outPath)}`);
  console.log(`[2-intros] Sample clips → ${path.relative(ROOT, samplesDir)}/`);
  console.log(`\nNext steps:`);
  console.log(`  1. Listen to each clip in data/samples/intro_N.mp3`);
  console.log(`  2. Edit data/intros.json — fill the "username" field for guests you recognize`);
  console.log(`     (leave "" to skip an intro that's not a real guest or you can't ID)`);
  console.log(`  3. Run: npm run pfps`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
