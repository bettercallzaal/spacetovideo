/**
 * One-off: search Neynar for a username variant.
 * Usage: tsx scripts/find-user.ts <query>
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { searchUsers } from "./lib/neynar.js";

const ROOT = path.resolve(import.meta.dirname, "..");
loadEnv({ path: path.join(ROOT, ".env") });

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.error("Usage: tsx scripts/find-user.ts <query>");
    process.exit(1);
  }
  const apiKey = process.env.NEYNAR_API_KEY!;
  const users = await searchUsers({ query, apiKey, limit: 8 });
  for (const u of users) {
    console.log(`  @${u.username}  fid=${u.fid}  "${u.display_name}"  ${u.pfp_url?.slice(0, 80)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
