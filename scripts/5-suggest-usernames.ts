/**
 * Step 5 (optional): Mine intros.json for likely names, search Neynar, and
 * suggest candidate Farcaster users per intro. Writes data/suggestions.json.
 *
 * The script does NOT mutate intros.json — review the suggestions, then fill
 * in `username` (and optionally `display_name`) in intros.json by hand.
 *
 * Heuristics:
 *   - Pull names from "I'm/I am/my name is/you're/name is X" patterns.
 *   - Plus any capitalized token (3-20 chars) not in the stopword list.
 *   - Dedupe, search Neynar, keep top 5 matches per query.
 */

import { config as loadEnv } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { searchUsers, type NeynarUser } from "./lib/neynar.js";

const ROOT = path.resolve(import.meta.dirname, "..");
loadEnv({ path: path.join(ROOT, ".env") });

type IntroEntry = {
  id: number;
  username?: string;
  display_name?: string;
  candidate_name?: string | null;
  host_prompt?: string;
  candidate_raw?: string;
};

type Suggestion = {
  intro_id: number;
  candidate_name: string | null;
  current_username: string;
  queries: string[];
  matches: Array<{
    query: string;
    users: NeynarUser[];
  }>;
};

const STOPWORDS = new Set(
  [
    "Hi", "Hello", "Yeah", "Yes", "No", "Okay", "Well", "Oh", "Wow", "Yo", "Ah",
    "Cool", "Sure", "Right", "Nice", "Great", "Indeed", "True", "False",
    "How", "What", "Who", "When", "Where", "Why", "Which",
    "The", "And", "But", "Or", "So", "If", "Then", "That", "This", "These", "Those",
    "Welcome", "Thank", "Thanks", "Please", "Sorry", "Bye", "Goodbye", "GMGF", "GM",
    "Farcon", "Farcaster", "Juke", "Rome", "Italy", "Warpcast", "Audio",
    "I", "I'm", "Im", "Ive",
    "From", "With", "For", "About", "Online", "Live", "Around", "Here", "There",
    "Mini", "App", "Client", "Native",
    "Amazing", "Incredible", "Beautiful", "Wonderful", "Crazy", "Awesome",
    "Aloha", "Quack",
    "Italian", "English", "French", "Spanish",
  ].map((s) => s.toLowerCase()),
);

const NAME_PATTERNS = [
  /\b(?:i'?m|i am)\s+([A-Z][a-zA-Z]{1,19})/g,
  /\bmy name is\s+([A-Z][a-zA-Z]{1,19})/gi,
  /\byou'?re\s+([A-Z][a-zA-Z]{1,19})/g,
  /\bname is\s+([A-Z][a-zA-Z]{1,19})/gi,
  /\bthis is\s+([A-Z][a-zA-Z]{1,19})/g,
];

const CAP_TOKEN = /\b([A-Z][a-zA-Z]{2,19})\b/g;

function extractQueries(intro: IntroEntry): string[] {
  const blob = [intro.candidate_name ?? "", intro.host_prompt ?? "", intro.candidate_raw ?? ""].join(" ");
  const found = new Set<string>();

  // Pattern-based pulls (highest signal first)
  for (const re of NAME_PATTERNS) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(blob)) !== null) {
      const name = m[1];
      if (name && !STOPWORDS.has(name.toLowerCase())) {
        found.add(name);
      }
    }
  }

  // Fallback: any capitalized token
  let m: RegExpExecArray | null;
  while ((m = CAP_TOKEN.exec(blob)) !== null) {
    const name = m[1];
    if (!STOPWORDS.has(name.toLowerCase())) {
      found.add(name);
    }
  }

  return [...found].slice(0, 5);
}

async function main() {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    console.error("NEYNAR_API_KEY not set — add it to .env");
    process.exit(1);
  }

  const introsPath = path.join(ROOT, "data", "intros.json");
  const txt = await readFile(introsPath, "utf8").catch(() => null);
  if (!txt) {
    console.error(`Missing ${introsPath}. Run \`npm run intros\` first.`);
    process.exit(1);
  }

  const intros: IntroEntry[] = JSON.parse(txt);
  const suggestions: Suggestion[] = [];

  // Cache: same name across multiple intros only searches once.
  const cache = new Map<string, NeynarUser[]>();

  let totalQueries = 0;
  for (const intro of intros) {
    const queries = extractQueries(intro);
    totalQueries += queries.length;
    const matches: Suggestion["matches"] = [];

    for (const q of queries) {
      const key = q.toLowerCase();
      let users = cache.get(key);
      if (!users) {
        try {
          users = await searchUsers({ query: q, apiKey, limit: 5 });
        } catch (err) {
          console.warn(`[5-suggest] search failed for "${q}": ${(err as Error).message}`);
          users = [];
        }
        cache.set(key, users);
      }
      matches.push({ query: q, users });
    }

    suggestions.push({
      intro_id: intro.id,
      candidate_name: intro.candidate_name ?? null,
      current_username: intro.username ?? "",
      queries,
      matches,
    });
  }

  const outPath = path.join(ROOT, "data", "suggestions.json");
  await writeFile(outPath, JSON.stringify(suggestions, null, 2));

  // Pretty print
  console.log(`\n[5-suggest] Searched ${totalQueries} queries (${cache.size} unique) across ${intros.length} intros.\n`);
  for (const s of suggestions) {
    if (s.queries.length === 0) {
      console.log(`#${s.intro_id}  (no queries extracted)`);
      continue;
    }
    console.log(`#${s.intro_id}  candidate=${JSON.stringify(s.candidate_name)}${s.current_username ? `  current=@${s.current_username}` : ""}`);
    for (const m of s.matches) {
      const top = m.users.slice(0, 3);
      if (top.length === 0) {
        console.log(`    "${m.query}": (no matches)`);
      } else {
        console.log(`    "${m.query}":`);
        for (const u of top) {
          const dn = u.display_name && u.display_name !== u.username ? ` — ${u.display_name}` : "";
          console.log(`      @${u.username}  fid=${u.fid}${dn}`);
        }
      }
    }
    console.log("");
  }

  console.log(`Wrote ${path.relative(ROOT, outPath)}`);
  console.log(`Next: edit data/intros.json — set username (and optionally display_name) per intro, then npm run pfps`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
