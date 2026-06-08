import { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { Guest } from "../data";

export type ActiveGuestState = {
  guest: Guest | null;
  changedAtFrame: number;
};

/**
 * Returns the guest whose [start_ms, end_ms] window contains the current frame.
 * Also returns the frame at which this guest became active, so the caller can
 * drive a slide-in animation.
 */
export const useActiveGuest = (guests: Guest[]): ActiveGuestState => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;

  return useMemo(() => {
    // Linear scan is fine: guest counts are tens, not thousands.
    let active: Guest | null = null;
    for (const g of guests) {
      if (ms >= g.start_ms && ms < g.end_ms) {
        active = g;
        break;
      }
    }
    const changedAtFrame = active ? Math.round((active.start_ms / 1000) * fps) : frame;
    return { guest: active, changedAtFrame };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(ms / 50), guests]); // recompute every ~50ms, not every frame
};
