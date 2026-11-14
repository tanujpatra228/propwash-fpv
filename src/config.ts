/** Single source of truth for tunable values. Each later milestone adds its own section. */

export const LOOP = {
  /** Largest simulated step; protects physics after a hidden tab or a stall. */
  maxDtS: 1 / 20,
  /** Smallest step; avoids divide-by-zero when two frames share a timestamp. */
  minDtS: 0.0001,
} as const;

const WORLD_BASE = {
  seed: 1337,
  /** The faint grid that marks the boundary. It only shows when the drone is close. */
  boundaryGrid: {
    spacingM: 25,
    lineColor: 0xa8e6ff,
    maxOpacity: 0.3,
    /** Fully visible closer than this to the wall, gone beyond fadeEndM. */
    fadeStartM: 25,
    fadeEndM: 140,
    bottomM: -30,
  },
} as const;

export type TrackId = 'valley' | 'city' | 'night' | 'harbor' | 'glacier';
export const TRACK_IDS: readonly TrackId[] = ['valley', 'city', 'night', 'harbor', 'glacier'];

/** Which world a track is built from. A track is a world plus an atmosphere (`night` is the city after dark). */
export type WorldFamily = 'valley' | 'city' | 'harbor' | 'glacier';
export type AtmosphereId = 'day' | 'night' | 'dusk' | 'alpine';

export function isTrackId(value: unknown): value is TrackId {
  return value === 'valley' || value === 'city' || value === 'night' || value === 'harbor' || value === 'glacier';
}

/**
 * Per-track facts the server also needs. `worldVersion` is bumped when a track's world changes: it invalidates saved
 * ghosts and best laps. `start` is gate 0's position on the ground plane. The drone cannot leave the bounds box.
 */
export const TRACK_DEFS = {
  valley: { family: 'valley' as WorldFamily, atmosphere: 'day' as AtmosphereId, isNight: false, name: 'Valley Sprint', blurb: 'Nature, a lake and a factory.', worldVersion: 1, start: [0, -150], halfSizeM: 900, ceilingM: 300 },
  city: { family: 'city' as WorldFamily, atmosphere: 'day' as AtmosphereId, isNight: false, name: 'Downtown Dash', blurb: 'Streets, traffic, towers and windows to fly through.', worldVersion: 101, start: [0, 190], halfSizeM: 320, ceilingM: 170 },
  night: { family: 'city' as WorldFamily, atmosphere: 'night' as AtmosphereId, isNight: true, name: 'Downtown Dash: Night', blurb: 'The same city after dark: neon, street lights and glowing windows.', worldVersion: 102, start: [0, 190], halfSizeM: 320, ceilingM: 170 },
  harbor: { family: 'harbor' as WorldFamily, atmosphere: 'dusk' as AtmosphereId, isNight: false, name: 'Harbor Run', blurb: 'Container yard, cranes, a cargo ship and open water at golden hour.', worldVersion: 103, start: [-230, -128], halfSizeM: 360, ceilingM: 130 },
  glacier: { family: 'glacier' as WorldFamily, atmosphere: 'alpine' as AtmosphereId, isNight: false, name: 'Glacier Pass', blurb: 'Snowy peaks, a tight canyon, a frozen lake and wind that pushes you around.', worldVersion: 104, start: [0, 240], halfSizeM: 500, ceilingM: 400 },
} as const;

/** The track chosen at start-up: `?track=` first, then the saved choice, else the valley. Changing it reloads the page. */
function readActiveTrack(): TrackId {
  // `globalThis` so the same file also compiles for the server, which has no window.
  const env = globalThis as { location?: { search: string }; localStorage?: { getItem(key: string): string | null } };
  try {
    const fromUrl = new URLSearchParams(env.location?.search ?? '').get('track');
    if (isTrackId(fromUrl)) return fromUrl;
    const saved: unknown = JSON.parse(env.localStorage?.getItem('pw.track.v1') ?? 'null');
    if (isTrackId(saved)) return saved;
  } catch {
    // No window (the server) or blocked storage: the valley.
  }
  return 'valley';
}

export const ACTIVE_TRACK_ID: TrackId = readActiveTrack();
export const ACTIVE_TRACK_DEF = TRACK_DEFS[ACTIVE_TRACK_ID];

export const WORLD = {
  ...WORLD_BASE,
  version: ACTIVE_TRACK_DEF.worldVersion as number,
  bounds: { halfSizeM: ACTIVE_TRACK_DEF.halfSizeM as number, ceilingM: ACTIVE_TRACK_DEF.ceilingM as number },
};


/** Valley layout. Changing noise, sizes or seeds changes the world: bump WORLD.version. */
export const VALLEY = {
  sizeM: 2600,
  segments: 320,
  valleyFloorRadiusM: 150,
  mountainRingRadiusM: 460,
  lake: { x: -40, z: 74, radiusM: 44, depthBelowShoreM: 2.2 },
  bando: { x: 112, z: 100, innerRadiusM: 24, outerRadiusM: 42 },
} as const;

/**
 * Glacier Pass: the race route carved through the mountains, the wind zones, the arch, the lodge and the trees.
 * `route` points are [x, z, floorY, halfWidthM, clearanceM]: the valley floor height there, how wide the carved floor is,
 * and how far above the floor the race line flies. See docs/features/glacier-pass.md.
 */
