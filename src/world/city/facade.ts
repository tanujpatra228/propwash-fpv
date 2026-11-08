import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace } from 'three';

const SIZE = 256;
/** The bottom part of the texture is a plain ledge: roofs and undersides sample it so they are solid, not windows. */
export const LEDGE_V = 0.06;

/**
 * One tile of facade: a bay of windows over a floor ledge. Drawn in neutral grey so each building's vertex colour
 * tints it. Tiled by the box UVs, so one texture covers every building.
 */
export function createFacadeTexture(maxAnisotropy: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const c = canvas.getContext('2d');
  if (c) {
    c.fillStyle = '#a3a9ad';
    c.fillRect(0, 0, SIZE, SIZE);
    // Window: dark glass with a lighter sky reflection toward the top, inside a frame.
    const x = 36;
    const w = SIZE - 72;
    const top = 40;
    const h = SIZE - 40 - 52;
    c.fillStyle = '#c9cfd3';
    c.fillRect(x - 6, top - 6, w + 12, h + 12);
    const glass = c.createLinearGradient(0, top, 0, top + h);
    glass.addColorStop(0, '#6f93ad');
    glass.addColorStop(0.55, '#2b4457');
    glass.addColorStop(1, '#1d2d3a');
    c.fillStyle = glass;
    c.fillRect(x, top, w, h);
    // Mullion down the middle.
    c.fillStyle = '#b9c0c4';
    c.fillRect(SIZE / 2 - 3, top, 6, h);
    // The ledge, a little darker, at the bottom of the tile (V is flipped: canvas bottom is texture v = 0).
    c.fillStyle = '#767c80';
    c.fillRect(0, SIZE - Math.round(LEDGE_V * SIZE * 2), SIZE, Math.round(LEDGE_V * SIZE * 2));
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = maxAnisotropy;
  texture.minFilter = LinearMipmapLinearFilter;
  return texture;
}

/** White where the glass is, black elsewhere, in the same layout as the facade. At night it makes the windows glow. */
export function createWindowMask(maxAnisotropy: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const c = canvas.getContext('2d');
  if (c) {
    c.fillStyle = '#000';
    c.fillRect(0, 0, SIZE, SIZE);
    c.fillStyle = '#fff';
    c.fillRect(36, 40, SIZE - 72, SIZE - 40 - 52);
    c.fillStyle = '#000';
    c.fillRect(SIZE / 2 - 3, 40, 6, SIZE - 40 - 52);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = maxAnisotropy;
  texture.minFilter = LinearMipmapLinearFilter;
  return texture;
}
