/**
 * auto-suggest-speakers.ts - reduce the manual speaker->handle mapping for hosted
 * Spaces / AMAs. For each non-host diarized speaker, mine the host's hand-off line
 * right before they start ("what up Benny", "go ahead X", "welcome X") plus their own
 * first self-intro ("this is X", "I'm X"), search Neynar for each candidate name, and
 * write data/speaker-suggestions.json + print a pre-filled SPEAKER_TO_USERNAME block to
 * paste into build-speaker-intros.ts.
 *
 *   HOST_USERNAME=zaal tsx scripts/auto-suggest-speakers.ts
 *
 * Diarization has no identity, so this ASSISTS the human - it surfaces the likely handle
 * per voice; you confirm the ambiguous ones. Farcaster exposes no Spaces roster, so this
 * (or a manual map) is the realistic path. See ZAO research doc 916.
 */

import { config as loadEnv } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { searchUsers, type NeynarUser } from "./lib/neynar.js";

const ROOT = path.resolve(import.meta.dirname, "..");
loadEnv({ path: path.join(ROOT, ".env") });

type Utterance = { start: number; end: number; transcript: string; speaker?: number };

// Host hand-off cues - the host names the next speaker. Group 1 = candidate name.
// Cues are case-insensitive ('i' flag); the captured name keeps its original case, and mine()
// drops anything not actually Capitalized in the source (filters "up", "the", etc).
const HANDOFF: RegExp[] = [
  // cue then (optional comma) then a name: "What up, Benny", "welcome Tako", "go ahead X"
  /\b(?:what'?s?\s*up|welcome|go\s+ahead|go\s+for\s+it|here'?s|we\s+(?:have|have\s+got|got)|bring\s+up|come\s+on\s+up|over\s+to|introduc\w*|say\s+hi\s+to|joined\s+by)\s*[,:]?\s+([A-Za-z][a-zA-Z0-9_.]{1,20})/gi,
  /\b([A-Za-z][a-zA-Z0-9_.]{1,20})\s*[,:]?\s+(?:what'?s\s+your\s+question|you'?re\s+up|the\s+(?:floor|stage)\s+is\s+yours|take\s+it\s+away)/gi,
];
// Guest self-intro cues. Group 1 = candidate name.
const SELFINTRO: RegExp[] = [
  /\b(?:i'?m|i\s+am|this\s+is|my\s+name\s+is|it'?s|name'?s)\s+([A-Za-z][a-zA-Z0-9_.]{1,20})/gi,
  /\b(?:^|[,.!?]\s*)([A-Za-z][a-zA-Z0-9_.]{1,20})\s+here\b/gi,
];
const STOP = new Set(
  ("hi hello yeah yes no okay well oh wow yo ah cool sure right nice great the and but so " +
    "welcome thank thanks please sorry gm gn farcaster warpcast juke intern space been minute man " +
    "loud clear used live forgot other on chain to from with for about here there i im it that this " +
    "what who when where why how howdy totally chaos test apologies looks song like kevin").split(" "),
);

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function mine(blob: string): string[] {
  const out = new Set<string>();
  for (const re of [...HANDOFF, ...SELFINTRO]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(blob)) !== null) {
      const name = m[1];
      // keep only names that are actually Capitalized in the source (drops "up", "the", ...)
      if (name && /^[A-Z]/.test(name) && !STOP.has(name.toLowerCase())) out.add(name);
    }
  }
  return [...out].slice(0, 4);
}

async function main() {
  const apiKey = process.env.NEYNAR_API_KEY;
  const hostUsername = (process.env.HOST_USERNAME ?? "").toLowerCase();

  const raw = await readFile(path.join(ROOT, "data", "transcript.json"), "utf8");
  const data = JSON.parse(raw);
  const utterances: Utterance[] = data.results?.utterances ?? [];
  if (utterances.length === 0) {
    console.error("No utterances in data/transcript.json. Run `npm run transcribe` first.");
    process.exit(1);
  }

  // Host = most-spoken speaker (only to EXCLUDE from suggestions; build-speaker-intros uses
  // HOST_USERNAME explicitly). Note: in an AMA the guest may out-talk the host, so we never
  // trust this for identity - it just picks the busiest voice to skip suggesting a handle for.
  const dur = new Map<number, number>();
  for (const u of utterances) if (u.speaker !== undefined) dur.set(u.speaker, (dur.get(u.speaker) ?? 0) + (u.end - u.start));
  const busiest = [...dur.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const firstIdx = new Map<number, number>();
  utterances.forEach((u, i) => {
    if (u.speaker !== undefined && !firstIdx.has(u.speaker)) firstIdx.set(u.speaker, i);
  });

  const cache = new Map<string, NeynarUser[]>();
  const speakers = [...firstIdx.keys()].sort((a, b) => (firstIdx.get(a) ?? 0) - (firstIdx.get(b) ?? 0));
  const suggestions: any[] = [];

  for (const sp of speakers) {
    const i = firstIdx.get(sp)!;
    const hostBefore = utterances.slice(Math.max(0, i - 2), i).map((u) => u.transcript).join(" ");
    const ownFirst = utterances.filter((u) => u.speaker === sp).slice(0, 5).map((u) => u.transcript).join(" ");
    const candidates = mine(hostBefore + " " + ownFirst);

    const matches: Array<{ name: string; users: NeynarUser[] }> = [];
    if (apiKey) {
      for (const name of candidates) {
        const key = name.toLowerCase();
        let users = cache.get(key);
        if (!users) {
          try {
            users = await searchUsers({ query: name, apiKey, limit: 3 });
          } catch {
            users = [];
          }
          cache.set(key, users);
        }
        matches.push({ name, users });
      }
    }

    const top = matches.find((m) => m.users.length > 0)?.users[0];
    suggestions.push({
      speaker: sp,
      is_busiest: sp === busiest,
      minutes: Math.round((dur.get(sp) ?? 0) / 60),
      first_at: fmt(utterances[i].start),
      host_before: hostBefore.slice(0, 160),
      own_first: ownFirst.slice(0, 200),
      candidates,
      neynar_top: matches.flatMap((m) => m.users.slice(0, 2).map((u) => ({ query: m.name, username: u.username, fid: u.fid, display: u.display_name }))),
      suggested_username: top?.username ?? "",
    });
  }

  const outPath = path.join(ROOT, "data", "speaker-suggestions.json");
  await writeFile(outPath, JSON.stringify(suggestions, null, 2));

  console.log(`\n[auto-suggest] Wrote ${path.relative(ROOT, outPath)}\n`);
  console.log("Suggested SPEAKER_TO_USERNAME (paste into build-speaker-intros.ts, then confirm):");
  console.log("const SPEAKER_TO_USERNAME: Record<number, string> = {");
  // Never auto-assign the host handle to the busiest voice - in an AMA the guest out-talks the
  // host, so "busiest" is host-or-main-guest. Flag it, let the human decide.
  for (const s of suggestions) {
    const note = s.is_busiest ? "  // busiest voice - host OR main guest, confirm" : "";
    console.log(`  ${s.speaker}: ${JSON.stringify(s.suggested_username)},${note}  // ${s.minutes}min, first ${s.first_at}${s.candidates.length ? `, names: ${s.candidates.join("/")}` : ""}`);
  }
  if (hostUsername) console.log(`  // remember to set the host speaker's value to "${hostUsername}" (HOST_USERNAME)`);
  console.log("};\n");
  console.log("Review data/speaker-suggestions.json: confirm each suggested_username (diarization is anonymous; names can be ambiguous).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