export const GLACIER = {
  seed: 20_251,
  route: [
    [0, 240, 10, 30, 7], [0, 180, 10, 30, 7], [0, 140, 12, 30, 8], [10, 90, 20, 32, 8],
    [40, 40, 32, 34, 8], [85, -10, 45, 45, 10], [115, -70, 55, 50, 12], [110, -130, 62, 50, 14], [70, -180, 68, 40, 14],
    [20, -215, 62, 25, 12], [-25, -245, 52, 9, 8], [-70, -270, 46, 9, 8], [-120, -290, 42, 9, 8], [-165, -300, 38, 12, 8],
    [-215, -285, 22, 60, 10], [-260, -230, 15, 90, 7], [-270, -160, 15, 90, 6], [-250, -90, 16, 70, 8], [-200, -20, 20, 50, 9],
    [-160, 60, 18, 45, 9], [-110, 140, 14, 40, 8], [-60, 210, 12, 34, 7], [-58, 252, 12, 34, 7],
    [-38, 282, 11, 32, 7], [-8, 284, 10, 30, 7], [2, 262, 10, 30, 7],
  ],
  /** Gates, as [x, z] anchors along the route. */
  gateAnchors: [[0, 240], [0, 190], [0, 140], [40, 40], [115, -70], [70, -180], [-25, -245], [-95, -280], [-165, -300], [-260, -230], [-200, -20], [-60, 210]],
  /** Terrain: how far past the carved floor the walls take to reach full mountain height. */
  wallTransitionM: 28,
  /** Mountain height: base plus noise, rising toward the world edge. */
  mountain: { baseM: 110, noiseM: 140, edgeStartM: 380, edgeEndM: 560, edgeM: 190 },
  /** Heights above which the slopes turn to snow, and the slope that turns them to rock. */
  snowLineM: 48,
  rockSlope: 0.55,
  /** The frozen lake: ice where the route floor is this wide or wider and below this height. */
  lake: { minHalfWidthM: 60, maxFloorM: 30 },
  arch: { x: 0, z: 140, pillarX: 7.5, pillarWidthM: 3, lintelBottomM: 16, lintelTopM: 22, depthM: 8 },
  lodge: { x: 52, z: 268, widthM: 26, depthM: 14, wallHeightM: 7, roofHeightM: 4 },
  pines: { count: 650, maxHeightM: 62, minGapFromFloorM: 8, areaHalfM: 460 },
  /**
   * Wind: zones with a centre, radius, direction (degrees, 0 = blowing toward -Z, clockwise on the map), strength in
   * m/s² and a gust period. Strength falls to zero at the edge; gusts swing between 65 and 100 percent.
   */
  wind: {
    zones: [
      { x: 0, z: 200, radiusM: 120, directionDeg: 270, strength: 1.2, gustPeriodS: 9, gustPhase: 0 },
      { x: 100, z: -60, radiusM: 110, directionDeg: 300, strength: 2.6, gustPeriodS: 7, gustPhase: 1.3 },
      { x: 80, z: -165, radiusM: 100, directionDeg: 330, strength: 3.4, gustPeriodS: 11, gustPhase: 2.1 },
      { x: -60, z: -260, radiusM: 90, directionDeg: 245, strength: 2.8, gustPeriodS: 6, gustPhase: 0.7 },
      { x: -250, z: -190, radiusM: 130, directionDeg: 90, strength: 1.6, gustPeriodS: 5, gustPhase: 3.4 },
    ],
    gustMin: 0.65,
    /** How fast the air moves for each unit of zone strength: 3 m/s² of strength is about 6.6 m/s of air. */
    metresPerSecondPerStrength: 2.2,
    /** Strongest push the field can give, whatever the zones add up to. */
    maxAccelMps2: 4,
  },
} as const;

type ControlPoint = readonly [x: number, z: number, clearanceM: number | 'bando' | 'lake'];

/** Control points: [x, z, clearance above ground in metres, or a named zone]. */
const TRACK_POINTS: Record<WorldFamily, readonly ControlPoint[]> = {
  valley: [
    [0, -150, 5],
    [95, -138, 6],
    [168, -78, 8],
    [178, 10, 7],
    [112, 100, 'bando'],
    [45, 150, 7],
    [-36, 74, 'lake'],
    [-112, 114, 9],
    [-180, 30, 13],
    [-160, -62, 6],
    [-88, -130, 4],
  ],
  // Downtown Dash: north up the main avenue and under the skybridge, east, through two tower portals, over the avenue
  // on a high arch, down the east avenue, west through the park over the pond, south down the avenue and back.
  city: [
    [0, 200, 6], [0, 140, 7], [0, 100, 8], [0, 38, 9], [0, -30, 11], [0, -80, 12], [3, -103, 10], [20, -112, 9],
    [53, -111, 8], [72, -116, 6.5], [82, -130, 5.5], [82, -155, 5.5], [82, -180, 5.5], [82, -205, 5.5], [82, -236, 8],
    [92, -245, 10], [115, -247, 16], [150, -246, 26], [190, -246, 24], [226, -240, 18], [244, -215, 13], [244, -170, 10],
    [244, -100, 8], [240, -70, 5], [226, -60, 4], [190, -60, 3], [150, -60, 4], [138, -60, 5], [128, -57, 6],
    [121, -47, 6], [120, -30, 6], [120, -10, 6], [120, 0, 7], [120, 60, 9], [120, 120, 10], [120, 180, 8], [115, 215, 7], [100, 234, 7],
    [75, 240, 7], [50, 240, 7], [20, 237, 7], [3, 225, 6],
  ],
  // Harbor Run: east along the quay under crane 1, up the first container aisle, along the top of the yard, down the
  // second aisle, under crane 2, over the ship's stern and through its cargo, a low run over the water, through the
  // warehouse on the west pier and back to the quay.
  harbor: [
    [-230, -128, 7], [-205, -128, 7], [-180, -128, 8], [-160, -128, 6.5], [-125, -128, 7], [-90, -128, 6.5], [-60, -128, 8],
    [-38, -131, 8], [-22, -148, 7], [-20, -175, 7], [-20, -215, 7], [-22, -243, 8], [-10, -258, 8], [20, -262, 8],
    [60, -262, 8], [95, -255, 8], [109, -235, 7], [110, -205, 7], [110, -170, 7], [105, -142, 7], [100, -128, 7],
    [96, -112, 9], [82, -103, 11], [60, -102, 13], [35, -102, 14], [0, -102, 14], [-42, -102, 14], [-62, -102, 13],
    [-82, -100, 12], [-98, -84, 7], [-100, -60, 4], [-98, -38, 3.6], [-108, -24, 3.8], [-128, -21, 4.2], [-148, -27, 4.4],
    [-162, -30, 4.2], [-180, -30, 4.2], [-198, -38, 5], [-218, -52, 6], [-240, -68, 7], [-250, -90, 7], [-246, -106, 7],
    [-243, -120, 7],
  ],
  glacier: GLACIER.route.map(([x, z, , , clearance]): ControlPoint => [x, z, clearance]),
};

