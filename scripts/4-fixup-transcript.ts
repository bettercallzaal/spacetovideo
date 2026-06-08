/**
 * Step 4 (optional): Fix up known mishears in transcript.json and intros.json
 * without re-spending Deepgram credits.
 *
 * Operates at two levels:
 *   - String-level REPLACEMENTS: regex passes over utterance/sentence/paragraph
 *     transcripts (used by intro detection and any code that reads the joined text).
 *   - Word-level WORD_RULES: per-token rewrites on words[] arrays (used by the
 *     rolling caption renderer). Pair rules merge two adjacent words into one,
 *     extending the merged word's timing to span both originals.
 *
 * Edit the tables below to extend coverage. Re-run anytime — idempotent.
 */

import { config as loadEnv } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DeepgramResponse, DeepgramUtterance, DeepgramWord } from "./lib/deepgram.js";

const ROOT = path.resolve(import.meta.dirname, "..");
loadEnv({ path: path.join(ROOT, ".env") });

type Rule = { pattern: RegExp; replacement: string };

// Order matters: longer/more-specific patterns first so they win over shorter ones.
// Add your own mishear corrections here — re-run anytime, idempotent.
const REPLACEMENTS: Rule[] = [
  // Example: fix a common Deepgram mishear of a proper noun
  { pattern: /\bFar Cast\b/gi, replacement: "Farcaster" },
  { pattern: /\bWarp Cast\b/gi, replacement: "Warpcast" },
];

