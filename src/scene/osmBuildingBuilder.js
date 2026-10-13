import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * OsmBuildingBuilder
 * Takes parsed OSM building footprints within 150m of a Navsari junction
 * and extrudes them into 3D meshes using local meters projection.
 *
 * NOTE: The controlled junction remains an idealized 4-way with straight-through traffic;
 * real geometry provides contextual urban backdrop.
 */
export class OsmBuildingBuilder {
  constructor() {
    this.buildingGroup = new THREE.Group();
    this.buildingGroup.name = 'OsmContextBuildings';

    // Materials palette for realistic Indian urban facade variations
    this.materials = [
      new THREE.MeshStandardMaterial({ color: 0xd6d3d1, roughness: 0.85, metalness: 0.05 }), // Warm stone / plaster
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8, metalness: 0.08 }),  // Modern civic off-white
      new THREE.MeshStandardMaterial({ color: 0xfed7aa, roughness: 0.85, metalness: 0.05 }), // Soft peach / terracotta wash
      new THREE.MeshStandardMaterial({ color: 0xbae6fd, roughness: 0.5, metalness: 0.2 }),  // Commercial glass/blue accent
      new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.85, metalness: 0.05 }), // Institutional cream/yellow
      new THREE.MeshStandardMaterial({ color: 0xc4b5fd, roughness: 0.8, metalness: 0.05 }),  // Mauve civic block
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.9, metalness: 0.1 })   // Slate concrete
    ];

    this.roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.9
    });

    this.windowMaterial = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.3,
      metalness: 0.7
    });

    this.rooftopPropMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.7
    });
  }

  /**
   * Clears existing extruded buildings and generates new meshes for both junction twins.
   * @param {THREE.Scene} scene
   * @param {Array} buildings Array of building objects from OsmNavsariData
   */
  rebuild(scene, buildings) {
    // Remove previous buildings
    this.clear();

    if (!buildings || buildings.length === 0) return;

    // Build for Left Junction (Fixed)
    const leftMeshes = this.createBuildingsForJunction(buildings, CONFIG.layout.junctionCenters.left);
    this.buildingGroup.add(leftMeshes);

    // Build for Right Junction (Adaptive)
    const rightMeshes = this.createBuildingsForJunction(buildings, CONFIG.layout.junctionCenters.right);
    this.buildingGroup.add(rightMeshes);

    if (!scene.getObjectByName('OsmContextBuildings')) {
      scene.add(this.buildingGroup);
    }
  }

  clear() {
    while (this.buildingGroup.children.length > 0) {
      const child = this.buildingGroup.children[0];
      this.disposeObject(child);
      this.buildingGroup.remove(child);
    }
  }

  disposeObject(obj) {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.children) {
      obj.children.forEach(c => this.disposeObject(c));
    }
  }

  /**
   * Creates extruded meshes for a single junction center offset.
   */
  createBuildingsForJunction(buildings, centerOffset) {
    const group = new THREE.Group();
    group.position.set(centerOffset.x, 0, centerOffset.z);

    // Road buffer zone: road width is 7.2m (±3.6m) + sidewalk (1.8m) = ±5.4m
    const ROAD_BUFFER = 5.8;

    buildings.forEach((b, idx) => {
      // 1. Ensure building does not collide directly with idealized 4-way crossroad
      const inCrossroad =
        (Math.abs(b.centroid.x) < ROAD_BUFFER && Math.abs(b.centroid.z) < 70) ||
        (Math.abs(b.centroid.z) < ROAD_BUFFER && Math.abs(b.centroid.x) < 70);

      // If too close to road corridor, nudge away along dominant axis
      let offsetX = 0;
      let offsetZ = 0;
      if (inCrossroad) {
        if (Math.abs(b.centroid.x) < Math.abs(b.centroid.z)) {
          offsetX = (b.centroid.x >= 0 ? 1 : -1) * (ROAD_BUFFER + 6.0);
        } else {
          offsetZ = (b.centroid.z >= 0 ? 1 : -1) * (ROAD_BUFFER + 6.0);
        }
      }

      // 2. Build 2D polygon shape in local (x, -z) coordinates
      const shape = new THREE.Shape();
      const poly = b.polygon;

      if (poly.length < 3) return;

      shape.moveTo(poly[0].x + offsetX, poly[0].z + offsetZ);
      for (let i = 1; i < poly.length; i++) {
        shape.lineTo(poly[i].x + offsetX, poly[i].z + offsetZ);
      }
      shape.closePath();

      // 3. Extrude geometry
      const extrudeSettings = {
        depth: Math.max(5.0, b.height),
        bevelEnabled: true,
        bevelThickness: 0.25,
        bevelSize: 0.2,
        bevelSegments: 1
      };

      const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      // In Three.js ExtrudeGeometry extrudes along +Z; we rotate to extrude vertically (+Y)
      geo.rotateX(Math.PI / 2);

      const mat = this.materials[idx % this.materials.length];
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = {
        id: b.id,
        name: b.name,
        type: b.type,
        levels: b.levels,
        height: b.height
      };

      group.add(mesh);

      // 4. Rooftop AC units / water tanks for authentic Indian urban skyline
      if (b.levels >= 2) {
        const roofY = b.height + 0.1;
        const tankGeo = new THREE.CylinderGeometry(1.2, 1.2, 1.6, 8);
        const tank = new THREE.Mesh(tankGeo, this.rooftopPropMat);
        tank.position.set(b.centroid.x + offsetX, roofY + 0.8, b.centroid.z + offsetZ);
        group.add(tank);

        // Small parapet accent
        const parapetGeo = new THREE.BoxGeometry(2.5, 0.8, 2.0);
        const parapet = new THREE.Mesh(parapetGeo, this.roofMaterial);
        parapet.position.set(b.centroid.x + offsetX + 3, roofY + 0.4, b.centroid.z + offsetZ + 2);
        group.add(parapet);
      }
    });

    return group;
  }
}