/**
 * Where each gate sits, as [x, z] on the ground plane, for tracks whose gates are placed by hand (the city).
 * Tracks without anchors space their gates evenly along the line.
 */
const GATE_ANCHORS: Partial<Record<WorldFamily, ReadonlyArray<readonly [number, number]>>> = {
  city: [[0, 190], [0, 100], [0, 38], [0, -75], [82, -155], [82, -205], [170, -246], [244, -170], [190, -60], [126, -60], [120, 0], [50, 240]],
  glacier: GLACIER.gateAnchors,
  harbor: [[-230, -128], [-195, -128], [-160, -128], [-90, -128], [-20, -175], [-20, -240], [45, -262], [110, -205], [35, -102], [-45, -102], [-100, -40], [-170, -30]],
};

const TRACK_SHARED = {
  samples: 4000,
  gateCount: 12,
  /** How far above the highest ground within groundScanRadiusM a normal control point sits. */
  groundScanRadiusM: 14,
  bandoClearanceM: 3.4,
  lakeClearanceM: 2.4,
  minGroundClearanceM: 1.8,
  /** Samples within this distance of the factory centre are not forced above the terrain. */
  smoothingPasses: 4,
  smoothingHalfWindow: 6,
  curvatureHalfWindow: 6,
  curvatureSmoothPasses: 2,
  curvatureSmoothHalfWindow: 8,
  /** Highest sideways acceleration an AI drone or ghost is posed for. */
  maxLateralAccelMps2: 22,
} as const;

export const TRACK = {
  ...TRACK_SHARED,
  name: ACTIVE_TRACK_DEF.name as string,
  points: TRACK_POINTS[ACTIVE_TRACK_DEF.family],
  gateAnchors: GATE_ANCHORS[ACTIVE_TRACK_DEF.family] ?? null,
  /** Samples this close to the factory centre are not forced above the terrain (the valley only). */
  bandoZoneRadiusM: ACTIVE_TRACK_DEF.family === 'valley' ? 30 : 0,
};

/** Downtown Dash: a 4 by 4 grid of blocks between avenues. See docs/features/city-track.md. */
export const CITY = {
  seed: 424_242,
  avenueSpacingM: 120,
  avenueWidthM: 28,
  /** Block centres on each axis. */
  blockCentersM: [-180, -60, 60, 180],
  blockHalfM: 46,
  /** Each block holds four lots: this half-size, centred this far from the block centre. */
  lotHalfM: 19,
  lotOffsetM: 22,
  height: { tower: [60, 110], mid: [25, 55], low: [10, 20] },
  /** Chance a free lot becomes a tower or a mid-rise (the rest are low). */
  towerChance: 0.25,
  midChance: 0.45,
  plazaBlock: { ix: 1, iz: 3 },
  parkBlock: { ix: 3, iz: 1 },
  /** Lots forced tall so the skybridge has towers to hang between: lot centres. */
  bridgeTowerLots: [[-38, 38], [38, 38]],
  bridgeTowerHeightM: 78,
  skybridge: { z: 38, bottomY: 22, depthM: 6, heightM: 6 },
  /** Lots with a tunnel through them (a "window" to fly through): lot centre and the axis the tunnel runs along. */
  portalLots: [
    { x: 82, z: -158, axis: 'z' },
    { x: 82, z: -202, axis: 'z' },
    { x: -82, z: -82, axis: 'x' },
    { x: -38, z: -82, axis: 'x' },
    { x: -158, z: 82, axis: 'z' },
    { x: 158, z: 82, axis: 'z' },
  ],
  portalLotHeightM: 55,
  portal: { widthM: 8, heightM: 5, floorM: 3 },
  /** Vehicles stop and go in blocks: each axis moves one block per green and waits through the other axis's green. */
  traffic: {
    laneOffsetM: 7,
    /** Lanes run the whole world plus a margin so vehicles wrap outside the playable area. */
    laneLengthM: 720,
    blockM: 120,
    cycleS: 40,
    greenS: 18,
    /** Rest position inside a block, measured from the intersection line: keeps stopped vehicles out of junctions. */
    restMinM: 22,
    restMaxM: 98,
    minGapM: 4,
    vehiclesPerBlockLane: [1, 2],
    types: {
      car: { lengthM: 4.4, widthM: 1.9, heightM: 1.45, weight: 0.6 },
      van: { lengthM: 5.4, widthM: 2.1, heightM: 2.2, weight: 0.25 },
      bus: { lengthM: 11, widthM: 2.6, heightM: 3.1, weight: 0.15 },
    },
    colors: [0xd23a2f, 0x2f6fd2, 0xe8e8e8, 0x1f1f22, 0xf0c230, 0x3aa870, 0xb0b4b8, 0xe07a2a, 0x7a3fb0],
  },
  /** Birds, delivery drones and pedestrians: scenery only, never solid. */
  life: {
    parkBirds: 26,
    towerBirds: 16,
    deliveryDrones: 6,
    deliveryDroneSpeedMps: [14, 22],
    deliveryDroneHeightM: [16, 28],
    pedestrians: 160,
    walkSpeedMps: 1.3,
    /** How far inside a block edge pedestrians walk. */
    sidewalkInsetM: 6,
  },
  /** Windows on towers: one window bay is this wide and one floor this tall. */
  windowBayM: 6,
  floorHeightM: 4,
  /** Tint of each building kind: [low, mid, tower] colours multiplied into the facade texture. */
  tints: [0xd8c9b0, 0xb9c2c9, 0x9fb7c8, 0xe6e2da, 0xc7b8a8, 0x8fa4b5],
} as const;

