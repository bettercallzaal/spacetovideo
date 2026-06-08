// Patterns the host uses to elicit intros, and patterns the guest uses to give one.
// Everything matched case-insensitively against the lowercased utterance text.

export const HOST_PROMPTS: RegExp[] = [
  /\bwho\s+are\s+you\b/,
  /\bwhat'?s\s+your\s+name\b/,
  /\bwhat\s+is\s+your\s+name\b/,
  /\btell\s+me\s+your\s+name\b/,
  /\bsay\s+your\s+name\b/,
  /\bintroduce\s+yourself\b/,
  /\bwho\s+is\s+this\b/,
  /\bwho\s+do\s+we\s+have\b/,
  /\bwho\s+are\s+we\s+talking\s+to\b/,
  /\bwhat'?s\s+your\s+(handle|@|username)\b/,
  /\bwho\s+am\s+i\s+talking\s+to\b/,
  /\bcan\s+you\s+introduce\s+yourself\b/,
];

// Capturing patterns — group 1 should yield the candidate name/phrase.
export const GUEST_SELF_INTRO: RegExp[] = [
  /\bi'?m\s+([a-z][a-z0-9 ._-]{0,40}?)(?:[,.!?]|\band\b|\bfrom\b|\bworking\b|\bhere\b|$)/i,
  /\bmy\s+name\s+is\s+([a-z][a-z0-9 ._-]{0,40}?)(?:[,.!?]|\band\b|\bfrom\b|\bhere\b|$)/i,
  /\bthis\s+is\s+([a-z][a-z0-9 ._-]{0,40}?)(?:[,.!?]|\band\b|\bfrom\b|\bhere\b|$)/i,
  /\b(?:^|[,.!?]\s+)([a-z][a-z0-9._-]{1,40})\s+here\b/i,
  /\bi\s+go\s+by\s+([a-z][a-z0-9 ._-]{0,40}?)(?:[,.!?]|\band\b|$)/i,
  /\byou\s+can\s+call\s+me\s+([a-z][a-z0-9 ._-]{0,40}?)(?:[,.!?]|\band\b|$)/i,
  /\bcall\s+me\s+([a-z][a-z0-9 ._-]{0,40}?)(?:[,.!?]|\band\b|$)/i,
];

export function matchesHostPrompt(text: string): boolean {
  const lower = text.toLowerCase();
  return HOST_PROMPTS.some((re) => re.test(lower));
}

export function extractCandidateName(text: string): string | null {
  for (const re of GUEST_SELF_INTRO) {
    const m = text.match(re);
    if (m && m[1]) {
      const cleaned = m[1].trim().replace(/\s+/g, " ");
      if (cleaned.length >= 2 && cleaned.length <= 40) {
        return cleaned;
      }
    }
  }
  return null;
}
