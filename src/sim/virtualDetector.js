import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * DetectorAdapter - Abstract base interface for vision-based traffic detection.
 * Designed so a real YOLOv8/ONNX model or edge RTSP stream can seamlessly plug in.
 */
export class DetectorAdapter {
  /**
   * Updates detector state on each timestep.
   * @param {number} dt Timestep delta
   * @param {number} simTime Current simulation second
   * @param {Object} junction Reference to junction simulation
   * @param {boolean} isNight Whether night scenario is active
   * @param {Object} cameras Map of THREE.PerspectiveCamera per arm
   */
  update(dt, simTime, junction, isNight = false, cameras = null) {
    throw new Error('update() must be implemented by DetectorAdapter');
  }

  /**
   * Retrieves active detections for an arm.
   * @param {'N'|'S'|'E'|'W'} arm
   * @returns {Array<Detection>}
   */
  getDetections(arm) {
    return [];
  }

  /**
   * Returns count of stopped/queued vehicles detected on this arm.
   * @param {'N'|'S'|'E'|'W'} arm
   * @returns {number}
   */
  getDetectedQueueCount(arm) {
    return 0;
  }

  /**
   * Returns accuracy metric for a given arm comparing detected vs actual.
   * @param {'N'|'S'|'E'|'W'} arm
   * @param {number} actualCount
   */
  getAccuracy(arm, actualCount) {
    return { detected: 0, actual: actualCount, accuracyPct: 100 };
  }
}

/**
 * VirtualDetector (Simulated detector)
 * Simulates an optical edge CV camera detector:
 * - Operates at configurable update rate (default 10 Hz)
 * - Detects vehicles within 60m of stop line
 * - Models camera latency (default 0.2s buffer)
 * - Models miss rate (default 5% false-negatives)
 * - Models lower detection confidence in dark night conditions
 * - Projects 3D vehicle bounds onto virtual camera screen space
 */
export class VirtualDetector extends DetectorAdapter {
  constructor(options = {}) {
    super();
    this.detectionRange = options.detectionRange ?? CONFIG.vision.detectionRange; // 60m
    this.missRate = options.missRate ?? CONFIG.vision.missRate; // 0.05
    this.falsePositiveRate = options.falsePositiveRate ?? CONFIG.vision.falsePositiveRate; // 0.0
    this.latency = options.latency ?? CONFIG.vision.latency; // 0.2s
    this.updateRate = options.updateRate ?? CONFIG.vision.updateRate; // 10 Hz
    this.updateInterval = 1.0 / this.updateRate; // 0.1s

    this.timer = 0.0;
    this.lastSimTime = 0.0;

    // Latency queue: stores { simTime, armDetections: { N: [], S: [], E: [], W: [] } }
    this.historyBuffer = [];

    // Current delayed output returned to controller
    this.currentOutput = {
      N: [],
      S: [],
      E: [],
      W: []
    };

    // Tracking stats
    this.stats = {
      totalSamples: 0,
      totalDetected: 0,
      totalActual: 0
    };

    // Projected bounding box helpers
    this._vec3 = new THREE.Vector3();
    this._box = new THREE.Box3();
  }

  /**
   * Steps the simulated detector at fixed 10 Hz rate.
   */
  update(dt, simTime, junction, isNight = false, cameras = null) {
    this.timer += dt;
    this.lastSimTime = simTime;

    if (this.timer >= this.updateInterval) {
      this.timer -= this.updateInterval;
      this.processFrame(simTime, junction, isNight, cameras);
    }

    // Retrieve delayed detection snapshot matching latency
    this.applyLatency(simTime);
  }

  /**
   * Processes a single detection frame across all 4 arms.
   */
  processFrame(simTime, junction, isNight, cameras) {
    const frameSnapshot = {
      simTime,
      armDetections: { N: [], S: [], E: [], W: [] }
    };

    const waitThreshold = CONFIG.vehicles.physics.waitSpeedThreshold; // 0.5 m/s
    const stopDist = junction.stopLineDist;

    ['N', 'S', 'E', 'W'].forEach(arm => {
      const armVehicles = junction.vehiclesByArm[arm] || [];
      const detections = [];
      const cam = cameras ? cameras[arm] : null;

      armVehicles.forEach(v => {
        const distToStop = stopDist - v.dist;

        // Detection zone: up to 60m before stop line, down to slightly past stop line
        if (distToStop >= -2.0 && distToStop <= this.detectionRange) {
          // Miss rate check (5% default false negative)
          // Use pseudo-random test
          const isMissed = Math.random() < this.missRate;
          if (isMissed) return;

          // Confidence computation
          const confRange = isNight
            ? [CONFIG.vision.nightConfidenceMin, CONFIG.vision.nightConfidenceMax]
            : [CONFIG.vision.dayConfidenceMin, CONFIG.vision.dayConfidenceMax];
          
          // Slightly higher confidence closer to camera
          const distFactor = Math.max(0, 1 - (distToStop / this.detectionRange) * 0.2);
          const baseConf = confRange[0] + Math.random() * (confRange[1] - confRange[0]);
          const confidence = Math.min(0.99, baseConf * distFactor);

          // Project bounding box if camera is available
          const bbox = this.calculateScreenBBox(v, cam);

          const isStopped = v.speed < waitThreshold;

          detections.push({
            id: v.id,
            type: v.typeKey,
            color: CONFIG.vision.colors[v.typeKey] || '#38bdf8',
            confidence: parseFloat(confidence.toFixed(2)),
            distToStop: parseFloat(distToStop.toFixed(1)),
            speed: parseFloat(v.speed.toFixed(1)),
            isStopped,
            isObstruction: !!v.isObstruction,
            bbox
          });
        }
      });

      frameSnapshot.armDetections[arm] = detections;
    });

    // Store in history buffer for latency modeling
    this.historyBuffer.push(frameSnapshot);

    // Prune history buffer older than 2.0s
    while (this.historyBuffer.length > 0 && this.historyBuffer[0].simTime < simTime - 2.0) {
      this.historyBuffer.shift();
    }
  }

