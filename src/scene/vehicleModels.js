import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Procedural low-poly vehicle models:
 * - Two-wheeler (Scooter / Motorbike with rider)
 * - Car (Sedan)
 * - Auto-rickshaw (3-wheeler classic Indian auto)
 * - Bus (Commuter city bus)
 * - Truck (Heavy haul freight truck)
 * - Ambulance (Medical emergency vehicle with flashing beacon)
 */

// Shared reusable materials to keep draw calls and memory low
const materials = {
  blackRubber: new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 }),
  wheelRim: new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4, metalness: 0.8 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2, metalness: 0.8 }),
  headlight: new THREE.MeshBasicMaterial({ color: 0xfef08a }),
  taillight: new THREE.MeshBasicMaterial({ color: 0xef4444 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.9 }),
  riderSkin: new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.7 }),
  riderClothes: new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.8 }),
  helmet: new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.3 })
};

export class VehicleModelBuilder {
  /**
   * Factory method to build procedural 3D vehicle group by type key.
   */
  static create(typeKey) {
    const group = new THREE.Group();
    group.name = `Vehicle_${typeKey}`;

    let meshData;
    switch (typeKey) {
      case 'twoWheeler':
        meshData = this.buildTwoWheeler();
        break;
      case 'car':
        meshData = this.buildCar();
        break;
      case 'autoRickshaw':
        meshData = this.buildAutoRickshaw();
        break;
      case 'bus':
        meshData = this.buildBus();
        break;
      case 'truck':
        meshData = this.buildTruck();
        break;
      case 'ambulance':
        meshData = this.buildAmbulance();
        break;
      default:
        meshData = this.buildCar();
    }

    group.add(meshData.mesh);
    return {
      group,
      beacon: meshData.beacon || null,
      type: typeKey
    };
  }

