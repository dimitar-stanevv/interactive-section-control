import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Map, { Source, Layer } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import Sidebar from '../components/Sidebar';
import { saveProgress, loadProgress } from '../utils/storage';
import { haversineMeters } from '../utils/geo';
import config from '../../config.json';

const MAPBOX_TOKEN = config.mapbox_access_token;

function findClosestEndPoint(startFeature, endPoints, processedPointIds) {
  const [startLng, startLat] = startFeature.geometry.coordinates;
  const startRoadRef = startFeature.properties?.osm_road?.road_ref;
  const MIN_DISTANCE_M = 300;
  let closest = null;
  let minDist = Infinity;
  for (const ep of endPoints) {
    if (processedPointIds.has(ep.properties.id)) continue;
    const epRoadRef = ep.properties?.osm_road?.road_ref;
    if (startRoadRef && epRoadRef !== startRoadRef) continue;
    const [lng, lat] = ep.geometry.coordinates;
    const dist = haversineMeters(startLat, startLng, lat, lng);
    if (dist < MIN_DISTANCE_M) continue;
    if (dist < minDist) {
      minDist = dist;
      closest = ep;
    }
  }
  return closest;
}

function hasNearbyMidPoints(startFeature, midPoints, processedPointIds, thresholdM = 20000) {
  const [startLng, startLat] = startFeature.geometry.coordinates;
  for (const mp of midPoints) {
    if (processedPointIds.has(mp.properties.id)) continue;
    const [lng, lat] = mp.geometry.coordinates;
    if (haversineMeters(startLat, startLng, lat, lng) <= thresholdM) return true;
  }
  return false;
}

function buildStartPointOrder(startPoints) {
  const groups = {};
  for (const f of startPoints) {
    const ref = f.properties.osm_road?.road_ref || '__no_ref__';
    if (!groups[ref]) groups[ref] = [];
    groups[ref].push(f);
  }

  for (const ref of Object.keys(groups)) {
    groups[ref].sort((a, b) => {
      const latA = a.geometry.coordinates[1];
      const latB = b.geometry.coordinates[1];
      const lngA = a.geometry.coordinates[0];
      const lngB = b.geometry.coordinates[0];
      return latA !== latB ? latB - latA : lngA - lngB;
    });
  }

  const sortedRefs = Object.keys(groups).sort((a, b) => {
    if (a === '__no_ref__') return 1;
    if (b === '__no_ref__') return -1;
    return groups[b].length - groups[a].length;
  });

  const ordered = [];
  for (const ref of sortedRefs) {
    ordered.push(...groups[ref]);
  }
  return ordered;
}

