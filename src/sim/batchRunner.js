import { CONFIG } from '../config.js';
import { PRNG } from '../utils/prng.js';
import { CarFollowingModel } from './carFollowing.js';
import { FixedController } from '../controllers/fixedController.js';
import { AdaptiveController } from '../controllers/adaptiveController.js';
import { VirtualDetector } from './virtualDetector.js';

/**
 * Headless Simulation Runner for Monte Carlo Batch Evaluation
 * Runs without Three.js WebGL rendering for ultra-fast calculation.
 * 
 * Evaluates 10 seeds per scenario across:
 * 1. Baseline 1: Fixed 30/30 Plan
 * 2. Baseline 2: Time-of-Day (TOD) Plan
 * 3. Proposed: AI-Based Adaptive (Ground Truth)
 * 4. Proposed: AI-Based Adaptive (Simulated Camera Detector - 5% miss, 0.2s latency)
 */

class HeadlessJunction {
  constructor(controller, detector = null) {
    this.controller = controller;
    this.detector = detector;
    this.vehiclesByArm = { N: [], S: [], E: [], W: [] };
    this.allVehicles = [];
    this.completedCount = 0;
    this.totalWaitTime = 0.0;
    this.totalStops = 0;
    this.maxQueue = 0;

    const { armLength, roadWidth, stopLineDistance } = CONFIG.layout;
    this.armLength = armLength;
    this.stopLineDist = armLength - stopLineDistance;
    this.exitDist = 2 * armLength + roadWidth;
  }

  spawnVehicle(descriptor) {
    const { id, typeKey, arm, initialSpeed } = descriptor;
    const typeConfig = CONFIG.vehicles.types[typeKey];

    const vehicle = {
      id,
      typeKey,
      arm,
      typeConfig,
      speed: initialSpeed,
      dist: 0.0,
      waitTime: 0.0,
      stops: 0,
      isStopped: false,
      stoppedDuration: 0.0,
      completed: false
    };

    this.vehiclesByArm[arm].push(vehicle);
    this.allVehicles.push(vehicle);
  }

