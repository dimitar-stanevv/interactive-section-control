import config from '../../config.json';
import { haversineMeters } from './geo';

const MAPBOX_TOKEN = config.mapbox_access_token;
const HAVERSINE_WARN_THRESHOLD = 0.25;
const MIDPOINT_DIST_WARN_THRESHOLD = 0.05;
const MIN_STRAIGHT_LINE_M = 200;
const MIN_ROUTE_DISTANCE_M = 300;

export async function fetchDirections(startCoords, endCoords) {
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${startCoords[0]},${startCoords[1]};${endCoords[0]},${endCoords[1]}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Directions API error: ${res.status}`);
  const data = await res.json();
  if (!data.routes || data.routes.length === 0) throw new Error('No route found');
  return {
    geometry: data.routes[0].geometry,
    distance: data.routes[0].distance,
    duration: data.routes[0].duration,
  };
}

export function getPointCoords(feature, movedPoints) {
  const id = feature.properties?.id;
  if (id && movedPoints[id]) return movedPoints[id];
  return feature.geometry.coordinates;
}

function buildSubSections(section, movedPoints) {
  const midPoints = section.mid_points || [];
  const allPoints = [section.start, ...midPoints, section.end];
  const subs = [];
  for (let i = 0; i < allPoints.length - 1; i++) {
    subs.push({
      startPoint: allPoints[i],
      endPoint: allPoints[i + 1],
      startCoords: getPointCoords(allPoints[i], movedPoints),
      endCoords: getPointCoords(allPoints[i + 1], movedPoints),
    });
  }
  return subs;
}

export async function fetchAllDirections(section, movedPoints) {
  const subs = buildSubSections(section, movedPoints);
  const midPoints = section.mid_points || [];
  const hasMidPoints = midPoints.length > 0;

  const subPromises = subs.map((s) =>
    fetchDirections(s.startCoords, s.endCoords).then((result) => ({
      ...result,
      haversineDistance: haversineMeters(
        s.startCoords[1], s.startCoords[0],
        s.endCoords[1], s.endCoords[0]
      ),
    }))
  );

  let directPromise = null;
  if (hasMidPoints) {
    const startCoords = getPointCoords(section.start, movedPoints);
    const endCoords = getPointCoords(section.end, movedPoints);
    directPromise = fetchDirections(startCoords, endCoords);
  }

  const [subResults, directResult] = await Promise.all([
    Promise.all(subPromises),
    directPromise,
  ]);

  return { subSections: subResults, directAtoBResult: directResult };
}

export function computeWarnings(directionsResult, section) {
  const warnings = [];
  if (!directionsResult) return warnings;

  for (let i = 0; i < directionsResult.subSections.length; i++) {
    const sub = directionsResult.subSections[i];
    const label = directionsResult.subSections.length > 1 ? `Segment ${i + 1}` : 'Section';

    if (sub.haversineDistance > 0 && sub.haversineDistance < MIN_STRAIGHT_LINE_M) {
      warnings.push(
        `${label}: straight-line distance is only ${Math.round(sub.haversineDistance)} m (< ${MIN_STRAIGHT_LINE_M} m). This section may be too short for average speed tracking and could be better represented as a fixed speed camera.`
      );
    } else if (sub.distance > 0 && sub.distance < MIN_ROUTE_DISTANCE_M) {
      warnings.push(
        `${label}: route distance is only ${Math.round(sub.distance)} m (< ${MIN_ROUTE_DISTANCE_M} m). This section may be too short for average speed tracking and could be better represented as a fixed speed camera.`
      );
    }

    if (sub.haversineDistance > 0) {
      const ratio = Math.abs(sub.distance - sub.haversineDistance) / sub.haversineDistance;
      if (ratio > HAVERSINE_WARN_THRESHOLD) {
        warnings.push(
          `${label}: route distance (${(sub.distance / 1000).toFixed(1)} km) differs from straight-line (${(sub.haversineDistance / 1000).toFixed(1)} km) by ${Math.round(ratio * 100)}%. A start/end point may be mispositioned.`
        );
      }
    }
  }

  if (directionsResult.directAtoBResult && directionsResult.subSections.length > 1) {
    const sumDist = directionsResult.subSections.reduce((s, r) => s + r.distance, 0);
    const directDist = directionsResult.directAtoBResult.distance;
    if (directDist > 0) {
      const ratio = Math.abs(sumDist - directDist) / directDist;
      if (ratio > MIDPOINT_DIST_WARN_THRESHOLD) {
        warnings.push(
          `Sum of sub-segments (${(sumDist / 1000).toFixed(1)} km) differs from direct A\u2192B route (${(directDist / 1000).toFixed(1)} km) by ${Math.round(ratio * 100)}%. A mid point may not be correctly positioned.`
        );
      }
    }
  }

  return warnings;
}

export function countApiCalls(sections) {
  let total = 0;
  for (const s of sections) {
    const midCount = (s.mid_points || []).length;
    if (midCount > 0) {
      total += midCount + 2;
    } else {
      total += 1;
    }
  }
  return total;
}

export async function fetchAllSectionsDirections(sections, onProgress) {
  const results = new Array(sections.length).fill(null);
  const BATCH_SIZE = 10;
  let completed = 0;

  for (let i = 0; i < sections.length; i += BATCH_SIZE) {
    const batch = sections.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((section) => fetchAllDirections(section, {}))
    );
    batchResults.forEach((result, j) => {
      const idx = i + j;
      if (result.status === 'fulfilled') {
        results[idx] = {
          ...result.value,
          warnings: computeWarnings(result.value, sections[idx]),
          error: null,
        };
      } else {
        results[idx] = {
          subSections: [],
          directAtoBResult: null,
          warnings: [],
          error: result.reason?.message || 'Unknown error',
        };
      }
      completed++;
      onProgress?.({ completed, total: sections.length });
    });
  }
  return results;
}
