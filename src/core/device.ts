/** What we can tell about the device. Plain values, so the decision is easy to test. */
export interface DeviceInfo {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** The main pointer is a finger (coarse) rather than a mouse or trackpad. */
  isPointerCoarse: boolean;
  /** The main input cannot hover (a touch screen with no mouse). */
  canHover: boolean;
}

const MOBILE_AGENT = /Android|iPhone|iPad|iPod|Mobile|Windows Phone|Opera Mini|BlackBerry/i;

/** True on phones and tablets: the game needs a keyboard and a mouse. Pure. */
export function isUnsupportedDevice(d: DeviceInfo): boolean {
  if (MOBILE_AGENT.test(d.userAgent)) return true;
  // iPads in desktop mode report a Mac user agent but still have a touch screen.
  if (/Mac/i.test(d.platform) && d.maxTouchPoints > 1) return true;
  // A touch-only device: the main pointer is a finger and nothing can hover.
  return d.isPointerCoarse && !d.canHover;
}

export function readDeviceInfo(): DeviceInfo {
  const query = (q: string): boolean => typeof window.matchMedia === 'function' && window.matchMedia(q).matches;
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    isPointerCoarse: query('(pointer: coarse)'),
    canHover: query('(hover: hover)'),
  };
}
