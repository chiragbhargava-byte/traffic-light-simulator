/**
 * CONFIG.JS - Central configuration for 3D Adaptive Traffic Signal Simulator
 * Project: SFIC 2026, PS000073 (Navsari Municipal Corporation)
 * 
 * ALL physical parameters, visual dimensions, controller coefficients,
 * camera presets, and scenario rates are maintained here as single source of truth.
 */

export const CONFIG = {
  // -------------------------------------------------------------
  // 1. Spatial & Geometric Layout
  // -------------------------------------------------------------
  layout: {
    armLength: 70.0,              // Length of each arm from junction center (meters)
    laneWidth: 3.6,               // Single lane width (meters)
    roadWidth: 7.2,               // 2-lane road (1 inbound, 1 outbound) = 7.2m
    stopLineDistance: 4.8,        // Distance of stop line from junction center (meters)
    zebraWidth: 3.0,              // Zebra crossing strip width along road axis (meters)
    zebraDistFromStop: 1.0,       // Gap between stop line and zebra crossing
    junctionSpacing: 170.0,       // Distance between Left & Right junction centers
    junctionCenters: {
      left: { x: -85.0, y: 0, z: 0 },   // Fixed-timer junction (Left)
      right: { x: 85.0, y: 0, z: 0 }    // Adaptive controller junction (Right)
    },
    groundWidth: 360.0,
    groundDepth: 190.0,
    schoolZonePositionZ: -34.0,   // Distance along North arm for school building & road paint
    schoolZoneLength: 22.0        // Length of painted school road zone
  },

  // -------------------------------------------------------------
  // 2. Visual Palette & Rendering Aesthetics
  // -------------------------------------------------------------
  theme: {
    day: {
      skyColor: 0xd8e5ed,
      fogColor: 0xd8e5ed,
      fogNear: 150,
      fogFar: 360,
      ambientColor: 0xffffff,
      ambientIntensity: 0.75,
      sunColor: 0xfff6e5,
      sunIntensity: 1.4,
      sunPosition: { x: 80, y: 120, z: 60 },
      groundColor: 0x1e272c,
      roadColor: 0x272d34,
      sidewalkColor: 0x3d464f,
      grassColor: 0x223028
    },
    night: {
      skyColor: 0x070b12,
      fogColor: 0x070b12,
      fogNear: 90,
      fogFar: 280,
      ambientColor: 0x1b2438,
      ambientIntensity: 0.35,
      sunColor: 0x4f6b99,
      sunIntensity: 0.3,
      sunPosition: { x: -40, y: 80, z: -30 },
      groundColor: 0x0b0f14,
      roadColor: 0x14181f,
      sidewalkColor: 0x1c222b,
      grassColor: 0x0d1612
    },
    markings: {
      dividerLine: 0xf3f4f6,
      stopLine: 0xffffff,
      zebraStrip: 0xffffff,
      schoolPaint: 0xf59e0b,      // Amber/yellow school zone surface marking
      curbColor: 0x64748b
    },
    signals: {
      poleColor: 0x18181b,
      housingColor: 0x09090b,
      colors: {
        red: 0xef4444,
        yellow: 0xf59e0b,
        green: 0x10b981
      },
      emissiveIntensityActive: 3.5,
      emissiveIntensityInactive: 0.08
    }
  },

  // -------------------------------------------------------------
  // 3. Camera Presets
  // -------------------------------------------------------------
  cameras: {
    topDown: {
      position: { x: 0, y: 140, z: 0.01 },
      target: { x: 0, y: 0, z: 0 },
      fov: 48
    },
    isometric: {
      position: { x: 0, y: 92, z: 125 },
      target: { x: 0, y: 0, z: 0 },
      fov: 45
    },
    school: {
      position: { x: 92, y: 15, z: -16 },
      target: { x: 85, y: 2, z: -35 },
      fov: 50
    }
  },

  // -------------------------------------------------------------
  // 4. Signal Timers & Controller Parameters (4 Single-Arm Phases: N, E, S, W)
  // -------------------------------------------------------------
  controllers: {
    // Clearance intervals between all green phases
    clearance: {
      yellowDuration: 3.0,        // 3s Yellow transition
      allRedDuration: 2.0         // 2s All-Red intersection clearance
    },

    // Fixed Baseline Controller (Order: N -> E -> S -> W, 20s each, cycle ~100s)
    fixed: {
      defaultArmGreen: 20.0,
      phaseOrder: ['N', 'E', 'S', 'W']
    },

    // Time-of-Day (TOD) Baseline Controller
    timeOfDay: {
      schoolArmGreen: 35.0,       // School arm (North) gets 35s during school hours
      otherArmGreen: 15.0,        // Other arms get 15s during school hours
      normalArmGreen: 20.0,       // 20s each otherwise
      phaseOrder: ['N', 'E', 'S', 'W']
    },

    // 4-Phase Single-Arm Adaptive Controller
    adaptive: {
      baseGreen: 8.0,             // Base green: 8s
      k: 2.0,                     // Green per queued vehicle: 2s/veh
      minGreen: 8.0,              // Minimum green clamp: 8s
      maxGreen: 45.0,             // Maximum green clamp: 45s
      starvationLimit: 120.0,     // Max wait time before forced service: 120s
      schoolWeight: 1.5,          // 1.5x queue weight for North school arm
      emergencyDistance: 60.0,    // Detection trigger radius for ambulance preemption (meters)
      queueZoneDistance: 40.0,    // Zone from stop line considered queued if speed < 0.5 m/s (meters)
      obstructionDuration: 20.0,  // Stoppage duration outside queue zone to flag obstruction (seconds)
      obstructionThresholdDistance: 42.0 // Beyond this distance from stop line, stopped vehicle = obstruction
    }
  },

  // -------------------------------------------------------------
  // 5. Vehicle Classes & Physical Properties
  // -------------------------------------------------------------
  vehicles: {
    types: {
      twoWheeler: {
        share: 0.50,
        length: 1.9,
        width: 0.8,
        height: 1.3,
        maxSpeed: 11.5,           // ~41 km/h (m/s)
        acceleration: 3.2,        // m/s^2 (agile acceleration)
        color: 0x06b6d4,          // Cyan
        name: 'Two-wheeler'
      },
      car: {
        share: 0.30,
        length: 4.2,
        width: 1.8,
        height: 1.45,
        maxSpeed: 13.0,           // ~47 km/h (m/s)
        acceleration: 2.2,        // m/s^2
        color: 0x3b82f6,          // Sapphire Blue
        name: 'Car'
      },
      autoRickshaw: {
        share: 0.08,
        length: 2.7,
        width: 1.3,
        height: 1.7,
        maxSpeed: 9.5,            // ~34 km/h (m/s)
        acceleration: 2.0,
        color: 0xeab308,          // Yellow-green auto
        name: 'Auto-rickshaw'
      },
      bus: {
        share: 0.06,
        length: 9.6,
        width: 2.4,
        height: 3.1,
        maxSpeed: 8.5,            // ~30 km/h (m/s)
        acceleration: 1.1,        // Slower acceleration
        color: 0xf97316,          // Orange transit bus
        name: 'Bus'
      },
      truck: {
        share: 0.06,
        length: 8.2,
        width: 2.3,
        height: 2.8,
        maxSpeed: 8.0,
        acceleration: 1.0,
        color: 0x64748b,          // Slate commercial truck
        name: 'Truck'
      },
      ambulance: {
        share: 0.0,               // Event triggered only
        length: 5.4,
        width: 2.1,
        height: 2.3,
        maxSpeed: 15.5,           // ~56 km/h (high priority)
        acceleration: 3.0,
        color: 0xf8fafc,          // Pure white
        name: 'Ambulance'
      }
    },
    physics: {
      minGap: 1.8,                // Minimum standstill gap between vehicles (meters)
      safeTimeHeadway: 1.2,       // Desired time headway T (seconds)
      comfortableDecel: 2.4,      // Comfortable deceleration b (m/s^2)
      emergencyDecel: 5.0,        // Emergency stopping max deceleration (m/s^2)
      waitSpeedThreshold: 0.5     // Below this speed (m/s), vehicle is accumulating waiting time
    }
  },

  // -------------------------------------------------------------
  // 6. Pedestrians
  // -------------------------------------------------------------
  pedestrians: {
    walkingSpeed: 1.3,            // Average crossing speed (m/s)
    capsuleRadius: 0.25,
    capsuleHeight: 1.6,
    crossDuration: 6.0            // Base seconds to cross 7.2m road
  },

  // -------------------------------------------------------------
  // 7. Scenarios & Inbound Demand Rates (Vehicles Per Minute)
  // -------------------------------------------------------------
  scenarios: {
    normalDay: {
      id: 'normalDay',
      name: 'Normal Day',
      description: 'Balanced daylight urban flow',
      rates: { N: 8, E: 8, S: 8, W: 8 },
      schoolPedestrians: false,
      isNight: false,
      durationSec: 300
    },
    schoolMorning: {
      id: 'schoolMorning',
      name: 'School Morning',
      description: 'Heavy Northbound flow toward school + high pedestrian activity',
      rates: { N: 6, E: 8, S: 24, W: 8 },
      schoolPedestrians: true,
      isNight: false,
      durationSec: 300
    },
    marketPeak: {
      id: 'marketPeak',
      name: 'Market Peak',
      description: 'Heavy East-West commercial flow with dense two-wheelers',
      rates: { N: 10, E: 20, S: 10, W: 20 },
      schoolPedestrians: false,
      isNight: false,
      durationSec: 300
    },
    night: {
      id: 'night',
      name: 'Night (1-2 AM)',
      description: 'Sparse traffic with demand-actuated green lights',
      rates: { N: 1, E: 1, S: 1, W: 1 },
      schoolPedestrians: false,
      isNight: true,
      durationSec: 300
    },
    ambulanceEvent: {
      id: 'ambulanceEvent',
      name: 'Ambulance Event',
      description: 'Emergency vehicle arrival on West arm at t = 60s',
      rates: { N: 8, E: 8, S: 8, W: 8 },
      schoolPedestrians: false,
      isNight: false,
      durationSec: 300,
      emergencySpawn: { arm: 'W', timeSec: 60 }
    }
  },

  // -------------------------------------------------------------
  // 8. Simulation Engine Timing
  // -------------------------------------------------------------
  sim: {
    timeStep: 0.05,               // 20 Hz fixed timestep (1/20s)
    speedMultipliers: [1, 5, 20],
    defaultSeed: 42,
    batchSeedsCount: 10           // 10 seeds evaluated per scenario for mean & spread
  },

  // -------------------------------------------------------------
  // 9. Camera Vision Layer (Simulated Detector)
  // -------------------------------------------------------------
  vision: {
    detectionRange: 60.0,         // Detection zone up to 60m from stop line
    missRate: 0.05,               // Default 5% false-negative rate
    falsePositiveRate: 0.0,       // Default 0% false-positive rate
    latency: 0.2,                 // Latency buffer (seconds)
    updateRate: 10,               // Detector update rate: 10 Hz (every 100ms)
    dayConfidenceMin: 0.86,       // Daytime confidence range
    dayConfidenceMax: 0.98,
    nightConfidenceMin: 0.65,     // Reduced confidence at night
    nightConfidenceMax: 0.82,
    cameraHeight: 5.2,            // Height of pole mount in meters
    cameraFov: 50,                // Camera lens field of view (degrees)
    cameraPitch: -20,             // Tilt down angle (degrees)
    colors: {
      twoWheeler: '#f59e0b',      // Amber
      car: '#38bdf8',             // Sky blue
      autoRickshaw: '#c084fc',    // Purple
      bus: '#10b981',             // Emerald
      truck: '#fb923c',           // Orange
      ambulance: '#ef4444'        // Red
    }
  }
};