export default function FixScdbDataMapScreen({ geojsonData, country, onComplete }) {
  const mapRef = useRef(null);

  const countryFeatures = useMemo(() => {
    return geojsonData.features.filter((f) => f.properties?.country === country);
  }, [geojsonData, country]);

  const { startPoints, endPoints, midPoints, startCount, endCount, midCount } = useMemo(() => {
    const sp = [], ep = [], mp = [];
    for (const f of countryFeatures) {
      const t = f.properties?.type;
      if (t === 'section_start') sp.push(f);
      else if (t === 'section_end') ep.push(f);
      else if (t === 'section_mid') mp.push(f);
    }
    return { startPoints: sp, endPoints: ep, midPoints: mp, startCount: sp.length, endCount: ep.length, midCount: mp.length };
  }, [countryFeatures]);

  const orderedStartPoints = useMemo(() => buildStartPointOrder(startPoints), [startPoints]);

  const [completedSections, setCompletedSections] = useState([]);
  const [danglingStartPoints, setDanglingStartPoints] = useState([]);
  const [currentStartIndex, setCurrentStartIndex] = useState(0);
  const [selectedEndId, setSelectedEndId] = useState(null);
  const [selectedMidIds, setSelectedMidIds] = useState([]);
  const [isFinished, setIsFinished] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const toastTimerRef = useRef(null);
  const [zoomLevel, setZoomLevel] = useState(10);

  const [autonomousRunning, setAutonomousRunning] = useState(false);
  const autonomousRunningRef = useRef(false);
  const autonomousTimerRef = useRef(null);

  const stopAutonomous = useCallback(() => {
    autonomousRunningRef.current = false;
    setAutonomousRunning(false);
    if (autonomousTimerRef.current) {
      clearTimeout(autonomousTimerRef.current);
      autonomousTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const saved = loadProgress(country);
    if (saved && saved.completedSections) {
      setCompletedSections(saved.completedSections);
      setDanglingStartPoints(saved.danglingStartPoints || []);
      setCurrentStartIndex(saved.currentStartIndex || 0);
      if (saved.currentStartIndex >= orderedStartPoints.length) {
        setIsFinished(true);
      }
    }
  }, [country, orderedStartPoints.length]);

  const processedPointIds = useMemo(() => {
    const ids = new Set();
    for (const sec of completedSections) {
      ids.add(sec.start.properties.id);
      if (sec.end) ids.add(sec.end.properties.id);
      for (const m of sec.midPoints) ids.add(m.properties.id);
    }
    for (const dp of danglingStartPoints) {
      ids.add(dp.properties.id);
    }
    return ids;
  }, [completedSections, danglingStartPoints]);

  const currentStartPoint = orderedStartPoints[currentStartIndex] || null;

  const currentRoadRef = currentStartPoint?.properties?.osm_road?.road_ref || 'No road ref';

  const persist = useCallback((sections, dangling, idx) => {
    saveProgress(country, {
      completedSections: sections,
      danglingStartPoints: dangling,
      currentStartIndex: idx,
      startPointOrder: orderedStartPoints.map((f) => f.properties.id),
    });
  }, [country, orderedStartPoints]);

  const advanceToNext = useCallback((sections, dangling, nextIdx) => {
    setSelectedEndId(null);
    setSelectedMidIds([]);

    if (nextIdx >= orderedStartPoints.length) {
      setCurrentStartIndex(nextIdx);
      persist(sections, dangling, nextIdx);
      setIsFinished(true);
    } else {
      setCurrentStartIndex(nextIdx);
      persist(sections, dangling, nextIdx);
    }
  }, [orderedStartPoints.length, persist]);

  const handleContinue = useCallback(() => {
    if (!selectedEndId || !currentStartPoint) return;
    stopAutonomous();
    const endFeature = endPoints.find((f) => f.properties.id === selectedEndId);

    const midFeatures = selectedMidIds
      .map((id) => midPoints.find((f) => f.properties.id === id))
      .filter(Boolean);

    const startId = String(currentStartPoint.properties.id);
    const mismatches = [];
    if (!String(endFeature.properties.id).includes(startId)) {
      mismatches.push(`End point ID (${endFeature.properties.id})`);
    }
    for (const mf of midFeatures) {
      if (!String(mf.properties.id).includes(startId)) {
        mismatches.push(`Mid point ID (${mf.properties.id})`);
      }
    }
    if (mismatches.length > 0) {
      if (!window.confirm(`The following IDs do not contain the start point ID (${startId}):\n\n${mismatches.join('\n')}\n\nAre you sure you want to continue?`)) {
        return;
      }
    }

    const newSection = {
      start: currentStartPoint,
      end: endFeature,
      midPoints: midFeatures,
    };

    const newSections = [...completedSections, newSection];
    setCompletedSections(newSections);
    advanceToNext(newSections, danglingStartPoints, currentStartIndex + 1);
  }, [selectedEndId, currentStartPoint, endPoints, midPoints, selectedMidIds, completedSections, danglingStartPoints, currentStartIndex, advanceToNext, stopAutonomous]);

  const handleNoEndPoint = useCallback(() => {
    if (!currentStartPoint) return;
    const id = currentStartPoint.properties.id;
    if (!window.confirm(`Dismiss start point "${id}" with no matching end point?\n\nIt will appear as a dangling point in the export.`)) return;
    stopAutonomous();
    const newDangling = [...danglingStartPoints, currentStartPoint];
    setDanglingStartPoints(newDangling);
    advanceToNext(completedSections, newDangling, currentStartIndex + 1);
  }, [currentStartPoint, danglingStartPoints, completedSections, currentStartIndex, advanceToNext, stopAutonomous]);

  const showToast = useCallback((msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const handleAutoMatch = useCallback(() => {
    if (!currentStartPoint) return;
    stopAutonomous();
    const closest = findClosestEndPoint(currentStartPoint, endPoints, processedPointIds);
    if (closest) {
      setSelectedEndId(closest.properties.id);
    } else {
      showToast('No matching end point found (same road, ≥300m away)');
    }
  }, [currentStartPoint, endPoints, processedPointIds, showToast, stopAutonomous]);

  const handleUndo = useCallback(() => {
    if (completedSections.length === 0 && danglingStartPoints.length === 0) return;
    stopAutonomous();

    const prevIdx = currentStartIndex - 1;
    if (prevIdx < 0) return;

    const prevStartPoint = orderedStartPoints[prevIdx];
    const prevStartId = prevStartPoint?.properties?.id;

    const lastDangling = danglingStartPoints[danglingStartPoints.length - 1];
    if (lastDangling && lastDangling.properties.id === prevStartId) {
      const newDangling = danglingStartPoints.slice(0, -1);
      setDanglingStartPoints(newDangling);
      setCurrentStartIndex(prevIdx);
      setSelectedEndId(null);
      setSelectedMidIds([]);
      setIsFinished(false);
      persist(completedSections, newDangling, prevIdx);
      return;
    }

    const lastSection = completedSections[completedSections.length - 1];
    if (lastSection) {
      const newSections = completedSections.slice(0, -1);
      setCompletedSections(newSections);
      setCurrentStartIndex(prevIdx);
      setSelectedEndId(null);
      setSelectedMidIds([]);
      setIsFinished(false);
      persist(newSections, danglingStartPoints, prevIdx);
    }
  }, [completedSections, danglingStartPoints, currentStartIndex, orderedStartPoints, persist, stopAutonomous]);

  const handleFinish = useCallback(() => {
    const usedEndIds = new Set();
    for (const sec of completedSections) {
      if (sec.end) usedEndIds.add(sec.end.properties.id);
    }
    const danglingEndPoints = endPoints.filter((f) => !usedEndIds.has(f.properties.id));

    onComplete({
      sections: completedSections,
      danglingStartPoints,
      danglingEndPoints,
    });
  }, [completedSections, danglingStartPoints, endPoints, onComplete]);

  // --- Autonomous Mode ---
  const stateRef = useRef({});
  stateRef.current = {
    currentStartPoint, endPoints, midPoints, processedPointIds,
    completedSections, danglingStartPoints, currentStartIndex, isFinished,
  };
  const callbacksRef = useRef({});
  callbacksRef.current = { advanceToNext, showToast };

  const autonomousTickRef = useRef(null);
  autonomousTickRef.current = () => {
    const s = stateRef.current;
    const { advanceToNext: advance, showToast: toast } = callbacksRef.current;

    if (!autonomousRunningRef.current || s.isFinished || !s.currentStartPoint) {
      stopAutonomous();
      return;
    }

    const matched = findClosestEndPoint(s.currentStartPoint, s.endPoints, s.processedPointIds);
    if (!matched) {
      toast('Autonomous stopped: no matching end point');
      stopAutonomous();
      return;
    }

    setSelectedEndId(matched.properties.id);

    const [startLng, startLat] = s.currentStartPoint.geometry.coordinates;
    const [endLng, endLat] = matched.geometry.coordinates;
    const startToEndDist = haversineMeters(startLat, startLng, endLat, endLng);

    autonomousTimerRef.current = setTimeout(() => {
      if (!autonomousRunningRef.current) return;
      const s2 = stateRef.current;

      if (!s2.currentStartPoint) { stopAutonomous(); return; }

      if (hasNearbyMidPoints(s2.currentStartPoint, s2.midPoints, s2.processedPointIds, startToEndDist)) {
        callbacksRef.current.showToast('Autonomous stopped: mid points closer than matched end point');
        stopAutonomous();
        return;
      }

      const startId = String(s2.currentStartPoint.properties.id);
      if (!String(matched.properties.id).includes(startId)) {
        callbacksRef.current.showToast('Autonomous stopped: end point ID mismatch');
        stopAutonomous();
        return;
      }

      const newSection = { start: s2.currentStartPoint, end: matched, midPoints: [] };
      const newSections = [...s2.completedSections, newSection];
      setCompletedSections(newSections);
      callbacksRef.current.advanceToNext(newSections, s2.danglingStartPoints, s2.currentStartIndex + 1);

      autonomousTimerRef.current = setTimeout(() => {
        if (!autonomousRunningRef.current) return;
        autonomousTickRef.current();
      }, 1000);
    }, 1000);
  };

  const handleToggleAutonomous = useCallback(() => {
    if (autonomousRunningRef.current) {
      stopAutonomous();
    } else {
      autonomousRunningRef.current = true;
      setAutonomousRunning(true);
      autonomousTickRef.current();
    }
  }, [stopAutonomous]);

  useEffect(() => {
    if (isFinished && autonomousRunningRef.current) {
      stopAutonomous();
    }
  }, [isFinished, stopAutonomous]);

  useEffect(() => {
    return () => {
      if (autonomousTimerRef.current) clearTimeout(autonomousTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'm' || e.key === 'M') {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (autonomousRunningRef.current) return;
        handleAutoMatch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleAutoMatch]);

  const prevStartIdRef = useRef(null);
  useEffect(() => {
    if (!currentStartPoint) return;
    const currentId = currentStartPoint.properties.id;
    if (currentId === prevStartIdRef.current) return;
    prevStartIdRef.current = currentId;

    if (!mapRef.current) return;
    const [lng, lat] = currentStartPoint.geometry.coordinates;
    mapRef.current.flyTo({ center: [lng, lat], zoom: zoomLevel, duration: 1000 });
  }, [currentStartPoint, zoomLevel]);

  const handleMapClick = useCallback((e) => {
    if (isFinished || autonomousRunningRef.current) return;
    const map = mapRef.current;
    if (!map) return;

    const features = map.queryRenderedFeatures(e.point, {
      layers: ['end-points', 'end-point-selected', 'mid-points', 'mid-points-selected'],
    });

    if (features.length === 0) return;

    const clicked = features[0];
    const clickedId = clicked.properties.id;
    const clickedType = clicked.properties.type;

    if (processedPointIds.has(clickedId)) return;

    stopAutonomous();

    if (clickedType === 'section_end') {
      setSelectedEndId((prev) => (prev === clickedId ? null : clickedId));
    } else if (clickedType === 'section_mid') {
      setSelectedMidIds((prev) => {
        if (prev.includes(clickedId)) {
          return prev.filter((id) => id !== clickedId);
        }
        return [...prev, clickedId];
      });
    }
  }, [isFinished, processedPointIds, stopAutonomous]);

  const allPointsGeoJson = useMemo(() => {
    const features = countryFeatures.map((f) => {
      const id = f.properties.id;
      const isProcessed = processedPointIds.has(id);
      const isCurrent = currentStartPoint && id === currentStartPoint.properties.id;
      const isSelectedEnd = id === selectedEndId;
      const midOrder = selectedMidIds.indexOf(id);

      return {
        ...f,
        properties: {
          ...f.properties,
          _isProcessed: isProcessed,
          _isCurrent: isCurrent,
          _isSelectedEnd: isSelectedEnd,
          _midOrder: midOrder >= 0 ? midOrder + 1 : -1,
        },
      };
    });
    return { type: 'FeatureCollection', features };
  }, [countryFeatures, processedPointIds, currentStartPoint, selectedEndId, selectedMidIds]);

  const initialViewState = useMemo(() => {
    if (currentStartPoint) {
      return {
        longitude: currentStartPoint.geometry.coordinates[0],
        latitude: currentStartPoint.geometry.coordinates[1],
        zoom: 10,
      };
    }
    if (countryFeatures.length > 0) {
      let sumLng = 0, sumLat = 0;
      for (const f of countryFeatures) {
        sumLng += f.geometry.coordinates[0];
        sumLat += f.geometry.coordinates[1];
      }
      return {
        longitude: sumLng / countryFeatures.length,
        latitude: sumLat / countryFeatures.length,
        zoom: 7,
      };
    }
    return { longitude: 10, latitude: 50, zoom: 4 };
  }, []);

  const selectedEndFeature = selectedEndId
    ? endPoints.find((f) => f.properties.id === selectedEndId) || null
    : null;

  const selectedMidFeatures = selectedMidIds
    .map((id) => midPoints.find((f) => f.properties.id === id))
    .filter(Boolean);

  return (
    <div className="map-screen">
      <Sidebar
        country={country}
        totalCameras={countryFeatures.length}
        startCount={startCount}
        endCount={endCount}
        midCount={midCount}
        processedCount={currentStartIndex}
        totalStartPoints={orderedStartPoints.length}
        currentRoadRef={currentRoadRef}
        currentStartPoint={currentStartPoint}
        selectedEndFeature={selectedEndFeature}
        selectedMidFeatures={selectedMidFeatures}
        onContinue={handleContinue}
        onNoEndPoint={handleNoEndPoint}
        onUndo={handleUndo}
        canContinue={!!selectedEndId && !isFinished}
        canUndo={currentStartIndex > 0}
        isFinished={isFinished}
        onFinish={handleFinish}
        onAutoMatch={handleAutoMatch}
        onRemoveMid={(id) => {
          setSelectedMidIds((prev) => prev.filter((mid) => mid !== id));
        }}
        autonomousRunning={autonomousRunning}
        onToggleAutonomous={handleToggleAutonomous}
        zoomLevel={zoomLevel}
        onZoomLevelChange={setZoomLevel}
      />
      <div className="map-container">
        <Map
          ref={mapRef}
          initialViewState={initialViewState}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/light-v11"
          onClick={handleMapClick}
          interactiveLayerIds={['end-points', 'end-point-selected', 'mid-points', 'mid-points-selected']}
          cursor="pointer"
        >
          <Source id="all-points" type="geojson" data={allPointsGeoJson}>
            {/* Processed start points */}
            <Layer
              id="start-points-processed"
              type="circle"
              filter={['all', ['==', ['get', 'type'], 'section_start'], ['==', ['get', '_isProcessed'], true], ['!=', ['get', '_isCurrent'], true]]}
              paint={{
                'circle-radius': 6,
                'circle-color': '#22c55e',
                'circle-opacity': 0.2,
                'circle-stroke-width': 1,
                'circle-stroke-color': '#16a34a',
                'circle-stroke-opacity': 0.2,
              }}
            />
            {/* Unprocessed start points */}
            <Layer
              id="start-points"
              type="circle"
              filter={['all', ['==', ['get', 'type'], 'section_start'], ['!=', ['get', '_isProcessed'], true], ['!=', ['get', '_isCurrent'], true]]}
              paint={{
                'circle-radius': 7,
                'circle-color': '#22c55e',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#16a34a',
              }}
            />
            {/* Processed end points */}
            <Layer
              id="end-points-processed"
              type="circle"
              filter={['all', ['==', ['get', 'type'], 'section_end'], ['==', ['get', '_isProcessed'], true]]}
              paint={{
                'circle-radius': 6,
                'circle-color': '#ef4444',
                'circle-opacity': 0.2,
                'circle-stroke-width': 1,
                'circle-stroke-color': '#dc2626',
                'circle-stroke-opacity': 0.2,
              }}
            />
            {/* Unprocessed end points (not selected) */}
            <Layer
              id="end-points"
              type="circle"
              filter={['all', ['==', ['get', 'type'], 'section_end'], ['!=', ['get', '_isProcessed'], true], ['!=', ['get', '_isSelectedEnd'], true]]}
              paint={{
                'circle-radius': 7,
                'circle-color': '#ef4444',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#dc2626',
              }}
            />
            {/* Selected end point */}
            <Layer
              id="end-point-selected"
              type="circle"
              filter={['==', ['get', '_isSelectedEnd'], true]}
              paint={{
                'circle-radius': 11,
                'circle-color': '#ef4444',
                'circle-stroke-width': 3,
                'circle-stroke-color': '#ffffff',
              }}
            />
            {/* Processed mid points */}
            <Layer
              id="mid-points-processed"
              type="circle"
              filter={['all', ['==', ['get', 'type'], 'section_mid'], ['==', ['get', '_isProcessed'], true]]}
              paint={{
                'circle-radius': 5,
                'circle-color': '#3b82f6',
                'circle-opacity': 0.2,
                'circle-stroke-width': 1,
                'circle-stroke-color': '#2563eb',
                'circle-stroke-opacity': 0.2,
              }}
            />
            {/* Unprocessed mid points (not selected) */}
            <Layer
              id="mid-points"
              type="circle"
              filter={['all', ['==', ['get', 'type'], 'section_mid'], ['!=', ['get', '_isProcessed'], true], ['==', ['get', '_midOrder'], -1]]}
              paint={{
                'circle-radius': 6,
                'circle-color': '#3b82f6',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#2563eb',
              }}
            />
            {/* Selected mid points */}
            <Layer
              id="mid-points-selected"
              type="circle"
              filter={['>', ['get', '_midOrder'], 0]}
              paint={{
                'circle-radius': 10,
                'circle-color': '#3b82f6',
                'circle-stroke-width': 3,
                'circle-stroke-color': '#ffffff',
              }}
            />
            <Layer
              id="mid-points-selected-label"
              type="symbol"
              filter={['>', ['get', '_midOrder'], 0]}
              layout={{
                'text-field': ['to-string', ['get', '_midOrder']],
                'text-size': 11,
                'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
                'text-allow-overlap': true,
              }}
              paint={{
                'text-color': '#ffffff',
              }}
            />
            {/* Current start point (highlighted) */}
            <Layer
              id="current-start-point"
              type="circle"
              filter={['==', ['get', '_isCurrent'], true]}
              paint={{
                'circle-radius': 13,
                'circle-color': '#22c55e',
                'circle-stroke-width': 4,
                'circle-stroke-color': '#ffffff',
              }}
            />
            <Layer
              id="current-start-pulse"
              type="circle"
              filter={['==', ['get', '_isCurrent'], true]}
              paint={{
                'circle-radius': 20,
                'circle-color': '#22c55e',
                'circle-opacity': 0.25,
              }}
            />
            {/* Selected end point checkmark */}
            <Layer
              id="end-point-selected-label"
              type="symbol"
              filter={['==', ['get', '_isSelectedEnd'], true]}
              layout={{
                'text-field': '✓',
                'text-size': 14,
                'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
                'text-allow-overlap': true,
              }}
              paint={{
                'text-color': '#ffffff',
              }}
            />
          </Source>
        </Map>
      </div>
      {toastMessage && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: '#333', color: '#fff', padding: '10px 20px', borderRadius: 8,
          fontSize: 14, zIndex: 9999, boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}>
          {toastMessage}
        </div>
      )}
    </div>
  );
}