  /**
   * Retrieves the detection snapshot from simTime - latency.
   */
  applyLatency(simTime) {
    const targetTime = simTime - this.latency;

    if (this.historyBuffer.length === 0) return;

    // Find snapshot closest to targetTime
    let closest = this.historyBuffer[0];
    for (let i = 1; i < this.historyBuffer.length; i++) {
      if (this.historyBuffer[i].simTime <= targetTime) {
        closest = this.historyBuffer[i];
      } else {
        break;
      }
    }

    this.currentOutput = closest.armDetections;
  }

  /**
   * Projects a 3D vehicle model into 2D feed canvas normalized/pixel coordinates.
   */
  calculateScreenBBox(vehicle, camera, screenWidth = 240, screenHeight = 160) {
    if (!camera || !vehicle.model) {
      return { x: 50, y: 50, width: 40, height: 30 };
    }

    // World position of vehicle center
    vehicle.model.getWorldPosition(this._vec3);
    this._vec3.y += 0.8; // Vertical center of vehicle body

    // Project world coordinates to Camera NDC (-1 to +1)
    const projected = this._vec3.clone().project(camera);

    // If behind camera, clip
    if (projected.z > 1.0) {
      return { x: -100, y: -100, width: 0, height: 0, visible: false };
    }

    const cx = ((projected.x + 1) / 2) * screenWidth;
    const cy = ((-projected.y + 1) / 2) * screenHeight;

    // Compute approximate perspective width & height based on distance
    const distToCam = camera.position.distanceTo(this._vec3);
    const focalScale = 220 / Math.max(4.0, distToCam);

    const typeConfig = vehicle.typeConfig || { length: 4.2, width: 1.8, height: 1.5 };
    const w = Math.max(14, typeConfig.width * focalScale);
    const h = Math.max(12, typeConfig.height * focalScale * 1.2);

    return {
      x: cx - w / 2,
      y: cy - h / 2,
      width: w,
      height: h,
      visible: cx >= -20 && cx <= screenWidth + 20 && cy >= -20 && cy <= screenHeight + 20
    };
  }

  /**
   * Retrieves active detections for arm.
   */
  getDetections(arm) {
    return this.currentOutput[arm] || [];
  }

  /**
   * Computes the detected stopped/queued vehicle count for this arm.
   * Used directly by getQueueCount(arm) in camera detector mode.
   */
  getDetectedQueueCount(arm) {
    const list = this.getDetections(arm);
    let count = 0;

    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      // Stopped vehicles within 40m of stop line
      if (d.isStopped && d.distToStop <= CONFIG.controllers.adaptive.queueZoneDistance) {
        // Exclude detected obstructions
        if (d.isObstruction) continue;
        count++;
      }
    }

    return count;
  }

  /**
   * Computes accuracy metrics comparing detected queue count against ground truth.
   */
  getAccuracy(arm, actualCount) {
    const detected = this.getDetectedQueueCount(arm);
    let accuracyPct = 100.0;

    if (actualCount === 0 && detected === 0) {
      accuracyPct = 100.0;
    } else if (actualCount === 0 && detected > 0) {
      accuracyPct = Math.max(0, 100.0 - detected * 20.0);
    } else {
      const err = Math.abs(detected - actualCount);
      accuracyPct = Math.max(0, ((actualCount - err) / actualCount) * 100.0);
    }

    return {
      detected,
      actual: actualCount,
      accuracyPct: parseFloat(accuracyPct.toFixed(1))
    };
  }

  reset() {
    this.historyBuffer = [];
    this.currentOutput = { N: [], S: [], E: [], W: [] };
    this.timer = 0.0;
  }
}
