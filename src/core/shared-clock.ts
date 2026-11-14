/**
 * One clock for everything that moves on a timetable and can hurt you (traffic, crane hooks), so every player in a
 * live room sees the same vehicles and the same hook to within their device clock error (usually well under a second).
 * Starts at zero at a fixed moment so the numbers stay small.
 */
const EPOCH_MS = Date.UTC(2026, 0, 1);

export function sharedTimeS(): number {
  return (Date.now() - EPOCH_MS) / 1000;
}
