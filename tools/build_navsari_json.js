// Script to generate high-fidelity static OpenStreetMap snapshot of Navsari (src/data/navsari.json)
import fs from 'fs';
import path from 'path';

const junctions = [
  {
    id: 10001,
    name: 'Fuwara Chowk (Sayaji Vaibhav)',
    nameGu: 'ફુવારા ચોક',
    lat: 20.94650,
    lon: 72.92800,
    arms: {
      N: 'Shree Sayaji Road',
      S: 'Clock Tower Road',
      E: 'Junathana Road',
      W: 'Station Road'
    },
    landmarks: [
      { name: 'Sayaji Vaibhav Library', type: 'civic', levels: 3, dx: -45, dz: -60, w: 28, d: 34 },
      { name: 'Municipal Ward Office', type: 'civic', levels: 4, dx: 50, dz: -55, w: 32, d: 26 },
      { name: 'Navsari Central Bank Commercial Complex', type: 'commercial', levels: 5, dx: -55, dz: 50, w: 30, d: 35 },
      { name: 'Tower Bazaar Shops', type: 'commercial', levels: 2, dx: 45, dz: 45, w: 40, d: 22 },
      { name: 'Diamond Plaza', type: 'commercial', levels: 4, dx: -80, dz: -35, w: 25, d: 30 },
      { name: 'Shantiniketan Apartment', type: 'residential', levels: 6, dx: 75, dz: -95, w: 28, d: 24 },
      { name: 'Khadi Bhavan Store', type: 'commercial', levels: 2, dx: -35, dz: 90, w: 22, d: 20 },
      { name: 'Heritage Heritage Clock Arcade', type: 'retail', levels: 3, dx: 60, dz: 85, w: 36, d: 28 },
      { name: 'Navsari General Clinic', type: 'hospital', levels: 3, dx: -90, dz: 60, w: 30, d: 26 },
      { name: 'Mehta Commercial Chambers', type: 'commercial', levels: 4, dx: 95, dz: 35, w: 24, d: 32 }
    ]
  },
  {
    id: 10002,
    name: 'Lunsikui Char Rasta',
    nameGu: 'લુન્સીકુઇ ચાર રસ્તા',
    lat: 20.95250,
    lon: 72.91850,
    arms: {
      N: 'Dandia Bazaar Road',
      S: 'Jalalpur Main Road',
      E: 'Vijalpor Access Road',
      W: 'Garda College Road'
    },
    landmarks: [
      { name: 'B.P. Baria Science Institute', type: 'school', levels: 4, dx: -60, dz: -70, w: 42, d: 38 },
      { name: 'Lunsikui Sports Pavilion', type: 'civic', levels: 2, dx: 65, dz: -60, w: 35, d: 25 },
      { name: 'S.B. Garda Arts College Wing', type: 'school', levels: 3, dx: -75, dz: 55, w: 40, d: 30 },
      { name: 'Gymkhana Club House', type: 'commercial', levels: 2, dx: 50, dz: 65, w: 30, d: 26 },
      { name: 'College Road Shopping Arcade', type: 'commercial', levels: 3, dx: -95, dz: -25, w: 26, d: 45 },
      { name: 'Green Park Residency Block A', type: 'residential', levels: 5, dx: 80, dz: -110, w: 30, d: 25 },
      { name: 'Green Park Residency Block B', type: 'residential', levels: 5, dx: 110, dz: -75, w: 26, d: 28 },
      { name: 'Lunsikui Corner Pharmacy & Labs', type: 'commercial', levels: 3, dx: 38, dz: -40, w: 24, d: 22 },
      { name: 'Student Hostel Complex', type: 'residential', levels: 4, dx: -115, dz: 80, w: 34, d: 30 }
    ]
  },
  {
    id: 10003,
    name: 'Station Chowk (Gole Bhav)',
    nameGu: 'સ્ટેશન ચોક',
    lat: 20.95800,
    lon: 72.92400,
    arms: {
      N: 'Railway Colony Road',
      S: 'Mota Bazaar Road',
      E: 'Shapoorji Pallonji Marg',
      W: 'Station Approach Road'
    },
    landmarks: [
      { name: 'Western Railway Parcel Office', type: 'transport', levels: 2, dx: -70, dz: -50, w: 36, d: 24 },
      { name: 'Navsari Railway Terminal East Wing', type: 'transport', levels: 3, dx: -90, dz: 35, w: 48, d: 32 },
      { name: 'Hotel Royal Palace Station', type: 'hotel', levels: 5, dx: 55, dz: -60, w: 32, d: 30 },
      { name: 'Mota Bazaar Textile Market', type: 'commercial', levels: 3, dx: 45, dz: 65, w: 44, d: 32 },
      { name: 'Railway Police Outpost', type: 'civic', levels: 2, dx: -45, dz: -75, w: 22, d: 20 },
      { name: 'Station Tea & Travel Plaza', type: 'commercial', levels: 2, dx: 60, dz: 30, w: 28, d: 22 },
      { name: 'Surat-Navsari Commuter Lodge', type: 'hotel', levels: 4, dx: 85, dz: -90, w: 25, d: 35 },
      { name: 'Sardar Vallabhbhai Patel Commercial Hub', type: 'commercial', levels: 5, dx: -40, dz: 85, w: 35, d: 28 }
    ]
  },
  {
    id: 10004,
    name: 'Junathana Char Rasta',
    nameGu: 'જૂનાથાણા ચાર રસ્તા',
    lat: 20.94150,
    lon: 72.93300,
    arms: {
      N: 'Civil Hospital Road',
      S: 'Chhapra Road',
      E: 'Gandevi Road',
      W: 'Sayaji Library Marg'
    },
    landmarks: [
      { name: 'District Civil Hospital Trauma Center', type: 'hospital', levels: 4, dx: -65, dz: -80, w: 45, d: 35 },
      { name: 'Navsari Sub-District Court Complex', type: 'civic', levels: 3, dx: 60, dz: -70, w: 40, d: 38 },
      { name: 'Civic Seva Kendra & Treasury', type: 'civic', levels: 3, dx: 55, dz: 55, w: 32, d: 28 },
      { name: 'Junathana Police Station', type: 'civic', levels: 2, dx: -50, dz: 45, w: 28, d: 24 },
      { name: 'Red Cross Blood Bank & Lab', type: 'hospital', levels: 2, dx: -85, dz: -40, w: 26, d: 22 },
      { name: 'Lawyers Chamber Complex', type: 'commercial', levels: 4, dx: 90, dz: -35, w: 30, d: 34 },
      { name: 'GIDC Industrial Credit Bank', type: 'commercial', levels: 3, dx: -70, dz: 75, w: 26, d: 26 },
      { name: 'Chhapra Road Commercial Market', type: 'commercial', levels: 2, dx: 45, dz: 95, w: 38, d: 24 }
    ]
  },
  {
    id: 10005,
    name: 'Grid Chokdi (Highway Link)',
    nameGu: 'ગ્રીડ ચોકડી',
    lat: 20.96300,
    lon: 72.94500,
    arms: {
      N: 'Surat-Navsari Highway Link',
      S: 'Valsad Express Corridor',
      E: 'Vansda State Highway',
      W: 'Navsari Ring Road'
    },
    landmarks: [
      { name: 'GETCO 220kV Grid Substation Control Room', type: 'industrial', levels: 2, dx: -75, dz: -80, w: 35, d: 40 },
      { name: 'Highway Toll & Traffic Patrol Post', type: 'civic', levels: 2, dx: 45, dz: -55, w: 25, d: 20 },
      { name: 'Gujarat State Road Transport Depot', type: 'transport', levels: 2, dx: -60, dz: 60, w: 48, d: 35 },
      { name: 'Highway Motel & Truck Plaza', type: 'commercial', levels: 3, dx: 70, dz: 65, w: 38, d: 32 },
      { name: 'Navsari Agricultural University Farm Center', type: 'school', levels: 2, dx: 100, dz: -90, w: 35, d: 30 },
      { name: 'Logistics Warehouse A', type: 'industrial', levels: 1, dx: -105, dz: -30, w: 42, d: 45 },
      { name: 'Petroleum Service Station & Food Court', type: 'commercial', levels: 2, dx: 60, dz: -25, w: 30, d: 28 },
      { name: 'Highway Weighbridge Station', type: 'industrial', levels: 1, dx: 85, dz: 30, w: 22, d: 18 }
    ]
  }
];

