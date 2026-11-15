# Feature: Sound Design

Status: In progress (parts 1 to 4 built: bus, motors, race and battery sounds, crash sounds, Crown chase sounds, positional sound for other pilots)
Phase: 8
Branch: `feat/sound-design`
Last updated: 2026-11-15

## Summary

A proper audio layer: one mixer (bus) with volume sliders, a four-motor drone sound with prop wash and wind, and sound feedback for gates, laps, the countdown and a low battery. Everything is synthesised in the browser with Web Audio: no files, no download, no Cloudflare cost. This replaces the Phase 1 `MotorSound` (see `motor-sound.md`).

## Player experience

- **Settings** gets a Sound section: Master, Motors, Effects and Ambience sliders. They are saved.
- **Motors:** four slightly detuned motors. Throttle raises the pitch, banking and pitching shift load between motors, so the sound moves and beats like a real quad. Diving or punching the throttle adds a rough prop-wash buzz.
- **Wind:** rushing air that gets louder and brighter with speed.
- **Camera changes what you hear:** goggles sit on the drone (loudest, brightest). The chase camera is further away (quieter, duller, less wind). The broadcast camera is far. The seat camera (a third of the chase distance) sits between goggles and chase: motors 0.8, brightness 0.85, wind 0.8.
- **Gates:** a clean ping. Each gate in a row (no crash) is one semitone higher, up to an octave. A crash or respawn resets the streak.
- **Countdown:** a tick per number and a higher tone on GO.
- **Laps:** a two-note chime for a lap, a three-note rising chime for a personal best.
- **Crashes:** what you hit decides the sound, how fast you were going decides the loudness (a slow bump still thuds). Under every crash the motors cut with a falling whine. Hard crashes leave a short ringing in the ears.
  - Ground: dull thud. Soft surfaces (water and trees) stay low and muffled: a deep 45 Hz thump, low-passed noise, a low falling hum where the motors cut, no ringing and nothing bright. Water adds three low bubbles. Trees add a hush of leaves, soft low taps that fade out. Building and factory: heavy low thump. Rock: sharp crack.
  - Gate, container and crane: ringing metal (gate bright, container mid, crane deep and long). Vehicle: crunch, then a short car horn.
- **Other pilots (live rooms):** every other drone has its own motor voice placed in 3D around you. You hear it come from the left or right, in front or behind (HRTF panning), get louder as it nears and duller as it recedes (distance and air absorption), and its pitch bends as it passes (Doppler: higher as it flies toward you, lower as it flies away). Its pitch also follows how hard it is flying (speed and climbing). The "listener" is the camera, so goggles, chase and seat each hear it from where they are. Beyond 250 m a drone is silent.
- **Crown chase:**
  - **Free crown:** a high shimmer you can steer by. It gets louder as you get close, and pans left or right to show where the beacon is relative to your drone's heading. It is silent beyond 220 m and while someone wears the crown.
  - **You claim it:** a bright rising chord. **You are dethroned:** a low falling sting. **Someone else claims it:** a soft ping. **It drops:** a falling swoop. **It returns at the beacon:** a chime.
  - **Heartbeat:** while you are king, a heartbeat that speeds up as your 30 seconds run out.
  - **Proximity pulse:** while a chaser is within 14 m of the king, a sonar-style pulse that speeds up as they close in. The king hears a higher, sharper pulse (danger). The chaser hears a lower one (lock-on).
- **Battery low:** short beeps that speed up as the pack drains, like a real low-voltage buzzer.
- Sound is still off until the player turns it on (M or the flight menu button), because browsers need a click first. The on/off choice is saved as before.

## Behavior and rules (values in `config.ts` `AUDIO`)