  getQueueCount(arm) {
    if (this.detector) {
      return this.detector.getDetectedQueueCount(arm);
    }
    const list = this.vehiclesByArm[arm] || [];
    const queueZone = CONFIG.controllers.adaptive.queueZoneDistance;
    const waitThreshold = CONFIG.vehicles.physics.waitSpeedThreshold;

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

  update(dt, simTime, isNight = false) {
    // 0. Update virtual detector if attached
    if (this.detector) {
      this.detector.update(dt, simTime, this, isNight);
    }

    // 1. Controller step
    this.controller.update(dt, this);

    // 2. Kinematics & Car following
    const waitSpeed = CONFIG.vehicles.physics.waitSpeedThreshold;

    ['N', 'E', 'S', 'W'].forEach(arm => {
      const armList = this.vehiclesByArm[arm];
      armList.sort((a, b) => b.dist - a.dist);
      const signalState = this.controller.aspects[arm];

      for (let i = 0; i < armList.length; i++) {
        const v = armList[i];
        const leader = i > 0 ? armList[i - 1] : null;

        if (v.isObstruction) {
          v.speed = 0;
          v.stoppedDuration += dt;
          continue;
        }

        const distToStop = this.stopLineDist - v.dist;
        const accel = CarFollowingModel.computeAcceleration(v, leader, signalState, distToStop);
        v.speed = Math.max(0, v.speed + accel * dt);
        v.dist += v.speed * dt;

        if (v.speed < waitSpeed) {
          v.waitTime += dt;
          v.stoppedDuration += dt;
          if (!v.isStopped && v.speed < 0.1) {
            v.isStopped = true;
            v.stops += 1;
            this.totalStops += 1;
          }
        } else {
          v.isStopped = false;
          v.stoppedDuration = 0.0;
        }

        if (v.dist >= this.exitDist) {
          v.completed = true;
          this.completedCount += 1;
          this.totalWaitTime += v.waitTime;
        }
      }

      this.vehiclesByArm[arm] = armList.filter(v => !v.completed);
      const q = this.getQueueCount(arm);
      this.maxQueue = Math.max(this.maxQueue, q);
    });

    this.allVehicles = this.allVehicles.filter(v => !v.completed);
  }

  getMetrics() {
    const avgWait = this.completedCount > 0 ? this.totalWaitTime / this.completedCount : 0.0;
    const stopsPerVeh = this.completedCount > 0 ? this.totalStops / this.completedCount : 0.0;
    return {
      completedCount: this.completedCount,
      totalWaitTime: this.totalWaitTime,
      avgWait: avgWait,
      stopsPerVeh: stopsPerVeh,
      maxQueue: this.maxQueue
    };
  }
}

export class BatchRunner {
  /**
   * Executes full Monte Carlo batch evaluation across 5 scenarios x 10 seeds x 3 controllers.
   * 
   * @param {Function} onProgress Callback (percent, statusText)
   * @returns {Promise<Object>} Aggregated results with mean and spread
   */
  static async runAll(onProgress = () => {}) {
    const scenarioKeys = ['normalDay', 'schoolMorning', 'marketPeak', 'night', 'ambulanceEvent'];
    const seedList = [42, 101, 203, 305, 407, 509, 611, 713, 815, 917]; // 10 deterministic seeds
    const simDuration = 300.0; // 5 simulated minutes (seconds)
    const dt = 0.05; // 20 Hz fixed timestep
    const totalSteps = Math.round(simDuration / dt);

    const totalRuns = scenarioKeys.length * seedList.length;
    let completedRuns = 0;

    const detailedRows = []; // Every individual seed run for CSV export
    const summaryByScenario = {}; // Aggregated stats per scenario

    for (const scId of scenarioKeys) {
      const scenarioConfig = CONFIG.scenarios[scId];
      summaryByScenario[scId] = {
        id: scId,
        name: scenarioConfig.name,
        fixed30: { waitTimes: [], throughputs: [], stops: [], maxQueues: [] },
        timeOfDay: { waitTimes: [], throughputs: [], stops: [], maxQueues: [] },
        adaptive: { waitTimes: [], throughputs: [], stops: [], maxQueues: [] },
        adaptiveVision: { waitTimes: [], throughputs: [], stops: [], maxQueues: [] }
      };

      for (const seed of seedList) {
        // Yield to browser UI thread periodically so progress bar updates smoothly
        await new Promise(resolve => setTimeout(resolve, 0));

        const result = this.simulateSingleRun(scId, seed, simDuration, dt, totalSteps);

        // Store in summary
        summaryByScenario[scId].fixed30.waitTimes.push(result.fixed30.avgWait);
        summaryByScenario[scId].fixed30.throughputs.push(result.fixed30.completedCount);
        summaryByScenario[scId].fixed30.stops.push(result.fixed30.stopsPerVeh);
        summaryByScenario[scId].fixed30.maxQueues.push(result.fixed30.maxQueue);

        summaryByScenario[scId].timeOfDay.waitTimes.push(result.timeOfDay.avgWait);
        summaryByScenario[scId].timeOfDay.throughputs.push(result.timeOfDay.completedCount);
        summaryByScenario[scId].timeOfDay.stops.push(result.timeOfDay.stopsPerVeh);
        summaryByScenario[scId].timeOfDay.maxQueues.push(result.timeOfDay.maxQueue);

        summaryByScenario[scId].adaptive.waitTimes.push(result.adaptive.avgWait);
        summaryByScenario[scId].adaptive.throughputs.push(result.adaptive.completedCount);
        summaryByScenario[scId].adaptive.stops.push(result.adaptive.stopsPerVeh);
        summaryByScenario[scId].adaptive.maxQueues.push(result.adaptive.maxQueue);

        summaryByScenario[scId].adaptiveVision.waitTimes.push(result.adaptiveVision.avgWait);
        summaryByScenario[scId].adaptiveVision.throughputs.push(result.adaptiveVision.completedCount);
        summaryByScenario[scId].adaptiveVision.stops.push(result.adaptiveVision.stopsPerVeh);
        summaryByScenario[scId].adaptiveVision.maxQueues.push(result.adaptiveVision.maxQueue);

        // Detailed row for CSV export
        const waitRedVsFixed = result.fixed30.avgWait > 0
          ? ((result.fixed30.avgWait - result.adaptive.avgWait) / result.fixed30.avgWait) * 100.0
          : 0.0;
        const waitRedVsTOD = result.timeOfDay.avgWait > 0
          ? ((result.timeOfDay.avgWait - result.adaptive.avgWait) / result.timeOfDay.avgWait) * 100.0
          : 0.0;
        const waitRedVisionVsFixed = result.fixed30.avgWait > 0
          ? ((result.fixed30.avgWait - result.adaptiveVision.avgWait) / result.fixed30.avgWait) * 100.0
          : 0.0;

        detailedRows.push({
          scenarioId: scId,
          scenarioName: scenarioConfig.name,
          seed: seed,
          fixed30_avgWait: result.fixed30.avgWait.toFixed(2),
          tod_avgWait: result.timeOfDay.avgWait.toFixed(2),
          adaptive_avgWait: result.adaptive.avgWait.toFixed(2),
          adaptiveVision_avgWait: result.adaptiveVision.avgWait.toFixed(2),
          waitReduction_vs_Fixed_Pct: waitRedVsFixed.toFixed(1),
          waitReduction_vs_TOD_Pct: waitRedVsTOD.toFixed(1),
          waitReduction_Vision_vs_Fixed_Pct: waitRedVisionVsFixed.toFixed(1),
          fixed30_throughput: result.fixed30.completedCount,
          tod_throughput: result.timeOfDay.completedCount,
          adaptive_throughput: result.adaptive.completedCount,
          adaptiveVision_throughput: result.adaptiveVision.completedCount,
          fixed30_stops: result.fixed30.stopsPerVeh.toFixed(2),
          adaptive_stops: result.adaptive.stopsPerVeh.toFixed(2),
          adaptiveVision_stops: result.adaptiveVision.stopsPerVeh.toFixed(2)
        });

        completedRuns++;
        const pct = Math.round((completedRuns / totalRuns) * 100);
        onProgress(pct, `Evaluating ${scenarioConfig.name} (Seed ${seed})...`);
      }
    }

    // Compute Mean, StdDev, Min, Max for each scenario and controller
    const aggregated = {};
    for (const scId of scenarioKeys) {
      const s = summaryByScenario[scId];
      aggregated[scId] = {
        id: scId,
        name: s.name,
        fixed30: this.calcStats(s.fixed30.waitTimes),
        timeOfDay: this.calcStats(s.timeOfDay.waitTimes),
        adaptive: this.calcStats(s.adaptive.waitTimes),
        adaptiveVision: this.calcStats(s.adaptiveVision.waitTimes),
        fixed30_throughput: this.calcStats(s.fixed30.throughputs),
        adaptive_throughput: this.calcStats(s.adaptive.throughputs),
        adaptiveVision_throughput: this.calcStats(s.adaptiveVision.throughputs)
      };

      // Mean percentage wait time improvement
      const fixedMean = aggregated[scId].fixed30.mean;
      const todMean = aggregated[scId].timeOfDay.mean;
      const adaptMean = aggregated[scId].adaptive.mean;
      const adaptVisionMean = aggregated[scId].adaptiveVision.mean;

      aggregated[scId].improvementVsFixed = fixedMean > 0
        ? ((fixedMean - adaptMean) / fixedMean) * 100.0
        : 0.0;
      aggregated[scId].improvementVsTOD = todMean > 0
        ? ((todMean - adaptMean) / todMean) * 100.0
        : 0.0;
      aggregated[scId].improvementVisionVsFixed = fixedMean > 0
        ? ((fixedMean - adaptVisionMean) / fixedMean) * 100.0
        : 0.0;
      aggregated[scId].visionRobustnessPct = adaptMean > 0
        ? Math.min(100.0, (adaptMean / adaptVisionMean) * 100.0)
        : 100.0;
    }

    return {
      aggregated,
      detailedRows,
      scenarioKeys
    };
  }

