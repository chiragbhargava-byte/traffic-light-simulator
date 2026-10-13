import { CONFIG } from '../config.js';

/**
 * ============================================================================
 * FIXED & TIME-OF-DAY TRAFFIC SIGNAL CONTROLLERS (MUNICIPAL BASELINES)
 * 4 Single-Arm Phases: N -> E -> S -> W
 * ============================================================================
 * 
 * In Indian intersections, typical signal phasing allows exactly ONE inbound
 * approach arm green at a time to prevent conflicting turning collisions:
 * 
 * 1. FIXED 4-PHASE BASELINE:
 *    - Sequence: N (20s) -> Yellow (3s) -> All-Red (2s)
 *             -> E (20s) -> Yellow (3s) -> All-Red (2s)
 *             -> S (20s) -> Yellow (3s) -> All-Red (2s)
 *             -> W (20s) -> Yellow (3s) -> All-Red (2s)
 *    - Cycle time: 4 x (20 + 3 + 2) = 100 seconds.
 * 
 * 2. TIME-OF-DAY (TOD) BASELINE:
 *    - During School Hours (School Morning scenario):
 *      School arm (N) receives 35s green, while others receive 15s green each.
 *    - Otherwise: 20s green per arm.
 * ============================================================================
 */

export class FixedController {
  /**
   * @param {'fixed30' | 'timeOfDay'} mode Baseline controller variant
   */
  constructor(mode = 'fixed30') {
    this.mode = mode; // 'fixed30' (Fixed 4-phase) or 'timeOfDay'
    this.currentScenarioId = 'normalDay';

    this.arms = ['N', 'E', 'S', 'W'];
    this.armIndex = 0; // Current active arm: 0 = N, 1 = E, 2 = S, 3 = W
    this.subState = 'GREEN'; // 'GREEN' | 'YELLOW' | 'ALL_RED'
    this.timeInPhase = 0.0;

    // Phase string exposed for HUD: e.g. 'N_GREEN', 'N_YELLOW', 'ALL_RED'
    this.phase = 'N_GREEN';

    // Signal aspects: { N, S, E, W }
    this.aspects = { N: 'GREEN', E: 'RED', S: 'RED', W: 'RED' };
  }

  setMode(mode) {
    this.mode = mode;
  }

  setScenario(scenarioId) {
    this.currentScenarioId = scenarioId;
  }

  reset() {
    this.armIndex = 0;
    this.subState = 'GREEN';
    this.timeInPhase = 0.0;
    this.phase = 'N_GREEN';
    this.aspects = { N: 'GREEN', E: 'RED', S: 'RED', W: 'RED' };
  }

  /**
   * Returns green duration for the given arm based on active mode.
   * @param {'N'|'E'|'S'|'W'} arm
   */
  getArmGreenDuration(arm) {
    if (this.mode === 'fixed30') {
      return CONFIG.controllers.fixed.defaultArmGreen; // 20s
    }

    // Time-of-Day (TOD)
    if (this.currentScenarioId === 'schoolMorning') {
      return arm === 'N'
        ? CONFIG.controllers.timeOfDay.schoolArmGreen // 35s for school arm
        : CONFIG.controllers.timeOfDay.otherArmGreen;  // 15s for others
    }

    return CONFIG.controllers.timeOfDay.normalArmGreen; // 20s each
  }

  /**
   * Advances controller state by dt seconds.
   * @param {number} dt Delta time in seconds
   */
  update(dt) {
    this.timeInPhase += dt;

    const currentArm = this.arms[this.armIndex];
    const { yellowDuration, allRedDuration } = CONFIG.controllers.clearance;
    const greenDuration = this.getArmGreenDuration(currentArm);

    switch (this.subState) {
      case 'GREEN': {
        this.aspects = { N: 'RED', E: 'RED', S: 'RED', W: 'RED' };
        this.aspects[currentArm] = 'GREEN';
        this.phase = `${currentArm}_GREEN`;

        if (this.timeInPhase >= greenDuration) {
          this.subState = 'YELLOW';
          this.timeInPhase = 0.0;
        }
        break;
      }

      case 'YELLOW': {
        this.aspects = { N: 'RED', E: 'RED', S: 'RED', W: 'RED' };
        this.aspects[currentArm] = 'YELLOW';
        this.phase = `${currentArm}_YELLOW`;

        if (this.timeInPhase >= yellowDuration) {
          this.subState = 'ALL_RED';
          this.timeInPhase = 0.0;
        }
        break;
      }

      case 'ALL_RED': {
        this.aspects = { N: 'RED', E: 'RED', S: 'RED', W: 'RED' };
        this.phase = 'ALL_RED';

        if (this.timeInPhase >= allRedDuration) {
          // Advance to next arm in N -> E -> S -> W sequence
          this.armIndex = (this.armIndex + 1) % this.arms.length;
          this.subState = 'GREEN';
          this.timeInPhase = 0.0;
        }
        break;
      }
    }

    return this.aspects;
  }

  /**
   * Descriptive helper for HUD banner.
   */
  getPlanSummary() {
    if (this.mode === 'fixed30') {
      return 'Fixed 4-phase: 20s N -> 20s E -> 20s S -> 20s W (Cycle 100s)';
    }
    if (this.currentScenarioId === 'schoolMorning') {
      return 'TOD 4-phase: School Arm (N) 35s, others 15s each (Cycle 100s)';
    }
    return 'TOD 4-phase: 20s each arm + 5s clearance (Cycle 100s)';
  }
}
