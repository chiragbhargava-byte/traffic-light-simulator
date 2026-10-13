import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * CameraFeedsView - Picture-in-Picture Vision Feeds Panel
 * Renders 4 virtual camera feeds (North, South, East, West) at ~10 Hz
 * with 2D bounding boxes, confidence tags, vehicle counts, and simulated detector labels.
 */
export class CameraFeedsView {
  constructor(sceneManager, cameraMounts, virtualDetector, junctionSim) {
    this.sceneManager = sceneManager;
    this.cameraMounts = cameraMounts;
    this.detector = virtualDetector;
    this.junctionSim = junctionSim;

    this.isOpen = false;
    this.lastRenderTime = 0;
    this.renderInterval = 0.1; // ~10 Hz (every 100ms)

    this.arms = ['N', 'S', 'E', 'W'];
    this.armLabels = {
      N: 'Cam N (North Inbound)',
      S: 'Cam S (South Inbound)',
      E: 'Cam E (East Inbound)',
      W: 'Cam W (West Inbound)'
    };

    this.initDOM();
  }

  initDOM() {
    this.panelEl = document.getElementById('camera-feeds-panel');
    this.toggleBtn = document.getElementById('btn-toggle-camera-feeds');
    this.closeBtn = document.getElementById('btn-close-camera-feeds');
    this.btnToggleFov = document.getElementById('btn-toggle-fov');
    this.pipCanvas = document.getElementById('pip-webgl-canvas');
    this.statusEl = document.getElementById('pip-status-info');

    // Overlay 2D canvases per arm
    this.overlayCanvases = {
      N: document.getElementById('feed-overlay-n'),
      S: document.getElementById('feed-overlay-s'),
      E: document.getElementById('feed-overlay-e'),
      W: document.getElementById('feed-overlay-w')
    };

    // Count badges per arm
    this.countBadges = {
      N: document.getElementById('feed-count-n'),
      S: document.getElementById('feed-count-s'),
      E: document.getElementById('feed-count-e'),
      W: document.getElementById('feed-count-w')
    };

    // Accuracy badges per arm
    this.accBadges = {
      N: document.getElementById('feed-acc-n'),
      S: document.getElementById('feed-acc-s'),
      E: document.getElementById('feed-acc-e'),
      W: document.getElementById('feed-acc-w')
    };

    if (this.toggleBtn) {
      this.toggleBtn.addEventListener('click', () => this.toggle());
    }

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.hide());
    }

    if (this.btnToggleFov) {
      this.btnToggleFov.addEventListener('click', () => {
        const isVis = this.cameraMounts.toggleFov();
        this.btnToggleFov.textContent = isVis ? '👁️ FOV Wedges: ON' : '👁️ FOV Wedges: OFF';
        this.btnToggleFov.classList.toggle('active', isVis);
      });
    }

    // Set fixed pixel resolution for PIP canvas
    if (this.pipCanvas) {
      this.pipCanvas.width = 960; // 4 feeds x 240px width
      this.pipCanvas.height = 160;
    }
  }

  toggle() {
    if (this.isOpen) {
      this.hide();
    } else {
      this.show();
    }
  }

  show() {
    this.isOpen = true;
    if (this.panelEl) this.panelEl.style.display = 'flex';
    if (this.toggleBtn) this.toggleBtn.classList.add('active');
  }

  hide() {
    this.isOpen = false;
    if (this.panelEl) this.panelEl.style.display = 'none';
    if (this.toggleBtn) this.toggleBtn.classList.remove('active');
  }

  /**
   * Main render tick called by main animation loop.
   * Throttled to ~10 Hz and only runs when panel is open.
   */
  update(simTime) {
    if (!this.isOpen) return;

    if (simTime - this.lastRenderTime >= this.renderInterval) {
      this.lastRenderTime = simTime;
      this.renderFeeds();
      this.renderBoundingBoxes();
    }
  }

  /**
   * Renders 4 virtual camera views into the single WebGL PiP canvas using viewport scissors.
   */
  renderFeeds() {
    if (!this.pipCanvas || !this.sceneManager) return;

    const renderer = this.sceneManager.renderer;
    const scene = this.sceneManager.scene;
    const cameras = this.cameraMounts.cameras;

    const fullW = this.pipCanvas.width;
    const fullH = this.pipCanvas.height;
    const feedW = fullW / 4; // 240px

    // Save main renderer viewport and scissor state
    const currentViewport = new THREE.Vector4();
    renderer.getViewport(currentViewport);
    const currentScissor = new THREE.Vector4();
    renderer.getScissor(currentScissor);
    const currentScissorTest = renderer.getScissorTest();

    // Render into pipCanvas context or main context
    // In Three.js we can render directly to the pipCanvas if pipRenderer exists,
    // or render offscreen to texture and draw to canvas.
    if (!this.pipRenderer) {
      this.pipRenderer = new THREE.WebGLRenderer({
        canvas: this.pipCanvas,
        antialias: false,
        powerPreference: 'low-power'
      });
      this.pipRenderer.setSize(fullW, fullH, false);
      this.pipRenderer.setClearColor(0x0f172a, 1);
    }

    // Render 4 feeds side-by-side: N, S, E, W
    this.pipRenderer.setScissorTest(true);

    this.arms.forEach((arm, idx) => {
      const cam = cameras[arm];
      if (!cam) return;

      const x = idx * feedW;
      const y = 0;

      this.pipRenderer.setViewport(x, y, feedW, fullH);
      this.pipRenderer.setScissor(x, y, feedW, fullH);
      this.pipRenderer.render(scene, cam);
    });

    this.pipRenderer.setScissorTest(false);
  }

  /**
   * Draws 2D bounding boxes and detector tags on the overlay canvases for each feed.
   */
  renderBoundingBoxes() {
    const feedW = 240;
    const feedH = 160;

    this.arms.forEach(arm => {
      const canvas = this.overlayCanvases[arm];
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, feedW, feedH);

      const detections = this.detector.getDetections(arm);
      const actualCount = this.junctionSim.getQueueCountGroundTruth
        ? this.junctionSim.getQueueCountGroundTruth(arm)
        : this.junctionSim.getQueueCount(arm);

      // 1. Draw crosshair / optic target in center
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(feedW / 2 - 10, feedH / 2);
      ctx.lineTo(feedW / 2 + 10, feedH / 2);
      ctx.moveTo(feedW / 2, feedH / 2 - 10);
      ctx.lineTo(feedW / 2, feedH / 2 + 10);
      ctx.stroke();

      // 2. Draw each detected bounding box
      let stoppedCount = 0;

      detections.forEach(d => {
        const bb = d.bbox;
        if (!bb || !bb.visible) return;

        if (d.isStopped) stoppedCount++;

        // Bounding box frame
        ctx.strokeStyle = d.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(bb.x, bb.y, bb.width, bb.height);

        // Corner bracket accents
        const cornerLen = Math.min(6, bb.width / 3);
        ctx.lineWidth = 3;
        ctx.beginPath();
        // Top-left
        ctx.moveTo(bb.x, bb.y + cornerLen);
        ctx.lineTo(bb.x, bb.y);
        ctx.lineTo(bb.x + cornerLen, bb.y);
        // Top-right
        ctx.moveTo(bb.x + bb.width - cornerLen, bb.y);
        ctx.lineTo(bb.x + bb.width, bb.y);
        ctx.lineTo(bb.x + bb.width, bb.y + cornerLen);
        ctx.stroke();

        // Label pill background
        const typeName = d.type.charAt(0).toUpperCase() + d.type.slice(1);
        const labelText = `${typeName} ${(d.confidence * 100).toFixed(0)}%`;
        ctx.font = 'bold 9px "Segoe UI", Inter, sans-serif';
        const textWidth = ctx.measureText(labelText).width;

        ctx.fillStyle = d.color;
        ctx.fillRect(bb.x - 1, Math.max(0, bb.y - 13), textWidth + 8, 13);

        // Text
        ctx.fillStyle = '#09090b';
        ctx.fillText(labelText, bb.x + 3, Math.max(9, bb.y - 3));

        // Stopped marker
        if (d.isStopped) {
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(bb.x + bb.width - 18, Math.max(0, bb.y - 13), 19, 13);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 8px Inter, sans-serif';
          ctx.fillText('STOP', bb.x + bb.width - 17, Math.max(9, bb.y - 3));
        }
      });

      // 3. Update HUD Badges per Arm
      if (this.countBadges[arm]) {
        this.countBadges[arm].textContent = `${stoppedCount} queued (${detections.length} total)`;
      }

      if (this.accBadges[arm]) {
        const accInfo = this.detector.getAccuracy(arm, actualCount);
        this.accBadges[arm].textContent = `Acc: ${accInfo.accuracyPct}% (${accInfo.detected}/${accInfo.actual})`;
        this.accBadges[arm].style.color = accInfo.accuracyPct >= 90 ? '#10b981' : '#f59e0b';
      }
    });

    // 4. Update overall status text
    if (this.statusEl) {
      const mode = this.junctionSim.detectionMode === 'cameraDetector' ? 'Active Controller Source' : 'Passive Monitor';
      this.statusEl.textContent = `Mode: ${mode} • Miss Rate: 5% • Latency: 0.2s • Simulated detector`;
    }
  }

  setArmStreetNames(arms) {
    if (!arms) return;
    this.arms.forEach(arm => {
      const titleEl = document.getElementById(`feed-title-${arm.toLowerCase()}`);
      if (titleEl) {
        titleEl.textContent = `CAM ${arm} • ${arms[arm] || 'Inbound'}`;
      }
    });
  }
}
