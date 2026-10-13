import { CONFIG } from '../config.js';

/**
 * ============================================================================
 * AI-BASED ADAPTIVE TRAFFIC SIGNAL CONTROLLER (4 SINGLE-ARM PHASES)
 * Project: SFIC 2026 — PS000073 (Navsari Municipal Corporation)
 * ============================================================================
 * 
 * PHASING ARCHITECTURE:
 * - 4 Single-Arm Phases: N, E, S, W (Exactly ONE inbound arm green at a time).
 * - After each green phase: 3s Yellow -> 2s All-Red -> Next Arm Green.
 * 
 * DYNAMIC ACTUATION SPECIFICATION:
 * 1. Dynamic Green Calculation:
 *      green_time = clamp(base + k * queue_count(arm), min_green, max_green)
 *      Defaults: base = 8s, k = 2s/veh, min_green = 8s, max_green = 45s.
 * 
 * 2. Next Arm Selection:
 *    - Chooses the arm with the highest weighted queue.
 *    - Skips arms with zero queue and no approaching vehicles.
 *    - Starvation limit: No arm waits longer than 120s before being served.
 * 
 * 3. Emergency Vehicle Preemption:
 *    - The ambulance's arm gets green after safe yellow (3s) and all-red (2s) clearance.
 *    - Holds green until the ambulance passes the stop line.
 * 
 * 4. School Mode:
 *    - North school arm queue gets 1.5x weight in School Morning scenario.
 * 
 * 5. Night Mode Demand Actuation:
 *    - Stays green on the current arm while all other arms are empty.
 *    - Switches (with safe clearance) when cross-traffic arrives on another arm.
 * 
 * 6. Obstruction Filtering:
 *    - Stalled/parked vehicles (>20s outside stop line) are excluded from queue count.
 * ============================================================================
 */

export class AdaptiveController {
  constructor() {
    this.arms = ['N', 'E', 'S', 'W'];
    this.activeArm = 'N';
    this.subState = 'GREEN'; // 'GREEN' | 'YELLOW' | 'ALL_RED'
    this.timeInPhase = 0.0;
    this.currentGreenDuration = CONFIG.controllers.adaptive.baseGreen; // 8s
    this.nextArm = null;

    // Signal aspect outputs: exactly one arm green/yellow at a time
    this.aspects = { N: 'GREEN', E: 'RED', S: 'RED', W: 'RED' };
    this.phase = 'N_GREEN';

    // Starvation tracking (seconds since each arm was last served green)
    this.timeSinceServed = {
      N: 0.0,
      E: 0.0,
      S: 0.0,
      W: 0.0
    };

    this.currentScenarioId = 'normalDay';
    this.emergencyActive = false;
    this.emergencyArm = null;

    this.decisionText = 'N green 8 s = 8 + 2 x 0 queued';
    this.activeAlerts = [];
  }

  setScenario(scenarioId) {
    this.currentScenarioId = scenarioId;
    this.reset();
  }

  reset() {
    this.activeArm = 'N';
    this.subState = 'GREEN';
    this.timeInPhase = 0.0;
    this.currentGreenDuration = CONFIG.controllers.adaptive.baseGreen;
    this.nextArm = null;
    this.timeSinceServed = { N: 0.0, E: 0.0, S: 0.0, W: 0.0 };
    this.emergencyActive = false;
    this.emergencyArm = null;
    this.aspects = { N: 'GREEN', E: 'RED', S: 'RED', W: 'RED' };
    this.phase = 'N_GREEN';
    this.decisionText = 'N green 8 s = 8 + 2 x 0 queued';
    this.activeAlerts = [];
  }

