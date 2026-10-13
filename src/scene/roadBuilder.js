import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Builds procedural road network, lane dividers, stop lines, zebra crossings,
 * and school zone road markings for both junctions.
 */
export class RoadBuilder {
  constructor() {
    this.materials = this.initMaterials();
  }

  initMaterials() {
    return {
      asphalt: new THREE.MeshStandardMaterial({
        color: CONFIG.theme.day.roadColor,
        roughness: 0.85,
        metalness: 0.1
      }),
      sidewalk: new THREE.MeshStandardMaterial({
        color: CONFIG.theme.day.sidewalkColor,
        roughness: 0.9,
        metalness: 0.05
      }),
      markingWhite: new THREE.MeshBasicMaterial({
        color: CONFIG.theme.markings.dividerLine
      }),
      stopLineMat: new THREE.MeshBasicMaterial({
        color: CONFIG.theme.markings.stopLine
      }),
      schoolZonePaint: new THREE.MeshBasicMaterial({
        color: CONFIG.theme.markings.schoolPaint,
        transparent: true,
        opacity: 0.85
      })
    };
  }

  /**
   * Builds the entire road infrastructure for both junctions and mounts them to the scene.
   */
  build(scene) {
    const roadGroup = new THREE.Group();
    roadGroup.name = 'RoadNetwork';

    // Build roads for Left Junction (Fixed)
    const leftJunctionRoads = this.buildSingleJunction(CONFIG.layout.junctionCenters.left, 'Left_Fixed');
    roadGroup.add(leftJunctionRoads);

    // Build roads for Right Junction (Adaptive)
    const rightJunctionRoads = this.buildSingleJunction(CONFIG.layout.junctionCenters.right, 'Right_Adaptive');
    roadGroup.add(rightJunctionRoads);

    // Build ground terrain
    const ground = this.buildGround();
    roadGroup.add(ground);

    scene.add(roadGroup);
    return roadGroup;
  }

