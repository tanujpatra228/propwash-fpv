import { BOTS, ROOMS, TRACK_DEFS, TRACK_IDS, type BotSkillId, type TrackId } from '../config';
import { el } from '../core/dom';
import { normaliseRoomCode, type BotSettings, type Loadout, type RoomMode, type RoomRules, type RosterEntry } from '../core/room-protocol';

export interface LobbyHandlers {
  onCreate(): void;
  onJoin(code: string): void;
  onReady(isReady: boolean): void;
  onLaps(laps: number): void;
  onMode(mode: RoomMode): void;
  onTrack(track: TrackId): void;
  onRules(drain: boolean, loadout: Loadout): void;
  onBots(count: number, skill: BotSkillId): void;
  onStart(): void;
  onChat(text: string): void;
  onCopyLink(): void;
  onLeave(): void;
}

export interface LobbyView {
  code: string;
  myId: string;
  hostId: string;
  laps: number;
  mode: RoomMode;
  /** The map the room is playing. */
  track: TrackId;
  rules: RoomRules;
  bots: BotSettings;
  /** A solo race against bots: no room code, no invite, no map or game choice here. */
  isSolo?: boolean;
  pilots: readonly RosterEntry[];
  pingMs: number;
}

/** Whether the host may start now, and if not, why. Shared with tests. */
export function startStatus(view: Pick<LobbyView, 'myId' | 'hostId' | 'pilots'> & { isSolo?: boolean }): { canStart: boolean; hint: string; label: string } {
  const here = view.pilots.filter((p) => p.isConnected);
  const humans = here.filter((p) => !p.isBot).length;
  if (view.isSolo && view.myId === view.hostId && here.length < ROOMS.minPilotsToStart) return { canStart: false, hint: 'Add at least one bot to race.', label: 'Start race' };
  // The host is always counted as ready.
  const ready = here.filter((p) => p.id === view.hostId || p.isReady).length;
  const count = `${ready}/${here.length} ready`;
  if (view.myId !== view.hostId) return { canStart: false, hint: 'Waiting for the host to start.', label: `Start race · ${count}` };
  if (!view.isSolo && humans < ROOMS.minPilotsToStart) return { canStart: false, hint: 'Share the link: you need at least one more pilot.', label: `Start race · ${humans}/${ROOMS.minPilotsToStart} pilots` };
  if (here.some((p) => !p.isOnMap)) return { canStart: false, hint: 'Waiting for everyone to switch to the map.', label: `Start race · ${count}` };
  if (ready < here.length) return { canStart: false, hint: 'Waiting for everyone to be ready.', label: `Start race · ${count}` };
  return { canStart: true, hint: 'Everyone is ready.', label: `Start race · ${count}` };
}

/** The "Race friends" screens: create or join, then the lobby. DOM only; the controller feeds it state. */
export class LobbyScreen {
  private readonly root: HTMLDivElement;
  private readonly entry: HTMLElement;
  private readonly room: HTMLElement;
  private readonly message = el('p', { class: 'cd-sub lobby-message' });
  private readonly codeInput = el('input', { type: 'text', class: 'name-input', autocomplete: 'off', spellcheck: 'false', maxlength: String(ROOMS.codeLength), placeholder: 'ROOM CODE', 'aria-label': 'Room code' });
  private readonly joinButton = el('button', { type: 'button', class: 'btn ghost', text: 'Join' });
  private readonly codeLabel = el('b', { class: 'lobby-code' });
  private readonly pilots = el('ul', { class: 'lobby-pilots' });
  private readonly lapButtons: HTMLButtonElement[] = [];
  private readonly lapsNote = el('small', { class: 'cd-sub' });
  private readonly lapsRow = el('div', { class: 'lobby-laps' });
  private readonly modeButtons = new Map<RoomMode, HTMLButtonElement>();
  private readonly modeNote = el('small', { class: 'cd-sub' });
  private readonly mapButtons = new Map<TrackId, HTMLButtonElement>();
  private readonly mapNote = el('small', { class: 'cd-sub' });
  private rules: RoomRules = { drain: false, loadout: 'stock' };
  private readonly drainButtons = new Map<boolean, HTMLButtonElement>();
  private readonly loadoutButtons = new Map<Loadout, HTMLButtonElement>();
  private readonly rulesRow = el('div', { class: 'lobby-rules' });
  private readonly botCountButtons: HTMLButtonElement[] = [];
  private readonly botSkillButtons = new Map<BotSkillId, HTMLButtonElement>();
  private readonly botsRow = el('div', { class: 'lobby-bots' });
  private readonly botsNote = el('small', { class: 'cd-sub' });
  private bots: BotSettings = { count: 0, skill: BOTS.defaultSkill };
  private readonly roomEyebrow = el('span', { class: 'eyebrow', text: 'Room code' });
  private readonly copyButton = el('button', { type: 'button', class: 'btn ghost', text: 'Copy invite link' });
  private mapRow!: HTMLElement;
  private modeRow!: HTMLElement;
  private readonly readyButton = el('button', { type: 'button', class: 'btn', text: 'Ready' });
  private readonly startButton = el('button', { type: 'button', class: 'btn', text: 'Start race' });
  private readonly startHint = el('small', { class: 'cd-sub' });
  private readonly chatLog = el('div', { class: 'lobby-chat', 'aria-live': 'polite' });
  private readonly chatInput = el('input', { type: 'text', class: 'name-input', autocomplete: 'off', spellcheck: 'false', maxlength: String(ROOMS.chatMaxChars), placeholder: 'Say something', 'aria-label': 'Chat message' });
  private isReady = false;