  /**
   * Main controller tick function called once per simulation step.
   * 
   * @param {number} dt Delta time in seconds
   * @param {Object} junction JunctionSim instance providing getQueueCount(arm)
   * @returns {Object} Signal aspects { N, E, S, W }
   */
  update(dt, junction) {
    this.timeInPhase += dt;
    this.activeAlerts = [];

    // Accumulate starvation timers for all inactive arms
    this.arms.forEach(arm => {
      if (arm !== this.activeArm) {
        this.timeSinceServed[arm] += dt;
      } else {
        this.timeSinceServed[arm] = 0.0;
      }
    });

    // -------------------------------------------------------------
    // PRIORITY 1: EMERGENCY VEHICLE PREEMPTION
    // -------------------------------------------------------------
    const ambulanceStatus = this.checkAmbulancePreemption(junction);
    if (ambulanceStatus.detected) {
      this.emergencyActive = true;
      this.emergencyArm = ambulanceStatus.arm;
      this.activeAlerts.push(`🚨 EMERGENCY: Ambulance detected on Arm ${this.emergencyArm} (Preemption active)`);

      if (this.activeArm === this.emergencyArm && this.subState === 'GREEN') {
        // Already green on ambulance arm: hold green until ambulance passes stop line!
        this.currentGreenDuration = Math.max(this.currentGreenDuration, this.timeInPhase + 5.0);
        this.decisionText = `EMERGENCY HOLD: Arm ${this.emergencyArm} green held for approaching Ambulance`;
        return this.aspects;
      } else if (this.subState === 'GREEN') {
        // Currently green on different arm: immediately transition to safe yellow!
        this.subState = 'YELLOW';
        this.timeInPhase = 0.0;
        this.nextArm = this.emergencyArm;
        this.decisionText = `EMERGENCY CLEARANCE: Transitioning to serve Ambulance on Arm ${this.emergencyArm}`;
      } else if (this.subState === 'YELLOW' || this.subState === 'ALL_RED') {
        this.nextArm = this.emergencyArm;
      }
    } else {
      this.emergencyActive = false;
      this.emergencyArm = null;
    }

    // -------------------------------------------------------------
    // PRIORITY 6: OBSTRUCTION MONITORING
    // -------------------------------------------------------------
    const obstructionInfo = this.checkObstructions(junction);
    if (obstructionInfo.hasObstruction) {
      this.activeAlerts.push(`🚧 OBSTRUCTION: Stalled vehicle on Arm ${obstructionInfo.arm} (${obstructionInfo.duration.toFixed(0)}s) - Filtered from queue`);
    }

    // Congestion alerts (> 12 queued on any single approach)
    this.arms.forEach(arm => {
      const q = junction.getQueueCount(arm);
      if (q >= 12) {
        this.activeAlerts.push(`⚠️ HEAVY QUEUE: Arm ${arm} has ${q} queued vehicles`);
      }
    });

    // -------------------------------------------------------------
    // STATE MACHINE EXECUTION (N -> E -> S -> W with Dynamic Selection)
    // -------------------------------------------------------------
    const { yellowDuration, allRedDuration } = CONFIG.controllers.clearance;

    switch (this.subState) {
      case 'GREEN': {
        this.aspects = { N: 'RED', E: 'RED', S: 'RED', W: 'RED' };
        this.aspects[this.activeArm] = 'GREEN';
        this.phase = `${this.activeArm}_GREEN`;

        // PRIORITY 5: NIGHT MODE DEMAND ACTUATION
        if (this.currentScenarioId === 'night' && this.timeInPhase >= CONFIG.controllers.adaptive.minGreen) {
          const otherDemand = this.arms
            .filter(a => a !== this.activeArm)
            .some(a => this.hasDemandOnArm(a, junction));

          if (!otherDemand) {
            // Other arms empty: stay green on current arm indefinitely!
            this.decisionText = `Night mode: Zero cross-demand. Holding ${this.activeArm} green.`;
            break;
          }
        }

        // Check if green duration has elapsed
        if (this.timeInPhase >= this.currentGreenDuration) {
          this.subState = 'YELLOW';
          this.timeInPhase = 0.0;
          this.nextArm = this.selectNextArm(junction);
        }
        break;
      }

      case 'YELLOW': {
        this.aspects = { N: 'RED', E: 'RED', S: 'RED', W: 'RED' };
        this.aspects[this.activeArm] = 'YELLOW';
        this.phase = `${this.activeArm}_YELLOW`;

        if (this.timeInPhase >= yellowDuration) {
          this.subState = 'ALL_RED';
          this.timeInPhase = 0.0;
          if (!this.nextArm) {
            this.nextArm = this.selectNextArm(junction);
          }
        }
        break;
      }

      case 'ALL_RED': {
        this.aspects = { N: 'RED', E: 'RED', S: 'RED', W: 'RED' };
        this.phase = 'ALL_RED';

        if (this.timeInPhase >= allRedDuration) {
          // Switch to selected next arm
          this.activeArm = this.nextArm || this.selectNextArm(junction);
          this.nextArm = null;
          this.subState = 'GREEN';
          this.timeInPhase = 0.0;
          this.currentGreenDuration = this.calculateGreenDuration(this.activeArm, junction);
        }
        break;
      }
    }

    return this.aspects;
  }

  /**
   * Evaluates if an arm has waiting or approaching vehicles.
   */
  hasDemandOnArm(arm, junction) {
    if (junction.getQueueCount(arm) > 0) return true;

    // Check if any vehicle is approaching within 60m of stop line
    const vehicles = junction.vehiclesByArm[arm] || [];
    for (let i = 0; i < vehicles.length; i++) {
      const distToStop = junction.stopLineDist - vehicles[i].dist;
      if (distToStop > -2.0 && distToStop <= CONFIG.controllers.adaptive.emergencyDistance) {
        return true;
      }
    }
    return false;
  }

