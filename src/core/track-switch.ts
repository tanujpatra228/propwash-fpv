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
