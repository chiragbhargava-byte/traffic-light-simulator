import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CONFIG } from '../config.js';

/**
 * SceneManager - Controls Three.js scene, camera, lighting, and camera transitions.
 */
export class SceneManager {
  constructor(container) {
    this.container = container;
    this.isNight = false;

    this.scene = new THREE.Scene();
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    this.sunLight = null;
    this.ambientLight = null;

    // Camera animation state
    this.cameraTransition = {
      active: false,
      startPos: new THREE.Vector3(),
      targetPos: new THREE.Vector3(),
      startLookAt: new THREE.Vector3(),
      targetLookAt: new THREE.Vector3(),
      progress: 0,
      duration: 1.0 // seconds
    };

    this.init();
  }

  init() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    // 1. Camera
    const iso = CONFIG.cameras.isometric;
    this.camera = new THREE.PerspectiveCamera(iso.fov, width / height, 0.5, 600);
    this.camera.position.set(iso.position.x, iso.position.y, iso.position.z);

    // 2. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 3. OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2.05; // Prevent dipping beneath ground
    this.controls.minDistance = 15;
    this.controls.maxDistance = 280;
    this.controls.target.set(iso.target.x, iso.target.y, iso.target.z);
    this.controls.update();

    // 4. Lighting & Fog
    this.initLighting();

    // 5. Window Resize listener
    window.addEventListener('resize', () => this.onWindowResize());
  }

  initLighting() {
    const theme = CONFIG.theme.day;

    this.scene.background = new THREE.Color(theme.skyColor);
    this.scene.fog = new THREE.Fog(theme.fogColor, theme.fogNear, theme.fogFar);

    // Ambient Light
    this.ambientLight = new THREE.AmbientLight(theme.ambientColor, theme.ambientIntensity);
    this.scene.add(this.ambientLight);

    // Directional Sunlight with shadows
    this.sunLight = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity);
    this.sunLight.position.set(theme.sunPosition.x, theme.sunPosition.y, theme.sunPosition.z);
    this.sunLight.castShadow = true;

    // Shadow camera bounds covering the full dual-junction footprint
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 400;
    const shadowD = 180;
    this.sunLight.shadow.camera.left = -shadowD;
    this.sunLight.shadow.camera.right = shadowD;
    this.sunLight.shadow.camera.top = shadowD;
    this.sunLight.shadow.camera.bottom = -shadowD;
    this.sunLight.shadow.bias = -0.0005;

    this.scene.add(this.sunLight);
  }

  /**
   * Smoothly animates camera to one of the presets: 'topDown', 'isometric', 'school'
   */
  setCameraPreset(presetKey) {
    const preset = CONFIG.cameras[presetKey];
    if (!preset) return;

    this.cameraTransition.startPos.copy(this.camera.position);
    this.cameraTransition.targetPos.set(preset.position.x, preset.position.y, preset.position.z);

    this.cameraTransition.startLookAt.copy(this.controls.target);
    this.cameraTransition.targetLookAt.set(preset.target.x, preset.target.y, preset.target.z);

    this.cameraTransition.progress = 0;
    this.cameraTransition.duration = 1.0;
    this.cameraTransition.active = true;
  }

  /**
   * Switches scene lighting and atmosphere between Day and Night.
   */
  setDayNight(isNight) {
    this.isNight = isNight;
    const theme = isNight ? CONFIG.theme.night : CONFIG.theme.day;

    this.scene.background.set(theme.skyColor);
    this.scene.fog.color.set(theme.fogColor);
    this.scene.fog.near = theme.fogNear;
    this.scene.fog.far = theme.fogFar;

    this.ambientLight.color.set(theme.ambientColor);
    this.ambientLight.intensity = theme.ambientIntensity;

    this.sunLight.color.set(theme.sunColor);
    this.sunLight.intensity = theme.sunIntensity;
    this.sunLight.position.set(theme.sunPosition.x, theme.sunPosition.y, theme.sunPosition.z);
  }

  onWindowResize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  update(deltaTime) {
    // Smooth camera transition interpolation
    if (this.cameraTransition.active) {
      this.cameraTransition.progress += deltaTime / this.cameraTransition.duration;
      const t = Math.min(1.0, this.cameraTransition.progress);
      // Smooth cubic easeInOut curve
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      this.camera.position.lerpVectors(this.cameraTransition.startPos, this.cameraTransition.targetPos, ease);
      this.controls.target.lerpVectors(this.cameraTransition.startLookAt, this.cameraTransition.targetLookAt, ease);

      if (t >= 1.0) {
        this.cameraTransition.active = false;
      }
    }

    this.controls.update();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
