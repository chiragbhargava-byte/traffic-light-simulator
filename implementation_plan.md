# Implementation Plan: 3D Adaptive Traffic Signal Simulator

**Project:** SFIC 2026 — PS000073 (Navsari Municipal Corporation)  
**Objective:** AI-Based Smart Traffic Monitoring & Adaptive Traffic Management Simulator  
**Core Thesis:** Prove in an interactive 3D browser scene (side-by-side split view) that adaptive signal control substantially reduces vehicle wait time and stops compared to fixed-timer signals under identical traffic arrival conditions.

---

## 1. System Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────────────────────┐
│                          HTML5 & HUD UI Layer                          │
│   Top Controls  │  Left/Right Metrics HUD  │  Alerts  │  Chart.js Modal│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                       Simulation Orchestrator                          │
│   • Timestep accumulator (dt = 0.05s, 1x/5x/20x speed multiplier)       │
│   • Seeded PRNG (Mulberry32 / LCG) for identical vehicle streams       │
│   • Active Scenario manager (rates, school weight, night mode)         │
│   • Batch headless runner for "Run All Scenarios"                      │
└───────────────┬────────────────────────────────────────┬───────────────┘
                │                                        │
┌───────────────▼────────────────┐      ┌────────────────▼───────────────┐
│       Left Junction (FIXED)     │      │     Right Junction (ADAPTIVE)  │
│ • Fixed 30s NS / 30s EW timer  │      │ • Dynamic queue estimation     │
│ • Vehicle car-following (IDM)  │      │ • Formula: base + k * queue    │
│ • Fixed metrics accumulator    │      │ • Emergency & School priority  │
│                                │      │ • Night demand-actuation       │
│                                │      │ • Obstruction filtering        │
└───────────────┬────────────────┘      └────────────────┬───────────────┘
                │                                        │