| Part | Rule |
|---|---|
| Motor tone | Per motor: a sawtooth plus a square at 1.502 times (the Phase 1 timbre), through a low-pass filter. Pitch 120 Hz + 360 Hz x that motor's load |
| Motor load | Throttle plus a mix: nose down loads the rear motors, a bank loads the opposite side, turning loads one diagonal pair. Tilt gives a steady offset, tilt change rate gives the quick correction |
| Detune | Each motor is a few cents off the others, so they beat |
| Prop wash | Noise through a band-pass with a 24 Hz tremolo. Level rises with sink rate (from 2 m/s, full at 10 m/s) and with how fast throttle changes |
| Wind | Noise through a band-pass at 700 Hz + 15 Hz per m/s. Volume as before (speed / 30 m/s) |
| Gate ping | 660 Hz, +1 semitone per gate in a row, capped at 12. 0.25 s decay |
| Countdown | 880 Hz tick, 1320 Hz GO |
| Battery low | Beep at 2.8 kHz. Interval 1.2 s at the low threshold, down to 0.25 s near empty |
| Crash | Per surface profile in `AUDIO.crash.profiles` (thump, noise burst, ringing partials, optional horn, bubbles or rustle; `isSoft` surfaces use low-passed noise and a low motor-cut hum). Loudness 35% at 3 m/s impact speed up to 100% at 25 m/s. Motor-cut whine 520 to 60 Hz in 0.45 s. Ringing in the ears above 60% intensity, only on hard surfaces (not trees or water) |
| Crown beacon | Two detuned sines (1568 Hz and 1975 Hz) with a 5 Hz shimmer. Volume rises with closeness inside 220 m; pan is the beacon's side relative to the drone heading |
| Crown heartbeat | Lub-dub every 1.0 s at the start of the hold, down to 0.38 s at the end (accelerating) |
| Crown pulse | Beep every 0.8 s at the edge of the warning range, 0.12 s when touching |
| Other pilots | Per drone: two detuned sawtooth plus a square fifth through a low-pass, then an HRTF panner (inverse distance, reference 4 m, roll-off 1.6). Pitch is the motor pitch for its estimated throttle (0.35 + 0.3 x speed ratio + climb), times a Doppler ratio from the speed of sound (343 m/s) and both velocities, limited to 0.8 to 1.25. Brightness falls with distance. Silent beyond 250 m. Voices are created when a drone appears and removed when it leaves |
| Mixer | Motors and prop wash on the Motors bus, wind on Ambience, all one-shot sounds on Effects. All feed Master, then a limiter so stacked sounds never clip |
| Slider curve | Slider 0 to 100, gain is the square of slider / 100 (feels even to the ear) |

## Technical design

- `src/audio/` is a new layer (config, core only; it never imports the game): 
  - `audio-bus.ts`: context, master and group gains, limiter, level changes.
  - `motor-model.ts`: pure functions (`motorLoads`, `washLevel`, `windTone`, `batteryBeepIntervalS`, `gatePitchHz`), unit tested.
  - `motor-voice.ts`: the four motors. `wind-voice.ts`: wind and prop wash. `sfx.ts`: one-shot sounds.
  - `positional-model.ts`: pure functions for the Doppler ratio, the estimated throttle of a remote drone, air absorption and the volume of a remote voice (unit tested). `remote-voice.ts`: one other pilot's motor. The sound system keeps one voice per visible drone and aims the Web Audio listener at the camera every frame.
- `sound-system.ts`: the one object the game holds. Same API as the old `MotorSound` (`toggle`, `enabled`, `available`) plus `update(frame)`, `play(event)` and `setLevels`.
- `core/audio-settings.ts`: the four sliders, sanitised and saved under `pw.audio.v1` (pure, tested).
- `FlightSession` reports each crash (what was hit and how fast) and the game plays `crash` on the sound system. `game/audio-director.ts`: watches each presented frame (the countdown text, the lap tracker, the battery, crashes) and turns changes into sound events. No game rule knows about sound.
- The old `core/audio.ts` is removed.

## Edge cases

- Web Audio blocked or missing: the menu button says unavailable, the game carries on, no errors.
- Tab hidden: the browser suspends audio and it resumes on return.
- Motors cut (empty battery): motors fade over 0.3 s, wind keeps going, the low-battery beep stops.
- Crash freeze: motors silent, wash silent, wind continues.
- Main menu background flyby: silent, as before.

## Acceptance criteria

