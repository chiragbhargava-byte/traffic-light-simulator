import * as THREE from 'three';
import { CONFIG } from './config.js';
import { SceneManager } from './scene/sceneManager.js';
import { RoadBuilder } from './scene/roadBuilder.js';
import { PropBuilder } from './scene/propBuilder.js';
import { buildJunctionSignals } from './scene/signalMesh.js';
import { buildJunctionQueueBadges } from './scene/queueBadge.js';
import { TrafficSpawner } from './sim/spawner.js';
import { FixedController } from './controllers/fixedController.js';
import { AdaptiveController } from './controllers/adaptiveController.js';
import { JunctionSim } from './sim/junctionSim.js';
import { PedestrianSim } from './sim/pedestrianSim.js';
import { MetricsTracker } from './sim/metricsTracker.js';
import { BatchRunner } from './sim/batchRunner.js';
import { ChartModal } from './ui/chartModal.js';
import navsariDataRaw from './data/navsari.json';
import { OsmNavsariData } from './utils/osmParser.js';
import { OsmBuildingBuilder } from './scene/osmBuildingBuilder.js';
import { ArmLabels } from './scene/armLabels.js';
import { MapModal } from './ui/mapModal.js';
import { VirtualDetector } from './sim/virtualDetector.js';
import { CameraMounts } from './scene/cameraMounts.js';
import { CameraFeedsView } from './ui/cameraFeedsView.js';

class SimulatorApp {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.sceneManager = new SceneManager(this.container);

    this.roadBuilder = new RoadBuilder();
    this.propBuilder = new PropBuilder();
    this.osmData = new OsmNavsariData(navsariDataRaw);
    this.osmBuildingBuilder = new OsmBuildingBuilder();
    this.armLabels = new ArmLabels();
    this.activeJunction = this.osmData.junctions[0];
    this.mapModal = null;

    // Camera Vision Layer
    this.virtualDetector = new VirtualDetector();
    this.cameraMountsLeft = null;
    this.cameraMountsRight = null;
    this.cameraFeedsView = null;

    // Controllers
    this.currentBaseline = 'fixed30';
    this.leftController = new FixedController(this.currentBaseline);
    this.rightController = new AdaptiveController();

    // Spawner
    this.spawner = new TrafficSpawner(CONFIG.sim.defaultSeed);
    this.metricsTracker = new MetricsTracker();
    this.chartModal = new ChartModal();

    // Simulation components
    this.leftJunction = null;
    this.rightJunction = null;
    this.leftPedestrians = null;
    this.rightPedestrians = null;

    // Fixed timestep accumulator
    this.clock = new THREE.Clock();
    this.simTime = 0.0;
    this.accumulator = 0.0;
    this.fixedDt = CONFIG.sim.timeStep; // 0.05s (20 Hz)
    this.speedMultiplier = 1;
    this.isPaused = false;

    // HUD DOM references
    this.hud = {
      // Left Metrics
      leftAvgWait: document.getElementById('left-avg-wait'),
      leftThroughput: document.getElementById('left-throughput'),
      leftMaxQueue: document.getElementById('left-max-queue'),
      leftStops: document.getElementById('left-stops'),
      leftPhase: document.getElementById('left-phase'),
      baselineBadgeTag: document.getElementById('baseline-badge-tag'),
      baselineBadgeTitle: document.getElementById('baseline-badge-title'),
      baselinePlanText: document.getElementById('baseline-plan-text'),

      // Right Metrics
      rightAvgWait: document.getElementById('right-avg-wait'),
      rightThroughput: document.getElementById('right-throughput'),
      rightMaxQueue: document.getElementById('right-max-queue'),
      rightStops: document.getElementById('right-stops'),
      rightDetectorAcc: document.getElementById('right-detector-acc'),
      rightPhase: document.getElementById('right-phase'),
      decisionText: document.getElementById('decision-text'),

      // Comparison Badge & Alerts
      improvementVal: document.getElementById('improvement-val'),
      alertsContainer: document.getElementById('alerts-container'),
      statusPill: document.querySelector('.milestone-pill')
    };

