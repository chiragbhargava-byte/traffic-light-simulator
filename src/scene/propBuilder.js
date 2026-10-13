import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * PropBuilder - Generates procedural low-poly 3D environmental context:
 * - North-arm School Buildings (Left & Right junctions)
 * - School zone signboards
 * - Roadside low-poly trees
 * - Perimeter city buildings for scene depth
 */
export class PropBuilder {
  constructor() {
    this.materials = this.initMaterials();
  }

  initMaterials() {
    return {
      schoolWall: new THREE.MeshStandardMaterial({
        color: 0xfef08a, // Soft warm cream/yellow school facade
        roughness: 0.8
      }),
      schoolTrim: new THREE.MeshStandardMaterial({
        color: 0x0284c7, // Blue accent band/roof
        roughness: 0.6
      }),
      schoolRoof: new THREE.MeshStandardMaterial({
        color: 0x991b1b, // Terracotta/maroon roof
        roughness: 0.7
      }),
      windowGlass: new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.2,
        metalness: 0.8
      }),
      treeTrunk: new THREE.MeshStandardMaterial({
        color: 0x78350f,
        roughness: 0.9
      }),
      treeFoliage: new THREE.MeshStandardMaterial({
        color: 0x15803d, // Rich green foliage
        roughness: 0.7
      }),
      treeFoliageLight: new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        roughness: 0.7
      }),
      signBoard: new THREE.MeshStandardMaterial({
        color: 0xfacc15, // Bright caution yellow
        roughness: 0.4
      }),
      signPost: new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.6
      }),
      streetLampPole: new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.5,
        metalness: 0.8
      }),
      streetLampGlass: new THREE.MeshStandardMaterial({
        color: 0xfffbeb,
        emissive: 0xfef08a,
        emissiveIntensity: 0.2,
        roughness: 0.1
      }),
      buildingPalette: [
        new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 }),
        new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 }),
        new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 }),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 }),
        new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.8 })
      ]
    };
  }

  /**
   * Builds all environmental props for the entire scene.
   */
  build(scene) {
    const propGroup = new THREE.Group();
    propGroup.name = 'EnvironmentProps';

    // 1. School building on North arm of Left Junction (Fixed)
    const leftSchool = this.buildSchoolComplex(CONFIG.layout.junctionCenters.left);
    propGroup.add(leftSchool);

    // 2. School building on North arm of Right Junction (Adaptive)
    const rightSchool = this.buildSchoolComplex(CONFIG.layout.junctionCenters.right);
    propGroup.add(rightSchool);

    // 3. Roadside trees along road corridors
    const trees = this.buildTrees();
    propGroup.add(trees);

    // 4. Perimeter background buildings
    const cityBuildings = this.buildPerimeterBuildings();
    propGroup.add(cityBuildings);

    // 5. Center divide boulevard
    const centerLawn = this.buildCenterMedian();
    propGroup.add(centerLawn);

    // 6. Roadside streetlights
    const streetLamps = this.buildStreetLamps();
    propGroup.add(streetLamps);

    scene.add(propGroup);
    return propGroup;
  }

  /**
   * Toggles streetlamp lighting for night mode.
   */
  setNight(isNight) {
    this.materials.streetLampGlass.emissiveIntensity = isNight ? 4.5 : 0.2;
    this.materials.streetLampGlass.emissive.setHex(isNight ? 0xffedd5 : 0xfef08a);
  }

  /**
   * Creates a detailed low-poly 2-story school building with portico, windows,
   * pitched roof, and a roadside warning signboard.
   */
  buildSchoolComplex(junctionCenter) {
    const group = new THREE.Group();
    const { roadWidth, schoolZonePositionZ } = CONFIG.layout;
    // Position school on East side (+X) of North arm
    const schoolX = junctionCenter.x + roadWidth / 2 + 10.0;
    const schoolZ = junctionCenter.z + schoolZonePositionZ;

    group.position.set(schoolX, 0, schoolZ);

    // Main 2-story school structure (Width: 16m, Height: 7m, Depth: 10m)
    const mainGeo = new THREE.BoxGeometry(16, 7, 10);
    const mainBuilding = new THREE.Mesh(mainGeo, this.materials.schoolWall);
    mainBuilding.position.y = 3.5;
    mainBuilding.castShadow = true;
    mainBuilding.receiveShadow = true;
    group.add(mainBuilding);

    // Decorative mid-floor and roof-line trim bands
    const trimGeo = new THREE.BoxGeometry(16.4, 0.4, 10.4);
    const midTrim = new THREE.Mesh(trimGeo, this.materials.schoolTrim);
    midTrim.position.y = 3.5;
    group.add(midTrim);

    const topTrim = new THREE.Mesh(trimGeo, this.materials.schoolTrim);
    topTrim.position.y = 7.0;
    group.add(topTrim);

    // Pitched Roof (Triangular prism)
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-8.2, 0);
    roofShape.lineTo(8.2, 0);
    roofShape.lineTo(0, 3.2);
    roofShape.closePath();

    const extrudeSettings = { depth: 10.6, bevelEnabled: false };
    const roofGeo = new THREE.ExtrudeGeometry(roofShape, extrudeSettings);
    const roofMesh = new THREE.Mesh(roofGeo, this.materials.schoolRoof);
    roofMesh.position.set(0, 7.2, -5.3);
    roofMesh.castShadow = true;
    group.add(roofMesh);

    // Front Classroom Windows (facing road, -X direction)
    const windowGeo = new THREE.BoxGeometry(0.1, 1.2, 1.4);
    const windowCols = 4;
    const windowRows = 2;
    for (let r = 0; r < windowRows; r++) {
      const y = r === 0 ? 1.8 : 5.2;
      for (let c = 0; c < windowCols; c++) {
        const z = -3.3 + c * 2.2;
        const win = new THREE.Mesh(windowGeo, this.materials.windowGlass);
        win.position.set(-8.05, y, z);
        group.add(win);
      }
    }

    // Entrance Portico with columns
    const porticoGeo = new THREE.BoxGeometry(3.5, 0.3, 4.0);
    const porticoRoof = new THREE.Mesh(porticoGeo, this.materials.schoolTrim);
    porticoRoof.position.set(-9.5, 3.4, 0);
    group.add(porticoRoof);

    const colGeo = new THREE.CylinderGeometry(0.15, 0.15, 3.4, 8);
    const col1 = new THREE.Mesh(colGeo, this.materials.schoolTrim);
    col1.position.set(-11.0, 1.7, 1.8);
    group.add(col1);

    const col2 = new THREE.Mesh(colGeo, this.materials.schoolTrim);
    col2.position.set(-11.0, 1.7, -1.8);
    group.add(col2);

    // Roadside School Zone Signboard (Facing oncoming traffic from North and South)
    const signGroup = this.buildSchoolSign();
    signGroup.position.set(-8.5, 0, 8.0);
    group.add(signGroup);

    return group;
  }

  buildSchoolSign() {
    const sign = new THREE.Group();

    // Twin signposts
    const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8);
    const post1 = new THREE.Mesh(postGeo, this.materials.signPost);
    post1.position.set(0, 1.6, -0.6);
    post1.castShadow = true;
    sign.add(post1);

    const post2 = new THREE.Mesh(postGeo, this.materials.signPost);
    post2.position.set(0, 1.6, 0.6);
    post2.castShadow = true;
    sign.add(post2);

    // Bright Warning Signboard: "SCHOOL ZONE / GO SLOW"
    const boardGeo = new THREE.BoxGeometry(0.12, 1.6, 2.0);
    const boardMesh = new THREE.Mesh(boardGeo, this.materials.signBoard);
    boardMesh.position.set(0, 2.5, 0);
    boardMesh.castShadow = true;
    sign.add(boardMesh);

    // Blue text header strip
    const headerGeo = new THREE.BoxGeometry(0.13, 0.45, 1.9);
    const headerMesh = new THREE.Mesh(headerGeo, this.materials.schoolTrim);
    headerMesh.position.set(0, 2.9, 0);
    sign.add(headerMesh);

    return sign;
  }

  /**
   * Procedural low-poly tree builder.
   */
  createTree(scale = 1.0) {
    const tree = new THREE.Group();

    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.25 * scale, 0.35 * scale, 2.5 * scale, 6);
    const trunk = new THREE.Mesh(trunkGeo, this.materials.treeTrunk);
    trunk.position.y = 1.25 * scale;
    trunk.castShadow = true;
    tree.add(trunk);

    // Layered foliage (cones/octahedrons for clean low-poly look)
    const foliageMat = Math.random() > 0.5 ? this.materials.treeFoliage : this.materials.treeFoliageLight;
    const foliageGeo1 = new THREE.ConeGeometry(1.8 * scale, 2.6 * scale, 6);
    const f1 = new THREE.Mesh(foliageGeo1, foliageMat);
    f1.position.y = 3.0 * scale;
    f1.castShadow = true;
    tree.add(f1);

    const foliageGeo2 = new THREE.ConeGeometry(1.3 * scale, 2.2 * scale, 6);
    const f2 = new THREE.Mesh(foliageGeo2, foliageMat);
    f2.position.y = 4.3 * scale;
    f2.castShadow = true;
    tree.add(f2);

    return tree;
  }

  buildTrees() {
    const group = new THREE.Group();
    group.name = 'RoadsideTrees';

    const centers = [CONFIG.layout.junctionCenters.left, CONFIG.layout.junctionCenters.right];

    centers.forEach(jc => {
      const offsets = [
        // Along North arm
        { x: -7.5, z: -15 }, { x: -7.5, z: -30 }, { x: -7.5, z: -50 },
        // Along South arm
        { x: -7.5, z: 18 }, { x: -7.5, z: 35 }, { x: -7.5, z: 52 },
        { x: 7.5, z: 18 }, { x: 7.5, z: 35 }, { x: 7.5, z: 52 },
        // Along East arm
        { x: 18, z: 7.5 }, { x: 35, z: 7.5 }, { x: 52, z: 7.5 },
        { x: 18, z: -7.5 }, { x: 35, z: -7.5 }, { x: 52, z: -7.5 },
        // Along West arm
        { x: -18, z: 7.5 }, { x: -35, z: 7.5 }, { x: -52, z: 7.5 },
        { x: -18, z: -7.5 }, { x: -35, z: -7.5 }, { x: -52, z: -7.5 }
      ];

      offsets.forEach(off => {
        const tree = this.createTree(0.85 + Math.random() * 0.3);
        tree.position.set(jc.x + off.x, 0, jc.z + off.z);
        group.add(tree);
      });
    });

    return group;
  }

  buildPerimeterBuildings() {
    const group = new THREE.Group();
    group.name = 'CityBuildings';

    // Simple urban backdrop boxes along scene bounds (Z: -80 and +80, X: -160 and +160)
    const positions = [
      // Far North perimeter
      { x: -140, z: -75, w: 22, h: 28, d: 18 },
      { x: -85,  z: -75, w: 26, h: 20, d: 16 },
      { x: -30,  z: -75, w: 20, h: 34, d: 18 },
      { x: 30,   z: -75, w: 24, h: 22, d: 18 },
      { x: 85,   z: -75, w: 28, h: 18, d: 16 },
      { x: 140,  z: -75, w: 20, h: 30, d: 18 },

      // Far South perimeter
      { x: -140, z: 75, w: 24, h: 22, d: 18 },
      { x: -85,  z: 75, w: 22, h: 32, d: 16 },
      { x: -30,  z: 75, w: 26, h: 24, d: 18 },
      { x: 30,   z: 75, w: 22, h: 36, d: 18 },
      { x: 85,   z: 75, w: 24, h: 26, d: 16 },
      { x: 140,  z: 75, w: 22, h: 20, d: 18 },

      // Far West & East edges
      { x: -165, z: -35, w: 18, h: 25, d: 24 },
      { x: -165, z: 35,  w: 18, h: 30, d: 24 },
      { x: 165,  z: -35, w: 18, h: 28, d: 24 },
      { x: 165,  z: 35,  w: 18, h: 22, d: 24 }
    ];

    positions.forEach((b, idx) => {
      const mat = this.materials.buildingPalette[idx % this.materials.buildingPalette.length];
      const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.x, b.h / 2, b.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });

    return group;
  }

  buildCenterMedian() {
    // Elegant separator median between the two test sites (x = 0)
    const group = new THREE.Group();
    const dividerGeo = new THREE.BoxGeometry(8, 0.2, 160);
    const dividerMat = new THREE.MeshStandardMaterial({
      color: 0x166534, // Green lawn median
      roughness: 0.95
    });
    const median = new THREE.Mesh(dividerGeo, dividerMat);
    median.position.set(0, 0.1, 0);
    group.add(median);

    // Decorative shrubs on median
    for (let z = -70; z <= 70; z += 18) {
      const shrub = this.createTree(0.7);
      shrub.position.set(0, 0.2, z);
      group.add(shrub);
    }

    return group;
  }

  buildStreetLamps() {
    const group = new THREE.Group();
    group.name = 'StreetLamps';

    const centers = [CONFIG.layout.junctionCenters.left, CONFIG.layout.junctionCenters.right];
    const lampOffsets = [
      // Along North arm
      { x: -5.2, z: -20, rotY: Math.PI / 2 },
      { x: -5.2, z: -45, rotY: Math.PI / 2 },
      // Along South arm
      { x: 5.2, z: 22, rotY: -Math.PI / 2 },
      { x: 5.2, z: 48, rotY: -Math.PI / 2 },
      // Along East arm
      { x: 22, z: -5.2, rotY: Math.PI },
      { x: 48, z: -5.2, rotY: Math.PI },
      // Along West arm
      { x: -22, z: 5.2, rotY: 0 },
      { x: -48, z: 5.2, rotY: 0 }
    ];

    centers.forEach(jc => {
      lampOffsets.forEach(lo => {
        const lamp = this.createSingleStreetLamp();
        lamp.position.set(jc.x + lo.x, 0, jc.z + lo.z);
        lamp.rotation.y = lo.rotY;
        group.add(lamp);
      });
    });

    return group;
  }

  createSingleStreetLamp() {
    const lamp = new THREE.Group();

    // Vertical pole (height 6.5m)
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 6.5, 8);
    const poleMesh = new THREE.Mesh(poleGeo, this.materials.streetLampPole);
    poleMesh.position.y = 3.25;
    poleMesh.castShadow = true;
    lamp.add(poleMesh);

    // Arched overhead arm
    const armGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8);
    armGeo.rotateZ(Math.PI / 3);
    const armMesh = new THREE.Mesh(armGeo, this.materials.streetLampPole);
    armMesh.position.set(0.6, 6.2, 0);
    lamp.add(armMesh);

    // Lamp fixture housing
    const fixtureGeo = new THREE.ConeGeometry(0.3, 0.2, 8);
    fixtureGeo.rotateX(Math.PI);
    const fixture = new THREE.Mesh(fixtureGeo, this.materials.streetLampPole);
    fixture.position.set(1.2, 6.0, 0);
    lamp.add(fixture);

    // Glowing bulb / lens
    const bulbGeo = new THREE.SphereGeometry(0.18, 8, 8);
    const bulb = new THREE.Mesh(bulbGeo, this.materials.streetLampGlass);
    bulb.position.set(1.2, 5.9, 0);
    lamp.add(bulb);

    return lamp;
  }
}
