/**
 * Step 7: Precompute per-frame FFT magnitude bars so the renderer doesn't have
 * to decode 116 MB of OGG audio in every Chromium worker (which OOMs the parent
 * Node process around frame ~14k of a 220k-frame render).
 *
 * Pipeline:
 *   1. ffmpeg streams mono 22050 Hz float32 PCM into stdout.
 *   2. For each video frame, take a 256-sample Hann-windowed slice centered on
 *      the frame's time, run an in-place radix-2 FFT, take the magnitudes of
 *      the first BARS frequency bins.
 *   3. Quantize each bar to uint8 (already pre-scaled & clamped to [0, 1]) and
 *      write a flat binary blob `data/waveform.bin` (~12 MB for 2h2m). Metadata
 *      goes in `data/waveform.json`.
 *
 * The runtime <Waveform> just reads bytes[frame * bars + i] / 255 — no per-
 * renderer audio decode, no FFT at runtime.
 */

import { spawn } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const FPS = 30;
const SAMPLE_RATE = 22050; // mono 22050 → ~650 MB Float32Array for 2 h
const SAMPLE_SIZE = 256; // FFT window size — must be power of 2
const BARS = 56;
// Visual gain. Audio FFT magnitudes are tiny in linear space; this compresses
// the dynamic range so quiet speech still fills the bars.
const LOG_FLOOR = 0.0005;
const LOG_GAIN = 1 / Math.log10(1 / LOG_FLOOR);

// --- raw audio decode --------------------------------------------------------

