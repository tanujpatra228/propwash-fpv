import { clamp } from '../core/math';
import type { FlightInput } from '../drone/flight-model';
import { ACTIONS, actionForCode, type ActionId, type Bindings } from './key-bindings';

const MOUSE_RAD_PER_PX = 0.0025;
/** Drag distance that counts as full stick when pointer lock is unavailable. */
const DRAG_FULL_STICK_PX = 90;

type PressListener = (action: ActionId) => void;

/** Keyboard, mouse and pointer lock. The only module that knows about raw key codes. */
export class Input {
  /** When false, held keys are released and nothing is reported (menus, Controls panel). */
  private isEnabled = false;
  private readonly held = new Set<string>();
  private readonly listeners: PressListener[] = [];
  private mouseYawRad = 0;
  private sensitivity = 1;
  private isTurnInverted = false;
  private isDragging = false;
  private canUsePointerLock = true;
  private dragOriginX = 0;
  private dragOriginY = 0;
  readonly stick = { x: 0, y: 0 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private bindings: Bindings,
  ) {
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('blur', this.releaseAll);
    document.addEventListener('visibilitychange', this.releaseAll);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  get enabled(): boolean {
    return this.isEnabled;
  }

  set enabled(value: boolean) {
    this.isEnabled = value;
    if (!value) {
      this.releaseAll();
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    }
  }

  get hasPointerLock(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  setBindings(bindings: Bindings): void {
    this.bindings = bindings;
    this.releaseAll();
  }

  setSensitivity(value: number): void {
    this.sensitivity = value;
  }

  /** Pilot setting: flip the mouse turn direction. */
  setInvertTurn(isInverted: boolean): void {
    this.isTurnInverted = isInverted;
  }

  /** Subscribe to one-shot presses (camera, reset...). Returns an unsubscribe function. */
  onPress(listener: PressListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  isDown(action: ActionId): boolean {
    const [main, alternate] = this.bindings[action];
    return (main !== '' && this.held.has(main)) || (alternate !== '' && this.held.has(alternate));
  }

  /** Fills `out` for this frame (no allocation) and clears the accumulated mouse turn. */
  readFlightInput(out: FlightInput): FlightInput {
    out.forward = this.isDown('forward') ? 1 : 0;
    out.back = this.isDown('back') ? 1 : 0;
    out.left = this.isDown('left') ? 1 : 0;
    out.right = this.isDown('right') ? 1 : 0;
    out.up = this.isDown('up') ? 1 : 0;
    out.down = this.isDown('down') ? 1 : 0;
    out.turnLeft = this.isDown('turnLeft') ? 1 : 0;
    out.turnRight = this.isDown('turnRight') ? 1 : 0;
    out.mouseYawRad = this.mouseYawRad;
    out.stickX = this.stick.x;
    out.stickY = this.stick.y;
    this.mouseYawRad = 0;
    return out;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    window.removeEventListener('blur', this.releaseAll);
    document.removeEventListener('visibilitychange', this.releaseAll);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
  }

  private readonly releaseAll = (): void => {
    this.held.clear();
    this.mouseYawRad = 0;
    this.isDragging = false;
    this.stick.x = 0;
    this.stick.y = 0;
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.isEnabled || event.ctrlKey || event.metaKey) return;
    const action = actionForCode(this.bindings, event.code);
    if (action === null) return;
    // Stop Space and arrows from scrolling or clicking a focused button; hand focus back to the game.
    event.preventDefault();
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
    if (event.repeat) return;
    this.held.add(event.code);
    for (const listener of [...this.listeners]) listener(action);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.isEnabled || !this.hasPointerLock) return;
    // Moving right turns right, which is a negative (clockwise) yaw.
    this.mouseYawRad -= event.movementX * MOUSE_RAD_PER_PX * this.sensitivity * (this.isTurnInverted ? -1 : 1);
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.isEnabled) return;
    if (this.canUsePointerLock) {
      try {
        const result: unknown = this.canvas.requestPointerLock();
        if (result instanceof Promise) result.catch(this.onPointerLockError);
        return;
      } catch {
        this.onPointerLockError();
      }
    }
    this.isDragging = true;
    this.dragOriginX = event.clientX;
    this.dragOriginY = event.clientY;
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.isDragging) return;
    this.stick.x = clamp((event.clientX - this.dragOriginX) / DRAG_FULL_STICK_PX, -1, 1);
    this.stick.y = clamp((event.clientY - this.dragOriginY) / DRAG_FULL_STICK_PX, -1, 1);
  };

  private readonly onPointerUp = (): void => {
    this.isDragging = false;
    this.stick.x = 0;
    this.stick.y = 0;
  };

  private readonly onPointerLockError = (): void => {
    if (this.canUsePointerLock) console.warn('Pointer lock refused; using click-and-drag steering.');
    this.canUsePointerLock = false;
  };
}

/** All action ids that report as one-shot presses. */
export const PRESS_ACTIONS: readonly ActionId[] = ACTIONS.filter((a) => a.type === 'press').map((a) => a.id);
