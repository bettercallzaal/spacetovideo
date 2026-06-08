import { spawn } from "node:child_process";

export async function sliceAudio(opts: {
  inputPath: string;
  startSec: number;
  durationSec: number;
  outputPath: string;
}): Promise<void> {
  const { inputPath, startSec, durationSec, outputPath } = opts;
  const args = [
    "-y",
    "-loglevel",
    "error",
    "-ss",
    startSec.toFixed(3),
    "-t",
    durationSec.toFixed(3),
    "-i",
    inputPath,
    "-vn",
    "-acodec",
    "libmp3lame",
    "-q:a",
    "5",
    outputPath,
  ];

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 600)}`));
    });
  });
}
