import './style.css';
import { mustGet } from './core/dom';

// Entry point only: find the canvas and start the game (wired up in later milestones).
const canvas = mustGet<HTMLCanvasElement>('world');
const context = canvas.getContext('2d');
if (context) {
  context.fillStyle = '#0a1118';
  context.fillRect(0, 0, canvas.width, canvas.height);
}