  /**
   * PRIORITY 2 & 3: SELECT NEXT ARM
   * - Selects the arm with the highest weighted queue.
   * - Skips arms with zero queue and no approaching vehicles.
   * - Starvation limit: No arm waits longer than 120s.
   */
  selectNextArm(junction) {
    // 1. Emergency preemption takes absolute precedence
    if (this.emergencyActive && this.emergencyArm) {
      return this.emergencyArm;
    }

    const { starvationLimit, schoolWeight } = CONFIG.controllers.adaptive;

    // 2. Starvation check: Has any arm with demand waited >= 120s?
    let mostStarvedArm = null;
    let maxStarveTime = 0;

    for (const arm of this.arms) {
      if (arm !== this.activeArm && this.hasDemandOnArm(arm, junction)) {
        if (this.timeSinceServed[arm] >= starvationLimit && this.timeSinceServed[arm] > maxStarveTime) {
          maxStarveTime = this.timeSinceServed[arm];
          mostStarvedArm = arm;
        }
      }
    }

    if (mostStarvedArm) {
      return mostStarvedArm;
    }

    // 3. Queue-dominant selection: Find arm with highest weighted queue
    // Candidate arms are the other 3 arms (or all arms if others are empty)
    const candidateArms = this.arms.filter(a => a !== this.activeArm);
    let bestArm = null;
    let highestWeight = -1;

    for (const arm of candidateArms) {
      const q = junction.getQueueCount(arm);
      const hasTraffic = this.hasDemandOnArm(arm, junction);

      // Skip arm with zero queue and no approaching vehicles
      if (!hasTraffic && q === 0) continue;

      // School mode: 1.5x weight for North school arm
      const weightMultiplier = (arm === 'N' && this.currentScenarioId === 'schoolMorning')
        ? schoolWeight
        : 1.0;

      const weightedScore = (q * weightMultiplier) + (hasTraffic ? 0.5 : 0);

      if (weightedScore > highestWeight) {
        highestWeight = weightedScore;
        bestArm = arm;
      }
    }

    // If other arms are completely empty, check if current arm still has demand
    if (!bestArm) {
      if (this.hasDemandOnArm(this.activeArm, junction)) {
        return this.activeArm;
      }
      // Default cyclic progression: next in order N -> E -> S -> W
      const curIdx = this.arms.indexOf(this.activeArm);
      return this.arms[(curIdx + 1) % this.arms.length];
    }

    return bestArm;
  }

  /**
   * PRIORITY 2 & 4: DYNAMIC GREEN TIME CALCULATION
   * green_time = clamp(base + k * queue_count(arm), min_green, max_green)
   * Defaults: base = 8s, k = 2s/veh, min_green = 8s, max_green = 45s.
   */
  calculateGreenDuration(arm, junction) {
    const { baseGreen, k, minGreen, maxGreen, schoolWeight, starvationLimit } = CONFIG.controllers.adaptive;
    const rawQueue = junction.getQueueCount(arm);

    let effectiveQueue = rawQueue;
    let note = '';

    // School mode: 1.5x queue weight for North school arm
    if (arm === 'N' && this.currentScenarioId === 'schoolMorning') {
      effectiveQueue = rawQueue * schoolWeight;
      note = ` (School weight ${schoolWeight}x applied)`;
    }

    if (this.timeSinceServed[arm] >= starvationLimit) {
      note = ` [Starvation service: waited ${this.timeSinceServed[arm].toFixed(0)}s ≥ ${starvationLimit}s cap]`;
    }

    const calculated = baseGreen + k * effectiveQueue;
    const clampedGreen = Math.min(maxGreen, Math.max(minGreen, Math.round(calculated)));

    // HUD Decision Text: "N green 26 s = 8 + 2 x 9 queued"
    this.decisionText = `${arm} green ${clampedGreen} s = ${baseGreen} + ${k} x ${rawQueue} queued${note}`;

    return clampedGreen;
  }

  /**
   * PRIORITY 1: Ambulance Detection within 60m of stop line
   */
  checkAmbulancePreemption(junction) {
    const detectDist = CONFIG.controllers.adaptive.emergencyDistance; // 60m
    const vehicles = junction.allVehicles || [];

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      if (v.typeKey === 'ambulance') {
        const distToStop = junction.stopLineDist - v.dist;
        // Approaching within 60m of stop line and has not yet passed the stop line
        if (distToStop > 0.0 && distToStop <= detectDist) {
          return { detected: true, arm: v.arm, vehicle: v };
        }
      }
    }
    return { detected: false, arm: null };
  }

  /**
   * PRIORITY 6: Obstruction Detection
   */
  checkObstructions(junction) {
    const vehicles = junction.allVehicles || [];
    const thresholdSec = CONFIG.controllers.adaptive.obstructionDuration; // 20s
    const thresholdDist = CONFIG.controllers.adaptive.obstructionThresholdDistance; // 42m

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      const distToStop = junction.stopLineDist - v.dist;

      if (v.stoppedDuration >= thresholdSec && distToStop > thresholdDist) {
        v.isObstruction = true;
        return { hasObstruction: true, arm: v.arm, duration: v.stoppedDuration };
      }
    }
    return { hasObstruction: false };
  }
}
