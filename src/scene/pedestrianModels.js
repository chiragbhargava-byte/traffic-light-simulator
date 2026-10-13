import * as THREE from 'three';
import { CONFIG } from '../config.js';

const shirtColors = [0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0xec4899];
const pantsColor = 0x1e293b;
const skinColor = 0xf5d0b5;

/**
 * Procedural low-poly capsule pedestrian model.
 */
export class PedestrianModelBuilder {
  static create(colorIndex = 0) {
    const root = new THREE.Group();

    const shirtMat = new THREE.MeshStandardMaterial({
      color: shirtColors[colorIndex % shirtColors.length],
      roughness: 0.7
    });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.8 });
    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.6 });

    // Torso (capsule / cylinder)
    const torsoGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.7, 8);
    const torso = new THREE.Mesh(torsoGeo, shirtMat);
    torso.position.y = 0.95;
    torso.castShadow = true;
    root.add(torso);

    // Head (sphere)
    const headGeo = new THREE.SphereGeometry(0.16, 8, 8);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.45;
    head.castShadow = true;
    root.add(head);

    // Legs (two cylinders)
    const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.6, 6);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.set(-0.1, 0.3, 0);
    leftLeg.castShadow = true;
    root.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.set(0.1, 0.3, 0);
    rightLeg.castShadow = true;
    root.add(rightLeg);

    return root;
  }
}