/** Harbor Run: land and water, the container yard, a cargo ship, two gantry cranes with swinging hooks, a warehouse. */
export const HARBOR = {
  seed: 31_337,
  /** Quay and pier tops are this high above the water, which is at 0. */
  quayY: 1,
  /** Land rectangles as [x0, x1, z0, z1]: the yard and quay, two piers and a small jetty by the start. Everything else is water. */
  land: [
    [-360, 360, -360, -120],
    [150, 190, -120, 120],
    [-190, -150, -120, 60],
    [-260, -210, -120, -100],
  ],
  yard: {
    pitchX: 28,
    pitchZ: 20,
    blockX: 24,
    blockZ: 15.6,
    levelM: 2.6,
    minLevels: 2,
    maxLevels: 5,
    /** Block rows (centre z): five between the quay lane and the top aisle, four beyond it. */
    rowsZ: [-150, -170, -190, -210, -230, -285, -305, -325, -345],
    firstX: -322,
    lastX: 322,
    /** Aisles kept clear: [centre x, half width]. And the east to west aisle along the top of the yard. */
    aislesX: [[-20, 8], [110, 8]],
    topAisle: { z: -262, half: 8 },
    colors: [0x8a3a2a, 0x2f5d7a, 0x3c6a3c, 0xa7752e, 0x6b6b6b, 0xb3b3a8, 0x7a2f4a],
  },
  ship: {
    x0: -70,
    x1: 70,
    z0: -114,
    z1: -90,
    hullHeightM: 9,
    cargo: { x0: -45, x1: 45, z0: -111, z1: -93, top: 24 },
    /** The tunnel through the cargo, along X: centre z, width, floor and ceiling heights. */
    tunnel: { z: -102, width: 8, y0: 11, y1: 19 },
    bridge: { x0: 50, x1: 68, z0: -111, z1: -105, top: 34 },
  },
  /** Gantry cranes on the quay, each with a trolley and hanging container sliding along z on a timer. */
  cranes: [{ x: -160, phaseS: 0 }, { x: -90, phaseS: 3.5 }],
  crane: {
    halfGapX: 13,
    legZ: [-135, -121],
    boomZ: [-157, -55],
    boomY: 37,
    legSizeM: 1.6,
    trolleyY: 34.5,
    container: { widthM: 2.6, heightM: 2.6, lengthM: 12, bottomM: 5 },
    centreZ: -128,
    amplitudeM: 22.5,
    periodS: 14,
  },
  warehouse: { x0: -185, x1: -155, z0: -60, z1: 0, heightM: 14, tunnel: { z: -30, widthM: 9, heightM: 8 } },
  lighthouse: { x: -50, z: 316, radiusM: 5, heightM: 48 },
  breakwater: [[-220, -40, 310, 322], [40, 220, 310, 322]],
} as const;

export const SCENERY = {
  pad: { behindStartM: 10, besideStartM: 14, radiusM: 1.4 },
  pineCount: 3400,
  broadleafCount: 900,
  rockCount: 500,
  grassCount: 70000,
  cloudCount: 12,
  scatterHalfSizeM: 950,
  /** Trees, rocks and grass are split into map chunks this wide so the GPU can skip the ones out of view. */
  chunkSizeM: 200,
  treeMinTrackDistanceM: 13,
  broadleafMinTrackDistanceM: 12,
  rockMinTrackDistanceM: 6,
  houseMinTrackDistanceM: 22,
  maxTreeSlope: 0.9,
  maxGrassSlope: 0.6,
  maxTreeHeightM: 165,
  treeExclusion: { bandoRadiusM: 44, padRadiusM: 22 },
  grassReachM: 34,
  grassNearPadChance: 0.06,
  /**
   * Tree collision shapes as stacked vertical cylinders: [base above the trunk's foot, height, radius] in metres at
   * scale 1. Pines follow their three cone tiers (at about 75% of the tier's base radius); broadleaf crowns are a
   * wide band plus a narrower, taller core. All are multiplied by the tree's scale.
   */
  treeColliders: {
    pine: [
      [0, 10.65, 0.5],
      [2.1, 4.6, 2.0],
      [4.85, 3.9, 1.5],
      [7.35, 3.3, 0.95],
    ],
    broadleaf: [
      [0, 4, 0.4],
      [3.2, 3.2, 2.4],
      [2.6, 4.4, 1.6],
    ],
  },
  hamlet: { x: 40, z: -30, spreadM: 38, houseCount: 8 },
} as const;

