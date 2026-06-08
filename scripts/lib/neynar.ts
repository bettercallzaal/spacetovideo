const NEYNAR_BASE = "https://api.neynar.com/v2";

export type NeynarUser = {
  fid: number;
  username: string;
  display_name?: string;
  pfp_url?: string;
};

export async function searchUsers(opts: {
  query: string;
  apiKey: string;
  limit?: number;
}): Promise<NeynarUser[]> {
  const { query, apiKey } = opts;
  const limit = opts.limit ?? 5;
  const url = `${NEYNAR_BASE}/farcaster/user/search?q=${encodeURIComponent(
    query,
  )}&limit=${limit}`;

  const resp = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
      accept: "application/json",
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Neynar search ${resp.status} for "${query}": ${text.slice(0, 400)}`);
  }

  const data = (await resp.json()) as { result?: { users?: NeynarUser[] } };
  return (data.result?.users ?? []).map((u) => ({
    fid: u.fid,
    username: u.username,
    display_name: u.display_name,
    pfp_url: u.pfp_url,
  }));
}

export async function getUserByUsername(opts: {
  username: string;
  apiKey: string;
}): Promise<NeynarUser | null> {
  const { username, apiKey } = opts;
  const url = `${NEYNAR_BASE}/farcaster/user/by_username?username=${encodeURIComponent(
    username,
  )}`;

  const resp = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
      accept: "application/json",
    },
  });

  if (resp.status === 404) return null;
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Neynar ${resp.status} for @${username}: ${text.slice(0, 400)}`);
  }

  const data = (await resp.json()) as { user?: NeynarUser };
  if (!data.user) return null;
  return {
    fid: data.user.fid,
    username: data.user.username,
    display_name: data.user.display_name,
    pfp_url: data.user.pfp_url,
  };
}

export async function getLatestCast(opts: {
  fid: number;
  apiKey: string;
}): Promise<{ timestamp: string; text: string } | null> {
  const { fid, apiKey } = opts;
  const url = `${NEYNAR_BASE}/farcaster/feed/user/casts?fid=${fid}&limit=1`;
  const resp = await fetch(url, {
    headers: { "x-api-key": apiKey, accept: "application/json" },
  });
  if (!resp.ok) return null;
  const data = (await resp.json()) as { casts?: Array<{ timestamp?: string; text?: string }> };
  const cast = data.casts?.[0];
  if (!cast?.timestamp) return null;
  return { timestamp: cast.timestamp, text: cast.text ?? "" };
}

export async function downloadPfp(opts: {
  pfpUrl: string;
  destPath: string;
}): Promise<{ contentType: string | null; bytes: number }> {
  const { pfpUrl, destPath } = opts;
  const resp = await fetch(pfpUrl, {
    headers: { accept: "image/*" },
  });
  if (!resp.ok) {
    throw new Error(`PFP download ${resp.status} for ${pfpUrl}`);
  }
  const contentType = resp.headers.get("content-type");
  const buf = Buffer.from(await resp.arrayBuffer());
  const { writeFile } = await import("node:fs/promises");
  await writeFile(destPath, buf);
  return { contentType, bytes: buf.length };
}

export function extFromContentType(contentType: string | null, fallbackUrl?: string): string {
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (ct.includes("gif")) return "gif";
    if (ct.includes("png")) return "png";
    if (ct.includes("webp")) return "webp";
    if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
    if (ct.includes("svg")) return "svg";
  }
  if (fallbackUrl) {
    const m = fallbackUrl.toLowerCase().match(/\.(gif|png|webp|jpe?g|svg)(?:[?#]|$)/);
    if (m) return m[1] === "jpeg" ? "jpg" : m[1];
  }
  return "png";
}
