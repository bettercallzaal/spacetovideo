import { readFile } from "node:fs/promises";

const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen";

export type DeepgramWord = {
  word: string;
  punctuated_word?: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
  speaker_confidence?: number;
};

export type DeepgramUtterance = {
  start: number;
  end: number;
  confidence: number;
  channel: number;
  transcript: string;
  speaker?: number;
  words: DeepgramWord[];
  id?: string;
};

export type DeepgramResponse = {
  metadata: {
    duration: number;
    channels: number;
    [k: string]: unknown;
  };
  results: {
    channels: Array<{
      alternatives: Array<{
        transcript: string;
        words: DeepgramWord[];
        paragraphs?: {
          transcript: string;
          paragraphs: Array<{
            speaker?: number;
            start: number;
            end: number;
            sentences: Array<{ text: string; start: number; end: number }>;
          }>;
        };
      }>;
      detected_language?: string;
    }>;
    utterances?: DeepgramUtterance[];
  };
};

export async function transcribeFile(opts: {
  audioPath: string;
  apiKey: string;
  contentType?: string;
  timeoutMs?: number;
  keyterms?: string[];
}): Promise<DeepgramResponse> {
  const { audioPath, apiKey } = opts;
  const contentType = opts.contentType ?? "audio/ogg";
  const timeoutMs = opts.timeoutMs ?? 20 * 60 * 1000; // 20 min

  const audioBytes = await readFile(audioPath);

  const params = new URLSearchParams({
    model: "nova-3",
    smart_format: "true",
    punctuate: "true",
    diarize: "true",
    utterances: "true",
    paragraphs: "true",
    detect_language: "true",
  });

  for (const term of opts.keyterms ?? []) {
    if (term.trim()) params.append("keyterm", term.trim());
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const resp = await fetch(`${DEEPGRAM_URL}?${params}`, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        Authorization: `Token ${apiKey}`,
      },
      body: audioBytes,
      signal: ctrl.signal,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Deepgram ${resp.status}: ${text.slice(0, 800)}`);
    }

    return (await resp.json()) as DeepgramResponse;
  } finally {
    clearTimeout(timer);
  }
}
