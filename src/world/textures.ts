import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { WORLD } from '../config';
import { createRng, randRange } from '../core/math';

export interface WorldTextures {
  detail: CanvasTexture;
  concrete: CanvasTexture;
  ribs: CanvasTexture;
  houseWall: CanvasTexture;
  checker: CanvasTexture;
  pad: CanvasTexture;
  cloud: CanvasTexture;
}

type Painter = (g: CanvasRenderingContext2D, w: number, h: number, rnd: (min: number, max: number) => number) => void;

const BANNER_FONT = '800 84px "Saira Condensed", Impact, sans-serif';

/** Procedural canvas textures. Seeded, so every player sees the same pixels, and nothing is downloaded. */
export function createWorldTextures(maxAnisotropy: number): WorldTextures {
  let salt = 0;
  const make = (w: number, h: number, paint: Painter, repeat?: [number, number]): CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('2D canvas is not available');
    const rng = createRng(WORLD.seed + ++salt * 101);
    paint(g, w, h, (min, max) => randRange(rng, min, max));
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.anisotropy = maxAnisotropy;
    if (repeat) texture.repeat.set(repeat[0], repeat[1]);
    return texture;
  };

  return {
    detail: make(
      512,
      512,
      (g, w, h, rnd) => {
        g.fillStyle = '#e6e6e6';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 9000; i++) {
          const v = Math.floor(rnd(150, 255));
          g.fillStyle = `rgba(${v},${v},${v},.5)`;
          g.fillRect(rnd(0, w), rnd(0, h), rnd(1, 4), rnd(1, 4));
        }
      },
      [260, 260],
    ),

    concrete: make(
      512,
      512,
      (g, w, h, rnd) => {
        g.fillStyle = '#9a968e';
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 70; i++) {
          const x = rnd(0, w);
          const y = rnd(0, h);
          const r = rnd(20, 90);
          const gradient = g.createRadialGradient(x, y, 0, x, y, r);
          gradient.addColorStop(0, `rgba(60,58,52,${rnd(0.08, 0.25)})`);
          gradient.addColorStop(1, 'rgba(60,58,52,0)');
          g.fillStyle = gradient;
          g.fillRect(x - r, y - r, r * 2, r * 2);
        }
        for (let i = 0; i < 40; i++) {
          g.fillStyle = `rgba(50,45,40,${rnd(0.05, 0.18)})`;
          g.fillRect(rnd(0, w), rnd(0, h * 0.6), rnd(1, 3), rnd(40, 200));
        }
        for (let i = 0; i < 6000; i++) {
          const v = Math.floor(rnd(90, 190));
          g.fillStyle = `rgba(${v},${v},${v},.25)`;
          g.fillRect(rnd(0, w), rnd(0, h), 2, 2);
        }
      },
      [2, 2],
    ),

    ribs: make(256, 256, (g, w, h, rnd) => {
      for (let x = 0; x < w; x += 16) {
        const gradient = g.createLinearGradient(x, 0, x + 16, 0);
        gradient.addColorStop(0, '#d9d9d9');
        gradient.addColorStop(0.45, '#ffffff');
        gradient.addColorStop(0.55, '#a9a9a9');
        gradient.addColorStop(1, '#d0d0d0');
        g.fillStyle = gradient;
        g.fillRect(x, 0, 16, h);
      }
      for (let i = 0; i < 50; i++) {
        g.fillStyle = `rgba(110,60,30,${rnd(0.1, 0.35)})`;
        g.beginPath();
        g.arc(rnd(0, w), rnd(0, h), rnd(2, 10), 0, 7);
        g.fill();
      }
    }),

    // Light wall panel with two windows. Each house tints it with a material colour.
    houseWall: make(256, 256, (g, w, h) => {
      g.fillStyle = '#f2eee6';
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,.06)';
      for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 1);
      for (const x of [56, 168]) {
        g.fillStyle = '#e9e4da';
        g.fillRect(x - 6, 64, 56, 84);
        g.fillStyle = '#243645';
        g.fillRect(x, 70, 44, 72);
        g.fillStyle = 'rgba(255,255,255,.18)';
        g.fillRect(x, 70, 44, 20);
        g.fillStyle = '#e9e4da';
        g.fillRect(x + 20, 70, 4, 72);
        g.fillRect(x, 102, 44, 4);
      }
      g.fillStyle = 'rgba(0,0,0,.18)';
      g.fillRect(0, h - 28, w, 28);
    }),

    checker: make(1024, 160, (g, w, h) => {
      const size = 40;
      for (let y = 0; y < h; y += size) {
        for (let x = 0; x < w; x += size) {
          g.fillStyle = ((x + y) / size) % 2 ? '#111' : '#f4f4f4';
          g.fillRect(x, y, size, size);
        }
      }
      g.fillStyle = 'rgba(10,14,18,.9)';
      g.fillRect(w * 0.25, 22, w * 0.5, h - 44);
      g.fillStyle = '#ff7a1a';
      g.font = `italic ${BANNER_FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('START · FINISH', w / 2, h / 2 + 4);
    }),

    pad: make(256, 256, (g, w, h) => {
      g.fillStyle = '#26292d';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ff7a1a';
      g.lineWidth = 10;
      g.beginPath();
      g.arc(w / 2, h / 2, w / 2 - 14, 0, 7);
      g.stroke();
      g.fillStyle = '#f1f1f1';
      g.font = '800 150px "Saira Condensed", Impact, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('H', w / 2, h / 2 + 8);
    }),

    cloud: make(256, 256, (g, w, h, rnd) => {
      for (let i = 0; i < 14; i++) {
        const x = rnd(60, 196);
        const y = rnd(100, 160);
        const r = rnd(30, 70);
        const gradient = g.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, 'rgba(255,255,255,.55)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gradient;
        g.fillRect(0, 0, w, h);
      }
    }),
  };
}
