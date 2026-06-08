import { useEffect, useMemo, useState } from "react";
import { continueRender, delayRender, staticFile, useCurrentFrame } from "remotion";
import { theme } from "../theme";

type Props = {
  /** Unused; kept so the composition still calls it the same way. */
  audioSrc?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  bars?: number;
};

type WaveformMeta = { fps: number; bars: number; frameCount: number };
type WaveformData = { meta: WaveformMeta; bins: Uint8Array };

// Module-level cache so the binary is fetched once per worker, shared across
// the lifetime of the renderer.
let cached: Promise<WaveformData> | null = null;
function loadWaveform(): Promise<WaveformData> {
  if (!cached) {
    cached = Promise.all([
      fetch(staticFile("data/waveform.json")).then((r) => {
        if (!r.ok) throw new Error(`waveform.json ${r.status} — run \`npm run waveform\``);
        return r.json() as Promise<WaveformMeta>;
      }),
      fetch(staticFile("data/waveform.bin")).then((r) => {
        if (!r.ok) throw new Error(`waveform.bin ${r.status} — run \`npm run waveform\``);
        return r.arrayBuffer();
      }),
    ]).then(([meta, buf]) => ({ meta, bins: new Uint8Array(buf) }));
  }
  return cached;
}

export const Waveform: React.FC<Props> = ({ x, y, width, height, bars = 56 }) => {
  const frame = useCurrentFrame();
  const [data, setData] = useState<WaveformData | null>(null);

  useEffect(() => {
    const handle = delayRender("loading waveform bins");
    loadWaveform()
      .then((d) => {
        setData(d);
        continueRender(handle);
      })
      .catch((err) => {
        console.error(err);
        continueRender(handle);
      });
  }, []);

  // Read the FFT bins for the current frame from the precomputed binary.
  // Each frame has `meta.bars` uint8 values (already pre-scaled & clamped to 0..255).
  const usable = useMemo(() => {
    if (!data) return new Array(bars).fill(0);
    const f = Math.max(0, Math.min(data.meta.frameCount - 1, frame));
    const stride = data.meta.bars;
    const base = f * stride;
    const n = Math.min(bars, stride);
    const out = new Array<number>(bars).fill(0);
    for (let i = 0; i < n; i++) out[i] = data.bins[base + i] / 255;
    return out;
  }, [data, frame, bars]);

  const barWidth = 8;
  const gap = 6;
  const totalWidth = bars * (barWidth + gap) - gap;
  const startX = x + (width - totalWidth) / 2;
  const centerY = y + height / 2;

  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      {usable.map((amp, i) => {
        // amp is already pre-scaled & clamped to [0, 1] by the precompute step.
        const scaled = amp as number;
        const h = Math.max(6, scaled * height);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: startX + i * (barWidth + gap),
              top: centerY - h / 2,
              width: barWidth,
              height: h,
              borderRadius: barWidth / 2,
              background: `linear-gradient(180deg, ${theme.orange}, ${theme.purple})`,
              boxShadow: `0 0 ${scaled * 20}px ${theme.orange}99`,
            }}
          />
        );
      })}
    </div>
  );
};
