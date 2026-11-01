# Feature: Drone Model

Status: Planned
Phase: 1
Branch: `feat/drone-model`
Last updated: 2026-11-01

## Summary

The 3D model of the 5-inch racing drone, used for the player (chase camera), AI drones in the menu, and the best-lap ghost.

## Player experience

A recognizable FPV racing quad: carbon X-frame, colored canopy, front camera tilted up, battery strapped on top, antenna, four motors with spinning three-blade props and a soft prop-blur disc, and a glowing LED strip underneath.

## Behavior and rules

- Real proportions of a 5-inch quad (about 0.3 m motor-to-motor), drawn at 1.35× scale for visibility.
- Props spin in alternating directions; spin speed rises with throttle.
- Paint: one accent color drives the canopy, props, battery strap and LED.
- **Ghost variant:** the same model, translucent white-blue, no shadows, no depth writes.
- Built from simple procedural shapes in Phase 1; replaced by a Blender model in Phase 2 without changing the interface.

## Technical design

- `src/drone/drone-model.ts`:
  - `createDroneModel(options: { color: number; ghost?: boolean; propBlades?: 2 | 3 | 4 | 5 }): DroneModel` (Phase 1 always uses 3 blades; the option exists so Phase 3 parts need no rewrite)
  - `DroneModel`: `group: Group`, `setColor(color)`, `spinProps(throttle01, dt)`, `dispose()`.
- Prop blade, motor and frame geometries are created once at module level and shared by every drone.
- Colors and scale come from `config.ts` (`DRONE.scale`, `DRONE.colors`).

## Edge cases

- Several drones on screen: shared geometries keep memory flat.
- Ghost behind terrain: depth test on, depth write off, so it doesn't punch holes in other transparent objects.

## Acceptance criteria

- [ ] Drone reads clearly as an FPV quad at 3–5 m (chase camera distance).
- [ ] Props visibly spin faster at higher throttle.
- [ ] `setColor` changes canopy, props and LED together.
- [ ] Ghost is clearly translucent and casts no shadow.

## Test cases

| # | Steps | Expected result | Type |
|---|---|---|---|
| 1 | Chase camera, hover, then climb | Props speed up while climbing | Manual |
| 2 | Create 5 drones, check `renderer.info.memory.geometries` | Grows by 0 shared geometries after the first | Manual |
| 3 | Time trial with a saved best lap | Ghost is translucent, no shadow on the ground | Manual |

## Out of scope

Hangar and 2–5 blade prop meshes (drone-parts-and-upgrades, Phase 3). Multiple drone types and paint shop (Phase 6). Blender model (Phase 2).

## Changelog

- 2026-11-01: Created.
