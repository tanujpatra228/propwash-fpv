import './style.css';
import { isUnsupportedDevice, readDeviceInfo } from './core/device';
import { mustGet } from './core/dom';
import { Game } from './game/game';
import { showUnsupportedScreen } from './ui/unsupported-screen';

/** Entry point only: check the device, find the canvas and start the game. */
async function boot(): Promise<void> {
  // Phones and tablets cannot fly this (no keyboard or mouse), so say so before loading the heavy world.
  if (isUnsupportedDevice(readDeviceInfo())) await showUnsupportedScreen();
  const game = new Game(mustGet<HTMLCanvasElement>('world'));
  game.start();
  const ghostId = new URLSearchParams(window.location.search).get('ghost');
  const roomCode = new URLSearchParams(window.location.search).get('room');
  if (ghostId) game.startFromLink(ghostId);
  else if (roomCode) game.startFromRoomLink(roomCode);
  if (import.meta.env.DEV) (window as unknown as { __game: Game['debug'] }).__game = game.debug;
}

void boot();