export const CAMERA = {
  chase: { distanceM: 3.6, heightM: 1.15, lookAheadM: 2, smoothingPerS: 8, minAboveGroundM: 0.5, fovDeg: 70, nearM: 0.05 },
  goggles: { upM: 0.035, forwardM: 0.07, uptiltDeg: 25, fovDeg: 86, nearM: 0.03 },
  farM: 3200,
} as const;

/** FPV lens pass (goggles only) and its distance-based video noise. */
export const LENS = {
  /**
   * Off by default: measured in M5, bloom turned a view toward the sun into a white-out (average brightness 180 vs 93)
   * and costs GPU time. The gate LEDs still read well from their emissive colour alone. High quality may turn it on later.
   */
  bloom: { isEnabled: false, strength: 0.3, radius: 0.4, threshold: 1.6 },
  goggles: { fisheye: 1, vignette: 0.85, grainAnalog: 0.05, grainClean: 0.012 },
  flat: { fisheye: 0, vignette: 0.35, grain: 0.012 },
  static: {
    /** Video static rises between these distances from the pit pad. */
    startDistanceM: 260,
    fullDistanceM: 420,
    maxFromDistance: 0.5,
    inFactory: 0.12,
    crashBase: 0.4,
    crashPerRemainingS: 0.4,
  },
} as const;

/** Thresholds shared by the HUD gauges and the 3D ground marker, so colours always match. */
export const HUD = {
  height: { lowM: 2, dangerM: 0.6, barScaleMaxM: 30 },
  battery: { greenAbove01: 0.5, yellowAbove01: 0.2 },
  /** Text in the HUD refreshes every Nth frame; moving elements every frame. */
  textEveryNFrames: 3,
  minimapEveryNFrames: 2,
  markerEdgeLimit: 0.92,
  /** Ground marker colours (3D lines cannot read CSS tokens). */
  markerColors: { ok: 0xffffff, low: 0xffc94a, danger: 0xff5a6a },
  markerDash: { dashM: 0.22, gapM: 0.16, ringInnerM: 0.26, ringOuterM: 0.34, ringLiftM: 0.04 },
} as const;

export const DRONE = {
  scale: 1.35,
  colors: { player: 0xff7a1a },
  /** Prop spin: radians per second at zero and full throttle. */
  propSpinRadps: { idle: 60, full: 420 },
} as const;

interface Atmosphere {
  /** Tuned by measurement in M5: the first values (0.74, sun 2.6, sky fill 1) over-exposed whites and made everything glow. */
  toneMappingExposure: number;
  sunIntensity: number;
  hemisphereIntensity: number;
  environmentIntensity: number;
  sky: { turbidity: number; rayleigh: number; mieCoefficient: number; mieDirectionalG: number };
  fogDensity: number;
  fogColor: number;
  /** Where the sky dome's sun is. At night it is below the horizon, so the dome goes dark. */
  sunElevationDeg: number;
  sunAzimuthDeg: number;
  /** The one shadow-casting light: the sun by day, the moon at night. */
  lightColor: number;
  lightElevationDeg: number;
  lightAzimuthDeg: number;
  hemisphereSky: number;
  hemisphereGround: number;
  shadowExtentM: number;
  hasStars: boolean;
  /** Windows, signs, street lamps and vehicle lights glow. */
  isNight: boolean;
}

const ATMOSPHERE_DAY: Atmosphere = {
  toneMappingExposure: 0.68,
  sunIntensity: 1.7,
  hemisphereIntensity: 0.4,
  environmentIntensity: 0.6,
  /** Golden-hour haze. Lower turbidity and mie keep the sky clear when you face the sun. */
  sky: { turbidity: 3.5, rayleigh: 1.4, mieCoefficient: 0.0015, mieDirectionalG: 0.85 },
  fogDensity: 0.0011,
  fogColor: 0xc8b8a4,
  sunElevationDeg: 15,
  sunAzimuthDeg: 205,
  lightColor: 0xffdcb4,
  lightElevationDeg: 15,
  lightAzimuthDeg: 205,
  hemisphereSky: 0xbcd2ff,
  hemisphereGround: 0x5a4a35,
  shadowExtentM: 90,
  hasStars: false,
  isNight: false,
};

/** After dark: a dim blue moon, a deep navy sky with stars, light fog that hides the far edge. */
const ATMOSPHERE_NIGHT: Atmosphere = {
  ...ATMOSPHERE_DAY,
  toneMappingExposure: 1.0,
  sunIntensity: 1.1,
  hemisphereIntensity: 0.6,
  environmentIntensity: 0.35,
  sky: { turbidity: 2, rayleigh: 1.1, mieCoefficient: 0.001, mieDirectionalG: 0.8 },
  fogDensity: 0.0017,
  fogColor: 0x101a38,
  sunElevationDeg: -4,
  lightColor: 0x8aa6ff,
  lightElevationDeg: 38,
  lightAzimuthDeg: 120,
  hemisphereSky: 0x34508f,
  hemisphereGround: 0x14161c,
  hasStars: true,
  isNight: true,
};

