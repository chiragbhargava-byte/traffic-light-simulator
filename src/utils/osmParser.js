/**
 * OSM Parser & Local Geodesic Projection Utility for Navsari Dataset
 * Projects WGS84 (lat/lon) into local Cartesian meters (x = East, -z = North)
 */

const EARTH_RADIUS = 6378137.0; // WGS84 equatorial radius in meters

/**
 * Projects a lat/lon coordinate into local Cartesian meters relative to a center point.
 * In Three.js: +X is East, -Z is North, +Y is Up.
 */
export function latLonToLocalMeters(lat, lon, centerLat, centerLon) {
  const dLat = (lat - centerLat) * (Math.PI / 180.0);
  const dLon = (lon - centerLon) * (Math.PI / 180.0);
  const meanLat = (centerLat * Math.PI) / 180.0;

  const x = dLon * EARTH_RADIUS * Math.cos(meanLat);
  const z = -dLat * EARTH_RADIUS; // -Z is North

  return { x, z };
}

/**
 * Calculates geodesic distance in meters between two lat/lon coordinates.
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const dLat = ((lat2 - lat1) * Math.PI) / 180.0;
  const dLon = ((lon2 - lon1) * Math.PI) / 180.0;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180.0) *
      Math.cos((lat2 * Math.PI) / 180.0) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS * c;
}

/**
 * Parses raw OSM JSON dataset into structured junctions, roads, and building footprints.
 */
export class OsmNavsariData {
  constructor(osmJson) {
    this.raw = osmJson;
    this.nodes = new Map();
    this.ways = [];
    this.junctions = [];
    this.parse();
  }

  parse() {
    // 1. Index all nodes
    for (const el of this.raw.elements) {
      if (el.type === 'node') {
        this.nodes.set(el.id, el);
        if (el.tags && el.tags.highway === 'traffic_signals') {
          this.junctions.push({
            id: el.id,
            name: el.tags.name || `Junction #${el.id}`,
            nameGu: el.tags['name:gu'] || '',
            lat: el.lat,
            lon: el.lon,
            ref: el.tags.ref || `NMC-${el.id}`,
            arms: { N: 'North Road', S: 'South Road', E: 'East Road', W: 'West Road' }
          });
        }
      } else if (el.type === 'way') {
        this.ways.push(el);
      }
    }

    // 2. Discover arm street names for each junction
    for (const junc of this.junctions) {
      for (const way of this.ways) {
        if (!way.tags || !way.tags.highway) continue;
        if (!way.nodes.includes(junc.id)) continue;

        // Determine direction from junction node to other nodes in the way
        const roadName = way.tags.name || 'Connecting Road';
        const explicitDir = way.tags.arm_direction;

        if (explicitDir && ['N', 'S', 'E', 'W'].includes(explicitDir)) {
          junc.arms[explicitDir] = roadName;
        } else {
          // Compute bearing to determine N, S, E, or W
          const otherNodeId = way.nodes[0] === junc.id ? way.nodes[way.nodes.length - 1] : way.nodes[0];
          const otherNode = this.nodes.get(otherNodeId);
          if (otherNode) {
            const loc = latLonToLocalMeters(otherNode.lat, otherNode.lon, junc.lat, junc.lon);
            const angle = Math.atan2(loc.x, -loc.z); // 0 = N, PI/2 = E, PI = S, -PI/2 = W
            const deg = (angle * 180) / Math.PI;

            if (deg >= -45 && deg <= 45) junc.arms.N = roadName;
            else if (deg > 45 && deg <= 135) junc.arms.E = roadName;
            else if (deg < -45 && deg >= -135) junc.arms.W = roadName;
            else junc.arms.S = roadName;
          }
        }
      }
    }
  }

  /**
   * Retrieves all candidate traffic signal junctions.
   */
  getCandidateJunctions() {
    return this.junctions;
  }

  /**
   * Retrieves all building polygons within maxRadiusMeters (default 150m) of a junction.
   * Projected into local coordinates (x, z) relative to that junction center.
   */
  getBuildingsNearJunction(junctionId, maxRadiusMeters = 150.0) {
    const junction = this.junctions.find(j => j.id === junctionId) || this.junctions[0];
    if (!junction) return [];

    const result = [];

    for (const way of this.ways) {
      if (!way.tags || !way.tags.building) continue;

      // Extract polygon coordinates in local meters
      const coords = [];
      let centroidX = 0;
      let centroidZ = 0;
      let validCount = 0;

      for (const nid of way.nodes) {
        const node = this.nodes.get(nid);
        if (node) {
          const loc = latLonToLocalMeters(node.lat, node.lon, junction.lat, junction.lon);
          coords.push(loc);
          centroidX += loc.x;
          centroidZ += loc.z;
          validCount++;
        }
      }

      if (validCount < 3) continue;

      centroidX /= validCount;
      centroidZ /= validCount;

      const distFromJunction = Math.sqrt(centroidX * centroidX + centroidZ * centroidZ);
      if (distFromJunction <= maxRadiusMeters) {
        // Levels and height
        const levels = parseInt(way.tags['building:levels'] || '3', 10);
        const height = parseFloat(way.tags.height) || (levels * 3.5);

        result.push({
          id: way.id,
          name: way.tags.name || `${way.tags.building.toUpperCase()} Building`,
          type: way.tags.building,
          levels,
          height,
          dist: distFromJunction,
          centroid: { x: centroidX, z: centroidZ },
          polygon: coords
        });
      }
    }

    return result;
  }

  /**
   * Retrieves road polyline vectors for 2D offline canvas rendering.
   */
  getRoadVectors(centerLat, centerLon, radiusMeters = 250.0) {
    const roads = [];

    for (const way of this.ways) {
      if (!way.tags || !way.tags.highway) continue;

      const points = [];
      for (const nid of way.nodes) {
        const node = this.nodes.get(nid);
        if (node) {
          const loc = latLonToLocalMeters(node.lat, node.lon, centerLat, centerLon);
          points.push(loc);
        }
      }

      if (points.length >= 2) {
        roads.push({
          id: way.id,
          name: way.tags.name || '',
          highway: way.tags.highway,
          points
        });
      }
    }

    return roads;
  }
}