┌───────────────▼────────────────────────────────────────▼───────────────┐
│                         Three.js 3D Viewport                           │
│   • Procedural roads, stop lines, zebra crossings, signal poles/LEDs   │
│   • Procedural vehicle models (Two-wheeler, Car, Auto, Bus, Truck, EMS)│
│   • Low-poly school building, sign, ground, trees, environment boxes   │
│   • Day / Night dynamic lighting & vehicle headlights                  │
│   • Camera presets (Top-down, Isometric, School-level) + OrbitControls │
└────────────────────────────────────────────────────────────────────────┘
```

- **Bundler & Build Tool:** Vite (Vanilla JavaScript / ES Modules).
- **3D Graphics:** Three.js (r160+) + `OrbitControls`.
- **Procedural Only:** 100% procedural Three.js geometries (`BoxGeometry`, `CylinderGeometry`, `ExtrudeGeometry`, emissive materials). Zero external glTF/textures/CDN requests.
- **Charts & Export:** Chart.js (bundled via npm) for side-by-side grouped bar charts + CSV exporter + Canvas PNG exporter.
- **Central Configuration:** Single source of truth in `src/config.js` with documented parameters.

---

## 2. Directory & Module Structure

```
d:/Traffic light/
├── index.html                  # Main application entry point & HUD UI layout
├── package.json                # Dependencies: three, chart.js, vite
├── vite.config.js              # Vite local server & build configuration
├── src/
│   ├── main.js                 # App bootstrap, animation loop, camera presets, event wiring
│   ├── config.js               # All tunable constants, timings, vehicle sizes, physics params
│   ├── utils/
│   │   ├── prng.js             # Seeded random number generator (Mulberry32)
│   │   └── math.js             # Clamping, interpolation, coordinate helpers
│   ├── scene/
│   │   ├── sceneManager.js     # Three.js Scene, Camera, WebGLRenderer, OrbitControls, Lighting
│   │   ├── roadBuilder.js      # Procedural road meshes, lanes, zebra crossings, stop lines
│   │   ├── propBuilder.js      # School building, school zone road paint, trees, perimeter boxes
│   │   ├── signalMesh.js       # Traffic signal poles with emissive Red/Yellow/Green LED meshes
│   │   ├── vehicleModels.js    # Procedural 3D compound meshes for 6 vehicle types
│   │   └── pedestrianModels.js # Low-poly capsule pedestrians
│   ├── sim/
│   │   ├── simulationEngine.js # Fixed-step physics runner (dt = 0.05s) with speed multipliers
│   │   ├── junction.js         # Single junction logic: lanes, stop lines, vehicle queues, signals
│   │   ├── carFollowing.js     # Intelligent Driver Model (IDM) & safe braking logic
│   │   ├── spawner.js          # Synchronized Poisson arrival generator using seeded PRNG
│   │   ├── pedestrianSim.js    # Curb-waiting & crosswalk movement
│   │   └── metricsTracker.js   # Average wait time, queue lengths, stops, throughput
│   ├── controllers/
│   │   ├── fixedController.js  # 30s NS / 30s EW cycle with 3s yellow + 2s all-red
│   │   └── adaptiveController.js# Fully documented 6-priority adaptive rule engine & decision explainer
│   └── ui/
│       ├── hud.js              # Top bar, side-by-side metrics badges, decision text, alerts
│       ├── chartModal.js       # Chart.js modal for "Run All Scenarios", CSV export, PNG download
│       └── style.css           # Glassmorphism dark-theme styling for HUD and controls
└── README.md                   # Complete documentation, setup guide, and defense points for judges
```

---

## 3. Core Physics & Simulation Specification

1. **Timestep:**
   - Fixed `dt = 0.05s` (20 Hz).
   - Speed multipliers: `1x`, `5x`, `20x` (executes 1, 5, or 20 internal sub-steps per animation frame).
2. **Car-Following Behavior (Intelligent Driver Model / Newell-style Car Following):**
   - Acceleration towards free speed $v_{\text{max}}$.
   - Safe headway distance $s^* = s_0 + v \cdot T + \frac{v \cdot \Delta v}{2 \sqrt{a \cdot b}}$.
   - Deceleration when approaching leader or red/yellow stop line (if safe stopping distance allows).
3. **Identical Twin Traffic (Deterministic Seeded PRNG):**
   - A single seeded PRNG generates vehicle arrival times, vehicle types, speed profiles, and destination paths.
   - Exact duplicate vehicle instances are injected into both the Fixed (Left) and Adaptive (Right) junctions at the exact same simulation second.
4. **Pedestrian Simulation:**
   - Wait at curb during vehicle green phases; cross along zebra crossings when pedestrian phase is active or vehicle phase is red.
   - Extended wait during School scenario when > 5 pedestrians accumulate.

---

## 4. Adaptive Signal Controller Logic (`src/controllers/adaptiveController.js`)

Heavily commented rules evaluated strictly in order of priority:
1. **Priority 1: Emergency Preemption**
   - If an ambulance is detected within 60 m of the inbound stop line, immediately trigger clearance sequence (Yellow $\to$ All-Red if needed) or hold the green for that arm until the ambulance passes the stop line.
2. **Priority 2: Dynamic Green Calculation**
   - Formula:
     $$\text{green\_time} = \operatorname{clamp}(\text{base} + k \times \text{queue\_count}, \;\text{min\_green}, \;\text{max\_green})$$
   - Default tunable config: $\text{base} = 10\text{ s}$, $k = 2\text{ s/veh}$, $\text{min\_green} = 8\text{ s}$, $\text{max\_green} = 60\text{ s}$.
3. **Priority 3: Next Phase Selection & Starvation Prevention**
   - Compare queue sizes of NS vs EW. Phase with higher backlog receives priority, capped by a hard starvation limit (e.g. 90 s max wait time for any halted phase).
4. **Priority 4: School Zone Prioritization**
   - In "School Morning" scenario, multiply the North arm queue weight by $1.5\times$ and extend pedestrian crossing time by $+6\text{ s}$ when $> 5$ pedestrians are waiting.
5. **Priority 5: Night Mode Demand Actuation**
   - When no vehicle is approaching the red arm, maintain green on the current arm without artificial cycle rotations. As soon as a vehicle arrives on the opposing arm, initiate immediate clearance and phase switch.
6. **Priority 6: Obstruction Awareness & Outlier Filtering**
   - Vehicles stopped for $> 20\text{ s}$ away from the queue front (e.g. illegally parked or stalled) are classified as obstructions, raising an alert and excluded from the green-time calculation so they don't artificially prolong green phases.
7. **Explainable AI Text:**
   - Real-time decision string shown in HUD, e.g.:
     `"NS green 34s = 10s base + 2s x 12 queued (School weight 1.5 applied)"`.

---

## 5. Milestone Breakdown & Delivery Sequence

We will implement and deliver the project milestone by milestone, pausing after each milestone for your testing and review:

### **Milestone 1: Static 3D Scene & Camera System**
- Initialize Vite project and dependencies (`three`, `chart.js`).
- Build side-by-side twin 4-way junctions (Left: Fixed, Right: Adaptive).
- Add procedural roads, lane lines, zebra crossings, stop lines, and 3-aspect signal poles with emissive red/yellow/green LEDs.
- Add North-arm low-poly School building, school zone sign, and painted road zone.
- Add ground plane, surrounding contextual building blocks, and trees.
- Setup OrbitControls and camera preset buttons (Top-down, Isometric, School-level view).
- *Deliverable:* Interactive static 3D world with dual junctions ready for simulation.

### **Milestone 2: Vehicles, Fixed Controller & Pedestrians**
- Implement `config.js` with all physical parameters, dimensions, and speed values.
- Build procedural 3D models for all 6 vehicle types (Two-wheeler, Car, Auto-rickshaw, Bus, Truck, Ambulance).
- Implement seeded Poisson vehicle spawner (`prng.js`).
- Implement car-following physics and stopping line collision logic.
- Implement Fixed 30s NS / 30s EW controller with 3s yellow and 2s all-red clearance.
- Add procedural capsule pedestrians crossing at zebra lines.
- *Deliverable:* Left junction fully operational with realistic flowing traffic and fixed timer cycling.

### **Milestone 3: Adaptive Controller, Live Metrics & Split HUD**
- Implement full 6-priority Adaptive Controller in `src/controllers/adaptiveController.js` with comprehensive explanatory comments.
- Bind adaptive logic to the Right junction using the identical seeded traffic stream.
- Implement live queue detection and floating 3D/2D arm queue badges.
- Implement real-time metrics engine:
  - Average waiting time per vehicle ($v < 0.5\text{ m/s}$).
  - Average & peak queue length.
  - Throughput (completed trips).
  - Stop count per vehicle.
- Build live comparison HUD with % improvement badge (`-X% wait time`).
- Display live plain-text controller decision explanation.
- *Deliverable:* Real-time dual junction comparison showing immediate adaptive performance superiority.

### **Milestone 4: Scenarios, Batch Runner & Chart.js Analytics**
- Implement 5 standard scenarios:
  1. *Normal day* (balanced 8 vpm/arm)
  2. *School morning* (heavy South-to-North flow, high school pedestrian density)
  3. *Market peak* (dense two-wheelers on EW)
  4. *Night (1–2 AM)* (sparse 1 vpm/arm, dark environment)
  5. *Ambulance event* (emergency vehicle at $t=60\text{ s}$)
- Implement "Run All Scenarios" batch runner (fast-forward / headless calculation of all 5 scenarios).
- Implement results modal with Chart.js grouped bar charts (Fixed vs Adaptive wait time).
- Add "Download CSV" and "Download Chart as PNG" buttons.
- *Deliverable:* Complete quantitative validation suite for judge presentation and report export.

### **Milestone 4b: Camera Vision Layer (Simulated Detector)**
- **Camera Mounts & Detection FOV Wedges**: Small CCTV camera meshes on each signal pole (one per arm) aimed down the inbound approach, with toggleable translucent 3D field-of-view wedges covering up to 60m detection zones.
- **Picture-in-Picture (PiP) Feeds**: Collapsible 4-feed panel rendering virtual `THREE.PerspectiveCamera` views at ~10 Hz to protect rendering frame rate.
- **Simulated Detector (`src/sim/virtualDetector.js`)**:
  - Implements clean `DetectorAdapter` interface for future real model (YOLOv8) replacement.
  - Generates detections: `{ id, type, bbox, confidence }` with 5% miss rate, 0.2s latency buffer, and lower night confidence.
  - Draws 2D colored bounding boxes, type tags, and confidence overlays on each feed canvas.
- **Simulation Wiring & Controller Integration**:
  - Adaptive controller `getQueueCount(arm)` reads from simulated detector output (stopped vehicles in zone).
  - UI toggle: `[📷 Simulated Detector] / [🟢 Ground Truth (Perfect)]`.
  - Live detection accuracy metric `(detected / actual)` per arm displayed in HUD.
- **Scenario Comparison Suite**:
  - Monte Carlo batch runner compares Adaptive with Simulated Detector against Adaptive with Ground Truth to quantitatively prove controller robustness under imperfect detection.
- *Deliverable:* Complete optical vision perception layer and PiP camera feed panel clearly labeled as "Simulated detector".

### **Milestone 5: Interactive Demos, Lighting, Polish & Judge Defense README**
- Add "Block Lane" button (simulates illegal parking / stalled vehicle, triggers obstruction alert and filters from queue calculation).
- Add "Spawn Ambulance" button (triggers emergency siren HUD and instant signal preemption).
- Add automatic Day/Night dynamic lighting and vehicle headlights.
- Performance optimization pass: object pooling, minimal draw calls, 60 FPS target verification.
- Write comprehensive `README.md` containing execution instructions, algorithmic explanations, and municipal defense notes for the judges.
- *Deliverable:* Finished, polished, self-contained application ready for evaluation.

### **Milestone 6: Real Navsari Context & OpenStreetMap Integration (Complete & Verified)**
- Bundled static OSM dataset at `src/data/navsari.json` containing real Navsari signal nodes, roads, and building polygons (zero runtime Overpass calls).
- 2D Leaflet map view listing candidate junctions from `highway=traffic_signals` with OpenStreetMap online tiles and full vector HTML5 `<canvas>` fallback when offline.
- Geodesic local meters projection centered on candidate junctions ($X = \text{East}$, $-Z = \text{North}$).
- Dynamic 3D extrusion of real building footprints (`building=*`) within 150m radius around both twin junctions.
- 3D floating street name signboards on the 4 arms populated from authentic OpenStreetMap road names.
- Mandatory "© OpenStreetMap contributors" attribution.
- Maintained idealized 4-way intersection geometry for pure, uncorrupted traffic physics and controller comparison.
- *Deliverable:* Geospatially grounded digital twin with 2D Leaflet/Canvas map and 3D extruded Navsari urban context.

---

## 6. Review & Verification

All 6 milestones are implemented, fully tested, and verified:
1. Milestone 1: Static Procedural 3D Scene & Camera System (Done)
2. Milestone 2: Vehicle Kinematics, IDM Car-Following & Fixed Baseline Controller (Done)
3. Milestone 3: 6-Priority AI Adaptive Signal Controller & Live Metrics HUD (Done)
4. Milestone 4: 5 Standard Scenarios, 10-Seed Monte Carlo Batch Runner & Analytics (Done)
5. Milestone 5: Interactive Demos, Dynamic Lighting & Municipal Defense Docs (Done)
6. Milestone 6: Real Navsari OpenStreetMap Context & 2D/3D Geospatial Projections (Done)