  buildGround() {
    const geo = new THREE.PlaneGeometry(CONFIG.layout.groundWidth, CONFIG.layout.groundDepth);
    const mat = new THREE.MeshStandardMaterial({
      color: CONFIG.theme.day.groundColor,
      roughness: 0.95,
      metalness: 0.0
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    ground.name = 'GroundPlane';
    return ground;
  }

  /**
   * Constructs a 4-way junction with all markings at a specific center offset.
   */
  buildSingleJunction(center, namePrefix) {
    const group = new THREE.Group();
    group.name = `Junction_${namePrefix}`;
    group.position.set(center.x, 0, center.z);

    const { roadWidth, armLength, stopLineDistance, zebraWidth, laneWidth } = CONFIG.layout;
    const roadElevation = 0.01;
    const markingElevation = 0.02;

    // 1. Central Intersection Square
    const centerGeo = new THREE.PlaneGeometry(roadWidth, roadWidth);
    const centerMesh = new THREE.Mesh(centerGeo, this.materials.asphalt);
    centerMesh.rotation.x = -Math.PI / 2;
    centerMesh.position.set(0, roadElevation, 0);
    centerMesh.receiveShadow = true;
    group.add(centerMesh);

    // 2. Four Road Arms (North, South, East, West)
    // North Arm (along -Z)
    const armGeoZ = new THREE.PlaneGeometry(roadWidth, armLength);
    const northArm = new THREE.Mesh(armGeoZ, this.materials.asphalt);
    northArm.rotation.x = -Math.PI / 2;
    northArm.position.set(0, roadElevation, -(armLength / 2 + roadWidth / 2));
    northArm.receiveShadow = true;
    group.add(northArm);

    // South Arm (along +Z)
    const southArm = new THREE.Mesh(armGeoZ, this.materials.asphalt);
    southArm.rotation.x = -Math.PI / 2;
    southArm.position.set(0, roadElevation, (armLength / 2 + roadWidth / 2));
    southArm.receiveShadow = true;
    group.add(southArm);

    // East Arm (along +X)
    const armGeoX = new THREE.PlaneGeometry(armLength, roadWidth);
    const eastArm = new THREE.Mesh(armGeoX, this.materials.asphalt);
    eastArm.rotation.x = -Math.PI / 2;
    eastArm.position.set(armLength / 2 + roadWidth / 2, roadElevation, 0);
    eastArm.receiveShadow = true;
    group.add(eastArm);

    // West Arm (along -X)
    const westArm = new THREE.Mesh(armGeoX, this.materials.asphalt);
    westArm.rotation.x = -Math.PI / 2;
    westArm.position.set(-(armLength / 2 + roadWidth / 2), roadElevation, 0);
    westArm.receiveShadow = true;
    group.add(westArm);

    // 3. Sidewalks & Curbs along all 4 corners
    this.addSidewalks(group, roadWidth, armLength);

    // 4. Road Markings (Lane Dividers, Stop Lines, Zebra Crossings)
    this.addMarkings(group, roadWidth, armLength, stopLineDistance, zebraWidth, laneWidth, markingElevation);

    // 5. School Zone Markings on North Arm
    this.addSchoolZoneMarkings(group, markingElevation);

    return group;
  }

  addSidewalks(group, roadWidth, armLength) {
    const curbHeight = 0.16;
    const sidewalkWidth = 4.0;
    const halfRoad = roadWidth / 2;
    const cornerSize = armLength;

    // Corner sidewalks (4 quadrants)
    const quadrants = [
      { x: halfRoad + cornerSize / 2, z: -(halfRoad + cornerSize / 2) }, // NE
      { x: halfRoad + cornerSize / 2, z: halfRoad + cornerSize / 2 },    // SE
      { x: -(halfRoad + cornerSize / 2), z: halfRoad + cornerSize / 2 },   // SW
      { x: -(halfRoad + cornerSize / 2), z: -(halfRoad + cornerSize / 2) } // NW
    ];

    quadrants.forEach(q => {
      const geo = new THREE.BoxGeometry(cornerSize, curbHeight, cornerSize);
      const mesh = new THREE.Mesh(geo, this.materials.sidewalk);
      mesh.position.set(q.x, curbHeight / 2, q.z);
      mesh.receiveShadow = true;
      group.add(mesh);
    });
  }

  addMarkings(group, roadWidth, armLength, stopLineDist, zebraWidth, laneWidth, elevation) {
    const halfRoad = roadWidth / 2;

    // Center dividers (dashed lines along each arm)
    const dashLength = 2.0;
    const dashGap = 2.0;
    const dashWidth = 0.22;
    const totalDashes = Math.floor((armLength - 10) / (dashLength + dashGap));

    // North & South center dashes
    for (let i = 0; i < totalDashes; i++) {
      const zOffset = halfRoad + 5.0 + i * (dashLength + dashGap);
      const dashGeo = new THREE.PlaneGeometry(dashWidth, dashLength);

      // North
      const dashN = new THREE.Mesh(dashGeo, this.materials.markingWhite);
      dashN.rotation.x = -Math.PI / 2;
      dashN.position.set(0, elevation, -zOffset);
      group.add(dashN);

      // South
      const dashS = new THREE.Mesh(dashGeo, this.materials.markingWhite);
      dashS.rotation.x = -Math.PI / 2;
      dashS.position.set(0, elevation, zOffset);
      group.add(dashS);
    }

    // East & West center dashes
    for (let i = 0; i < totalDashes; i++) {
      const xOffset = halfRoad + 5.0 + i * (dashLength + dashGap);
      const dashGeo = new THREE.PlaneGeometry(dashLength, dashWidth);

      // East
      const dashE = new THREE.Mesh(dashGeo, this.materials.markingWhite);
      dashE.rotation.x = -Math.PI / 2;
      dashE.position.set(xOffset, elevation, 0);
      group.add(dashE);

      // West
      const dashW = new THREE.Mesh(dashGeo, this.materials.markingWhite);
      dashW.rotation.x = -Math.PI / 2;
      dashW.position.set(-xOffset, elevation, 0);
      group.add(dashW);
    }

    // Stop Lines (on inbound lanes, drive-on-left standard)
    // Inbound lane width = 3.6m. Stop line depth = 0.55m
    const stopLineThick = 0.55;
    const halfLane = laneWidth / 2;

    // North inbound: heading South (+Z), left side is X < 0 (-halfLane)
    const stopGeoNS = new THREE.PlaneGeometry(laneWidth, stopLineThick);
    const stopNorth = new THREE.Mesh(stopGeoNS, this.materials.stopLineMat);
    stopNorth.rotation.x = -Math.PI / 2;
    stopNorth.position.set(-halfLane, elevation, -(halfRoad + stopLineDist));
    group.add(stopNorth);

    // South inbound: heading North (-Z), left side is X > 0 (+halfLane)
    const stopSouth = new THREE.Mesh(stopGeoNS, this.materials.stopLineMat);
    stopSouth.rotation.x = -Math.PI / 2;
    stopSouth.position.set(halfLane, elevation, halfRoad + stopLineDist);
    group.add(stopSouth);

    // East inbound: heading West (-X), left side is Z < 0 (-halfLane)
    const stopGeoEW = new THREE.PlaneGeometry(stopLineThick, laneWidth);
    const stopEast = new THREE.Mesh(stopGeoEW, this.materials.stopLineMat);
    stopEast.rotation.x = -Math.PI / 2;
    stopEast.position.set(halfRoad + stopLineDist, elevation, -halfLane);
    group.add(stopEast);

    // West inbound: heading East (+X), left side is Z > 0 (+halfLane)
    const stopWest = new THREE.Mesh(stopGeoEW, this.materials.stopLineMat);
    stopWest.rotation.x = -Math.PI / 2;
    stopWest.position.set(-(halfRoad + stopLineDist), elevation, halfLane);
    group.add(stopWest);

    // Zebra Crossings (placed between intersection edge and stop lines across full road)
    this.addZebraCrossings(group, roadWidth, halfRoad, zebraWidth, elevation);
  }

  addZebraCrossings(group, roadWidth, halfRoad, zebraWidth, elevation) {
    const stripeCount = 10;
    const stripeWidth = 0.45;
    const stripeLen = zebraWidth;
    const zOffset = halfRoad + 1.8;

    // North & South zebra crossings
    for (let i = 0; i < stripeCount; i++) {
      const x = -roadWidth / 2 + (i + 0.5) * (roadWidth / stripeCount);
      const stripeGeo = new THREE.PlaneGeometry(stripeWidth, stripeLen);

      // North zebra
      const stripeN = new THREE.Mesh(stripeGeo, this.materials.markingWhite);
      stripeN.rotation.x = -Math.PI / 2;
      stripeN.position.set(x, elevation, -zOffset);
      group.add(stripeN);

      // South zebra
      const stripeS = new THREE.Mesh(stripeGeo, this.materials.markingWhite);
      stripeS.rotation.x = -Math.PI / 2;
      stripeS.position.set(x, elevation, zOffset);
      group.add(stripeS);
    }

    // East & West zebra crossings
    const xOffset = halfRoad + 1.8;
    for (let i = 0; i < stripeCount; i++) {
      const z = -roadWidth / 2 + (i + 0.5) * (roadWidth / stripeCount);
      const stripeGeo = new THREE.PlaneGeometry(stripeLen, stripeWidth);

      // East zebra
      const stripeE = new THREE.Mesh(stripeGeo, this.materials.markingWhite);
      stripeE.rotation.x = -Math.PI / 2;
      stripeE.position.set(xOffset, elevation, z);
      group.add(stripeE);

      // West zebra
      const stripeW = new THREE.Mesh(stripeGeo, this.materials.markingWhite);
      stripeW.rotation.x = -Math.PI / 2;
      stripeW.position.set(-xOffset, elevation, z);
      group.add(stripeW);
    }
  }

  addSchoolZoneMarkings(group, elevation) {
    const { roadWidth, schoolZonePositionZ, schoolZoneLength } = CONFIG.layout;

    // Amber painted zone on the North arm road surface
    const zoneGeo = new THREE.PlaneGeometry(roadWidth - 0.4, schoolZoneLength);
    const zoneMesh = new THREE.Mesh(zoneGeo, this.materials.schoolZonePaint);
    zoneMesh.rotation.x = -Math.PI / 2;
    zoneMesh.position.set(0, elevation + 0.005, schoolZonePositionZ);
    group.add(zoneMesh);

    // Transverse warning bars
    const barCount = 4;
    for (let i = 0; i < barCount; i++) {
      const z = schoolZonePositionZ - schoolZoneLength / 2 + (i + 0.5) * (schoolZoneLength / barCount);
      const barGeo = new THREE.PlaneGeometry(roadWidth - 0.8, 0.4);
      const barMesh = new THREE.Mesh(barGeo, this.materials.markingWhite);
      barMesh.rotation.x = -Math.PI / 2;
      barMesh.position.set(0, elevation + 0.008, z);
      group.add(barMesh);
    }
  }
}
