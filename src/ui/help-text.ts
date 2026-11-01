import { primaryKeyLabel, type ActionId, type Bindings } from '../input/key-bindings';

/** One line of current key hints for the bottom of the screen. Reads the live bindings, so remaps show up. */
export function helpText(bindings: Readonly<Bindings>): string {
  const key = (id: ActionId): string => primaryKeyLabel(bindings, id);
  return (
    `${key('up')} up · ${key('down')} down · ${key('forward')}/${key('back')} fly · ` +
    `${key('left')}/${key('right')} slide · mouse or ${key('turnLeft')}/${key('turnRight')} turn · ` +
    `${key('reset')} reset · ${key('pause')} menu`
  );
}