  /**
   * Runs a single headless simulation for 1 scenario and 1 seed across all 3 controllers.
   */
  static simulateSingleRun(scId, seed, simDuration, dt, totalSteps) {
    const prng = new PRNG(seed);
    const scenario = CONFIG.scenarios[scId];

    // Initialize the 3 controllers
    const ctrlFixed = new FixedController('fixed30');
    ctrlFixed.setScenario(scId);

    const ctrlTOD = new FixedController('timeOfDay');
    ctrlTOD.setScenario(scId);

    const ctrlAdaptive = new AdaptiveController();
    ctrlAdaptive.setScenario(scId);

    const ctrlAdaptiveVision = new AdaptiveController();
    ctrlAdaptiveVision.setScenario(scId);
    const visionDetector = new VirtualDetector();

    // Initialize 4 twin headless junctions
    const jFixed = new HeadlessJunction(ctrlFixed);
    const jTOD = new HeadlessJunction(ctrlTOD);
    const jAdaptive = new HeadlessJunction(ctrlAdaptive);
    const jAdaptiveVision = new HeadlessJunction(ctrlAdaptiveVision, visionDetector);

    // Synchronized arrival schedule
    const nextArrivals = { N: 0, E: 0, S: 0, W: 0 };
    ['N', 'E', 'S', 'W'].forEach(arm => {
      const lambda = scenario.rates[arm] / 60.0;
      nextArrivals[arm] = prng.sampleExponential(lambda);
    });

    let vehicleId = 0;
    let ambulanceSpawned = false;

    // Fast-forward discrete steps
    for (let step = 0; step < totalSteps; step++) {
      const simTime = step * dt;

      // Emergency ambulance spawn at t = 60s
      if (scenario.emergencySpawn && !ambulanceSpawned && simTime >= scenario.emergencySpawn.timeSec) {
        ambulanceSpawned = true;
        vehicleId++;
        const desc = {
          id: vehicleId,
          typeKey: 'ambulance',
          arm: scenario.emergencySpawn.arm,
          spawnTime: simTime,
          initialSpeed: CONFIG.vehicles.types.ambulance.maxSpeed * 0.85
        };
        jFixed.spawnVehicle(desc);
        jTOD.spawnVehicle(desc);
        jAdaptive.spawnVehicle(desc);
        jAdaptiveVision.spawnVehicle(desc);
      }

      // Check Poisson arrivals per arm
      ['N', 'E', 'S', 'W'].forEach(arm => {
        const lambda = scenario.rates[arm] / 60.0;
        if (simTime >= nextArrivals[arm]) {
          vehicleId++;
          // Sample vehicle type
          const r = prng.next();
          let typeKey = 'twoWheeler';
          if (r < 0.50) typeKey = 'twoWheeler';
          else if (r < 0.80) typeKey = 'car';
          else if (r < 0.88) typeKey = 'autoRickshaw';
          else if (r < 0.94) typeKey = 'bus';
          else typeKey = 'truck';

          const typeConfig = CONFIG.vehicles.types[typeKey];
          const desc = {
            id: vehicleId,
            typeKey: typeKey,
            arm: arm,
            spawnTime: simTime,
            initialSpeed: typeConfig.maxSpeed * 0.8
          };

          // Inject identical vehicle into all four junctions
          jFixed.spawnVehicle(desc);
          jTOD.spawnVehicle(desc);
          jAdaptive.spawnVehicle(desc);
          jAdaptiveVision.spawnVehicle(desc);

          nextArrivals[arm] = simTime + prng.sampleExponential(lambda);
        }
      });

      // Step all 4 junctions
      jFixed.update(dt, simTime, scenario.isNight);
      jTOD.update(dt, simTime, scenario.isNight);
      jAdaptive.update(dt, simTime, scenario.isNight);
      jAdaptiveVision.update(dt, simTime, scenario.isNight);
    }

    return {
      fixed30: jFixed.getMetrics(),
      timeOfDay: jTOD.getMetrics(),
      adaptive: jAdaptive.getMetrics(),
      adaptiveVision: jAdaptiveVision.getMetrics()
    };
  }

  /**
   * Helper to compute Mean, StdDev, Min, and Max from a numeric array.
   */
  static calcStats(arr) {
    if (!arr || arr.length === 0) return { mean: 0, stdDev: 0, min: 0, max: 0 };
    const n = arr.length;
    const mean = arr.reduce((acc, val) => acc + val, 0) / n;
    const variance = arr.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    const min = Math.min(...arr);
    const max = Math.max(...arr);

    return {
      mean: parseFloat(mean.toFixed(2)),
      stdDev: parseFloat(stdDev.toFixed(2)),
      min: parseFloat(min.toFixed(2)),
      max: parseFloat(max.toFixed(2))
    };
  }
}
