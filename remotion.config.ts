import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
// Audio is no longer decoded per-renderer (waveform is precomputed as JSON),
// but we still keep a generous delayRender timeout for the json fetch on cold
// starts, and a moderate concurrency to balance throughput with RAM headroom.
Config.setConcurrency(4);
Config.setDelayRenderTimeoutInMilliseconds(120_000);
Config.setCrf(22);