  constructor(private readonly handlers: LobbyHandlers) {
    this.entry = this.buildEntry();
    this.room = this.buildRoom();
    this.root = el('div', { class: 'modal', hidden: true }, [
      el('div', { class: 'panel lobby-panel', role: 'dialog', 'aria-label': 'Race friends' }, [this.message, this.entry, this.room]),
    ]);
    document.body.append(this.root);
  }

  private buildEntry(): HTMLElement {
    const create = el('button', { type: 'button', class: 'btn', text: 'Create a room' });
    create.addEventListener('click', () => this.handlers.onCreate());
    const join = (): void => {
      const code = normaliseRoomCode(this.codeInput.value);
      if (code) this.handlers.onJoin(code);
      else this.setMessage('Room codes are 5 letters and numbers.');
    };
    this.joinButton.addEventListener('click', join);
    this.codeInput.addEventListener('input', () => (this.codeInput.value = this.codeInput.value.toUpperCase()));
    this.stopKeys(this.codeInput, join);
    const leave = el('button', { type: 'button', class: 'btn ghost', text: 'Back' });
    leave.addEventListener('click', () => this.handlers.onLeave());
    return el('div', { class: 'lobby-entry' }, [
      el('span', { class: 'eyebrow', text: 'Race friends' }),
      el('h2', { text: 'Live race' }),
      el('p', { class: 'cd-sub', text: 'Up to 8 pilots, same valley, same start line.' }),
      create,
      el('div', { class: 'lobby-join' }, [this.codeInput, this.joinButton]),
      leave,
    ]);
  }

  private buildRoom(): HTMLElement {
    this.readyButton.addEventListener('click', () => {
      this.isReady = !this.isReady;
      this.handlers.onReady(this.isReady);
    });
    this.startButton.addEventListener('click', () => this.handlers.onStart());
    const copy = this.copyButton;
    copy.addEventListener('click', () => this.handlers.onCopyLink());
    const leave = el('button', { type: 'button', class: 'btn ghost', text: 'Leave' });
    leave.addEventListener('click', () => this.handlers.onLeave());
    const laps = el('div', { class: 'seg laps-seg' });
    for (let n = ROOMS.minLaps; n <= ROOMS.maxLaps; n++) {
      const button = el('button', { type: 'button', text: String(n) });
      button.addEventListener('click', () => this.handlers.onLaps(n));
      this.lapButtons.push(button);
      laps.append(button);
    }
    this.lapsRow.append(el('span', { text: 'Laps' }), laps);
    const send = (): void => {
      const text = this.chatInput.value.trim();
      if (text) this.handlers.onChat(text);
      this.chatInput.value = '';
    };
    this.stopKeys(this.chatInput, send);
    return el('div', { class: 'lobby-room', hidden: true }, [
      this.roomEyebrow,
      this.codeLabel,
      this.pilots,
      (this.modeRow = this.buildModeRow()),
      (this.mapRow = this.buildMapRow()),
      this.buildBotsRow(),
      this.buildRulesRow(),
      this.lapsRow,
      this.lapsNote,
      this.chatLog,
      this.chatInput,
      el('div', { class: 'cd-buttons' }, [this.readyButton, this.startButton, this.startHint, copy, leave]),
    ]);
  }

