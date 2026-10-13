import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * TrafficSignalMesh - 3-aspect procedural traffic signal pole (Red, Yellow, Green)
 * Emissive lighting is dynamically toggled: only the active light glows.
 */
export class TrafficSignalMesh {
  constructor(arm, position, facingRotationY) {
    this.arm = arm; // 'N', 'E', 'S', or 'W'
    this.state = 'RED'; // Current state: 'RED' | 'YELLOW' | 'GREEN'

    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.rotation.y = facingRotationY;

    this.lights = {};
    this.buildMesh();
    this.setLight('RED'); // Default initial state
  }

  buildMesh() {
    const { colors, poleColor, housingColor, emissiveIntensityActive, emissiveIntensityInactive } = CONFIG.theme.signals;

    // 1. Vertical Pole (Height ~5.2m)
    const poleMat = new THREE.MeshStandardMaterial({
      color: poleColor,
      roughness: 0.5,
      metalness: 0.8
    });
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.15, 5.2, 12);
    const poleMesh = new THREE.Mesh(poleGeo, poleMat);
    poleMesh.position.y = 2.6;
    poleMesh.castShadow = true;
    this.group.add(poleMesh);

    // 2. Horizontal Mast Arm extending slightly towards the roadway
    const mastGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.8, 12);
    const mastMesh = new THREE.Mesh(mastGeo, poleMat);
    mastMesh.rotation.z = Math.PI / 2;
    mastMesh.position.set(0.9, 4.8, 0);
    this.group.add(mastMesh);

    // 3. Signal Head Housing (Black backplate + box)
    const housingMat = new THREE.MeshStandardMaterial({
      color: housingColor,
      roughness: 0.7,
      metalness: 0.3
    });
    const housingGeo = new THREE.BoxGeometry(0.7, 1.8, 0.45);
    const housingMesh = new THREE.Mesh(housingGeo, housingMat);
    housingMesh.position.set(1.5, 4.5, 0);
    housingMesh.castShadow = true;
    this.group.add(housingMesh);

    // Backplate border (yellow/black safety backing)
    const backplateGeo = new THREE.BoxGeometry(0.85, 2.0, 0.05);
    const backplateMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.8
    });
    const backplate = new THREE.Mesh(backplateGeo, backplateMat);
    backplate.position.set(1.5, 4.5, -0.22);
    this.group.add(backplate);

    // 4. Lenses: Red (Top), Yellow (Middle), Green (Bottom)
    const lensRadius = 0.22;
    const lensGeo = new THREE.CylinderGeometry(lensRadius, lensRadius, 0.12, 16);
    lensGeo.rotateX(Math.PI / 2);

    const configs = [
      { key: 'RED', color: colors.red, y: 5.05 },
      { key: 'YELLOW', color: colors.yellow, y: 4.5 },
      { key: 'GREEN', color: colors.green, y: 3.95 }
    ];

    configs.forEach(c => {
      const mat = new THREE.MeshStandardMaterial({
        color: c.color,
        emissive: c.color,
        emissiveIntensity: emissiveIntensityInactive,
        roughness: 0.2,
        metalness: 0.1
      });

      const lensMesh = new THREE.Mesh(lensGeo, mat);
      lensMesh.position.set(1.5, c.y, 0.22);
      this.group.add(lensMesh);

      // Sun Visor / Hood over each lens
      const visorGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.2, 16, 1, true, 0, Math.PI);
      visorGeo.rotateZ(Math.PI / 2);
      const visorMesh = new THREE.Mesh(visorGeo, housingMat);
      visorMesh.position.set(1.5, c.y + 0.12, 0.22);
      this.group.add(visorMesh);

      this.lights[c.key] = {
        mesh: lensMesh,
        material: mat,
        color: c.color
      };
    });
  }

  /**
   * Updates signal light display.
   * @param {'RED' | 'YELLOW' | 'GREEN'} activeColor
   */
  setLight(activeColor) {
    this.state = activeColor;
    const { emissiveIntensityActive, emissiveIntensityInactive } = CONFIG.theme.signals;

    Object.keys(this.lights).forEach(key => {
      const item = this.lights[key];
      if (key === activeColor) {
        item.material.emissiveIntensity = emissiveIntensityActive;
      } else {
        item.material.emissiveIntensity = emissiveIntensityInactive;
      }
    });
  }
}

/**
 * Builds the set of 4 signal poles for a given junction.
 */
export function buildJunctionSignals(junctionCenter) {
  const { roadWidth, stopLineDistance } = CONFIG.layout;
  const halfRoad = roadWidth / 2;
  const stopDist = halfRoad + stopLineDistance;
  const curbOffset = halfRoad + 0.9;

  const signals = {};

  // In India (drive on left):
  // North arm: inbound vehicle comes from -Z towards 0, curb is at -X
  signals.N = new TrafficSignalMesh(
    'N',
    new THREE.Vector3(junctionCenter.x - curbOffset, 0, junctionCenter.z - stopDist),
    0 // Facing +Z (down toward oncoming traffic)
  );

  // South arm: inbound vehicle comes from +Z towards 0, curb is at +X
  signals.S = new TrafficSignalMesh(
    'S',
    new THREE.Vector3(junctionCenter.x + curbOffset, 0, junctionCenter.z + stopDist),
    Math.PI // Facing -Z
  );

  // East arm: inbound vehicle comes from +X towards 0, curb is at -Z
  signals.E = new TrafficSignalMesh(
    'E',
    new THREE.Vector3(junctionCenter.x + stopDist, 0, junctionCenter.z - curbOffset),
    -Math.PI / 2 // Facing -X
  );

  // West arm: inbound vehicle comes from -X towards 0, curb is at +Z
  signals.W = new TrafficSignalMesh(
    'W',
    new THREE.Vector3(junctionCenter.x - stopDist, 0, junctionCenter.z + curbOffset),
    Math.PI / 2 // Facing +X
  );

  const group = new THREE.Group();
  group.name = `Signals_${junctionCenter.x > 0 ? 'Adaptive' : 'Fixed'}`;
  group.add(signals.N.group);
  group.add(signals.S.group);
  group.add(signals.E.group);
  group.add(signals.W.group);

  return { signals, group };
}
