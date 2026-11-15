const KEY = 'pw.roomKey.v1';

let fallback: string | null = null;

/**
 * A secret for this browser tab, sent when joining a room. When the host picks another map every pilot reloads into it;
 * the key lets the server hand each of them their old place (and the host role) back. It lives in session storage, so
 * it survives the reload but not a closed tab, and it is never shown to other pilots.
 */
export function getRoomKey(): string {
  try {
    const saved = window.sessionStorage.getItem(KEY);
    if (saved && saved.length >= 8) return saved;
    const made = crypto.randomUUID();
    window.sessionStorage.setItem(KEY, made);
    return made;
  } catch {
    // Blocked storage: the key then only lasts until the reload, so a map change cannot restore the place.
    fallback ??= crypto.randomUUID();
    return fallback;
  }
}
