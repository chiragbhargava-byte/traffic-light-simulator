import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { VehicleModelBuilder } from '../scene/vehicleModels.js';
import { CarFollowingModel } from './carFollowing.js';

/**
 * JunctionSim - Coordinates vehicle kinematics, signal states,
 * queue calculation, and 3D mesh rendering for a single junction.
 */
export class JunctionSim {
  /**
   * @param {THREE.Scene} scene Three.js scene
   * @param {Object} center Junction world center { x, y, z }
   * @param {Object} signalMeshes { N, S, E, W }
   * @param {Object} queueBadges { N, S, E, W }
   * @param {Object} controller Signal controller instance
   * @param {string} name Junction label ('Left' | 'Right')
   */
  constructor(scene, center, signalMeshes, queueBadges, controller, name = 'Junction') {
    this.scene = scene;
    this.center = center;
    this.signalMeshes = signalMeshes;
    this.queueBadges = queueBadges;
    this.controller = controller;
    this.name = name;

    // Active vehicles categorized by arm: { N: [], S: [], E: [], W: [] }
    this.vehiclesByArm = { N: [], S: [], E: [], W: [] };
    this.allVehicles = [];

    // Obstruction vehicle (if active)
    this.obstruction = null;

    // Vision Detector Support (Simulated detector)
    this.detector = null;
    this.detectionMode = 'cameraDetector'; // 'groundTruth' | 'cameraDetector'
    this.pedestrianSim = null;

    // Simulation metrics
    this.metrics = {
      completedVehicles: 0,
      totalWaitTime: 0.0,
      totalStops: 0,
      maxQueue: 0
    };

    const { armLength, roadWidth, stopLineDistance } = CONFIG.layout;
    this.armLength = armLength;
    this.halfRoad = roadWidth / 2;
    this.stopLineDist = this.armLength - stopLineDistance; // Distance from entry to stop line
    this.exitDist = 2 * this.armLength + roadWidth; // Total travel distance
  }

  setDetector(detector) {
    this.detector = detector;
  }

  setDetectionMode(mode) {
    this.detectionMode = mode;
  }

  setPedestrianSim(pedSim) {
    this.pedestrianSim = pedSim;
  }

  /**
   * Injects a vehicle into this junction.
   */
  spawnVehicle(descriptor) {
    const { id, typeKey, arm, initialSpeed } = descriptor;
    const typeConfig = CONFIG.vehicles.types[typeKey];

    // Build procedural 3D mesh
    const model = VehicleModelBuilder.create(typeKey);
    this.scene.add(model.group);

    const vehicle = {
      id,
      typeKey,
      arm,
      typeConfig,
      speed: initialSpeed,
      dist: 0.0, // Distance along straight path from arm start (meters)
      model: model.group,
      beacon: model.beacon,
      waitTime: 0.0,
      stops: 0,
      isStopped: false,
      stoppedDuration: 0.0, // Used for obstruction detection
      completed: false
    };

    this.vehiclesByArm[arm].push(vehicle);
    this.allVehicles.push(vehicle);
  }