  // -------------------------------------------------------------
  // 1. Two-Wheeler (Motorcycle / Scooter with rider)
  // -------------------------------------------------------------
  static buildTwoWheeler() {
    const root = new THREE.Group();
    const cfg = CONFIG.vehicles.types.twoWheeler;
    const bodyMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.5 });

    // Chassis / frame
    const frameGeo = new THREE.BoxGeometry(0.35, 0.45, 1.6);
    const frame = new THREE.Mesh(frameGeo, bodyMat);
    frame.position.y = 0.5;
    frame.castShadow = true;
    root.add(frame);

    // Wheels (Front & Rear, radius 0.28m)
    const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.12, 12);
    wheelGeo.rotateZ(Math.PI / 2);

    const fWheel = new THREE.Mesh(wheelGeo, materials.blackRubber);
    fWheel.position.set(0, 0.28, 0.65);
    fWheel.castShadow = true;
    root.add(fWheel);

    const rWheel = new THREE.Mesh(wheelGeo, materials.blackRubber);
    rWheel.position.set(0, 0.28, -0.65);
    rWheel.castShadow = true;
    root.add(rWheel);

    // Handlebars
    const barGeo = new THREE.BoxGeometry(0.7, 0.05, 0.05);
    const bar = new THREE.Mesh(barGeo, materials.chrome);
    bar.position.set(0, 0.95, 0.5);
    root.add(bar);

    // Headlight
    const hlGeo = new THREE.BoxGeometry(0.18, 0.12, 0.08);
    const hl = new THREE.Mesh(hlGeo, materials.headlight);
    hl.position.set(0, 0.85, 0.78);
    root.add(hl);

    // Rider: Torso & Helmet
    const riderTorsoGeo = new THREE.BoxGeometry(0.4, 0.55, 0.28);
    const riderTorso = new THREE.Mesh(riderTorsoGeo, materials.riderClothes);
    riderTorso.position.set(0, 0.95, -0.15);
    riderTorso.castShadow = true;
    root.add(riderTorso);

    const helmetGeo = new THREE.SphereGeometry(0.2, 10, 8);
    const helmet = new THREE.Mesh(helmetGeo, materials.helmet);
    helmet.position.set(0, 1.35, -0.15);
    helmet.castShadow = true;
    root.add(helmet);

    return { mesh: root };
  }

  // -------------------------------------------------------------
  // 2. Car (Sedan)
  // -------------------------------------------------------------
  static buildCar() {
    const root = new THREE.Group();
    const cfg = CONFIG.vehicles.types.car;
    const bodyMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.4, metalness: 0.2 });

    // Lower Chassis
    const lowerGeo = new THREE.BoxGeometry(1.8, 0.6, 4.2);
    const lower = new THREE.Mesh(lowerGeo, bodyMat);
    lower.position.y = 0.55;
    lower.castShadow = true;
    root.add(lower);

    // Upper Cabin
    const cabinGeo = new THREE.BoxGeometry(1.6, 0.65, 2.2);
    const cabin = new THREE.Mesh(cabinGeo, bodyMat);
    cabin.position.set(0, 1.15, -0.2);
    cabin.castShadow = true;
    root.add(cabin);

    // Windshield & Rear glass
    const windGeo = new THREE.BoxGeometry(1.5, 0.5, 0.05);
    const frontWind = new THREE.Mesh(windGeo, materials.glass);
    frontWind.position.set(0, 1.15, 0.92);
    frontWind.rotation.x = 0.25;
    root.add(frontWind);

    const rearWind = new THREE.Mesh(windGeo, materials.glass);
    rearWind.position.set(0, 1.15, -1.32);
    rearWind.rotation.x = -0.25;
    root.add(rearWind);

    // 4 Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14);
    wheelGeo.rotateZ(Math.PI / 2);

    const wheelOffsets = [
      { x: 0.92, z: 1.25 },
      { x: -0.92, z: 1.25 },
      { x: 0.92, z: -1.25 },
      { x: -0.92, z: -1.25 }
    ];

    wheelOffsets.forEach(o => {
      const w = new THREE.Mesh(wheelGeo, materials.blackRubber);
      w.position.set(o.x, 0.32, o.z);
      w.castShadow = true;
      root.add(w);
    });

    // Headlights & Taillights
    const hlGeo = new THREE.BoxGeometry(0.3, 0.15, 0.05);
    const hl1 = new THREE.Mesh(hlGeo, materials.headlight);
    hl1.position.set(0.65, 0.6, 2.12);
    root.add(hl1);
    const hl2 = new THREE.Mesh(hlGeo, materials.headlight);
    hl2.position.set(-0.65, 0.6, 2.12);
    root.add(hl2);

    const tlGeo = new THREE.BoxGeometry(0.25, 0.12, 0.05);
    const tl1 = new THREE.Mesh(tlGeo, materials.taillight);
    tl1.position.set(0.65, 0.65, -2.12);
    root.add(tl1);
    const tl2 = new THREE.Mesh(tlGeo, materials.taillight);
    tl2.position.set(-0.65, 0.65, -2.12);
    root.add(tl2);

    return { mesh: root };
  }

  // -------------------------------------------------------------
  // 3. Auto-Rickshaw (Indian 3-Wheeler)
  // -------------------------------------------------------------
  static buildAutoRickshaw() {
    const root = new THREE.Group();
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.6 }); // Dark green base
    const yellowMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 }); // Yellow top hood
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.9 }); // Canvas roof

    // Lower chassis (green)
    const lowerGeo = new THREE.BoxGeometry(1.3, 0.6, 2.7);
    const lower = new THREE.Mesh(lowerGeo, greenMat);
    lower.position.y = 0.5;
    lower.castShadow = true;
    root.add(lower);

    // Cab hood (yellow)
    const hoodGeo = new THREE.BoxGeometry(1.24, 0.65, 2.0);
    const hood = new THREE.Mesh(hoodGeo, yellowMat);
    hood.position.set(0, 1.1, -0.15);
    hood.castShadow = true;
    root.add(hood);

    // Curved canvas roof
    const roofGeo = new THREE.BoxGeometry(1.28, 0.12, 2.1);
    const roof = new THREE.Mesh(roofGeo, blackMat);
    roof.position.set(0, 1.48, -0.15);
    root.add(roof);

    // Front windshield
    const windGeo = new THREE.BoxGeometry(1.15, 0.55, 0.05);
    const wind = new THREE.Mesh(windGeo, materials.glass);
    wind.position.set(0, 1.05, 0.88);
    root.add(wind);

    // 3 Wheels (1 front center, 2 rear)
    const wheelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.15, 12);
    wheelGeo.rotateZ(Math.PI / 2);

    const fWheel = new THREE.Mesh(wheelGeo, materials.blackRubber);
    fWheel.position.set(0, 0.24, 1.05);
    fWheel.castShadow = true;
    root.add(fWheel);

    const rWheel1 = new THREE.Mesh(wheelGeo, materials.blackRubber);
    rWheel1.position.set(0.65, 0.24, -0.9);
    rWheel1.castShadow = true;
    root.add(rWheel1);

    const rWheel2 = new THREE.Mesh(wheelGeo, materials.blackRubber);
    rWheel2.position.set(-0.65, 0.24, -0.9);
    rWheel2.castShadow = true;
    root.add(rWheel2);

    // Single central headlight
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.06), materials.headlight);
    hl.position.set(0, 0.6, 1.36);
    root.add(hl);

    return { mesh: root };
  }

  // -------------------------------------------------------------
  // 4. Bus (Commuter Transit Bus)
  // -------------------------------------------------------------
  static buildBus() {
    const root = new THREE.Group();
    const cfg = CONFIG.vehicles.types.bus;
    const bodyMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.5 });
    const whiteRoofMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 });

    // Main Bus Body (Length: 9.6m, Width: 2.4m, Height: 3.1m)
    const bodyGeo = new THREE.BoxGeometry(2.4, 2.3, 9.6);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.7;
    body.castShadow = true;
    root.add(body);

    // White roof panel
    const roofGeo = new THREE.BoxGeometry(2.42, 0.2, 9.62);
    const roof = new THREE.Mesh(roofGeo, whiteRoofMat);
    roof.position.y = 2.9;
    root.add(roof);

    // Side passenger windows (long black glass strips)
    const sideGlassGeo = new THREE.BoxGeometry(0.06, 0.9, 7.8);
    const sideGlassL = new THREE.Mesh(sideGlassGeo, materials.glass);
    sideGlassL.position.set(1.21, 2.0, -0.3);
    root.add(sideGlassL);

    const sideGlassR = new THREE.Mesh(sideGlassGeo, materials.glass);
    sideGlassR.position.set(-1.21, 2.0, -0.3);
    root.add(sideGlassR);

    // Front large windscreen
    const frontWindGeo = new THREE.BoxGeometry(2.2, 1.3, 0.06);
    const frontWind = new THREE.Mesh(frontWindGeo, materials.glass);
    frontWind.position.set(0, 2.0, 4.82);
    root.add(frontWind);

    // 6 Wheels (2 front, 4 rear duals)
    const wheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.32, 14);
    wheelGeo.rotateZ(Math.PI / 2);

    const wheelOffsets = [
      { x: 1.15, z: 3.2 },
      { x: -1.15, z: 3.2 },
      { x: 1.15, z: -2.8 },
      { x: -1.15, z: -2.8 },
      { x: 1.15, z: -3.8 },
      { x: -1.15, z: -3.8 }
    ];

    wheelOffsets.forEach(o => {
      const w = new THREE.Mesh(wheelGeo, materials.blackRubber);
      w.position.set(o.x, 0.48, o.z);
      w.castShadow = true;
      root.add(w);
    });

    // Headlights
    const hlGeo = new THREE.BoxGeometry(0.35, 0.2, 0.06);
    const hl1 = new THREE.Mesh(hlGeo, materials.headlight);
    hl1.position.set(0.85, 0.8, 4.82);
    root.add(hl1);
    const hl2 = new THREE.Mesh(hlGeo, materials.headlight);
    hl2.position.set(-0.85, 0.8, 4.82);
    root.add(hl2);

    return { mesh: root };
  }

  // -------------------------------------------------------------
  // 5. Truck (Freight Haul Truck)
  // -------------------------------------------------------------
  static buildTruck() {
    const root = new THREE.Group();
    const cfg = CONFIG.vehicles.types.truck;
    const cabMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.5 });
    const cargoMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });

    // Driver Cab (Front)
    const cabGeo = new THREE.BoxGeometry(2.3, 2.2, 2.4);
    const cab = new THREE.Mesh(cabGeo, cabMat);
    cab.position.set(0, 1.65, 2.7);
    cab.castShadow = true;
    root.add(cab);

    // Windshield
    const windGeo = new THREE.BoxGeometry(2.1, 0.95, 0.06);
    const wind = new THREE.Mesh(windGeo, materials.glass);
    wind.position.set(0, 1.95, 3.92);
    root.add(wind);

    // Cargo Box (Rear)
    const cargoGeo = new THREE.BoxGeometry(2.3, 2.5, 5.4);
    const cargo = new THREE.Mesh(cargoGeo, cargoMat);
    cargo.position.set(0, 1.9, -1.3);
    cargo.castShadow = true;
    root.add(cargo);

    // Chassis frame
    const chassisGeo = new THREE.BoxGeometry(1.6, 0.35, 8.0);
    const chassis = new THREE.Mesh(chassisGeo, materials.blackRubber);
    chassis.position.set(0, 0.65, 0);
    root.add(chassis);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.32, 14);
    wheelGeo.rotateZ(Math.PI / 2);

    const wheelOffsets = [
      { x: 1.1, z: 2.7 },
      { x: -1.1, z: 2.7 },
      { x: 1.1, z: -2.2 },
      { x: -1.1, z: -2.2 },
      { x: 1.1, z: -3.3 },
      { x: -1.1, z: -3.3 }
    ];

    wheelOffsets.forEach(o => {
      const w = new THREE.Mesh(wheelGeo, materials.blackRubber);
      w.position.set(o.x, 0.46, o.z);
      w.castShadow = true;
      root.add(w);
    });

    // Headlights
    const hlGeo = new THREE.BoxGeometry(0.3, 0.2, 0.06);
    const hl1 = new THREE.Mesh(hlGeo, materials.headlight);
    hl1.position.set(0.8, 0.9, 3.92);
    root.add(hl1);
    const hl2 = new THREE.Mesh(hlGeo, materials.headlight);
    hl2.position.set(-0.8, 0.9, 3.92);
    root.add(hl2);

    return { mesh: root };
  }

  // -------------------------------------------------------------
  // 6. Ambulance (Emergency Vehicle with Flashing Lightbar)
  // -------------------------------------------------------------
  static buildAmbulance() {
    const root = new THREE.Group();
    const cfg = CONFIG.vehicles.types.ambulance;
    const bodyMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.3 });
    const redCrossMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

    // Ambulance Van Body (Length: 5.4m, Width: 2.1m, Height: 2.3m)
    const bodyGeo = new THREE.BoxGeometry(2.1, 1.8, 5.4);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.35;
    body.castShadow = true;
    root.add(body);

    // Windshield
    const windGeo = new THREE.BoxGeometry(1.9, 0.75, 0.06);
    const wind = new THREE.Mesh(windGeo, materials.glass);
    wind.position.set(0, 1.55, 2.72);
    root.add(wind);

    // Red Cross emblems on both flanks
    [-1.06, 1.06].forEach(xSide => {
      // Horizontal cross bar
      const hGeo = new THREE.BoxGeometry(0.04, 0.25, 0.75);
      const hMesh = new THREE.Mesh(hGeo, redCrossMat);
      hMesh.position.set(xSide, 1.45, -0.4);
      root.add(hMesh);

      // Vertical cross bar
      const vGeo = new THREE.BoxGeometry(0.04, 0.75, 0.25);
      const vMesh = new THREE.Mesh(vGeo, redCrossMat);
      vMesh.position.set(xSide, 1.45, -0.4);
      root.add(vMesh);
    });

    // 4 Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.25, 14);
    wheelGeo.rotateZ(Math.PI / 2);

    const wheelOffsets = [
      { x: 1.05, z: 1.7 },
      { x: -1.05, z: 1.7 },
      { x: 1.05, z: -1.7 },
      { x: -1.05, z: -1.7 }
    ];

    wheelOffsets.forEach(o => {
      const w = new THREE.Mesh(wheelGeo, materials.blackRubber);
      w.position.set(o.x, 0.38, o.z);
      w.castShadow = true;
      root.add(w);
    });

    // Flashing Emergency Lightbar (Red LED on left, Blue LED on right)
    const lightbarBaseGeo = new THREE.BoxGeometry(1.3, 0.1, 0.3);
    const lightbarBase = new THREE.Mesh(lightbarBaseGeo, materials.blackRubber);
    lightbarBase.position.set(0, 2.3, 0.8);
    root.add(lightbarBase);

    const beaconGeo = new THREE.BoxGeometry(0.55, 0.18, 0.24);
    const redBeaconMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 3.0
    });
    const blueBeaconMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.2
    });

    const redBeacon = new THREE.Mesh(beaconGeo, redBeaconMat);
    redBeacon.position.set(-0.35, 2.42, 0.8);
    root.add(redBeacon);

    const blueBeacon = new THREE.Mesh(beaconGeo, blueBeaconMat);
    blueBeacon.position.set(0.35, 2.42, 0.8);
    root.add(blueBeacon);

    // Return beacon updater object
    const beacon = {
      redMat: redBeaconMat,
      blueMat: blueBeaconMat,
      update(simTime) {
        // Strobe flash at 4 Hz
        const isRedActive = Math.floor(simTime * 8) % 2 === 0;
        this.redMat.emissiveIntensity = isRedActive ? 4.0 : 0.2;
        this.blueMat.emissiveIntensity = isRedActive ? 0.2 : 4.0;
      }
    };

    return { mesh: root, beacon };
  }
}
