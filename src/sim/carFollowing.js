import { CONFIG } from '../config.js';

/**
 * Intelligent Driver Model (IDM) & Signal Braking Logic
 */
export class CarFollowingModel {
  /**
   * Calculates longitudinal acceleration for a vehicle.
   * 
   * @param {Object} vehicle The vehicle to calculate acceleration for
   * @param {Object|null} leadVehicle Immediate preceding vehicle on same lane, or null
   * @param {string} signalState 'GREEN' | 'YELLOW' | 'RED'
   * @param {number} distToStop Distance from front of vehicle to stop line (meters)
   * @param {number} distToZebra Distance from front of vehicle to occupied zebra crossing (meters)
   * @returns {number} Acceleration in m/s^2
   */
  static computeAcceleration(vehicle, leadVehicle, signalState, distToStop, distToZebra = Infinity) {
    const { minGap, safeTimeHeadway, comfortableDecel } = CONFIG.vehicles.physics;
    const a = vehicle.typeConfig.acceleration;
    const b = comfortableDecel;
    const v = Math.max(0, vehicle.speed);
    const v0 = vehicle.typeConfig.maxSpeed;

    // 1. Free acceleration term: a * (1 - (v / v0)^4)
    const freeRatio = v0 > 0 ? v / v0 : 0;
    let accel = a * (1 - Math.pow(freeRatio, 4));

    // 2. Lead vehicle interaction
    if (leadVehicle) {
      // Gap between front bumper of follower and rear bumper of leader
      const physicalGap = (leadVehicle.dist - leadVehicle.typeConfig.length / 2) -
                          (vehicle.dist + vehicle.typeConfig.length / 2);
      const s = Math.max(0.1, physicalGap);
      const deltaV = v - leadVehicle.speed;

      // Desired dynamic gap s*
      const sStar = minGap + Math.max(0, v * safeTimeHeadway + (v * deltaV) / (2 * Math.sqrt(a * b)));
      const leadDecel = -a * Math.pow(sStar / s, 2);
      accel = Math.min(accel, a * (1 - Math.pow(freeRatio, 4)) + leadDecel);
    }

    // 3. Virtual obstacle at stop line for RED / YELLOW signals
    // Only applies if the vehicle has not yet crossed the stop line
    if (distToStop > 0) {
      const halfLen = vehicle.typeConfig.length / 2;
      const sStop = Math.max(0.1, distToStop - halfLen);

      if (signalState === 'RED') {
        // Red light: must stop before the stop line
        const sStarStop = minGap + (v * safeTimeHeadway);
        const stopDecel = -a * Math.pow(sStarStop / sStop, 2);
        accel = Math.min(accel, stopDecel);
      } else if (signalState === 'YELLOW') {
        // Yellow light: check dilemma zone (can vehicle stop comfortably with deceleration b?)
        const stoppingDistRequired = (v * v) / (2 * b);
        if (distToStop >= stoppingDistRequired) {
          // Can stop comfortably, apply braking
          const sStarStop = minGap + (v * safeTimeHeadway);
          const stopDecel = -a * Math.pow(sStarStop / sStop, 2);
          accel = Math.min(accel, stopDecel);
        }
        // If distToStop < stoppingDistRequired, vehicle is committed to crossing safely
      }
    }

    // 4. Virtual obstacle for occupied zebra crossing (vehicles never enter occupied zebra)
    if (distToZebra > 0 && distToZebra < 50.0) {
      const halfLen = vehicle.typeConfig.length / 2;
      const sZebra = Math.max(0.1, distToZebra - halfLen);
      const sStarZebra = minGap + (v * safeTimeHeadway);
      const zebraDecel = -a * Math.pow(sStarZebra / sZebra, 2);
      accel = Math.min(accel, zebraDecel);
    }

    // Clamp acceleration between emergency braking and maximum engine acceleration
    const maxBrake = -CONFIG.vehicles.physics.emergencyDecel;
    return Math.max(maxBrake, Math.min(a, accel));
  }
}
