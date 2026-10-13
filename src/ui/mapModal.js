import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { latLonToLocalMeters } from '../utils/osmParser.js';

/**
 * MapModal - 2D Interactive Map View for Navsari City Context
 * Supports:
 * - Online OpenStreetMap tile layer with Leaflet
 * - Offline Canvas fallback drawn from bundled navsari.json
 * - Candidate junction listing from highway=traffic_signals
 * - "© OpenStreetMap contributors" attribution
 * - Selection callback to load into 3D scene
 */
export class MapModal {
  constructor(osmData, onSelectJunction) {
    this.osmData = osmData;
    this.onSelectJunction = onSelectJunction;
    this.selectedJunctionId = osmData.junctions[0]?.id || 10001;

    this.isOnlineMode = true;
    this.tileErrorDetected = false;
    this.leafletMap = null;
    this.tileLayer = null;
    this.markers = new Map();

    this.initDOM();
    this.initLeaflet();
    this.populateJunctionList();
  }

  initDOM() {
    this.modalEl = document.getElementById('map-modal');
    this.closeBtn = document.getElementById('btn-close-map');
    this.modeToggleBtn = document.getElementById('btn-map-mode-toggle');
    this.junctionListContainer = document.getElementById('map-junction-list');
    this.leafletContainer = document.getElementById('leaflet-map-container');
    this.canvasEl = document.getElementById('offline-map-canvas');
    this.statusBanner = document.getElementById('map-status-banner');

    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.hide());
    }

    if (this.modeToggleBtn) {
      this.modeToggleBtn.addEventListener('click', () => {
        this.setMode(!this.isOnlineMode);
      });
    }

    // Canvas click handling for offline mode
    if (this.canvasEl) {
      this.canvasEl.addEventListener('click', (e) => this.handleCanvasClick(e));
    }
  }

  initLeaflet() {
    if (!this.leafletContainer) return;

    const centerJunction = this.osmData.junctions[0] || { lat: 20.9465, lon: 72.9280 };

    this.leafletMap = L.map(this.leafletContainer, {
      center: [centerJunction.lat, centerJunction.lon],
      zoom: 15,
      zoomControl: true,
      attributionControl: false // We provide dedicated attribution element
    });

    // Add OpenStreetMap Tile Layer
    this.tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    });

    // Detect offline / tile load failures
    this.tileLayer.on('tileerror', () => {
      if (!this.tileErrorDetected) {
        this.tileErrorDetected = true;
        console.warn('Leaflet OSM tile loading failed. Falling back to bundled vector canvas.');
        this.statusBanner.textContent = '⚠️ Offline detected: Switched to vector canvas from bundled navsari.json';
        this.statusBanner.classList.add('offline-warning');
        this.setMode(false);
      }
    });

    this.tileLayer.addTo(this.leafletMap);

    // Add candidate junction markers with custom animated SVG icons
    this.osmData.junctions.forEach(j => {
      const isSelected = j.id === this.selectedJunctionId;
      const icon = this.createSignalDivIcon(j, isSelected);

      const marker = L.marker([j.lat, j.lon], { icon }).addTo(this.leafletMap);

      // Popup content
      const popupHtml = `
        <div class="map-popup">
          <div class="popup-title">${j.name}</div>
          <div class="popup-sub">${j.nameGu ? j.nameGu + ' • ' : ''}Ref: ${j.ref}</div>
          <div class="popup-coords">${j.lat.toFixed(5)}° N, ${j.lon.toFixed(5)}° E</div>
          <div class="popup-arms">
            <div><b>N:</b> ${j.arms.N}</div>
            <div><b>S:</b> ${j.arms.S}</div>
            <div><b>E:</b> ${j.arms.E}</div>
            <div><b>W:</b> ${j.arms.W}</div>
          </div>
          <button class="btn-popup-load" data-id="${j.id}">Load in 3D Scene ➔</button>
        </div>
      `;
      marker.bindPopup(popupHtml);

      marker.on('click', () => {
        this.selectJunction(j.id, false);
      });

      this.markers.set(j.id, marker);
    });

    // Delegate click inside popups
    this.leafletContainer.addEventListener('click', (e) => {
      if (e.target && e.target.classList.contains('btn-popup-load')) {
        const id = parseInt(e.target.dataset.id, 10);
        this.selectJunction(id, true);
        this.hide();
      }
    });
  }

  createSignalDivIcon(junction, isSelected) {
    const activeClass = isSelected ? 'active-pulse' : '';
    return L.divIcon({
      className: 'custom-traffic-signal-marker',
      html: `
        <div class="signal-pin ${activeClass}">
          <div class="pin-head">
            <span class="light red"></span>
            <span class="light yellow"></span>
            <span class="light green"></span>
          </div>
          <div class="pin-label">${junction.name.split(' ')[0]}</div>
        </div>
      `,
      iconSize: [42, 54],
      iconAnchor: [21, 50],
      popupAnchor: [0, -48]
    });
  }

  populateJunctionList() {
    if (!this.junctionListContainer) return;

    this.junctionListContainer.innerHTML = '';

    this.osmData.junctions.forEach(j => {
      const isSelected = j.id === this.selectedJunctionId;
      const card = document.createElement('div');
      card.className = `junction-card ${isSelected ? 'selected' : ''}`;
      card.dataset.id = j.id;

      card.innerHTML = `
        <div class="card-header">
          <span class="card-tag">highway=traffic_signals</span>
          ${isSelected ? '<span class="card-badge-active">Active in 3D</span>' : ''}
        </div>
        <div class="card-title">${j.name}</div>
        ${j.nameGu ? `<div class="card-gu">${j.nameGu}</div>` : ''}
        <div class="card-meta">
          <span>📍 ${j.lat.toFixed(4)}° N, ${j.lon.toFixed(4)}° E</span>
          <span>🏷️ ${j.ref}</span>
        </div>
        <div class="card-arms-preview">
          <div class="arm-item"><span>N:</span> ${j.arms.N}</div>
          <div class="arm-item"><span>S:</span> ${j.arms.S}</div>
          <div class="arm-item"><span>E:</span> ${j.arms.E}</div>
          <div class="arm-item"><span>W:</span> ${j.arms.W}</div>
        </div>
        <div class="card-actions">
          <button class="btn-card-load ${isSelected ? 'active' : ''}">${isSelected ? '✓ Currently Loaded' : 'Load into 3D'}</button>
        </div>
      `;

      card.addEventListener('click', () => {
        this.selectJunction(j.id, true);
      });

      this.junctionListContainer.appendChild(card);
    });
  }

  selectJunction(junctionId, trigger3dUpdate = true) {
    this.selectedJunctionId = junctionId;
    const j = this.osmData.junctions.find(item => item.id === junctionId);
    if (!j) return;

    // Pan Leaflet map
    if (this.leafletMap) {
      this.leafletMap.setView([j.lat, j.lon], 16, { animate: true });
    }

    // Refresh marker icons
    this.osmData.junctions.forEach(item => {
      const m = this.markers.get(item.id);
      if (m) {
        m.setIcon(this.createSignalDivIcon(item, item.id === junctionId));
      }
    });

    // Refresh card list selection
    this.populateJunctionList();

    // Redraw offline canvas if visible
    if (!this.isOnlineMode) {
      this.drawCanvasMap();
    }

    // Trigger 3D scene rebuild
    if (trigger3dUpdate && this.onSelectJunction) {
      this.onSelectJunction(j);
    }
  }

  setMode(online) {
    this.isOnlineMode = online;
    if (this.modeToggleBtn) {
      this.modeToggleBtn.innerHTML = online
        ? '🌐 OSM Tiles (Online)'
        : '📴 Vector Canvas (Offline)';
    }

    if (online) {
      this.leafletContainer.style.display = 'block';
      this.canvasEl.style.display = 'none';
      if (this.statusBanner) {
        this.statusBanner.textContent = 'Active: OpenStreetMap Online Tile Layer';
        this.statusBanner.classList.remove('offline-warning');
      }
      if (this.leafletMap) {
        this.leafletMap.invalidateSize();
      }
    } else {
      this.leafletContainer.style.display = 'none';
      this.canvasEl.style.display = 'block';
      if (this.statusBanner) {
        this.statusBanner.textContent = 'Active: Offline Vector Canvas (Rendered from src/data/navsari.json)';
        this.statusBanner.classList.add('offline-warning');
      }
      this.drawCanvasMap();
    }
  }

  drawCanvasMap() {
    if (!this.canvasEl) return;
    const ctx = this.canvasEl.getContext('2d');
    const w = (this.canvasEl.width = this.canvasEl.parentElement.clientWidth || 800);
    const h = (this.canvasEl.height = this.canvasEl.parentElement.clientHeight || 600);

    // Dark sleek urban cartography background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    // Current center
    const curJunction = this.osmData.junctions.find(j => j.id === this.selectedJunctionId) || this.osmData.junctions[0];
    const centerLat = curJunction.lat;
    const centerLon = curJunction.lon;

    // Scale: 1 meter = X pixels (zoom factor)
    const scale = 1.6; // pixels per meter
    const toCanvasX = (mx) => w / 2 + mx * scale;
    const toCanvasY = (mz) => h / 2 + mz * scale; // mz is already -dLat in Three.js coordinates

    // 1. Draw grid lines
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
    ctx.lineWidth = 1;
    const gridSize = 50 * scale;
    for (let x = (w / 2) % gridSize; x < w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = (h / 2) % gridSize; y < h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // 2. Draw 150m context boundary circle around active junction
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 150 * scale, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.04)';
    ctx.fill();

    // 150m boundary label
    ctx.fillStyle = '#34d399';
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText('150m Context Boundary', w / 2 + 10, h / 2 - 150 * scale + 15);

    // 3. Draw Roads from navsari.json
    for (const way of this.osmData.ways) {
      if (!way.tags || !way.tags.highway) continue;

      ctx.beginPath();
      let first = true;
      for (const nid of way.nodes) {
        const node = this.osmData.nodes.get(nid);
        if (!node) continue;
        const loc = latLonToLocalMeters(node.lat, node.lon, centerLat, centerLon);
        const cx = toCanvasX(loc.x);
        const cy = toCanvasY(loc.z);
        if (first) {
          ctx.moveTo(cx, cy);
          first = false;
        } else {
          ctx.lineTo(cx, cy);
        }
      }

      ctx.strokeStyle = way.tags.highway === 'primary' ? '#475569' : '#334155';
      ctx.lineWidth = way.tags.highway === 'primary' ? 8 : 5;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Road centerline
      ctx.strokeStyle = way.tags.highway === 'primary' ? '#94a3b8' : '#64748b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 4. Draw Building Polygons from navsari.json
    for (const way of this.osmData.ways) {
      if (!way.tags || !way.tags.building) continue;

      ctx.beginPath();
      let first = true;
      let cx0 = 0, cy0 = 0;
      for (const nid of way.nodes) {
        const node = this.osmData.nodes.get(nid);
        if (!node) continue;
        const loc = latLonToLocalMeters(node.lat, node.lon, centerLat, centerLon);
        const cx = toCanvasX(loc.x);
        const cy = toCanvasY(loc.z);
        if (first) {
          ctx.moveTo(cx, cy);
          cx0 = cx; cy0 = cy;
          first = false;
        } else {
          ctx.lineTo(cx, cy);
        }
      }
      ctx.closePath();

      // Building styling
      ctx.fillStyle = way.tags.building === 'school'
        ? 'rgba(251, 191, 36, 0.45)'
        : (way.tags.building === 'hospital'
          ? 'rgba(248, 113, 113, 0.45)'
          : 'rgba(71, 85, 105, 0.65)');
      ctx.fill();

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Name label for large buildings
      if (way.tags.name) {
        ctx.fillStyle = '#f8fafc';
        ctx.font = '9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(way.tags.name.substring(0, 18), cx0 + 10, cy0 + 10);
      }
    }

    // 5. Draw Junction Nodes
    this.osmData.junctions.forEach(j => {
      const loc = latLonToLocalMeters(j.lat, j.lon, centerLat, centerLon);
      const jx = toCanvasX(loc.x);
      const jy = toCanvasY(loc.z);
      const isSelected = j.id === this.selectedJunctionId;

      // Glow
      ctx.beginPath();
      ctx.arc(jx, jy, isSelected ? 16 : 10, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.2)';
      ctx.fill();

      // Center marker
      ctx.beginPath();
      ctx.arc(jx, jy, isSelected ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#10b981' : '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Junction Title
      ctx.fillStyle = isSelected ? '#34d399' : '#e2e8f0';
      ctx.font = isSelected ? 'bold 12px Inter, sans-serif' : '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(j.name, jx, jy - 14);
    });
  }

  handleCanvasClick(e) {
    if (!this.canvasEl) return;
    const rect = this.canvasEl.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const w = this.canvasEl.width;
    const h = this.canvasEl.height;
    const curJunction = this.osmData.junctions.find(j => j.id === this.selectedJunctionId) || this.osmData.junctions[0];
    const scale = 1.6;

    // Check hit test against junctions
    for (const j of this.osmData.junctions) {
      const loc = latLonToLocalMeters(j.lat, j.lon, curJunction.lat, curJunction.lon);
      const jx = w / 2 + loc.x * scale;
      const jy = h / 2 + loc.z * scale;
      const dist = Math.sqrt((clickX - jx) ** 2 + (clickY - jy) ** 2);
      if (dist <= 25) {
        this.selectJunction(j.id, true);
        return;
      }
    }
  }

  show() {
    if (!this.modalEl) return;
    this.modalEl.style.display = 'flex';
    if (this.isOnlineMode && this.leafletMap) {
      setTimeout(() => {
        this.leafletMap.invalidateSize();
      }, 100);
    } else {
      setTimeout(() => {
        this.drawCanvasMap();
      }, 100);
    }
  }

  hide() {
    if (!this.modalEl) return;
    this.modalEl.style.display = 'none';
  }
}
