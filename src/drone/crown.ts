import { ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';

const SPIKES = 5;

/** A small gold crown that sits above a drone: a band with five spikes. Sized for the drone model's own units. */
export function createCrown(): Group {
  const gold = new MeshStandardMaterial({ color: 0xffc83a, emissive: 0xffa800, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.8 });
  const crown = new Group();
  const band = new Mesh(new CylinderGeometry(0.052, 0.046, 0.026, 16, 1, true), gold);
  gold.side = 2; // draw the inside of the open band too
  crown.add(band);
  for (let i = 0; i < SPIKES; i++) {
    const angle = (i / SPIKES) * Math.PI * 2;
    const spike = new Mesh(new ConeGeometry(0.014, 0.05, 6), gold);
    spike.position.set(Math.cos(angle) * 0.049, 0.036, Math.sin(angle) * 0.049);
    crown.add(spike);
  }
  crown.position.set(0, 0.13, 0);
  crown.visible = false;
  return crown;
}
