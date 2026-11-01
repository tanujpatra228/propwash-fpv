/** Display formatting. Conversions to km/h and similar happen here, nowhere else. */

const MPS_TO_KMH = 3.6;

/** 45.27 -> "0:45.27" */
export function formatLapTime(timeS: number): string {
  const total = Math.max(0, timeS);
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
}

/** Gap to the best lap: "+0.84" or "-0.12". */
export function formatSplit(deltaS: number): string {
  return `${deltaS >= 0 ? '+' : '-'}${Math.abs(deltaS).toFixed(2)}`;
}

/** Flight timer "mm:ss". */
export function formatTimer(timeS: number): string {
  const total = Math.max(0, Math.floor(timeS));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatSpeedKmh(speedMps: number): string {
  return `${Math.round(speedMps * MPS_TO_KMH)} km/h`;
}

/** One decimal below 10 m, whole metres from 10 m. */
export function formatHeight(heightM: number): string {
  const clamped = Math.max(0, heightM);
  return clamped < 10 ? clamped.toFixed(1) : String(Math.round(clamped));
}

/** Estimated time left as "≈ 1:20", or "∞" when there is no limit. */
export function formatTimeLeft(timeS: number): string {
  if (!Number.isFinite(timeS)) return '∞';
  const total = Math.max(0, Math.round(timeS));
  const minutes = Math.floor(total / 60);
  return `≈ ${minutes}:${String(total % 60).padStart(2, '0')}`;
}

/** Charge as a whole percentage, "87%". */
export function formatPercent(fraction01: number): string {
  return `${Math.round(Math.max(0, Math.min(1, fraction01)) * 100)}%`;
}
