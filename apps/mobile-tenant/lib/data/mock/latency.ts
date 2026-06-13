/**
 * Simulated network latency for the mock data layer. Picks a value from a
 * narrow range so loading states are visible (skeletons need time to
 * render) but the app doesn't feel sluggish during demos.
 *
 *   await fakeLatency();             // 150–350ms
 *   await fakeLatency('slow');       // 600–900ms — show real shimmer
 *   await fakeLatency('instant');    // 0–30ms — for navigation prefetches
 */
type Speed = 'instant' | 'normal' | 'slow';

const SPEEDS: Record<Speed, [number, number]> = {
  instant: [0, 30],
  normal: [150, 350],
  slow: [600, 900],
};

export function fakeLatency(speed: Speed = 'normal'): Promise<void> {
  const [min, max] = SPEEDS[speed];
  const ms = Math.floor(min + Math.random() * (max - min));
  return new Promise((resolve) => setTimeout(resolve, ms));
}
