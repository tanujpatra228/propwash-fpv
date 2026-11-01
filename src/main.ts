import './style.css';
import { mustGet } from './core/dom';
import { Game } from './game/game';

// Entry point only: find the canvas and start the game.
const game = new Game(mustGet<HTMLCanvasElement>('world'));
game.start();

if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