  /** How many bots race and how good they are. Races only; the host chooses. */
  private buildBotsRow(): HTMLElement {
    const count = el('div', { class: 'seg bots-seg' });
    for (let n = 0; n <= BOTS.maxBots; n++) {
      const button = el('button', { type: 'button', text: String(n) });
      button.addEventListener('click', () => this.handlers.onBots(n, this.bots.skill));
      this.botCountButtons.push(button);
      count.append(button);
    }
    const skill = el('div', { class: 'seg' });
    for (const id of Object.keys(BOTS.skills) as BotSkillId[]) {
      const button = el('button', { type: 'button' }, [el('b', { text: BOTS.skills[id].label })]);
      button.addEventListener('click', () => this.handlers.onBots(this.bots.count, id));
      this.botSkillButtons.set(id, button);
      skill.append(button);
    }
    this.botsRow.append(el('span', { text: 'Bots' }), count, skill, this.botsNote);
    return this.botsRow;
  }

  private buildRulesRow(): HTMLElement {
    const drain = el('div', { class: 'seg two' });
    for (const [isOn, label, description] of [[false, 'Off', 'Battery never ends the race.'], [true, 'On', 'Run out before the finish and you are out.']] as const) {
      const button = el('button', { type: 'button' }, [el('b', { text: label }), el('small', { text: description })]);
      button.addEventListener('click', () => this.handlers.onRules(isOn, this.rules.loadout));
      this.drainButtons.set(isOn, button);
      drain.append(button);
    }
    const loadout = el('div', { class: 'seg two' });
    for (const [id, label, description] of [['stock', 'Stock drones', 'Everyone flies the same drone.'], ['hangar', 'Hangar setups', 'Everyone flies their own parts.']] as const) {
      const button = el('button', { type: 'button' }, [el('b', { text: label }), el('small', { text: description })]);
      button.addEventListener('click', () => this.handlers.onRules(this.rules.drain, id));
      this.loadoutButtons.set(id, button);
      loadout.append(button);
    }
    this.rulesRow.append(el('span', { text: 'Battery race' }), drain, el('span', { text: 'Drones' }), loadout);
    return this.rulesRow;
  }

  private buildMapRow(): HTMLElement {
    const seg = el('div', { class: 'seg map-seg' });
    for (const id of TRACK_IDS) {
      const button = el('button', { type: 'button' }, [el('b', { text: TRACK_DEFS[id].shortName })]);
      button.addEventListener('click', () => this.handlers.onTrack(id));
      this.mapButtons.set(id, button);
      seg.append(button);
    }
    return el('div', { class: 'lobby-map' }, [el('span', { text: 'Map' }), seg, this.mapNote]);
  }

  private buildModeRow(): HTMLElement {
    const seg = el('div', { class: 'seg two' });
    for (const [mode, label, description] of [['race', 'Race', 'Fly the gates.'], ['crown', 'Crown chase', 'Take the crown from the king.']] as const) {
      const button = el('button', { type: 'button' }, [el('b', { text: label }), el('small', { text: description })]);
      button.addEventListener('click', () => this.handlers.onMode(mode));
      this.modeButtons.set(mode, button);
      seg.append(button);
    }
    return el('div', { class: 'lobby-mode' }, [seg, this.modeNote]);
  }

