import { ACTIVE_TRACK_ID, type TrackId } from '../config';
import { saveJson } from './storage';

/** Saves the choice and reloads the page into that track. The track is read once at start-up, so a reload is the switch. */
export function switchTrack(id: TrackId): void {
  if (id === ACTIVE_TRACK_ID) return;
  saveJson('track.v1', id);
  const url = new URL(window.location.href);
  url.searchParams.delete('track');
  window.location.assign(url.toString());
}

/**
 * Reloads into a map for a live room, keeping the room code in the link so the game rejoins on load. The map goes in the
 * link only (not saved), so a friend's choice does not change which map you start on next time.
 */
export function reloadIntoRoomMap(id: TrackId, roomCode: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('track', id);
  url.searchParams.set('room', roomCode);
  window.location.assign(url.toString());
}
