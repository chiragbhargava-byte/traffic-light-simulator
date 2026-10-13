import { CONFIG } from '../config.js';
import { PRNG } from '../utils/prng.js';

/**
 * Synchronized Poisson Vehicle Spawner
 * Uses a single seeded PRNG so Left and Right junctions receive
 * IDENTICAL vehicle arrival sequences at identical timestamps.
 */
export class TrafficSpawner {
  constructor(seed = 42) {
    this.prng = new PRNG(seed);
    this.scenarioId = 'normalDay';
    this.simTime = 0.0;
    this.vehicleCounter = 0;

    // Next scheduled arrival timestamp per arm (N, E, S, W)
    this.nextArrivalTimes = { N: 0, E: 0, S: 0, W: 0 };
    this.ambulanceSpawned = false;
  }

  setSeed(seed) {
    this.prng.setSeed(seed);
    this.reset();
  }

  setScenario(scenarioId) {
    this.scenarioId = scenarioId;
    this.reset();
  }

  reset() {
    this.simTime = 0.0;
    this.vehicleCounter = 0;
    this.ambulanceSpawned = false;

    // Schedule initial arrival per arm using Poisson process
    const scenario = CONFIG.scenarios[this.scenarioId] || CONFIG.scenarios.normalDay;
    ['N', 'E', 'S', 'W'].forEach(arm => {
      const vpm = scenario.rates[arm];
      const lambda = vpm / 60.0; // Vehicles per second
      this.nextArrivalTimes[arm] = this.prng.sampleExponential(lambda);
    });
  }

  /**
   * Samples a vehicle type based on empirical traffic composition shares.
   */
  pickVehicleType() {
    const r = this.prng.next();
    // Shares: Two-wheeler (50%), Car (30%), Auto (8%), Bus (6%), Truck (6%)
    if (r < 0.50) return 'twoWheeler';
    if (r < 0.80) return 'car';
    if (r < 0.88) return 'autoRickshaw';
    if (r < 0.94) return 'bus';
    return 'truck';
  }

  /**
   * Advances time and returns newly spawned vehicle descriptors.
   * Both Left and Right junctions will receive these identical descriptors.
   * 
   * @param {number} dt Time step
   * @returns {Array<Object>} Array of vehicle descriptors to inject
   */
  update(dt) {
    this.simTime += dt;
    const scenario = CONFIG.scenarios[this.scenarioId] || CONFIG.scenarios.normalDay;
    const spawnedList = [];

    // Check emergency pre-programmed spawn (e.g. Ambulance at t = 60s)
    if (scenario.emergencySpawn && !this.ambulanceSpawned && this.simTime >= scenario.emergencySpawn.timeSec) {
      this.ambulanceSpawned = true;
      this.vehicleCounter++;
      spawnedList.push({
        id: this.vehicleCounter,
        typeKey: 'ambulance',
        arm: scenario.emergencySpawn.arm,
        spawnTime: this.simTime,
        initialSpeed: CONFIG.vehicles.types.ambulance.maxSpeed * 0.85
      });
    }

    // Check Poisson arrivals for each arm
    ['N', 'E', 'S', 'W'].forEach(arm => {
      const vpm = scenario.rates[arm];
      const lambda = vpm / 60.0; // Lambda in veh/sec

      if (this.simTime >= this.nextArrivalTimes[arm]) {
        this.vehicleCounter++;
        const typeKey = this.pickVehicleType();
        const typeConfig = CONFIG.vehicles.types[typeKey];

        spawnedList.push({
          id: this.vehicleCounter,
          typeKey: typeKey,
          arm: arm,
          spawnTime: this.simTime,
          initialSpeed: typeConfig.maxSpeed * 0.8
        });

        // Schedule next arrival time for this arm
        const interArrival = this.prng.sampleExponential(lambda);
        this.nextArrivalTimes[arm] = this.simTime + interArrival;
      }
    });

    return spawnedList;
  }

  /**
   * Forces an immediate ambulance spawn on a specified arm (e.g. for user interactive demo).
   */
  triggerEmergency(arm = 'W') {
    this.vehicleCounter++;
    return {
      id: this.vehicleCounter,
      typeKey: 'ambulance',
      arm: arm,
      spawnTime: this.simTime,
      initialSpeed: CONFIG.vehicles.types.ambulance.maxSpeed * 0.85
    };
  }
}