/** Golden hour on the water: a low orange sun, warm haze, long shadows. */
const ATMOSPHERE_DUSK: Atmosphere = {
  ...ATMOSPHERE_DAY,
  toneMappingExposure: 0.85,
  sunIntensity: 2.0,
  hemisphereIntensity: 0.6,
  environmentIntensity: 0.7,
  sky: { turbidity: 6, rayleigh: 2.2, mieCoefficient: 0.004, mieDirectionalG: 0.9 },
  fogDensity: 0.0014,
  fogColor: 0xe0a574,
  sunElevationDeg: 5,
  sunAzimuthDeg: 250,
  lightColor: 0xffa860,
  lightElevationDeg: 5,
  lightAzimuthDeg: 250,
  hemisphereSky: 0xffd2a0,
  hemisphereGround: 0x3a2e28,
  shadowExtentM: 130,
};

/** Bright cold alpine daylight: a high white sun, pale blue haze, light bounced up from the snow. */
const ATMOSPHERE_ALPINE: Atmosphere = {
  ...ATMOSPHERE_DAY,
  toneMappingExposure: 0.5,
  sunIntensity: 2.3,
  hemisphereIntensity: 0.5,
  environmentIntensity: 0.55,
  sky: { turbidity: 2, rayleigh: 2.4, mieCoefficient: 0.002, mieDirectionalG: 0.8 },
  fogDensity: 0.0006,
  fogColor: 0xbcd0e6,
  sunElevationDeg: 38,
  sunAzimuthDeg: 140,
  lightColor: 0xfff6e6,
  lightElevationDeg: 38,
  lightAzimuthDeg: 140,
  hemisphereSky: 0xcfe3ff,
  hemisphereGround: 0xdfe8f2,
  shadowExtentM: 140,
};

const ATMOSPHERES: Record<AtmosphereId, Atmosphere> = { day: ATMOSPHERE_DAY, night: ATMOSPHERE_NIGHT, dusk: ATMOSPHERE_DUSK, alpine: ATMOSPHERE_ALPINE };

/** The atmosphere of the active track. */
export const RENDER: Atmosphere = ATMOSPHERES[ACTIVE_TRACK_DEF.atmosphere];

export const COLLISION = {
  /** Cell size of the tree lookup grid. */
  gridCellM: 16,
  droneRadiusM: 0.18,
  restOffsetM: 0.1,
  /** Faster than this on touching the ground is a crash. */
  groundCrashSpeedMps: 8,
  /** Faster than this on touching an obstacle is a crash; slower is a bump. */
  obstacleCrashSpeedMps: 4,
  /** Fraction of horizontal speed kept per 1/60 s while sliding on the ground. */
  groundSlideKeepPer60Hz: 0.85,
  /** Touching the lake surface within this height is a crash. */
  waterContactM: 0.05,
  /** Bumped obstacles push the drone away with this much of the incoming speed. */
  bumpRestitution: 0.3,
  /** Largest distance moved between two collision checks. */
  maxStepM: 0.25,
  maxSubsteps: 8,
  crashDurationS: 1.6,
  respawnAheadOfGateM: 2,
  respawnMinAboveGroundM: 0.3,
} as const;

export const GATE = {
  widthM: 4.2,
  heightM: 3.0,
  frameThicknessM: 0.3,
  ledThicknessM: 0.05,
  legRadiusM: 0.07,
  legExtraM: 0.4,
  /** Gates floating less than this above the ground get no legs. */
  minLegLengthM: 0.2,
  bannerAboveM: 0.75,
  bannerExtraWidthM: 1.6,
} as const;

/** Best-lap ghost and time-trial rules. */
export const TRIAL = {
  countdownS: 3,
  /** How long "GO" stays on screen after the countdown. */
  goShownS: 0.9,
  /** Distance behind gate 0 where a run starts. */
  startBehindGateM: 4,
  splitShownS: 2,
  bannerShownS: 2.5,
  /** The run ends this long after the battery empties if the drone has not touched down. */
  emptyBatteryGraceS: 3,
} as const;

export const GHOST = {
  hz: 20,
  /** Positions are stored in 1 cm steps and angles in 0.01 rad steps. */
  positionStepM: 0.01,
  angleStepRad: 0.01,
  /** A lap longer than this stops recording (the lap still counts). */
  maxRecordS: 600,
  color: 0xbfe6ff,
} as const;

export const FREE_FLIGHT = {
  /** Landed on the pad: below this height, within this distance of the centre, slower than this speed. */
  swap: { maxHeightM: 0.15, maxDistanceM: 1.4, maxSpeedMps: 0.5, holdS: 2, /** Nothing to swap above this charge. */ skipAboveCharge01: 0.97 },
  emptyBatteryGraceS: 3,
} as const;

/** Synthesised motor and wind sound. Nothing is downloaded. */
export const AUDIO = {
  motorBaseHz: 120,
  motorHzPerThrottle: 360,
  /** The second oscillator sits a slightly harsh fifth above the first. */
  motorHarmonicRatio: 1.502,
  cutoffBaseHz: 700,
  cutoffHzPerThrottle: 2600,
  filterQ: 3,
  volumeBase: 0.035,
  volumePerThrottle: 0.05,
  windBandHz: 700,
  windMaxVolume: 0.12,
  windSpeedForFullMps: 30,
  windVolumeAtFull: 0.1,
  /** Parameter changes ramp over about this long, so the sound never clicks. */
  smoothingS: 0.05,
  motorsCutFadeS: 0.3,
} as const;