- [ ] Four sliders in Settings change the volume live and are remembered.
- [ ] Motor pitch rises with throttle and the sound shifts when banking and pitching.
- [ ] Diving or a throttle punch is audibly rougher (prop wash).
- [ ] Goggles are louder than chase, and chase louder than broadcast.
- [ ] Gate pings rise in a streak and reset after a crash.
- [ ] Countdown ticks, GO tone, lap chime and personal-best chime play in the matching modes.
- [ ] Each of the ten crash reasons sounds different, and a fast crash is louder than a slow bump.
- [ ] In Crown chase: the free crown can be found by ear, claim, loss, steal by others, drop and return each sound different, the heartbeat speeds up near the end of a hold, and the proximity pulse speeds up as a chaser closes in.
- [ ] In a live room, another drone is heard from the correct side, gets louder as it approaches, bends in pitch as it passes, and is silent far away or when that pilot leaves.
- [ ] Low-battery beeps speed up as charge drops and stop when empty.
- [ ] No console errors where audio is blocked.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | Unit: `motorLoads` nose down, bank, yaw | Rear > front when nose down; opposite side loaded in a bank; diagonal pair in yaw | Unit |
| 2 | Unit: `washLevel` | Zero when level, rises with sink and throttle change, capped at 1 | Unit |
| 3 | Unit: `gatePitchHz` | One semitone per step, capped at an octave | Unit |
| 4 | Unit: `batteryBeepIntervalS` | Long when full, short near empty, clamped | Unit |
| 5 | Unit: audio settings | Bad values clamped, missing keys default, round trip | Unit |
| 6 | Unit: director | Gate, lap, best lap, countdown, battery events fire once; streak resets on crash | Unit |
| 7 | Unit: crash volume and profiles | Slow bumps quiet but audible, hard crashes full; every crash reason has a profile and none is left over | Unit |
| 8 | Unit: Crown cues (model and director) | Beacon loudness and pan, heartbeat and pulse rates, one event per change of holder, nothing on the first update | Unit |
| 9 | Unit: positional model | Doppler ratio rises toward you and falls away, listener motion counts, clamped; throttle estimate rises with speed and climb; absorption falls with distance; volume zero beyond range | Unit |
| 10 | Manual: fly, bank, dive, change camera | See the acceptance criteria | Manual |

## Verification and known gaps

- Other pilots' motors: rendered offline in stereo with the listener facing -z. A drone on the right is louder in the right ear and one on the left in the left ear (equal when ahead), a drone 10 m away is about 6 times louder than one at 100 m, nothing is heard beyond 250 m or with no drone, and the same drone sounds about 16% higher flying toward the listener than away from it (the physics says 19%, the rest is the zero-crossing estimate). Not tested with real network poses or a human ear: live-room listening needs two people.
- Crown chase sounds: rendered offline in stereo: each sting is audible and distinct, the beacon is louder in the right ear when panned right and the left when panned left, and silent with no beacon. A two-browser Crown chase room with sound on ran with no console or page errors.
- Crash sounds: rendered offline in a browser (an `OfflineAudioContext` standing in for the real one): all ten reasons produce sound, they differ in loudness and pitch (building and factory lowest, water and tree noisiest), a 3 m/s bump is about half as loud as a 20 m/s crash, no errors.
- Verified: 506 tests (model, settings, director). In headless Chrome with a measuring analyser on the limiter: the menu is silent, free flight and time trial produce a signal, the context runs, and there are no console errors.
- Headless browsers have no audio output, so only logic and absence of errors can be tested here. Every tone value is a first guess and needs ears: please listen and tell me what to change.
- Not in these parts: per-map ambience and the optional extras.
- (Earlier note) Not in these parts: 3D positioned sound and Doppler for other pilots, per-map ambience (parts 4 to 6 of the plan).

## Changelog

- 2026-11-15: Created. Part 1 (bus, four motors, prop wash, wind, gate, countdown, lap and battery sounds, sliders).
- 2026-11-15: Part 2: crash sounds per surface, with impact speed deciding loudness. Positional sound for other pilots waits for the seat camera (the user is adding a third-person camera much closer to the drone than chase).
- 2026-11-15: Part 3: Crown chase sounds (beacon shimmer with pan and distance, claim, loss, steal, drop and return stings, heartbeat, proximity pulse). The beacon pans by the drone's heading, not the camera, so it needs no change for the future seat camera.
- 2026-11-15: The seat camera exists now. Its mix entry is in place; positional sound for other pilots (part 4) can be tuned against it.
- 2026-11-15: Trees sounded like a metal ping (the ear ringing played for every hard crash). Ringing is now per surface and off for trees and water; trees got a rustle of soft noise taps instead.
- 2026-11-15: Part 4: positional motor sound for other pilots with Doppler, listener on the camera.
- 2026-11-15: Trees and water still clinked (the buzzy sawtooth motor-cut whine, the 2.3 to 2.8 kHz noise and the bright bubbles were all high). Soft surfaces are now a separate class: deep thump (about 45 Hz), low-passed noise, a low sine hum instead of the sawtooth whine, low bubbles, soft leaf taps. Measured offline: the early zero-crossing rate of a tree crash fell from about 6,000 to about 550 Hz, water from about 5,500 to about 475 Hz.
