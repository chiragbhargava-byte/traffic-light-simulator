import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * ArmLabels - Generates floating 3D street name signboards on the 4 arms (N, S, E, W)
 * populated directly from OSM road names.
 */
export class ArmLabels {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'OsmArmLabels';
    this.sprites = [];
  }

  /**
   * Updates arm labels for both junctions with the given street names.
   * @param {THREE.Scene} scene
   * @param {Object} arms { N: string, S: string, E: string, W: string }
   */
  update(scene, arms) {
    this.clear();

    const leftGroup = this.createJunctionArmLabels(arms, CONFIG.layout.junctionCenters.left);
    const rightGroup = this.createJunctionArmLabels(arms, CONFIG.layout.junctionCenters.right);

    this.group.add(leftGroup);
    this.group.add(rightGroup);

    if (!scene.getObjectByName('OsmArmLabels')) {
      scene.add(this.group);
    }
  }

  clear() {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      if (child.traverse) {
        child.traverse(obj => {
          if (obj.material) {
            if (obj.material.map) obj.material.map.dispose();
            obj.material.dispose();
          }
          if (obj.geometry) obj.geometry.dispose();
        });
      }
      this.group.remove(child);
    }
    this.sprites = [];
  }

  createJunctionArmLabels(arms, centerOffset) {
    const jGroup = new THREE.Group();
    jGroup.position.set(centerOffset.x, 0, centerOffset.z);

    const positions = [
      { dir: 'N', label: `⬆ NORTH • ${arms.N || 'North Road'}`, pos: { x: 0, y: 7.5, z: -50 } },
      { dir: 'S', label: `⬇ SOUTH • ${arms.S || 'South Road'}`, pos: { x: 0, y: 7.5, z: 50 } },
      { dir: 'E', label: `➡ EAST • ${arms.E || 'East Road'}`, pos: { x: 50, y: 7.5, z: 0 } },
      { dir: 'W', label: `⬅ WEST • ${arms.W || 'West Road'}`, pos: { x: -50, y: 7.5, z: 0 } }
    ];

    positions.forEach(item => {
      const sprite = this.createSignboardSprite(item.label);
      sprite.position.set(item.pos.x, item.pos.y, item.pos.z);
      sprite.scale.set(18, 4.5, 1);
      jGroup.add(sprite);
      this.sprites.push(sprite);

      // Support post down to ground
      const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, item.pos.y, 6);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(item.pos.x, item.pos.y / 2, item.pos.z);
      jGroup.add(pole);
    });

    return jGroup;
  }

  createSignboardSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    // Indian Highway sign aesthetic: Forest green with white and gold border
    const radius = 16;
    ctx.fillStyle = '#064e3b'; // Deep emerald green
    ctx.strokeStyle = '#34d399'; // Emerald accent border
    ctx.lineWidth = 6;

    // Rounded rectangle
    ctx.beginPath();
    ctx.roundRect(8, 8, 512 - 16, 128 - 16, radius);
    ctx.fill();
    ctx.stroke();

    // Inner gold pinstripe
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(14, 14, 512 - 28, 128 - 28, radius - 4);
    ctx.stroke();

    // Street Name Text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px "Segoe UI", Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // Trim text if too long
    let displayText = text;
    if (displayText.length > 28) {
      displayText = displayText.substring(0, 26) + '...';
    }
    ctx.fillText(displayText, 256, 54);

    // Navsari Municipal Corporation tagline
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#a7f3d0';
    ctx.font = '600 16px "Segoe UI", Inter, sans-serif';
    ctx.fillText('NAVSARI MUNICIPAL CORPORATION (NMC)', 256, 94);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true
    });

    return new THREE.Sprite(material);
  }
}
