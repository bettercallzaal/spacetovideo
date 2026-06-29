/**
 * Step 3: Resolve filled-in usernames to Farcaster profiles + download PFPs.
 *
 * Reads:  data/intros.json (with `username` filled in by you), HOST_USERNAME env
 * Writes: data/profiles.json, public/pfps/<username>.<ext>
 */

import { config as loadEnv } from "dotenv";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { downloadPfp, extFromContentType, getUserByUsername } from "./lib/neynar.js";

const ROOT = path.resolve(import.meta.dirname, "..");
loadEnv({ path: path.join(ROOT, ".env") });

type IntroEntry = {
  id: number;
  start_ms: number;
  end_ms: number;
  username: string;
  candidate_name: string | null;
  // Optional: human-supplied label for guests who aren't on Farcaster
  // (e.g. "Jellyfish", "Duck"). Falls back to candidate_name → "Anonymous".
  display_name?: string;
};

type ProfileEntry = {
  username: string;
  fid: number;
  display_name: string;
  pfp_path: string;
};

type GuestEntry = ProfileEntry & {
  intro_id: number;
  start_ms: number;
  end_ms: number;
  candidate_name: string | null;
};

const DEFAULT_AVATAR = "/default-avatar.png";

// Reject obvious extractor garbage so we don't end up with display_name = "and"
// or "having a great time at Farcon Rome".
function sanitizeCandidateName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/[.,!?]+$/, "");
  if (s.length === 0 || s.length > 24) return null;
  if (/^(and|the|a|an|i'm|i am|from|having|with)\b/i.test(s)) return null;
  // Real names are 1-3 words. Anything longer is almost certainly a sentence fragment.
  const wordCount = s.split(/\s+/).length;
  if (wordCount > 3) return null;
  return s;
}

function fallbackName(intro: IntroEntry): string {
  if (intro.display_name && intro.display_name.trim()) return intro.display_name.trim();
  const cand = sanitizeCandidateName(intro.candidate_name);
  if (cand) return cand;
  return "Anonymous";
}

function unknownProfile(intro: IntroEntry): ProfileEntry {
  return {
    username: `unknown_${intro.id}`,
    fid: 0,
    display_name: fallbackName(intro),
    pfp_path: DEFAULT_AVATAR,
  };
}

async function resolveOne(opts: {
  username: string;
  apiKey: string;
  pfpsDir: string;
}): Promise<ProfileEntry> {
  const { username, apiKey, pfpsDir } = opts;
  const user = await getUserByUsername({ username, apiKey });
  if (!user) {
    console.warn(`[3-pfps] @${username} not found on Neynar — using default avatar.`);
    return {
      username,
      fid: 0,
      display_name: username,
      pfp_path: DEFAULT_AVATAR,
    };
  }

  // Try the Neynar pfp_url first, then self-heal through unavatar (which proxies
  // the same avatar via its own egress + cache, and can reach hosts like seadn.io
  // that sometimes refuse a direct fetch). unavatar/farcaster needs no extra data;
  // unavatar/x is a bonus that lands when the FC and X handles match.
  let pfpPath = DEFAULT_AVATAR;
  const sources = [
    user.pfp_url,
    `https://unavatar.io/farcaster/${username}?fallback=false`,
    `https://unavatar.io/x/${username}?fallback=false`,
  ].filter((u): u is string => Boolean(u));
  for (const src of sources) {
    try {
      const tmp = path.join(pfpsDir, `${username}.tmp`);
      const { contentType } = await downloadPfp({ pfpUrl: src, destPath: tmp });
      const ext = extFromContentType(contentType, src);
      const final = path.join(pfpsDir, `${username}.${ext}`);
      await (await import("node:fs/promises")).rename(tmp, final);
      pfpPath = `/pfps/${username}.${ext}`;
      if (src !== user.pfp_url) {
        console.warn(`[3-pfps] @${username}: primary pfp failed, recovered via ${src.includes("/farcaster/") ? "unavatar/farcaster" : "unavatar/x"}`);
      }
      break;
    } catch (err) {
      console.warn(`[3-pfps] pfp source failed for @${username} (${src.slice(0, 48)}): ${(err as Error).message}`);
    }
  }

  return {
    username: user.username,
    fid: user.fid,
    display_name: user.display_name ?? user.username,
    pfp_path: pfpPath,
  };
}

async function main() {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    console.error("NEYNAR_API_KEY not set — add it to .env");
    process.exit(1);
  }
  const hostUsername = process.env.HOST_USERNAME;
  if (!hostUsername) {
    console.error("HOST_USERNAME not set — add it to .env (e.g. HOST_USERNAME=dwr)");
    process.exit(1);
  }

  const introsPath = path.join(ROOT, "data", "intros.json");
  const txt = await readFile(introsPath, "utf8").catch(() => null);
  if (!txt) {
    console.error(`Missing ${introsPath}. Run \`npm run intros\` first.`);
    process.exit(1);
  }
  const intros: IntroEntry[] = JSON.parse(txt);

  const pfpsDir = path.join(ROOT, "public", "pfps");
  await mkdir(pfpsDir, { recursive: true });

  // Ensure default avatar exists (write a tiny transparent PNG if missing).
  const defaultPath = path.join(ROOT, "public", "default-avatar.png");
  if (!(await stat(defaultPath).catch(() => null))) {
    // 1x1 transparent PNG
    const onePx = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=",
      "base64",
    );
    await writeFile(defaultPath, onePx);
  }

  console.log(`[3-pfps] Resolving host: @${hostUsername}`);
  const host = await resolveOne({ username: hostUsername, apiKey, pfpsDir });

  const filledCount = intros.filter((i) => i.username?.trim()).length;
  console.log(
    `[3-pfps] ${intros.length} intros total: ${filledCount} with usernames, ${intros.length - filledCount} → warplet default`,
  );

  // Cache lookups so duplicate usernames don't re-download.
  const cache = new Map<string, ProfileEntry>();
  const guests: GuestEntry[] = [];

  for (const intro of intros) {
    const raw = intro.username?.trim().replace(/^@/, "") ?? "";
    let profile: ProfileEntry;
    if (raw.length === 0) {
      profile = unknownProfile(intro);
    } else {
      const cached = cache.get(raw.toLowerCase());
      if (cached) {
        profile = cached;
      } else {
        profile = await resolveOne({ username: raw, apiKey, pfpsDir });
        cache.set(raw.toLowerCase(), profile);
      }
    }
    guests.push({
      ...profile,
      intro_id: intro.id,
      start_ms: intro.start_ms,
      end_ms: intro.end_ms,
      candidate_name: intro.candidate_name,
    });
  }

  guests.sort((a, b) => a.start_ms - b.start_ms);

  const profiles = { host, guests };
  const outPath = path.join(ROOT, "data", "profiles.json");
  await writeFile(outPath, JSON.stringify(profiles, null, 2));

  console.log(`\n[3-pfps] Wrote ${path.relative(ROOT, outPath)}`);
  console.log(`[3-pfps] Host: @${host.username} (fid ${host.fid}) → ${host.pfp_path}`);
  console.log(`[3-pfps] Guests: ${guests.length} (unique usernames: ${cache.size})`);
  console.log(`\nNext: npm start  (then preview SpaceRecap in Remotion Studio)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
