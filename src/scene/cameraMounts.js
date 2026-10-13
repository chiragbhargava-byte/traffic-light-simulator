import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * CameraMounts - Manages CCTV vision camera meshes on signal poles,
 * virtual PerspectiveCameras for video feeds, and toggleable detection zone FOV wedges.
 */
export class CameraMounts {
  constructor(junctionCenter, name = 'Adaptive') {
    this.junctionCenter = junctionCenter;
    this.name = name;

    this.group = new THREE.Group();
    this.group.name = `VisionCameras_${name}`;

    this.fovGroup = new THREE.Group();
    this.fovGroup.name = `VisionFovWedges_${name}`;
    this.group.add(this.fovGroup);

    this.cameras = {};
    this.mountPositions = {};
    this.isFovVisible = true;

    this.buildCamerasAndMeshes();
  }

  buildCamerasAndMeshes() {
    const { roadWidth, stopLineDistance } = CONFIG.layout;
    const halfRoad = roadWidth / 2;
    const stopDist = halfRoad + stopLineDistance;
    const curbOffset = halfRoad + 0.9;
    const camHeight = CONFIG.vision.cameraHeight || 5.2;
    const fovRange = CONFIG.vision.detectionRange || 60.0;
    const halfLane = CONFIG.layout.laneWidth / 2;

    const jc = this.junctionCenter;

    // Camera specs per arm (In India, drive-on-left):
    // Pole position, camera aim direction & lookAt target down the inbound approach
    const armConfigs = {
      N: {
        polePos: new THREE.Vector3(jc.x - curbOffset, camHeight, jc.z - stopDist),
        camPos: new THREE.Vector3(jc.x - halfLane, camHeight, jc.z - stopDist),
        target: new THREE.Vector3(jc.x - halfLane, 0.8, jc.z - stopDist - 28.0),
        inboundDir: new THREE.Vector3(0, 0, -1),
        laneOffset: -halfLane,
        startZ: jc.z - stopDist,
        wedgeEnd: new THREE.Vector3(jc.x - halfLane, 0, jc.z - stopDist - fovRange)
      },
      S: {
        polePos: new THREE.Vector3(jc.x + curbOffset, camHeight, jc.z + stopDist),
        camPos: new THREE.Vector3(jc.x + halfLane, camHeight, jc.z + stopDist),
        target: new THREE.Vector3(jc.x + halfLane, 0.8, jc.z + stopDist + 28.0),
        inboundDir: new THREE.Vector3(0, 0, 1),
        laneOffset: halfLane,
        startZ: jc.z + stopDist,
        wedgeEnd: new THREE.Vector3(jc.x + halfLane, 0, jc.z + stopDist + fovRange)
      },
      E: {
        polePos: new THREE.Vector3(jc.x + stopDist, camHeight, jc.z - curbOffset),
        camPos: new THREE.Vector3(jc.x + stopDist, camHeight, jc.z - halfLane),
        target: new THREE.Vector3(jc.x + stopDist + 28.0, 0.8, jc.z - halfLane),
        inboundDir: new THREE.Vector3(1, 0, 0),
        laneOffset: -halfLane,
        startX: jc.x + stopDist,
        wedgeEnd: new THREE.Vector3(jc.x + stopDist + fovRange, 0, jc.z - halfLane)
      },
      W: {
        polePos: new THREE.Vector3(jc.x - stopDist, camHeight, jc.z + curbOffset),
        camPos: new THREE.Vector3(jc.x - stopDist, camHeight, jc.z + halfLane),
        target: new THREE.Vector3(jc.x - stopDist - 28.0, 0.8, jc.z + halfLane),
        inboundDir: new THREE.Vector3(-1, 0, 0),
        laneOffset: halfLane,
        startX: jc.x - stopDist,
        wedgeEnd: new THREE.Vector3(jc.x - stopDist - fovRange, 0, jc.z + halfLane)
      }
    };

    // Shared materials
    const camBodyMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.4,
      metalness: 0.6
    });

    const lensMat = new THREE.MeshStandardMaterial({
      color: 0x09090b,
      roughness: 0.1,
      metalness: 0.9
    });

    const bracketMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.6,
      metalness: 0.8
    });

    const fovMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4, // Vibrant cyan translucent wedge
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const fovEdgeMat = new THREE.LineBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.6
    });

    Object.keys(armConfigs).forEach(arm => {
      const cfg = armConfigs[arm];

      // 1. Virtual Perspective Camera for PiP rendering
      const camera = new THREE.PerspectiveCamera(CONFIG.vision.cameraFov || 50, 240 / 160, 0.5, 120);
      camera.position.copy(cfg.camPos);
      camera.lookAt(cfg.target);
      this.cameras[arm] = camera;
      this.mountPositions[arm] = cfg.camPos;

      // 2. 3D CCTV Camera Physical Mesh
      const camMesh = new THREE.Group();
      camMesh.position.copy(cfg.camPos);
      camMesh.lookAt(cfg.target);

      // Body box
      const bodyGeo = new THREE.BoxGeometry(0.24, 0.22, 0.45);
      const bodyMesh = new THREE.Mesh(bodyGeo, camBodyMat);
      camMesh.add(bodyMesh);

      // Sun shield cover
      const shieldGeo = new THREE.BoxGeometry(0.28, 0.04, 0.5);
      const shieldMesh = new THREE.Mesh(shieldGeo, camBodyMat);
      shieldMesh.position.set(0, 0.13, -0.02);
      camMesh.add(shieldMesh);

      // Front lens
      const lensGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.1, 12);
      lensGeo.rotateX(Math.PI / 2);
      const lensMesh = new THREE.Mesh(lensGeo, lensMat);
      lensMesh.position.set(0, 0, 0.23);
      camMesh.add(lensMesh);

      // Status LED (small pulsing green dot)
      const ledGeo = new THREE.SphereGeometry(0.025, 8, 8);
      const ledMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.set(0.08, 0.07, 0.23);
      camMesh.add(led);

      // Bracket arm connecting to pole
      const bracketGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8);
      const bracket = new THREE.Mesh(bracketGeo, bracketMat);
      bracket.position.set(0, -0.2, -0.15);
      camMesh.add(bracket);

      this.group.add(camMesh);

      // 3. Translucent Field-of-View Wedge (Detection zone up to 60m)
      const wedge = this.buildFovWedge(cfg.camPos, cfg.target, fovRange, fovMat, fovEdgeMat);
      this.fovGroup.add(wedge);
    });
  }

  /**
   * Constructs a translucent 3D vision frustum wedge covering up to 60m detection range.
   */
  buildFovWedge(origin, target, range, material, edgeMaterial) {
    const wedgeGroup = new THREE.Group();

    // Direction vector
    const dir = new THREE.Vector3().subVectors(target, origin).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(dir, up).normalize();

    // Near points (near camera / stop line)
    const nearDist = 3.0;
    const nearW = 2.0;
    const nearH = 1.2;

    // Far points (at 60m range)
    const farDist = range;
    const farW = 8.5; // Expands to cover full inbound approach width
    const farH = 4.5;

    const nCenter = origin.clone().addScaledVector(dir, nearDist);
    const fCenter = origin.clone().addScaledVector(dir, farDist);
    fCenter.y = 0.05; // Hugs road ground surface

    const p0 = nCenter.clone().addScaledVector(right, -nearW).addScaledVector(up, -nearH);
    const p1 = nCenter.clone().addScaledVector(right, nearW).addScaledVector(up, -nearH);
    const p2 = nCenter.clone().addScaledVector(right, nearW).addScaledVector(up, nearH);
    const p3 = nCenter.clone().addScaledVector(right, -nearW).addScaledVector(up, nearH);

    const p4 = fCenter.clone().addScaledVector(right, -farW);
    const p5 = fCenter.clone().addScaledVector(right, farW);
    const p6 = fCenter.clone().addScaledVector(right, farW).addScaledVector(up, farH);
    const p7 = fCenter.clone().addScaledVector(right, -farW).addScaledVector(up, farH);

    // Build triangular / quad faces
    const vertices = new Float32Array([
      // Ground plane of the wedge (hugging road surface)
      p0.x, 0.05, p0.z,   p1.x, 0.05, p1.z,   p5.x, 0.05, p5.z,
      p0.x, 0.05, p0.z,   p5.x, 0.05, p5.z,   p4.x, 0.05, p4.z,

      // Left slant
      p0.x, p0.y, p0.z,   p4.x, p4.y, p4.z,   p7.x, p7.y, p7.z,
      p0.x, p0.y, p0.z,   p7.x, p7.y, p7.z,   p3.x, p3.y, p3.z,

      // Right slant
      p1.x, p1.y, p1.z,   p2.x, p2.y, p2.z,   p6.x, p6.y, p6.z,
      p1.x, p1.y, p1.z,   p6.x, p6.y, p6.z,   p5.x, p5.y, p5.z,

      // Top slant
      p3.x, p3.y, p3.z,   p7.x, p7.y, p7.z,   p6.x, p6.y, p6.z,
      p3.x, p3.y, p3.z,   p6.x, p6.y, p6.z,   p2.x, p2.y, p2.z
    ]);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, material);
    wedgeGroup.add(mesh);

    // Outline edges for clarity
    const edgePoints = [
      p0, p4,  p1, p5,  p2, p6,  p3, p7,
      p4, p5,  p5, p6,  p6, p7,  p7, p4
    ];
    const edgeVerts = [];
    edgePoints.forEach(pt => edgeVerts.push(pt.x, Math.max(0.06, pt.y), pt.z));

    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgeVerts, 3));
    const lines = new THREE.LineSegments(edgeGeo, edgeMaterial);
    wedgeGroup.add(lines);

    return wedgeGroup;
  }

  setFovVisible(visible) {
    this.isFovVisible = visible;
    this.fovGroup.visible = visible;
  }

  toggleFov() {
    this.setFovVisible(!this.isFovVisible);
    return this.isFovVisible;
  }
}
