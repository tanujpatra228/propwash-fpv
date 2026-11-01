import { Quaternion, Vector3, type Scene } from 'three';
import { MENU } from '../config';
import { createDroneModel, type DroneModel } from '../drone/drone-model';
import { TrackRacer } from '../drone/track-racer';
import { track } from '../world/track';
import { broadcastShot, SHOT_ORDER } from './broadcast-shots';

const forward = new Vector3();
const ahead = new Vector3();
const heading = new Vector3();

/** The live flyby behind the main menu: AI drones racing the track, filmed with hard cuts between shots. */
export class MenuDirector {
  private readonly racers: TrackRacer[];
  private readonly models: DroneModel[];
  private shotIndex = 0;
  private shotTimeS = 0;
  readonly cameraPosition = new Vector3();
  readonly cameraLookAt = new Vector3();

  constructor(scene: Scene) {
    const count = MENU.racers.length;
    this.racers = MENU.racers.map((config, i) =>
      new TrackRacer({ topSpeedMps: config.topSpeedMps, lateralOffsetM: config.lateralOffsetM, phase: i * 2.1, startDistM: (track.lengthM * (i + 1)) / (count + 1) }),
    );
    this.models = MENU.racers.map((config) => createDroneModel({ color: config.color }));
    for (const model of this.models) {
      model.group.visible = false;
      scene.add(model.group);
    }
  }

  setActive(isActive: boolean): void {
    for (const model of this.models) model.group.visible = isActive;
    if (isActive) this.shotTimeS = 0;
  }

  update(dtS: number, timeS: number): void {
    this.shotTimeS += dtS;
    if (this.shotTimeS >= MENU.shotLengthS) {
      this.shotTimeS = 0;
      this.shotIndex++;
    }
    this.racers.forEach((racer, i) => {
      racer.step(dtS, timeS);
      const model = this.models[i];
      if (!model) return;
      model.group.position.copy(racer.position);
      model.group.quaternion.copy(racer.quaternion);
      model.spinProps(0.5, dtS);
    });

    const subject = this.racers[this.shotIndex % this.racers.length];
    if (!subject) return;
    forward.set(0, 0, -1).applyQuaternion(subject.quaternion as Quaternion);
    heading.set(forward.x, 0, forward.z).normalize();
    track.sampleAt((subject.distM + MENU.shots.trackside.aheadM) / track.lengthM, ahead);
    const kind = SHOT_ORDER[this.shotIndex % SHOT_ORDER.length] ?? 'chase';
    broadcastShot(kind, subject.position, heading, ahead, this.cameraPosition, this.cameraLookAt);
  }
}