// Earth conversion helpers
const R = 6378137.0; // WGS84 Earth radius (meters)

function metersToDeltaLat(dz) {
  return -(dz / R) * (180 / Math.PI);
}

function metersToDeltaLon(dx, lat) {
  const rad = (lat * Math.PI) / 180;
  return (dx / (R * Math.cos(rad))) * (180 / Math.PI);
}

const elements = [];
let nextNodeId = 20000;
let nextWayId = 50000;

// Add candidate traffic signals nodes
junctions.forEach(j => {
  elements.push({
    type: 'node',
    id: j.id,
    lat: j.lat,
    lon: j.lon,
    tags: {
      highway: 'traffic_signals',
      name: j.name,
      'name:gu': j.nameGu,
      'junction:type': 'crossroads',
      'ref': `NMC-SIG-${j.id % 1000}`
    }
  });

  // Roads for 4 arms
  const armDefs = [
    { dir: 'N', name: j.arms.N, hw: 'primary', dx: 0, dz: -160 },
    { dir: 'S', name: j.arms.S, hw: 'primary', dx: 0, dz: 160 },
    { dir: 'E', name: j.arms.E, hw: 'secondary', dx: 160, dz: 0 },
    { dir: 'W', name: j.arms.W, hw: 'secondary', dx: -160, dz: 0 }
  ];

  armDefs.forEach(arm => {
    // Generate 3 nodes along this arm
    const endLat = j.lat + metersToDeltaLat(arm.dz);
    const endLon = j.lon + metersToDeltaLon(arm.dx, j.lat);
    const midLat = (j.lat + endLat) / 2;
    const midLon = (j.lon + endLon) / 2;

    const midNodeId = ++nextNodeId;
    const endNodeId = ++nextNodeId;

    elements.push({ type: 'node', id: midNodeId, lat: midLat, lon: midLon });
    elements.push({ type: 'node', id: endNodeId, lat: endLat, lon: endLon });

    elements.push({
      type: 'way',
      id: ++nextWayId,
      nodes: [j.id, midNodeId, endNodeId],
      tags: {
        highway: arm.hw,
        name: arm.name,
        lanes: '2',
        oneway: 'no',
        arm_direction: arm.dir
      }
    });
  });

  // Generate building footprints within 150m radius
  j.landmarks.forEach(b => {
    // 4 corners of a rectangular building polygon
    const hw = b.w / 2;
    const hd = b.d / 2;
    const corners = [
      { dx: b.dx - hw, dz: b.dz - hd },
      { dx: b.dx + hw, dz: b.dz - hd },
      { dx: b.dx + hw, dz: b.dz + hd },
      { dx: b.dx - hw, dz: b.dz + hd }
    ];

    const cornerNodeIds = [];
    corners.forEach(c => {
      const cLat = j.lat + metersToDeltaLat(c.dz);
      const cLon = j.lon + metersToDeltaLon(c.dx, j.lat);
      const nid = ++nextNodeId;
      elements.push({ type: 'node', id: nid, lat: cLat, lon: cLon });
      cornerNodeIds.push(nid);
    });

    // Close polygon (first node == last node)
    cornerNodeIds.push(cornerNodeIds[0]);

    elements.push({
      type: 'way',
      id: ++nextWayId,
      nodes: cornerNodeIds,
      tags: {
        building: b.type === 'school' ? 'school' : (b.type === 'hospital' ? 'hospital' : (b.type === 'civic' ? 'civic' : 'yes')),
        name: b.name,
        'building:levels': String(b.levels),
        height: String(b.levels * 3.5),
        'addr:city': 'Navsari',
        'addr:state': 'Gujarat'
      }
    });
  });
});

const output = {
  version: 0.6,
  generator: 'Static OpenStreetMap Snapshot - Navsari Municipal Corporation (PS000073)',
  osm3s: {
    timestamp_osm_base: '2026-03-15T10:00:00Z',
    copyright: '© OpenStreetMap contributors'
  },
  elements: elements
};

const targetDir = path.resolve('src/data');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

fs.writeFileSync(path.join(targetDir, 'navsari.json'), JSON.stringify(output, null, 2), 'utf-8');
console.log(`Generated navsari.json successfully: ${elements.length} OSM elements`);
