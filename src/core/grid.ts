import { ROOMS } from '../config';

/** How far behind the start line a starting-grid slot sits, in metres (two columns, rows going back). */
export function gridBehindM(slot: number): number {
  return ROOMS.gridFirstRowBehindM + Math.floor(slot / 2) * ROOMS.gridRowSpacingM;
}