/** Graphics presets. Pixel ratio is capped by the device's own ratio. */
export const QUALITY = {
  low: { label: 'Low', description: 'Older laptops. No shadows or grass.', pixelRatio: 0.75, shadowMapPx: 0, hasGrass: false },
  medium: { label: 'Medium', description: 'Most laptops. Shadows and grass.', pixelRatio: 1, shadowMapPx: 1024, hasGrass: true },
  high: { label: 'High', description: 'Gaming laptops. Sharper image.', pixelRatio: 1.75, shadowMapPx: 2048, hasGrass: true },
} as const;

export const MENU = {
  /** AI drones that fly the track behind the menu. */
  racers: [
    { color: 0x3ec7ff, topSpeedMps: 25.7, lateralOffsetM: -1.0 },
    { color: 0xff4fa3, topSpeedMps: 25.0, lateralOffsetM: 1.0 },
    { color: 0xb6ff3b, topSpeedMps: 24.2, lateralOffsetM: -0.2 },
  ],
  /** AI never pulls more sideways acceleration than this; it slows for tight bends. */
  maxLateralAccelMps2: 18,
  lookAheadS: 0.6,
  speedUpPerS: 0.9,
  slowDownPerS: 2.5,
  shotLengthS: 7,
  shots: { chaseBehindM: 7, sideOutM: 13, trackside: { aheadM: 120, heightM: 3 } },
  fpsSampleS: 1,
} as const;

/** Training mode: how each lesson step is judged. */
export const TRAINING = {
  takeoffHeightM: 3,
  hoverMinHeightM: 1.5,
  hoverMaxSpeedMps: 3,
  hoverForS: 5,
  landMaxHeightM: 0.2,
  landMaxDistanceM: 1.6,
  landMaxSpeedMps: 0.5,
  farFromPadM: 40,
  /** Gates to pass in the last lesson (the start gate and the next three). */
  courseLastGate: 3,
  lessonCompleteShownS: 2.5,
  /** Pause before the next lesson starts, so the banner can be read. */
  nextLessonDelayS: 2.5,
} as const;

/** Online laps: what the server accepts. This is a sanity filter, not anti-cheat. */
export const ONLINE = {
  /** The track is about 1.1 km and top speed 28 m/s, so a lap under this is impossible. */
  minLapS: 30,
  maxLapS: 600,
  /** The recorded ghost may differ from the lap time by this fraction (sampling is 20 Hz). */
  ghostLengthTolerance: 0.05,
  /** No two ghost samples may be further apart than this speed allows (catches teleports). */
  maxGhostSpeedMps: 45,
  /** The ghost must start this close to the start gate. */
  startRadiusM: 30,
  maxBodyBytes: 40_000,
  maxGhostChars: 30_000,
  pilotIdMinLength: 8,
  pilotIdMaxLength: 64,
  /** One accepted submission per pilot per this many seconds. */
  minSecondsBetweenSubmissions: 10,
  leaderboardDefaultLimit: 20,
  leaderboardMaxLimit: 50,
  leaderboardCacheS: 30,
  ghostCacheS: 300,
  requestTimeoutMs: 6000,
} as const;

/** Live race rooms. Every limit here also protects the Cloudflare free-plan budget (see docs/features/live-race-rooms.md). */
export const ROOMS = {
  /** No 0/O or 1/I/L, so a code read aloud or typed from a screenshot is not ambiguous. */
  codeAlphabet: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  codeLength: 5,
  maxPilots: 8,
  minPilotsToStart: 2,
  defaultLaps: 3,
  minLaps: 1,
  maxLaps: 5,
  countdownMs: 3000,
  /** Pose updates during a race; also the Durable Object budget driver (incoming messages bill 20:1). */
  poseHz: 10,
  maxFrameBytes: 512,
  maxMessagesPerSecond: 20,
  /** A connection sending this many bad frames in a row is closed. */
  badFramesBeforeClose: 10,
  chatMaxChars: 120,
  chatMinGapMs: 1000,
  /** Gates are 40+ m apart at 28 m/s at most, so faster than this is a fake report. */
  minGateGapMs: 1000,
  graceAfterFirstFinishMs: 60_000,
  raceHardStopMs: 900_000,
  /** An empty or finished room is forgotten after this long. */
  roomIdleExpiryMs: 3_600_000,
  /** Remote drones are drawn this far in the past so 10 Hz updates look smooth. */
  interpolationDelayMs: 100,
  maxExtrapolationMs: 250,
  /** A remote drone with no update for this long fades out. */
  silentFadeMs: 5000,
  /** Largest believable pose values: quantised units are 1 cm and 0.01 rad. */
  poseLimitCm: 200_000,
  poseAngleLimit: 700,
  /** Grid: two columns, rows behind the start gate. Gate opening is 4.2 m wide, so columns stay inside it. */
  gridColumnOffsetM: 1.2,
  gridFirstRowBehindM: 4,
  gridRowSpacingM: 3.5,
  /** One colour per grid slot, so pilots can be told apart. */
  droneColors: [0xff7a1a, 0x2ec4ff, 0x7dff5a, 0xff4fa3, 0xffe14a, 0xb07cff, 0x4affd8, 0xff5a4a],
  /** Name tags float this far above a drone, fade between the two distances and show their distance label inside the near one. */
  tagAboveM: 0.8,
  tagNearM: 60,
  tagFarM: 400,
  tagFarOpacity: 0.4,
  pingIntervalMs: 5000,
  connectTimeoutMs: 8000,
} as const;

/**
 * Drone parts (Phase 3). Factors multiply the stock drone: 1 is unchanged. See docs/features/drone-parts-and-upgrades.md.
 * Prices are credits. Upgrade levels run 1 to 3.
 */