  private stopKeys(input: HTMLInputElement, onEnter: () => void): void {
    input.addEventListener('keydown', (event) => {
      event.stopPropagation(); // typing must not trigger flight keys
      if (event.key === 'Enter') onEnter();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** A message that shows over the room view too (for example while reloading into another map). */
  showRoomMessage(text: string): void {
    this.message.textContent = text;
    this.root.hidden = false;
  }

  setMessage(text: string): void {
    this.message.textContent = text;
  }

  showEntry(message = ''): void {
    this.setMessage(message);
    this.entry.hidden = false;
    this.room.hidden = true;
    this.root.hidden = false;
    this.codeInput.focus();
  }

  /** Prefills the code field (from an invite link). */
  setCode(code: string): void {
    this.codeInput.value = code;
  }

  showRoom(view: LobbyView): void {
    if (this.message.textContent === 'Connecting…') this.setMessage('');
    this.entry.hidden = true;
    this.room.hidden = false;
    this.root.hidden = false;
    this.codeLabel.textContent = view.code;
    const isSolo = view.isSolo === true;
    this.codeLabel.hidden = isSolo;
    this.roomEyebrow.textContent = isSolo ? 'Solo race' : 'Room code';
    this.copyButton.hidden = isSolo;
    this.mapRow.hidden = isSolo;
    this.modeRow.hidden = isSolo;
    const me = view.pilots.find((p) => p.id === view.myId);
    this.isReady = me?.isReady ?? false;
    const isHost = view.myId === view.hostId;
    this.readyButton.textContent = this.isReady ? 'Not ready' : 'Ready';
    this.readyButton.hidden = isHost;
    const status = startStatus(view);
    this.bots = view.bots;
    this.botsRow.hidden = view.mode === 'crown';
    this.botCountButtons.forEach((button, n) => {
      button.classList.toggle('on', n === view.bots.count);
      button.disabled = !isHost;
    });
    for (const [id, button] of this.botSkillButtons) {
      button.classList.toggle('on', id === view.bots.skill);
      button.disabled = !isHost;
    }
    this.botsNote.textContent = isHost ? (view.bots.count < 1 && isSolo ? 'Pick at least one bot.' : BOTS.skills[view.bots.skill].description) : 'The host chooses the bots.';
    this.startButton.hidden = !isHost;
    this.startButton.disabled = !status.canStart;
    this.startButton.textContent = status.label.replace('Start race', view.mode === 'crown' ? 'Start match' : 'Start race');
    this.startHint.textContent = status.hint;
    this.lapButtons.forEach((button, i) => {
      button.classList.toggle('on', i + ROOMS.minLaps === view.laps);
      button.disabled = !isHost;
    });
    this.lapsNote.textContent = isHost || view.mode === 'crown' ? '' : 'The host chooses the number of laps.';
    this.lapsRow.hidden = view.mode === 'crown';
    this.rules = view.rules;
    // The battery only matters in races; the drones matter in both modes.
    for (const [isOn, button] of this.drainButtons) {
      button.classList.toggle('on', isOn === view.rules.drain);
      button.disabled = !isHost;
      button.hidden = false;
    }
    for (const [id, button] of this.loadoutButtons) {
      button.classList.toggle('on', id === view.rules.loadout);
      button.disabled = !isHost;
    }
    const drainRow = this.rulesRow.children[0];
    const drainSeg = this.rulesRow.children[1];
    if (drainRow instanceof HTMLElement) drainRow.hidden = view.mode === 'crown';
    if (drainSeg instanceof HTMLElement) drainSeg.hidden = view.mode === 'crown';
    for (const [id, button] of this.mapButtons) {
      button.classList.toggle('on', id === view.track);
      button.disabled = !isHost;
    }
    this.mapNote.textContent = isHost ? 'Everyone reloads into the map you pick.' : `Map: ${TRACK_DEFS[view.track].name}. The host chooses.`;
    for (const [mode, button] of this.modeButtons) {
      button.classList.toggle('on', mode === view.mode);
      button.disabled = !isHost;
    }
    this.modeNote.textContent = view.mode === 'crown' ? '3 minutes. Touch the king to take the crown. No crashes between drones.' : isHost ? '' : 'The host chooses the game.';
    this.pilots.replaceChildren(
      ...view.pilots.filter((p) => p.isConnected).map((p) =>
        el('li', { class: p.id === view.myId ? 'me' : undefined }, [
          el('i', { class: 'lobby-dot', style: `background:#${(ROOMS.droneColors[p.slot % ROOMS.droneColors.length] ?? 0xffffff).toString(16).padStart(6, '0')}` }),
          el('span', { class: 'st-name', text: p.name }),
          el('small', { text: p.isBot ? 'Bot' : !p.isOnMap ? 'Switching map' : p.id === view.hostId ? 'Host' : p.isReady ? 'Ready' : 'Not ready' }),
        ]),
      ),
    );
  }

  addChat(name: string, text: string): void {
    this.chatLog.append(el('p', {}, [el('b', { text: `${name}: ` }), text]));
    while (this.chatLog.childElementCount > 40) this.chatLog.firstElementChild?.remove();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  clearChat(): void {
    this.chatLog.replaceChildren();
  }
}
