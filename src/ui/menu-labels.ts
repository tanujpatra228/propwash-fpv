import { primaryKeyLabel, type Bindings } from '../input/key-bindings';
import type { FlightMenuLabels } from './flight-menu';

export interface MenuLabelState {
  isChaseCamera: boolean;
  isAnalogOn: boolean;
  isSoundAvailable: boolean;
  isSoundOn: boolean;
}

/** Text and key hints for the in-flight menu, from the live key bindings and the current toggles. */
export function buildFlightMenuLabels(bindings: Readonly<Bindings>, state: MenuLabelState): FlightMenuLabels {
  return {
    cameraLabel: state.isChaseCamera ? 'chase' : 'goggles',
    isAnalogOn: state.isAnalogOn,
    cameraKey: primaryKeyLabel(bindings, 'camera'),
    staticKey: primaryKeyLabel(bindings, 'static'),
    resetKey: primaryKeyLabel(bindings, 'reset'),
    soundLabel: state.isSoundAvailable ? `Motor sound: ${state.isSoundOn ? 'on' : 'off'}` : 'Motor sound: unavailable',
    soundKey: primaryKeyLabel(bindings, 'sound'),
    exitKey: primaryKeyLabel(bindings, 'pause'),
  };
}