async function dumpMonoPCM(audioPath: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const ff = spawn("ffmpeg", [
      "-i", audioPath,
      "-ac", "1",
      "-ar", String(SAMPLE_RATE),
      "-f", "f32le",
      "-loglevel", "error",
      "pipe:1",
    ]);
    ff.stdout.on("data", (c: Buffer) => chunks.push(c));
    let stderr = "";
    ff.stderr.on("data", (c) => (stderr += c.toString()));
    ff.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 400)}`));
      const total = chunks.reduce((s, c) => s + c.length, 0);
      const buf = Buffer.concat(chunks, total);
      // Copy into a tightly-allocated Float32Array (Buffer.concat may keep
      // padding; this avoids holding extra memory in the long-lived array).
      const f32 = new Float32Array(buf.length / 4);
      for (let i = 0; i < f32.length; i++) f32[i] = buf.readFloatLE(i * 4);
      resolve(f32);
    });
    ff.on("error", reject);
  });
}

// --- in-place radix-2 FFT (Cooley-Tukey) -------------------------------------

function fftInPlace(real: Float64Array, imag: Float64Array): void {
  const N = real.length;
  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < N - 1; i++) {
    if (i < j) {
      const tr = real[i];
      real[i] = real[j];
      real[j] = tr;
      const ti = imag[i];
      imag[i] = imag[j];
      imag[j] = ti;
    }
    let k = N >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }
  // Butterflies
  for (let m = 2; m <= N; m <<= 1) {
    const mh = m >> 1;
    const angle = (-2 * Math.PI) / m;
    const wmReal = Math.cos(angle);
    const wmImag = Math.sin(angle);
    for (let kBase = 0; kBase < N; kBase += m) {
      let wReal = 1;
      let wImag = 0;
      for (let i = 0; i < mh; i++) {
        const idxA = kBase + i;
        const idxB = idxA + mh;
        const tReal = wReal * real[idxB] - wImag * imag[idxB];
        const tImag = wReal * imag[idxB] + wImag * real[idxB];
        const uReal = real[idxA];
        const uImag = imag[idxA];
        real[idxA] = uReal + tReal;
        imag[idxA] = uImag + tImag;
        real[idxB] = uReal - tReal;
        imag[idxB] = uImag - tImag;
        const nwReal = wReal * wmReal - wImag * wmImag;
        wImag = wReal * wmImag + wImag * wmReal;
        wReal = nwReal;
      }
    }
  }
}

// --- main --------------------------------------------------------------------

async function main() {
  const audioPath = process.env.AUDIO_PATH ?? path.join(ROOT, "public", "audio.ogg");
  if (!(await stat(audioPath).catch(() => null))) {
    console.error(`Audio not found at ${audioPath}`);
    process.exit(1);
  }

  console.log(`[7-waveform] Decoding ${path.relative(ROOT, audioPath)} → mono ${SAMPLE_RATE} Hz f32le`);
  const t0 = Date.now();
  const samples = await dumpMonoPCM(audioPath);
  const decodeSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `[7-waveform] Decoded ${(samples.length / SAMPLE_RATE).toFixed(1)}s of audio in ${decodeSec}s (${(samples.byteLength / 1024 / 1024).toFixed(0)} MB Float32)`,
  );

  const totalFrames = Math.ceil((samples.length / SAMPLE_RATE) * FPS);
  const bytes = new Uint8Array(totalFrames * BARS);

  // Pre-allocate scratch buffers
  const real = new Float64Array(SAMPLE_SIZE);
  const imag = new Float64Array(SAMPLE_SIZE);
  const hann = new Float64Array(SAMPLE_SIZE);
  for (let i = 0; i < SAMPLE_SIZE; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (SAMPLE_SIZE - 1)));
  }

  console.log(`[7-waveform] Computing ${totalFrames} frames × ${BARS} bars (FFT N=${SAMPLE_SIZE})`);
  const tComp = Date.now();
  const half = SAMPLE_SIZE >> 1;
  // First normalising pass: figure out the per-bin peak magnitude across the
  // whole audio so we can scale to a clean [0, 1] before the log compress.
  // Doing one pass for all frames is faster than per-frame, but cheaper still
  // is to use a global scalar tied to maxInt-style normalisation.
  // FFT of a Hann-windowed sinusoid peaks around ~ N/4 (window energy = N/4).
  // We'll normalise by N/4 then run through log compression.
  const norm = SAMPLE_SIZE / 4;

  for (let f = 0; f < totalFrames; f++) {
    const startIdx = Math.floor((f / FPS) * SAMPLE_RATE) - half;
    imag.fill(0);
    for (let i = 0; i < SAMPLE_SIZE; i++) {
      const si = startIdx + i;
      const s = si >= 0 && si < samples.length ? samples[si] : 0;
      real[i] = s * hann[i];
    }
    fftInPlace(real, imag);

    const base = f * BARS;
    for (let b = 0; b < BARS; b++) {
      const mag = Math.hypot(real[b], imag[b]) / norm;
      // Log compression: map [LOG_FLOOR, 1] → [0, 1] in log10 space, clamp.
      let v: number;
      if (mag <= LOG_FLOOR) v = 0;
      else if (mag >= 1) v = 1;
      else v = (Math.log10(mag) - Math.log10(LOG_FLOOR)) * LOG_GAIN;
      bytes[base + b] = Math.max(0, Math.min(255, Math.round(v * 255)));
    }

    if (f > 0 && f % 30000 === 0) {
      const elapsed = (Date.now() - tComp) / 1000;
      const eta = (elapsed / f) * (totalFrames - f);
      console.log(`  frame ${f}/${totalFrames}  elapsed=${elapsed.toFixed(0)}s  ETA=${eta.toFixed(0)}s`);
    }
  }

  await mkdir(path.join(ROOT, "data"), { recursive: true });
  const binPath = path.join(ROOT, "data", "waveform.bin");
  const jsonPath = path.join(ROOT, "data", "waveform.json");
  await writeFile(binPath, Buffer.from(bytes));
  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        fps: FPS,
        bars: BARS,
        frameCount: totalFrames,
        sampleRate: SAMPLE_RATE,
        sampleSize: SAMPLE_SIZE,
      },
      null,
      2,
    ),
  );

  const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[7-waveform] Wrote ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB → ${path.relative(ROOT, binPath)} in ${totalSec}s total`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