function applyAll(text: string): string {
  let out = text;
  for (const { pattern, replacement } of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

// --- Word-level rules ---------------------------------------------------------

type WordRule =
  | { kind: "single"; match: RegExp; to: string }
  | { kind: "merge"; match1: RegExp; match2: RegExp; to: string }
  // Context-aware single replacement: word[i] is rewritten only when word[i+1]
  // matches the second pattern. Word count stays the same.
  | { kind: "contextual"; match1: RegExp; match2: RegExp; to1: string };

// Pair rules are evaluated before singles so we don't rewrite half a pair.
const WORD_RULES: WordRule[] = [
  // Pair-merge: collapse two mishorm tokens into one canonical word.
  { kind: "merge", match1: /^park$/i, match2: /^on$/i, to: "Farcon" },
  { kind: "merge", match1: /^car$/i, match2: /^con$/i, to: "Farcon" },
  { kind: "merge", match1: /^far$/i, match2: /^cast$/i, to: "Farcaster" },
  { kind: "merge", match1: /^warp$/i, match2: /^cast$/i, to: "Warpcast" },
  // Contextual: "Duke Audio" → "Juke Audio" (only inside that pair).
  { kind: "contextual", match1: /^duke$/i, match2: /^audio$/i, to1: "Juke" },
  // Singles
  { kind: "single", match: /^carcon$/i, to: "Farcon" },
  { kind: "single", match: /^parkon$/i, to: "Farcon" },
  { kind: "single", match: /^parcom$/i, to: "Farcon" },
  { kind: "single", match: /^farkham$/i, to: "Farcon" },
  { kind: "single", match: /^falcon$/i, to: "Farcon" },
  { kind: "single", match: /^parkaster$/i, to: "Farcaster" },
  { kind: "single", match: /^fakas$/i, to: "Farcaster" },
  { kind: "single", match: /^farkas$/i, to: "Farcaster" },
  { kind: "single", match: /^farcast$/i, to: "Farcaster" },
  { kind: "single", match: /^drook$/i, to: "Juke" },
];

function bareToken(w: DeepgramWord): string {
  const raw = w.word ?? w.punctuated_word ?? "";
  return raw.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
}

function trailingPunct(w: DeepgramWord): string {
  const p = w.punctuated_word ?? "";
  const m = p.match(/[.,!?]+$/);
  return m ? m[0] : "";
}

function setWordText(w: DeepgramWord, newText: string): void {
  const tail = trailingPunct(w);
  w.word = newText.toLowerCase();
  w.punctuated_word = newText + tail;
}

function mergeWords(a: DeepgramWord, b: DeepgramWord, newText: string): DeepgramWord {
  const tail = trailingPunct(b);
  return {
    ...a,
    end: b.end,
    word: newText.toLowerCase(),
    punctuated_word: newText + tail,
  };
}

function fixWords(words: DeepgramWord[]): { singles: number; merges: number } {
  let singles = 0;
  let merges = 0;
  let i = 0;
  while (i < words.length) {
    const a = words[i];
    const aBare = bareToken(a);
    let consumedNext = false;

    if (i + 1 < words.length) {
      const b = words[i + 1];
      const bBare = bareToken(b);
      for (const r of WORD_RULES) {
        if (r.kind === "merge" && r.match1.test(aBare) && r.match2.test(bBare)) {
          words[i] = mergeWords(a, b, r.to);
          words.splice(i + 1, 1);
          merges++;
          consumedNext = true;
          break;
        }
        if (r.kind === "contextual" && r.match1.test(aBare) && r.match2.test(bBare)) {
          setWordText(a, r.to1);
          singles++;
          break;
        }
      }
    }

    if (!consumedNext) {
      for (const r of WORD_RULES) {
        if (r.kind !== "single") continue;
        if (r.match.test(aBare)) {
          setWordText(a, r.to);
          singles++;
          break;
        }
      }
    }
    i++;
  }
  return { singles, merges };
}

function fixUtterance(u: DeepgramUtterance): { changedText: number; words: { singles: number; merges: number } } {
  const before = u.transcript;
  u.transcript = applyAll(before);
  const w = fixWords(u.words ?? []);
  return { changedText: before === u.transcript ? 0 : 1, words: w };
}

async function fixTranscript(
  filePath: string,
): Promise<{ utterances: number; sentences: number; channels: number; wordSingles: number; wordMerges: number }> {
  const txt = await readFile(filePath, "utf8");
  const data: DeepgramResponse = JSON.parse(txt);

  let channelHits = 0;
  let utteranceHits = 0;
  let sentenceHits = 0;
  let wordSingles = 0;
  let wordMerges = 0;

  for (const ch of data.results?.channels ?? []) {
    for (const alt of ch.alternatives ?? []) {
      const before = alt.transcript;
      alt.transcript = applyAll(before);
      if (before !== alt.transcript) channelHits++;

      // Top-level words[] (the per-channel transcript track).
      const w = fixWords(alt.words ?? []);
      wordSingles += w.singles;
      wordMerges += w.merges;

      const para = alt.paragraphs;
      if (para) {
        para.transcript = applyAll(para.transcript);
        for (const p of para.paragraphs ?? []) {
          for (const s of p.sentences ?? []) {
            const sb = s.text;
            s.text = applyAll(sb);
            if (sb !== s.text) sentenceHits++;
          }
        }
      }
    }
  }

  for (const u of data.results?.utterances ?? []) {
    const r = fixUtterance(u);
    utteranceHits += r.changedText;
    wordSingles += r.words.singles;
    wordMerges += r.words.merges;
  }

  await writeFile(filePath, JSON.stringify(data, null, 2));
  return { utterances: utteranceHits, sentences: sentenceHits, channels: channelHits, wordSingles, wordMerges };
}

async function fixIntros(filePath: string): Promise<{ touched: number }> {
  const txt = await readFile(filePath, "utf8").catch(() => null);
  if (!txt) return { touched: 0 };

  const intros = JSON.parse(txt) as Array<Record<string, unknown>>;
  const stringFields = ["host_prompt", "candidate_raw", "context_snippet", "candidate_name"];
  let touched = 0;
  for (const intro of intros) {
    let changed = false;
    for (const f of stringFields) {
      const v = intro[f];
      if (typeof v !== "string") continue;
      const next = applyAll(v);
      if (next !== v) {
        intro[f] = next;
        changed = true;
      }
    }
    if (changed) touched++;
  }

  await writeFile(filePath, JSON.stringify(intros, null, 2));
  return { touched };
}

async function main() {
  const transcriptPath = path.join(ROOT, "data", "transcript.json");
  const introsPath = path.join(ROOT, "data", "intros.json");

  console.log(`[4-fixup] Applying ${REPLACEMENTS.length} rules`);

  const t = await fixTranscript(transcriptPath);
  console.log(
    `[4-fixup] transcript.json: ${t.utterances} utterances + ${t.sentences} sentences + ${t.channels} channels touched (text); words: ${t.wordSingles} singles + ${t.wordMerges} merges`,
  );

  const i = await fixIntros(introsPath);
  console.log(`[4-fixup] intros.json: ${i.touched} entries touched`);

  console.log(`\nNext: review data/intros.json — fill in usernames; blanks render with the warplet.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