export const PARTS = {
  dryWeightG: 457,
  maxLevel: 3,
  propellers: {
    swift: { label: 'Swift', blades: 2, topSpeed: 1.1, grip: 0.75, lift: 0.9, drain: 0.8, wobble: 0.6, price: 300, blurb: 'Fastest and most efficient, but loose and twitchy' },
    allround: { label: 'Allround', blades: 3, topSpeed: 1, grip: 1, lift: 1, drain: 1, wobble: 0, price: 0, blurb: 'Balanced. The stock set' },
    grip: { label: 'Grip', blades: 4, topSpeed: 0.95, grip: 1.15, lift: 1.1, drain: 1.15, wobble: 0, price: 300, blurb: 'Sharper, steadier turns and stronger climbs' },
    hauler: { label: 'Hauler', blades: 5, topSpeed: 0.88, grip: 1.3, lift: 1.2, drain: 1.3, wobble: 0, price: 600, blurb: 'Smoothest and strongest, but thirsty' },
  },
  batteries: {
    light: { label: 'Light 1100', sizeM: [0.03, 0.02, 0.066], labelColor: 0x5cc8ff, cells: 4, capacityMah: 1100, weightG: 140, topSpeed: 1, lift: 1, drain: 1, price: 200, blurb: 'Lighter and quicker to accelerate, short flights' },
    standard: { label: 'Standard 1500', sizeM: [0.032, 0.026, 0.08], labelColor: 0xffc94a, cells: 4, capacityMah: 1500, weightG: 185, topSpeed: 1, lift: 1, drain: 1, price: 0, blurb: 'Balanced. The stock pack' },
    long: { label: 'Long 1800', sizeM: [0.034, 0.03, 0.094], labelColor: 0x5fe08c, cells: 4, capacityMah: 1800, weightG: 215, topSpeed: 1, lift: 1, drain: 1, price: 400, blurb: 'Heavier, long flights' },
    punch: { label: 'Punch 1300 6S', sizeM: [0.036, 0.032, 0.088], labelColor: 0xff5a6a, cells: 6, capacityMah: 1300, weightG: 220, topSpeed: 1.12, lift: 1.1, drain: 1.25, price: 900, blurb: 'More voltage: faster and punchier, hungry' },
  },
  /** Per level above 1. */
  upgrade: { propDrainCutPerLevel: 0.05, propWobbleCutPerLevel: 0.2, batteryCapacityGainPerLevel: 0.1 },
  upgradePrice: { 2: 150, 3: 400 },
  credits: { perLap: 10, personalBest: 50, perChallengeStar: 100 },
  /** Steady effort (0 to 1) used to compare flight times in the Hangar: about racing pace. */
  racingEffort01: 0.6,
  stockProp: 'allround',
  stockBattery: 'standard',
} as const;

/**
 * Battery Challenge: finish the laps before the one battery runs out. `laps: null` is Endurance (as many as you can).
 * Par times are first guesses until playtested. See docs/features/battery-challenge.md.
 */
export const CHALLENGES = {
  list: [
    { id: 'three', name: 'Three on a pack', blurb: 'Finish 3 laps before the battery dies.', laps: 3, parS: 150, requiredProp: null },
    { id: 'five', name: 'Five on a pack', blurb: 'Finish 5 laps. You will need an efficient setup.', laps: 5, parS: 250, requiredProp: null },
    { id: 'heavy', name: 'Heavy sprint', blurb: 'Finish 2 laps on Hauler 5-blade props.', laps: 2, parS: 85, requiredProp: 'hauler' },
    { id: 'endurance', name: 'Endurance', blurb: 'As many laps as one battery allows.', laps: null, parS: null, requiredProp: null },
  ],
  /** Two stars need at least this much charge left at the finish. */
  twoStarCharge01: 0.15,
  countdownS: 3,
  /** The run ends this long after the battery empties if the drone has not landed. */
  emptyBatteryGraceS: 3,
} as const;

export const STORAGE_PREFIX = 'pw.';

/** Stock-drone flight tuning. Units: metres, seconds, radians. */
export const FLIGHT = {
  gravityMps2: 9.81,
  maxTiltRad: 0.72,
  tiltResponsePerS: 6,
  /** Thrust is gravity divided by this much "up", so tilting never loses height. */
  minUpY: 0.4,
  climbRateMps: 6,
  descendRateMps: 5,
  verticalResponsePerS: 3,
  dragQuadratic: 0.007,
  dragLinear: 0.1,
  keyboardTurnRateRadps: 2.2,
  yawRateSmoothingPerS: 8,
  autoBankGain: 0.14,
  autoBankMaxRad: 0.45,
  autoBankFullEffectSpeedMps: 12,
  driftAssistPerS: 1.2,
  /** Reference top speed for the battery effort formula and throttle display. */
  topSpeedMps: 28,
  wobbleMaxRad: 0.04,
  wobbleRateHz: 9,
  throttleResponsePerS: 6,
} as const;

/** Stock 4S pack. Voltage points are per cell, charge 1 down to 0. */
export const BATTERY = {
  hoverCurrentA: 8,
  extraCurrentA: 42,
  effortExponent: 1.5,
  internalResistanceOhm4s: 0.012,
  lowChargeThreshold01: 0.2,
  lowPowerBase: 0.6,
  lowPowerSlope: 2,
  /** Time constant of the average-current estimate behind "time left". */
  averageCurrentTauS: 8,
  cellCurve: [
    [0, 3.3],
    [0.1, 3.55],
    [0.2, 3.65],
    [0.5, 3.8],
    [0.8, 3.95],
    [1, 4.2],
  ],
} as const;
