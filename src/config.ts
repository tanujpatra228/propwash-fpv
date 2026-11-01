/** Single source of truth for tunable values. Each later milestone adds its own section. */

export const LOOP = {
  /** Largest simulated step; protects physics after a hidden tab or a stall. */
  maxDtS: 1 / 20,
  /** Smallest step; avoids divide-by-zero when two frames share a timestamp. */
  minDtS: 0.0001,
} as const;

export const WORLD = {
  /** Bump when noise or seeds change: it invalidates saved ghosts and best laps. */
  version: 1,
  seed: 1337,
  /** The drone cannot leave this box. Centre is the origin; the floor is the terrain. */
  bounds: { halfSizeM: 900, ceilingM: 300 },
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

/** Valley layout. Changing noise, sizes or seeds changes the world: bump WORLD.version. */
export const VALLEY = {
  sizeM: 2600,
  segments: 320,
  valleyFloorRadiusM: 150,
  mountainRingRadiusM: 460,
  lake: { x: -40, z: 74, radiusM: 44, depthBelowShoreM: 2.2 },
  bando: { x: 112, z: 100, innerRadiusM: 24, outerRadiusM: 42 },
} as const;

/** Control points of "Valley Sprint": [x, z, clearance above ground in metres, or a named zone]. */
export const TRACK = {
  name: 'Valley Sprint',
  points: [
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
  samples: 4000,
  gateCount: 12,
  /** How far above the highest ground within groundScanRadiusM a normal control point sits. */
  groundScanRadiusM: 14,
  bandoClearanceM: 3.4,
  lakeClearanceM: 2.4,
  minGroundClearanceM: 1.8,
  /** Samples within this distance of the factory centre are not forced above the terrain. */
  bandoZoneRadiusM: 30,
  smoothingPasses: 4,
  smoothingHalfWindow: 6,
  curvatureHalfWindow: 6,
  curvatureSmoothPasses: 2,
  curvatureSmoothHalfWindow: 8,
  /** Highest sideways acceleration an AI drone or ghost is posed for. */
  maxLateralAccelMps2: 22,
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

export const RENDER = {
  /** Tuned by measurement in M5: the first values (0.74, sun 2.6, sky fill 1) over-exposed whites and made everything glow. */
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
  shadowExtentM: 90,
} as const;

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
