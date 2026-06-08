/**
 * Step 6 (optional): Sanity-check filled usernames in intros.json before
 * running pfps. For each filled handle, fetch the most recent cast and flag
 * accounts that have been quiet for >365 days (likely a wrong match).
 */

import { config as loadEnv } from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getLatestCast, getUserByUsername } from "./lib/neynar.js";

const ROOT = path.resolve(import.meta.dirname, "..");
loadEnv({ path: path.join(ROOT, ".env") });

const STALE_DAYS = 365;

type IntroEntry = {
  id: number;
  username?: string;
  display_name?: string;
  candidate_name?: string | null;
  host_prompt?: string;
};

function daysAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86400_000;
}

async function main() {
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    console.error("NEYNAR_API_KEY not set");
    process.exit(1);
  }

  const intros: IntroEntry[] = JSON.parse(
    await readFile(path.join(ROOT, "data", "intros.json"), "utf8"),
  );

  const filled = intros.filter((i) => (i.username ?? "").trim());
  console.log(`[6-review] ${filled.length} filled, ${intros.length - filled.length} unfilled (warplet defaults)\n`);

  const stale: typeof filled = [];
  const missing: typeof filled = [];

  for (const intro of filled) {
    const handle = intro.username!.trim().replace(/^@/, "");
    const user = await getUserByUsername({ username: handle, apiKey });
    if (!user) {
      missing.push(intro);
      console.log(`#${intro.id.toString().padStart(2)}  @${handle}  →  NOT FOUND on Neynar`);
      continue;
    }
    const cast = await getLatestCast({ fid: user.fid, apiKey });
    if (!cast) {
      console.log(`#${intro.id.toString().padStart(2)}  @${handle}  fid=${user.fid}  no casts returned`);
      continue;
    }
    const age = daysAgo(cast.timestamp);
    const flag = age > STALE_DAYS ? " ⚠️ STALE" : age > 90 ? " (quiet)" : "";
    if (age > STALE_DAYS) stale.push(intro);
    const displayName = user.display_name && user.display_name !== user.username ? ` — ${user.display_name}` : "";
    console.log(
      `#${intro.id.toString().padStart(2)}  @${handle}${displayName}  fid=${user.fid}  last_cast=${cast.timestamp.slice(0, 10)} (${Math.round(age)}d)${flag}`,
    );
  }

  console.log("\nUnfilled intros (will render as warplet):");
  for (const i of intros.filter((x) => !(x.username ?? "").trim())) {
    const dn = i.display_name ? `display="${i.display_name}"` : `candidate=${JSON.stringify(i.candidate_name)}`;
    console.log(`  #${i.id.toString().padStart(2)}  ${dn}`);
  }

  if (stale.length) {
    console.log(`\n⚠️  ${stale.length} stale account(s) (>${STALE_DAYS}d since last cast). Likely wrong matches:`);
    for (const i of stale) console.log(`     #${i.id}  @${i.username}`);
  }
  if (missing.length) {
    console.log(`\n❌ ${missing.length} username(s) not found on Neynar:`);
    for (const i of missing) console.log(`     #${i.id}  @${i.username}`);
  }
  if (!stale.length && !missing.length) {
    console.log("\n✅ All filled handles look active. Ready for npm run pfps.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