    this.initScene();
    this.initControls();
    this.startLoop();
  }

  initScene() {
    // 1. Build roads & markings for both junctions
    this.roadBuilder.build(this.sceneManager.scene);

    // 2. Build environmental props (School buildings, trees, backdrop buildings)
    this.propBuilder.build(this.sceneManager.scene);

    // 3. Build 3-aspect signal poles & queue badges for Left Junction
    const leftSig = buildJunctionSignals(CONFIG.layout.junctionCenters.left);
    this.sceneManager.scene.add(leftSig.group);
    const leftB = buildJunctionQueueBadges(CONFIG.layout.junctionCenters.left, false);
    this.sceneManager.scene.add(leftB.group);

    // 4. Build 3-aspect signal poles & queue badges for Right Junction
    const rightSig = buildJunctionSignals(CONFIG.layout.junctionCenters.right);
    this.sceneManager.scene.add(rightSig.group);
    const rightB = buildJunctionQueueBadges(CONFIG.layout.junctionCenters.right, true);
    this.sceneManager.scene.add(rightB.group);

    // 5. Initialize Junction Simulation Coordinators
    this.leftJunction = new JunctionSim(
      this.sceneManager.scene,
      CONFIG.layout.junctionCenters.left,
      leftSig.signals,
      leftB.badges,
      this.leftController,
      'Left_Fixed'
    );

    this.rightJunction = new JunctionSim(
      this.sceneManager.scene,
      CONFIG.layout.junctionCenters.right,
      rightSig.signals,
      rightB.badges,
      this.rightController,
      'Right_Adaptive'
    );

    // 5b. Install Camera Mounts & Detection FOV Wedges
    this.cameraMountsLeft = new CameraMounts(CONFIG.layout.junctionCenters.left, 'Fixed');
    this.sceneManager.scene.add(this.cameraMountsLeft.group);

    this.cameraMountsRight = new CameraMounts(CONFIG.layout.junctionCenters.right, 'Adaptive');
    this.sceneManager.scene.add(this.cameraMountsRight.group);

    // Connect Simulated Detector to Right (Adaptive) Junction
    this.rightJunction.setDetector(this.virtualDetector);
    this.rightJunction.setDetectionMode('cameraDetector');

    // Picture-in-Picture Camera Feeds View
    this.cameraFeedsView = new CameraFeedsView(
      this.sceneManager,
      this.cameraMountsRight,
      this.virtualDetector,
      this.rightJunction
    );
    this.cameraFeedsView.setArmStreetNames(this.activeJunction.arms);

    // 6. Pedestrians
    this.leftPedestrians = new PedestrianSim(
      this.sceneManager.scene,
      CONFIG.layout.junctionCenters.left,
      false
    );
    this.rightPedestrians = new PedestrianSim(
      this.sceneManager.scene,
      CONFIG.layout.junctionCenters.right,
      true
    );
    this.leftJunction.setPedestrianSim(this.leftPedestrians);
    this.rightJunction.setPedestrianSim(this.rightPedestrians);

    // 7. Milestone 6: Load Real Navsari Context (3D Extruded Buildings & OSM Arm Signs)
    this.loadJunctionContext(this.activeJunction, false);

    if (this.hud.statusPill) {
      this.hud.statusPill.textContent = 'Camera Vision Layer Active: Simulated Detector (5% Miss Rate, 0.2s Latency) • PiP Feeds';
    }
  }

  initControls() {
    // Camera Presets
    const camButtons = document.querySelectorAll('.btn-camera');
    camButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        camButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const camKey = btn.dataset.cam;
        this.sceneManager.setCameraPreset(camKey);
      });
    });

    // Speed Multipliers
    const speedButtons = document.querySelectorAll('.btn-speed');
    speedButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        speedButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.speedMultiplier = parseInt(btn.dataset.speed, 10);
      });
    });

    // Play / Pause
    const playPauseBtn = document.getElementById('btn-play-pause');
    playPauseBtn.addEventListener('click', () => {
      this.isPaused = !this.isPaused;
      playPauseBtn.textContent = this.isPaused ? 'Play' : 'Pause';
      playPauseBtn.classList.toggle('btn-primary', !this.isPaused);
    });

    // Scenario Dropdown
    const scenarioSelect = document.getElementById('scenario-select');
    scenarioSelect.addEventListener('change', (e) => {
      const scenarioKey = e.target.value;
      const scenario = CONFIG.scenarios[scenarioKey];
      if (scenario) {
        this.sceneManager.setDayNight(scenario.isNight);
        this.propBuilder.setNight(scenario.isNight);
        this.spawner.setScenario(scenarioKey);
        this.leftController.setScenario(scenarioKey);
        this.rightController.setScenario(scenarioKey);
        this.resetSimulation();
      }
    });

    // Baseline Selector (Fixed 30/30 vs Time-of-Day Plan)
    const baselineSelect = document.getElementById('baseline-select');
    if (baselineSelect) {
      baselineSelect.addEventListener('change', (e) => {
        this.currentBaseline = e.target.value;
        this.leftController.setMode(this.currentBaseline);

        if (this.currentBaseline === 'fixed30') {
          this.hud.baselineBadgeTag.textContent = 'Baseline 1';
          this.hud.baselineBadgeTitle.textContent = 'FIXED 4-PHASE (20s per arm)';
          if (this.hud.baselinePlanText) {
            this.hud.baselinePlanText.textContent = this.leftController.getPlanSummary();
          }
        } else {
          this.hud.baselineBadgeTag.textContent = 'Baseline 2';
          this.hud.baselineBadgeTitle.textContent = 'TIME-OF-DAY 4-PHASE';
          if (this.hud.baselinePlanText) {
            this.hud.baselinePlanText.textContent = this.leftController.getPlanSummary();
          }
        }
        this.resetSimulation();
      });
    }

    // Detector Source Selector (Simulated Detector vs Ground Truth)
    const detectorSourceSelect = document.getElementById('detector-source-select');
    if (detectorSourceSelect) {
      detectorSourceSelect.addEventListener('change', (e) => {
        const mode = e.target.value;
        this.rightJunction.setDetectionMode(mode);
        if (this.hud.statusPill) {
          this.hud.statusPill.textContent = mode === 'cameraDetector'
            ? 'Camera Vision Active: Simulated Detector (5% Miss, 0.2s Latency) • PiP Feeds'
            : 'Ground Truth Active: Perfect Queue Measurement';
        }
      });
    }

    // Seed Input
    const seedInput = document.getElementById('input-seed');
    seedInput.addEventListener('change', (e) => {
      const seedVal = parseInt(e.target.value, 10) || 42;
      this.spawner.setSeed(seedVal);
      this.resetSimulation();
    });

    // Reset button
    const resetBtn = document.getElementById('btn-reset');
    resetBtn.addEventListener('click', () => {
      this.resetSimulation();
    });

    // Action: Spawn Ambulance
    const btnAmbulance = document.getElementById('btn-spawn-ambulance');
    if (btnAmbulance) {
      btnAmbulance.addEventListener('click', () => {
        const desc = this.spawner.triggerEmergency('W');
        this.leftJunction.spawnVehicle(desc);
        this.rightJunction.spawnVehicle(desc);
      });
    }

    // Action: Block Lane (Obstruction Demo)
    const btnBlock = document.getElementById('btn-block-lane');
    if (btnBlock) {
      btnBlock.addEventListener('click', () => {
        this.triggerObstructionDemo();
      });
    }

    // Action: Run All Scenarios Batch Runner (10 Seeds Monte Carlo)
    const btnRunAll = document.getElementById('btn-run-all');
    if (btnRunAll) {
      btnRunAll.addEventListener('click', async () => {
        const wasPaused = this.isPaused;
        this.isPaused = true; // Pause 3D animation while running batch
        this.chartModal.showProgress();

        try {
          const results = await BatchRunner.runAll((pct, status) => {
            this.chartModal.updateProgress(pct, status);
          });
          this.chartModal.hideProgress();
          this.chartModal.show(results);
        } catch (err) {
          console.error('Batch runner error:', err);
          this.chartModal.hideProgress();
        } finally {
          this.isPaused = wasPaused;
        }
      });
    }

    // Milestone 6: Open 2D Leaflet / Canvas Map Modal
    this.mapModal = new MapModal(this.osmData, (selectedJunction) => {
      this.loadJunctionContext(selectedJunction, true);
    });

    const btnOpenMap = document.getElementById('btn-open-map');
    if (btnOpenMap) {
      btnOpenMap.addEventListener('click', () => {
        this.mapModal.show();
      });
    }
  }

  /**
   * Loads real Navsari OpenStreetMap context into the 3D scene:
   * - Extrudes real buildings (building=*) within 150m of candidate junction
   * - Updates 3D arm signboards with authentic OSM street names
   * - Updates HUD street names and active junction indicator
   */
  loadJunctionContext(junction, showNotification = true) {
    if (!junction) return;
    this.activeJunction = junction;

    // 1. Query buildings within 150m
    const buildings = this.osmData.getBuildingsNearJunction(junction.id, 150.0);

    // 2. Extrude in 3D around twin junctions
    this.osmBuildingBuilder.rebuild(this.sceneManager.scene, buildings);

    // 3. Update 3D Arm Signboards
    this.armLabels.update(this.sceneManager.scene, junction.arms);

    // Update Camera Feeds Arm Street Names
    if (this.cameraFeedsView) {
      this.cameraFeedsView.setArmStreetNames(junction.arms);
    }

    // 4. Update HUD badges & road strip
    const activeJuncEl = document.getElementById('active-junction-name');
    if (activeJuncEl) activeJuncEl.textContent = junction.name;

    const armN = document.getElementById('osm-arm-n');
    const armS = document.getElementById('osm-arm-s');
    const armE = document.getElementById('osm-arm-e');
    const armW = document.getElementById('osm-arm-w');
    if (armN) armN.textContent = junction.arms.N;
    if (armS) armS.textContent = junction.arms.S;
    if (armE) armE.textContent = junction.arms.E;
    if (armW) armW.textContent = junction.arms.W;

    // 5. Visual Notification in alerts container
    if (showNotification && this.hud.alertsContainer) {
      const banner = document.createElement('div');
      banner.className = 'alert-banner';
      banner.style.borderLeftColor = '#0ea5e9';
      banner.style.background = 'rgba(2, 132, 199, 0.25)';
      banner.innerHTML = `
        <span class="alert-icon">📍</span>
        <span class="alert-text"><b>Loaded OSM Context:</b> ${junction.name} (${junction.lat.toFixed(4)}°N, ${junction.lon.toFixed(4)}°E) • ${buildings.length} buildings within 150m extruded in 3D</span>
      `;
      this.hud.alertsContainer.appendChild(banner);
      setTimeout(() => banner.remove(), 6000);
    }
  }

  triggerObstructionDemo() {
    // Pick or spawn a stalled vehicle on Arm E of Right junction for 60 seconds
    const rightList = this.rightJunction.vehiclesByArm['E'];
    if (rightList && rightList.length > 0) {
      const target = rightList[rightList.length - 1];
      target.isObstruction = true;
      target.stoppedDuration = 22.0; // Immediately exceeds 20s obstruction threshold
      target.obstructionTimer = 60.0; // Stays blocked for 60 seconds as specified
      target.speed = 0;
    } else {
      // Spawn a stalled car directly on Arm E at distance 20m
      const desc = {
        id: ++this.spawner.vehicleCounter,
        typeKey: 'car',
        arm: 'E',
        spawnTime: this.simTime,
        initialSpeed: 0
      };
      this.rightJunction.spawnVehicle(desc);
      const spawned = this.rightJunction.vehiclesByArm['E'].find(v => v.id === desc.id);
      if (spawned) {
        spawned.dist = 20.0; // Positioned away from stop line (distToStop > 42m)
        spawned.isObstruction = true;
        spawned.stoppedDuration = 22.0;
        spawned.obstructionTimer = 60.0;
        spawned.speed = 0;
      }
    }
  }

  resetSimulation() {
    this.simTime = 0.0;
    this.accumulator = 0.0;
    this.spawner.reset();
    this.virtualDetector.reset();
    this.leftJunction.reset();
    this.rightJunction.reset();
    this.leftPedestrians.initPedestrians();
    this.rightPedestrians.initPedestrians();
    this.metricsTracker.reset();
    this.updateHUD();
  }

  /**
   * Fixed-timestep physics step (20 Hz, dt = 0.05s).
   */
  stepSimulation(dt) {
    this.simTime += dt;

    // 1. Spawner generates deterministic traffic arrivals (Identical for both junctions)
    const newVehicles = this.spawner.update(dt);
    newVehicles.forEach(v => {
      this.leftJunction.spawnVehicle(v);
      this.rightJunction.spawnVehicle(v);
    });

    // 2. Step Signal Controllers
    const leftAspects = this.leftJunction.updateSignals(dt);
    const rightAspects = this.rightJunction.updateSignals(dt);

    // 3. Step Vehicle Kinematics & Car-Following
    this.leftJunction.updateVehicles(dt, this.simTime);
    this.rightJunction.updateVehicles(dt, this.simTime);

    // 3b. Step Simulated Camera Detector & PiP Feeds
    const scenario = CONFIG.scenarios[this.spawner.currentScenario];
    const isNight = scenario ? !!scenario.isNight : false;
    this.virtualDetector.update(
      dt,
      this.simTime,
      this.rightJunction,
      isNight,
      this.cameraMountsRight ? this.cameraMountsRight.cameras : null
    );

    if (this.cameraFeedsView) {
      this.cameraFeedsView.update(this.simTime);
    }

    // 4. Step Pedestrians
    this.leftPedestrians.update(dt, leftAspects);
    this.rightPedestrians.update(dt, rightAspects);

    // 5. Update Metrics Tracker
    this.metricsTracker.update(this.leftJunction, this.rightJunction);

    // 6. Update HUD display
    this.updateHUD();
  }

  updateHUD() {
    const snap = this.metricsTracker.getSnapshot();

    // Left Metrics
    if (this.hud.leftAvgWait) this.hud.leftAvgWait.textContent = `${snap.left.avgWait.toFixed(1)}s`;
    if (this.hud.leftThroughput) this.hud.leftThroughput.textContent = `${snap.left.completedCount}`;
    if (this.hud.leftMaxQueue) this.hud.leftMaxQueue.textContent = `${snap.left.maxQueue}`;
    if (this.hud.leftStops) this.hud.leftStops.textContent = `${snap.left.stopsPerVeh.toFixed(1)}`;

    const lp = this.leftController.phase.replace('_', ' ');
    if (this.hud.leftPhase) {
      this.hud.leftPhase.textContent = lp;
      this.hud.leftPhase.style.color = lp.includes('YELLOW') ? '#f59e0b' : (lp.includes('RED') ? '#ef4444' : '#10b981');
    }

    // Right Metrics
    if (this.hud.rightAvgWait) this.hud.rightAvgWait.textContent = `${snap.right.avgWait.toFixed(1)}s`;
    if (this.hud.rightThroughput) this.hud.rightThroughput.textContent = `${snap.right.completedCount}`;
    if (this.hud.rightMaxQueue) this.hud.rightMaxQueue.textContent = `${snap.right.maxQueue}`;
    if (this.hud.rightStops) this.hud.rightStops.textContent = `${snap.right.stopsPerVeh.toFixed(1)}`;

    // Live Detection Accuracy Metric
    if (this.hud.rightDetectorAcc) {
      let totalAcc = 0;
      let totalDet = 0;
      let totalAct = 0;
      ['N', 'S', 'E', 'W'].forEach(arm => {
        const acc = this.rightJunction.getDetectionAccuracy(arm);
        totalDet += acc.detected;
        totalAct += acc.actual;
        totalAcc += acc.accuracyPct;
      });
      const avgAcc = (totalAcc / 4).toFixed(0);
      this.hud.rightDetectorAcc.textContent = `${avgAcc}% (${totalDet}/${totalAct})`;
      this.hud.rightDetectorAcc.style.color = avgAcc >= 90 ? '#10b981' : '#f59e0b';
    }

    const rp = this.rightController.phase.replace('_', ' ');
    if (this.hud.rightPhase) {
      this.hud.rightPhase.textContent = rp;
      this.hud.rightPhase.style.color = rp.includes('YELLOW') ? '#f59e0b' : (rp.includes('RED') ? '#ef4444' : '#10b981');
    }

    // Controller Decision Text
    if (this.hud.decisionText) {
      this.hud.decisionText.textContent = this.rightController.decisionText;
    }

    // Wait Time Improvement Badge
    if (this.hud.improvementVal) {
      const waitRed = snap.improvement.waitTimeReductionPercent;
      if (snap.left.completedCount >= 2 && Math.abs(waitRed) > 0.1) {
        const sign = waitRed >= 0 ? '-' : '+';
        this.hud.improvementVal.textContent = `${sign}${Math.abs(waitRed).toFixed(1)}%`;
        this.hud.improvementVal.style.color = waitRed >= 0 ? '#34d399' : '#f87171';
      } else {
        this.hud.improvementVal.textContent = '--%';
        this.hud.improvementVal.style.color = '#94a3b8';
      }
    }

    // Alerts Banner
    if (this.hud.alertsContainer) {
      const alerts = this.rightController.activeAlerts;
      if (alerts.length === 0) {
        this.hud.alertsContainer.innerHTML = '';
      } else {
        this.hud.alertsContainer.innerHTML = alerts.map(a => {
          let cls = 'alert-congestion';
          if (a.includes('EMERGENCY')) cls = 'alert-emergency';
          else if (a.includes('OBSTRUCTION')) cls = 'alert-obstruction';
          return `<div class="alert-toast ${cls}">${a}</div>`;
        }).join('');
      }
    }
  }

  startLoop() {
    const animate = () => {
      requestAnimationFrame(animate);

      const frameDelta = Math.min(this.clock.getDelta(), 0.1);

      if (!this.isPaused) {
        this.accumulator += frameDelta * this.speedMultiplier;

        let steps = 0;
        const maxStepsPerFrame = 60;
        while (this.accumulator >= this.fixedDt && steps < maxStepsPerFrame) {
          this.stepSimulation(this.fixedDt);
          this.accumulator -= this.fixedDt;
          steps++;
        }
      }

      this.sceneManager.update(frameDelta);
      this.sceneManager.render();
    };

    requestAnimationFrame(animate);
  }
}

// Bootstrap on DOM loaded
window.addEventListener('DOMContentLoaded', () => {
  window.app = new SimulatorApp();
});