  /**
   * Ground truth queue count directly from micro-simulation positions.
   */
  getQueueCountGroundTruth(arm) {
    const list = this.vehiclesByArm[arm] || [];
    const queueZone = CONFIG.controllers.adaptive.queueZoneDistance; // 40m
    const waitThreshold = CONFIG.vehicles.physics.waitSpeedThreshold; // 0.5 m/s

    let count = 0;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      const distToStop = this.stopLineDist - v.dist;

      if (distToStop >= -1.0 && distToStop <= queueZone && v.speed < waitThreshold) {
        if (v.isObstruction) continue;
        count++;
      }
    }
    return count;
  }

  /**
   * Returns live queue count for a given arm:
   * - In 'cameraDetector' mode: reads from the virtual detector output (stopped vehicles in zone).
   * - In 'groundTruth' mode: reads from simulation ground truth.
   * 
   * @param {'N' | 'E' | 'S' | 'W'} arm
   * @returns {number}
   */
  getQueueCount(arm) {
    if (this.detectionMode === 'cameraDetector' && this.detector) {
      return this.detector.getDetectedQueueCount(arm);
    }
    return this.getQueueCountGroundTruth(arm);
  }

  getDetectionAccuracy(arm) {
    const groundTruth = this.getQueueCountGroundTruth(arm);
    if (this.detector) {
      return this.detector.getAccuracy(arm, groundTruth);
    }
    return { detected: groundTruth, actual: groundTruth, accuracyPct: 100.0 };
  }

  /**
   * Updates signal aspects on 3D meshes and controller logic.
   */
  updateSignals(dt) {
    const aspects = this.controller.update(dt, this);
    if (this.signalMeshes && aspects) {
      this.signalMeshes.N.setLight(aspects.N);
      this.signalMeshes.S.setLight(aspects.S);
      this.signalMeshes.E.setLight(aspects.E);
      this.signalMeshes.W.setLight(aspects.W);
    }
    return aspects;
  }

  /**
   * Steps vehicle physics, car following, stop-line compliance, and metrics.
   */
  updateVehicles(dt, simTime) {
    const halfLane = CONFIG.layout.laneWidth / 2;
    const waitSpeed = CONFIG.vehicles.physics.waitSpeedThreshold;

    ['N', 'E', 'S', 'W'].forEach(arm => {
      const armList = this.vehiclesByArm[arm];
      // Sort arm list so leader (greatest distance) is at index 0
      armList.sort((a, b) => b.dist - a.dist);

      const signalState = this.controller.aspects[arm];

      for (let i = 0; i < armList.length; i++) {
        const vehicle = armList[i];
        const leader = i > 0 ? armList[i - 1] : null;

        // If this vehicle is manually set as an obstruction (e.g. stalled), keep it stopped
        if (vehicle.isObstruction) {
          vehicle.speed = 0;
          vehicle.stoppedDuration += dt;
          if (vehicle.obstructionTimer !== undefined) {
            vehicle.obstructionTimer -= dt;
            if (vehicle.obstructionTimer <= 0) {
              vehicle.isObstruction = false;
              vehicle.stoppedDuration = 0.0;
            }
          }
          this.update3DPosition(vehicle, halfLane);
          continue;
        }

        const distToStop = this.stopLineDist - vehicle.dist;

        // Check distance to occupied zebra crossing (vehicles never enter occupied zebra)
        let distToZebra = Infinity;
        if (this.pedestrianSim) {
          const oppArm = { N: 'S', S: 'N', E: 'W', W: 'E' }[arm];
          const inboundZebraDist = this.stopLineDist + 3.0;
          const outboundZebraDist = this.exitDist - this.stopLineDist - 3.0;

          if (vehicle.dist < inboundZebraDist) {
            if (this.pedestrianSim.isZebraOccupied(arm)) {
              distToZebra = inboundZebraDist - vehicle.dist;
            }
          } else if (vehicle.dist < outboundZebraDist) {
            if (this.pedestrianSim.isZebraOccupied(oppArm)) {
              distToZebra = outboundZebraDist - vehicle.dist;
            }
          }
        }

        // Compute acceleration from IDM car following
        const accel = CarFollowingModel.computeAcceleration(vehicle, leader, signalState, distToStop, distToZebra);
        vehicle.speed = Math.max(0, vehicle.speed + accel * dt);

        // Hard boundary: vehicle must stop before entering occupied zebra
        if (distToZebra > 0 && distToZebra <= 0.8 && vehicle.speed > 0) {
          vehicle.speed = 0;
        }

        vehicle.dist += vehicle.speed * dt;

        // Wait time and stop count accumulation
        if (vehicle.speed < waitSpeed) {
          vehicle.waitTime += dt;
          vehicle.stoppedDuration += dt;
          if (!vehicle.isStopped && vehicle.speed < 0.1) {
            vehicle.isStopped = true;
            vehicle.stops += 1;
            this.metrics.totalStops += 1;
          }
        } else {
          vehicle.isStopped = false;
          vehicle.stoppedDuration = 0.0;
        }

        // Update emergency beacon if ambulance
        if (vehicle.beacon) {
          vehicle.beacon.update(simTime);
        }

        // Update 3D position
        this.update3DPosition(vehicle, halfLane);

        // Despawn vehicle once it reaches the far boundary of the outbound lane
        if (vehicle.dist >= this.exitDist) {
          vehicle.completed = true;
          this.metrics.completedVehicles += 1;
          this.metrics.totalWaitTime += vehicle.waitTime;
        }
      }

      // Filter out completed vehicles and clean up 3D meshes
      this.vehiclesByArm[arm] = armList.filter(v => {
        if (v.completed) {
          this.scene.remove(v.model);
          return false;
        }
        return true;
      });

      // Update 3D floating queue badge for this arm
      const liveQueue = this.getQueueCount(arm);
      if (this.queueBadges && this.queueBadges[arm]) {
        this.queueBadges[arm].setCount(liveQueue);
      }
      this.metrics.maxQueue = Math.max(this.metrics.maxQueue, liveQueue);
    });

    // Clean up allVehicles array
    this.allVehicles = this.allVehicles.filter(v => !v.completed);
  }

  /**
   * Maps 1D trajectory distance into 3D world space coordinates according to Indian drive-on-left standard.
   */
  update3DPosition(vehicle, halfLane) {
    const { arm, dist, model } = vehicle;
    const cx = this.center.x;
    const cz = this.center.z;
    const startOffset = this.armLength + this.halfRoad;

    switch (arm) {
      case 'N':
        // Moving along +Z (Southbound) on left lane (X = cx - halfLane)
        model.position.set(cx - halfLane, 0, cz - startOffset + dist);
        model.rotation.y = 0; // Facing +Z
        break;

      case 'S':
        // Moving along -Z (Northbound) on left lane (X = cx + halfLane)
        model.position.set(cx + halfLane, 0, cz + startOffset - dist);
        model.rotation.y = Math.PI; // Facing -Z
        break;

      case 'E':
        // Moving along -X (Westbound) on left lane (Z = cz - halfLane)
        model.position.set(cx + startOffset - dist, 0, cz - halfLane);
        model.rotation.y = -Math.PI / 2; // Facing -X
        break;

      case 'W':
        // Moving along +X (Eastbound) on left lane (Z = cz + halfLane)
        model.position.set(cx - startOffset + dist, 0, cz + halfLane);
        model.rotation.y = Math.PI / 2; // Facing +X
        break;
    }
  }

  /**
   * Resets all vehicles and metrics in this junction.
   */
  reset() {
    this.allVehicles.forEach(v => this.scene.remove(v.model));
    this.vehiclesByArm = { N: [], S: [], E: [], W: [] };
    this.allVehicles = [];
    this.obstruction = null;
    this.metrics = {
      completedVehicles: 0,
      totalWaitTime: 0.0,
      totalStops: 0,
      maxQueue: 0
    };
    if (this.controller && this.controller.reset) {
      this.controller.reset();
    }
    ['N', 'E', 'S', 'W'].forEach(arm => {
      if (this.queueBadges && this.queueBadges[arm]) {
        this.queueBadges[arm].setCount(0);
      }
    });
  }
}
