import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { PedestrianModelBuilder } from '../scene/pedestrianModels.js';

/**
 * PedestrianSim - Manages roadside pedestrians across all 4 crosswalks (N, E, S, W).
 * 
 * PHASING SAFETY RULES:
 * - Zebra on arm X is BLOCKED while arm X or the arm opposite X is green/yellow
 *   (vehicular traffic from those arms crosses zebra X).
 * - Pedestrians cross arm X's zebra ONLY when neither arm X nor opposite X is green/yellow
 *   (i.e. cross-street green, or during ALL-RED).
 * - Exposes isZebraOccupied(arm) so vehicles never enter an occupied zebra.
 */
export class PedestrianSim {
  constructor(scene, junctionCenter, isAdaptive = false) {
    this.scene = scene;
    this.center = junctionCenter;
    this.isAdaptive = isAdaptive;
    this.pedestrians = [];
    this.group = new THREE.Group();
    this.group.name = `Pedestrians_${isAdaptive ? 'Adaptive' : 'Fixed'}`;
    this.scene.add(this.group);

    // Opposite arm mapping
    this.oppositeArm = {
      N: 'S',
      S: 'N',
      E: 'W',
      W: 'E'
    };

    this.initPedestrians();
  }

  initPedestrians() {
    // Clear existing meshes
    this.pedestrians.forEach(p => this.group.remove(p.mesh));
    this.pedestrians = [];

    const { roadWidth } = CONFIG.layout;
    const halfRoad = roadWidth / 2;
    const curbOffset = halfRoad + 1.2;
    const zebraDist = halfRoad + 1.8;

    let pIndex = 0;

    // 1. North Crosswalk (School side - dense pedestrian flow)
    const countNorth = 8;
    for (let i = 0; i < countNorth; i++) {
      const mesh = PedestrianModelBuilder.create(pIndex++);
      const startAtLeft = i % 2 === 0;
      const initialPos = startAtLeft ? -curbOffset - (i * 0.35) : curbOffset + (i * 0.35);
      mesh.position.set(this.center.x + initialPos, 0, this.center.z - zebraDist);
      this.group.add(mesh);

      this.pedestrians.push({
        mesh,
        crosswalk: 'N',
        axis: 'x',
        fixedCoord: -zebraDist,
        curbMin: -curbOffset,
        curbMax: curbOffset,
        currentPos: initialPos,
        targetPos: startAtLeft ? curbOffset : -curbOffset,
        isCrossing: false,
        speed: 1.2 + (i % 3) * 0.2
      });
    }

    // 2. South Crosswalk
    const countSouth = 4;
    for (let i = 0; i < countSouth; i++) {
      const mesh = PedestrianModelBuilder.create(pIndex++);
      const startAtLeft = i % 2 === 0;
      const initialPos = startAtLeft ? -curbOffset - (i * 0.35) : curbOffset + (i * 0.35);
      mesh.position.set(this.center.x + initialPos, 0, this.center.z + zebraDist);
      this.group.add(mesh);

      this.pedestrians.push({
        mesh,
        crosswalk: 'S',
        axis: 'x',
        fixedCoord: zebraDist,
        curbMin: -curbOffset,
        curbMax: curbOffset,
        currentPos: initialPos,
        targetPos: startAtLeft ? curbOffset : -curbOffset,
        isCrossing: false,
        speed: 1.1 + (i % 2) * 0.2
      });
    }

    // 3. East Crosswalk
    const countEast = 4;
    for (let i = 0; i < countEast; i++) {
      const mesh = PedestrianModelBuilder.create(pIndex++);
      const startAtLeft = i % 2 === 0;
      const initialPos = startAtLeft ? -curbOffset - (i * 0.35) : curbOffset + (i * 0.35);
      mesh.position.set(this.center.x + zebraDist, 0, this.center.z + initialPos);
      this.group.add(mesh);

      this.pedestrians.push({
        mesh,
        crosswalk: 'E',
        axis: 'z',
        fixedCoord: zebraDist,
        curbMin: -curbOffset,
        curbMax: curbOffset,
        currentPos: initialPos,
        targetPos: startAtLeft ? curbOffset : -curbOffset,
        isCrossing: false,
        speed: 1.1 + (i % 2) * 0.2
      });
    }

    // 4. West Crosswalk
    const countWest = 4;
    for (let i = 0; i < countWest; i++) {
      const mesh = PedestrianModelBuilder.create(pIndex++);
      const startAtLeft = i % 2 === 0;
      const initialPos = startAtLeft ? -curbOffset - (i * 0.35) : curbOffset + (i * 0.35);
      mesh.position.set(this.center.x - zebraDist, 0, this.center.z + initialPos);
      this.group.add(mesh);

      this.pedestrians.push({
        mesh,
        crosswalk: 'W',
        axis: 'z',
        fixedCoord: -zebraDist,
        curbMin: -curbOffset,
        curbMax: curbOffset,
        currentPos: initialPos,
        targetPos: startAtLeft ? curbOffset : -curbOffset,
        isCrossing: false,
        speed: 1.1 + (i % 2) * 0.2
      });
    }
  }

  /**
   * Updates pedestrian states based on signal aspects:
   * Zebra on arm X is blocked if arm X or opposite(X) is GREEN or YELLOW.
   * Pedestrians cross X only when neither is green, and during all-red.
   */
  update(dt, signalAspects) {
    if (!signalAspects) return;

    ['N', 'S', 'E', 'W'].forEach(arm => {
      const opp = this.oppositeArm[arm];

      // Blocked if arm X or opposite(X) is active (Green or Yellow)
      const isBlocked =
        signalAspects[arm] === 'GREEN' || signalAspects[arm] === 'YELLOW' ||
        signalAspects[opp] === 'GREEN' || signalAspects[opp] === 'YELLOW';

      const canCross = !isBlocked;

      // Update pedestrians on this crosswalk
      this.pedestrians
        .filter(p => p.crosswalk === arm)
        .forEach(p => {
          if (canCross) {
            p.isCrossing = true;
            const dir = p.targetPos > p.currentPos ? 1 : -1;
            p.currentPos += dir * p.speed * dt;

            // Reached curb on other side
            if ((dir > 0 && p.currentPos >= p.targetPos) || (dir < 0 && p.currentPos <= p.targetPos)) {
              p.currentPos = p.targetPos;
              p.targetPos = p.targetPos === p.curbMax ? p.curbMin : p.curbMax;
              p.isCrossing = false;
            }
          } else {
            // Vehicular traffic is active across this zebra: wait at curb
            p.isCrossing = false;
          }

          // Update 3D mesh position
          if (p.axis === 'x') {
            p.mesh.position.x = this.center.x + p.currentPos;
            p.mesh.position.z = this.center.z + p.fixedCoord;
          } else {
            p.mesh.position.x = this.center.x + p.fixedCoord;
            p.mesh.position.z = this.center.z + p.currentPos;
          }
        });
    });
  }

  /**
   * Checks if zebra crossing on arm X is occupied by active crossing pedestrians.
   * Vehicles never enter an occupied zebra.
   * @param {'N'|'S'|'E'|'W'} arm
   * @returns {boolean}
   */
  isZebraOccupied(arm) {
    const roadwayLimit = (CONFIG.layout.roadWidth / 2) + 0.2;
    return this.pedestrians.some(p => {
      return (
        p.crosswalk === arm &&
        p.isCrossing &&
        Math.abs(p.currentPos) <= roadwayLimit
      );
    });
  }

  getWaitingCountNearSchool() {
    return this.pedestrians.filter(p => p.crosswalk === 'N' && !p.isCrossing).length;
  }
}
