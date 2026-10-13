/**
 * MetricsTracker - Computes live comparison analytics between Left (Baseline)
 * and Right (Adaptive) junctions under identical traffic input streams.
 */

export class MetricsTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.left = {
      completedCount: 0,
      totalWaitTime: 0.0,
      totalStops: 0,
      maxQueue: 0,
      queueSamples: [],
      avgWait: 0.0,
      stopsPerVeh: 0.0
    };

    this.right = {
      completedCount: 0,
      totalWaitTime: 0.0,
      totalStops: 0,
      maxQueue: 0,
      queueSamples: [],
      avgWait: 0.0,
      stopsPerVeh: 0.0
    };

    this.improvement = {
      waitTimeReductionPercent: 0.0,
      stopsReductionPercent: 0.0
    };
  }

  /**
   * Updates tracking metrics from the two junction instances.
   * 
   * @param {Object} leftJunction Left JunctionSim instance
   * @param {Object} rightJunction Right JunctionSim instance
   */
  update(leftJunction, rightJunction) {
    const lm = leftJunction.metrics;
    const rm = rightJunction.metrics;

    // Left (Baseline) metrics
    this.left.completedCount = lm.completedVehicles;
    this.left.totalWaitTime = lm.totalWaitTime;
    this.left.totalStops = lm.totalStops;
    this.left.maxQueue = lm.maxQueue;
    this.left.avgWait = lm.completedVehicles > 0 ? lm.totalWaitTime / lm.completedVehicles : 0.0;
    this.left.stopsPerVeh = lm.completedVehicles > 0 ? lm.totalStops / lm.completedVehicles : 0.0;

    // Right (Adaptive) metrics
    this.right.completedCount = rm.completedVehicles;
    this.right.totalWaitTime = rm.totalWaitTime;
    this.right.totalStops = rm.totalStops;
    this.right.maxQueue = rm.maxQueue;
    this.right.avgWait = rm.completedVehicles > 0 ? rm.totalWaitTime / rm.completedVehicles : 0.0;
    this.right.stopsPerVeh = rm.completedVehicles > 0 ? rm.totalStops / rm.completedVehicles : 0.0;

    // Percentage Improvement calculation (Adaptive vs Baseline)
    if (this.left.avgWait > 0.5) {
      const waitDelta = ((this.left.avgWait - this.right.avgWait) / this.left.avgWait) * 100.0;
      this.improvement.waitTimeReductionPercent = waitDelta;
    } else {
      this.improvement.waitTimeReductionPercent = 0.0;
    }

    if (this.left.stopsPerVeh > 0.1) {
      const stopsDelta = ((this.left.stopsPerVeh - this.right.stopsPerVeh) / this.left.stopsPerVeh) * 100.0;
      this.improvement.stopsReductionPercent = stopsDelta;
    } else {
      this.improvement.stopsReductionPercent = 0.0;
    }
  }

  getSnapshot() {
    return {
      left: { ...this.left },
      right: { ...this.right },
      improvement: { ...this.improvement }
    };
  }
}
