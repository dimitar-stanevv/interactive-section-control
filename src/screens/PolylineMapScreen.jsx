import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Map, { Source, Layer } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import PolylineSidebar from '../components/PolylineSidebar';
import { savePolylineProgress, loadPolylineProgress } from '../utils/storage';
import { fetchAllDirections, computeWarnings, getPointCoords } from '../utils/directions';
import { haversineMeters } from '../utils/geo';
import config from '../../config.json';

const MAPBOX_TOKEN = config.mapbox_access_token;

function buildSectionOrder(sections) {
  const groups = {};
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const ref = s.start.properties?.osm_road?.road_ref
      || s.end.properties?.osm_road?.road_ref
      || '__no_ref__';
    if (!groups[ref]) groups[ref] = [];
    groups[ref].push(i);
  }

  const sortedRefs = Object.keys(groups).sort((a, b) => {
    if (a === '__no_ref__') return 1;
    if (b === '__no_ref__') return -1;
    return groups[b].length - groups[a].length;
  });

  const ordered = [];
  for (const ref of sortedRefs) {
    const indices = groups[ref];
    if (indices.length <= 1) {
      ordered.push(...indices);
      continue;
    }

    const visited = new Set();
    let current = indices[0];
    visited.add(current);
    ordered.push(current);

    while (visited.size < indices.length) {
      const [curLng, curLat] = sections[current].start.geometry.coordinates;
      let nearest = null;
      let nearestDist = Infinity;
      for (const idx of indices) {
        if (visited.has(idx)) continue;
        const [lng, lat] = sections[idx].start.geometry.coordinates;
        const dist = haversineMeters(curLat, curLng, lat, lng);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = idx;
        }
      }
      if (nearest !== null) {
        visited.add(nearest);
        ordered.push(nearest);
        current = nearest;
      }
    }
  }

  return ordered;
}

export default function PolylineMapScreen({ sectionsData, prefetchedResults, onComplete }) {
  const mapRef = useRef(null);
  const country = sectionsData.country;
  const sections = sectionsData.sections;

  const sectionOrder = useMemo(() => buildSectionOrder(sections), [sections]);

  const [currentOrderIndex, setCurrentOrderIndex] = useState(0);
  const [processedSections, setProcessedSections] = useState([]);
  const [movedPoints, setMovedPoints] = useState({});
  const [isMovingPoint, setIsMovingPoint] = useState(null);
  const [currentDirectionsResult, setCurrentDirectionsResult] = useState(null);
  const [isLoadingDirections, setIsLoadingDirections] = useState(false);
  const [directionsError, setDirectionsError] = useState(null);
  const [disregardedIndices, setDisregardedIndices] = useState([]);
  const [isFinished, setIsFinished] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [storageWarning, setStorageWarning] = useState(false);
  const [removedMidIndices, setRemovedMidIndices] = useState(new Set());
  const [customDescription, setCustomDescription] = useState('');
  const toastTimerRef = useRef(null);
  const fetchIdRef = useRef(0);

  const currentSectionIndex = sectionOrder[currentOrderIndex] ?? 0;

  useEffect(() => {
    const saved = loadPolylineProgress(country);
    if (saved && saved.processedSections) {
      setProcessedSections(saved.processedSections);
      setMovedPoints(saved.movedPoints || {});
      setDisregardedIndices(saved.disregardedIndices || []);
      const savedOrderIdx = saved.currentOrderIndex ?? saved.currentSectionIndex ?? 0;
      setCurrentOrderIndex(savedOrderIdx);
      if (savedOrderIdx >= sections.length) {
        setIsFinished(true);
      }
    }
  }, [country, sections.length]);

  const currentSection = sections[currentSectionIndex] || null;

  const effectiveCurrentSection = useMemo(() => {
    if (!currentSection) return null;
    if (removedMidIndices.size === 0) return currentSection;
    const filteredMids = (currentSection.mid_points || []).filter((_, i) => !removedMidIndices.has(i));
    return { ...currentSection, mid_points: filteredMids };
  }, [currentSection, removedMidIndices]);

  const processedOriginalIndices = useMemo(() => {
    const set = new Set();
    for (const ps of processedSections) {
      set.add(ps.originalIndex);
    }
    return set;
  }, [processedSections]);

  const warnings = useMemo(
    () => computeWarnings(currentDirectionsResult, effectiveCurrentSection),
    [currentDirectionsResult, effectiveCurrentSection]
  );

  const persist = useCallback((processed, moved, orderIdx, disregarded) => {
    const savedOk = savePolylineProgress(country, {
      processedSections: processed,
      movedPoints: moved,
      currentOrderIndex: orderIdx,
      disregardedIndices: disregarded,
    });
    setStorageWarning(!savedOk);
  }, [country]);

  const showToast = useCallback((msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 4000);
  }, []);

  const handleRemoveSplitPoint = useCallback((midIndex) => {
    if (!currentSection) return;
    const newRemoved = new Set(removedMidIndices);
    newRemoved.add(midIndex);
    setRemovedMidIndices(newRemoved);

    const filteredMids = (currentSection.mid_points || []).filter((_, i) => !newRemoved.has(i));
    const section = { ...currentSection, mid_points: filteredMids };
    setCurrentDirectionsResult(null);
    setIsLoadingDirections(true);
    setDirectionsError(null);
    const id = ++fetchIdRef.current;
    fetchAllDirections(section, movedPoints).then((result) => {
      if (fetchIdRef.current !== id) return;
      setCurrentDirectionsResult(result);
      setIsLoadingDirections(false);
    }).catch((err) => {
      if (fetchIdRef.current !== id) return;
      setDirectionsError(err.message);
      setIsLoadingDirections(false);
    });
  }, [currentSection, removedMidIndices, movedPoints]);

  const handleRemoveAllSplitPoints = useCallback(() => {
    if (!currentSection) return;
    const mids = currentSection.mid_points || [];
    if (mids.length === 0) return;

    setRemovedMidIndices(new Set(mids.map((_, i) => i)));

    const section = { ...currentSection, mid_points: [] };
    setCurrentDirectionsResult(null);
    setIsLoadingDirections(true);
    setDirectionsError(null);
    const id = ++fetchIdRef.current;
    fetchAllDirections(section, movedPoints).then((result) => {
      if (fetchIdRef.current !== id) return;
      setCurrentDirectionsResult(result);
      setIsLoadingDirections(false);
    }).catch((err) => {
      if (fetchIdRef.current !== id) return;
      setDirectionsError(err.message);
      setIsLoadingDirections(false);
    });
  }, [currentSection, movedPoints]);

  const doFetchDirections = useCallback(async (section, moved) => {
    const id = ++fetchIdRef.current;
    setIsLoadingDirections(true);
    setDirectionsError(null);
    setCurrentDirectionsResult(null);
    try {
      const result = await fetchAllDirections(section, moved);
      if (fetchIdRef.current !== id) return;
      setCurrentDirectionsResult(result);
    } catch (err) {
      if (fetchIdRef.current !== id) return;
      setDirectionsError(err.message);
    } finally {
      if (fetchIdRef.current === id) setIsLoadingDirections(false);
    }
  }, []);

  useEffect(() => {
    if (!currentSection || isFinished) return;
    if (prefetchedResults && prefetchedResults[currentSectionIndex]) {
      const pre = prefetchedResults[currentSectionIndex];
      setCurrentDirectionsResult({ subSections: pre.subSections, directAtoBResult: pre.directAtoBResult });
      setIsLoadingDirections(false);
      setDirectionsError(pre.error || null);
    } else {
      doFetchDirections(currentSection, movedPoints);
    }
  }, [currentOrderIndex, isFinished]);

  const prevOrderIdxRef = useRef(null);
  useEffect(() => {
    if (!effectiveCurrentSection) return;
    if (currentOrderIndex === prevOrderIdxRef.current) return;
    prevOrderIdxRef.current = currentOrderIndex;

    if (!mapRef.current) return;

    const midPoints = effectiveCurrentSection.mid_points || [];
    const allPoints = [effectiveCurrentSection.start, ...midPoints, effectiveCurrentSection.end];
    const coords = allPoints.map((p) => getPointCoords(p, movedPoints));

    if (coords.length === 1) {
      mapRef.current.flyTo({ center: coords[0], zoom: 13, duration: 1000 });
      return;
    }

    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of coords) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    mapRef.current.fitBounds(
      [[minLng, minLat], [maxLng, maxLat]],
      { padding: { top: 80, bottom: 80, left: 80, right: 80 }, duration: 1000, maxZoom: 14 }
    );
  }, [currentOrderIndex, effectiveCurrentSection, movedPoints]);

  const handleContinue = useCallback(() => {
    if (!currentDirectionsResult || !effectiveCurrentSection) return;

    if (warnings.length > 0) {
      const proceed = window.confirm(
        `This section has ${warnings.length} warning(s):\n\n${warnings.join('\n\n')}\n\nDo you want to continue anyway?`
      );
      if (!proceed) return;
    }

    const midPoints = effectiveCurrentSection.mid_points || [];
    const allPoints = [effectiveCurrentSection.start, ...midPoints, effectiveCurrentSection.end];

    const subSectionFeatures = currentDirectionsResult.subSections.map((sub, i) => ({
      startPoint: allPoints[i],
      endPoint: allPoints[i + 1],
      startCoords: getPointCoords(allPoints[i], movedPoints),
      endCoords: getPointCoords(allPoints[i + 1], movedPoints),
      geometry: sub.geometry,
      distance: sub.distance,
      duration: sub.duration,
      haversineDistance: sub.haversineDistance,
    }));

    const newProcessed = [...processedSections, {
      originalIndex: currentSectionIndex,
      section: effectiveCurrentSection,
      subSectionFeatures,
      warnings: computeWarnings(currentDirectionsResult, effectiveCurrentSection),
      movedPointIds: Object.keys(movedPoints).filter((id) => {
        const allIds = allPoints.map((p) => p.properties?.id).filter(Boolean);
        return allIds.includes(id);
      }),
      customDescription: customDescription.trim() || null,
    }];

    const nextOrderIdx = currentOrderIndex + 1;
    setProcessedSections(newProcessed);
    setRemovedMidIndices(new Set());
    setCustomDescription('');

    if (nextOrderIdx >= sectionOrder.length) {
      setCurrentOrderIndex(nextOrderIdx);
      setIsFinished(true);
      persist(newProcessed, movedPoints, nextOrderIdx, disregardedIndices);
    } else {
      setCurrentOrderIndex(nextOrderIdx);
      setCurrentDirectionsResult(null);
      persist(newProcessed, movedPoints, nextOrderIdx, disregardedIndices);
    }
  }, [currentDirectionsResult, effectiveCurrentSection, currentSectionIndex, currentOrderIndex, processedSections, sectionOrder.length, movedPoints, persist, warnings, disregardedIndices, customDescription]);

  const handleDisregard = useCallback(() => {
    if (!currentSection) return;
    const proceed = window.confirm(
      'Are you sure you want to disregard this section? It will be excluded from the final output.'
    );
    if (!proceed) return;

    const newDisregarded = [...disregardedIndices, currentSectionIndex];
    setDisregardedIndices(newDisregarded);
    setRemovedMidIndices(new Set());

    const nextOrderIdx = currentOrderIndex + 1;
    if (nextOrderIdx >= sectionOrder.length) {
      setCurrentOrderIndex(nextOrderIdx);
      setIsFinished(true);
      persist(processedSections, movedPoints, nextOrderIdx, newDisregarded);
    } else {
      setCurrentOrderIndex(nextOrderIdx);
      setCurrentDirectionsResult(null);
      persist(processedSections, movedPoints, nextOrderIdx, newDisregarded);
    }
  }, [currentSection, currentSectionIndex, currentOrderIndex, sectionOrder.length, processedSections, movedPoints, persist, disregardedIndices]);

  const handleUndo = useCallback(() => {
    if (currentOrderIndex <= 0) return;
    const prevOrderIdx = currentOrderIndex - 1;
    const prevOriginalIdx = sectionOrder[prevOrderIdx];

    setRemovedMidIndices(new Set());

    if (disregardedIndices.length > 0 && disregardedIndices[disregardedIndices.length - 1] === prevOriginalIdx) {
      const newDisregarded = disregardedIndices.slice(0, -1);
      setDisregardedIndices(newDisregarded);
      setCurrentOrderIndex(prevOrderIdx);
      setIsFinished(false);
      setCurrentDirectionsResult(null);
      persist(processedSections, movedPoints, prevOrderIdx, newDisregarded);
    } else if (processedSections.length > 0) {
      const newProcessed = processedSections.slice(0, -1);
      setProcessedSections(newProcessed);
      setCurrentOrderIndex(prevOrderIdx);
      setIsFinished(false);
      setCurrentDirectionsResult(null);
      persist(newProcessed, movedPoints, prevOrderIdx, disregardedIndices);
    }
  }, [processedSections, currentOrderIndex, sectionOrder, movedPoints, persist, disregardedIndices]);

  const handleFinish = useCallback(() => {
    const features = [];
    let warningCount = 0;

    for (const ps of processedSections) {
      if (ps.warnings.length > 0) warningCount++;

      const sectionStartProps = ps.section.start.properties || {};
      const sectionEndProps = ps.section.end.properties || {};
      const movedIds = ps.movedPointIds || [];
      const originalStartId = sectionStartProps.id || null;
      const originalEndId = sectionEndProps.id || null;

      for (let i = 0; i < ps.subSectionFeatures.length; i++) {
        const sub = ps.subSectionFeatures[i];
        const startProps = sub.startPoint.properties || {};
        const endProps = sub.endPoint.properties || {};

        features.push({
          type: 'Feature',
          geometry: sub.geometry,
          properties: {
            original_start_point_id: originalStartId,
            original_end_point_id: originalEndId,
            max_speed: sectionStartProps.max_speed ?? null,
            is_variable: sectionStartProps.is_variable ?? false,
            distance: Math.round(sub.distance),
            country,
            rev_geocode: sectionStartProps.rev_geocode || null,
            osm_road: sectionStartProps.osm_road || null,
            description: sectionStartProps.description || null,
            custom_description: ps.customDescription ?? null,
            start_point: {
              id: startProps.id || null,
              lat: sub.startCoords[1],
              lng: sub.startCoords[0],
              is_moved: movedIds.includes(startProps.id),
            },
            end_point: {
              id: endProps.id || null,
              lat: sub.endCoords[1],
              lng: sub.endCoords[0],
              is_moved: movedIds.includes(endProps.id),
            },
          },
        });
      }
    }

    onComplete({
      features,
      warningCount,
      totalSections: sections.length,
      totalPolylines: features.length,
    });
  }, [processedSections, sections.length, country, onComplete]);

  const handleMapClick = useCallback((e) => {
    if (isFinished) return;

    if (isMovingPoint) {
      const newCoords = [e.lngLat.lng, e.lngLat.lat];
      setIsMovingPoint(null);
      showToast('Point repositioned. Fetching new route...');

      if (effectiveCurrentSection) {
        const updatedMoved = { ...movedPoints, [isMovingPoint.pointId]: newCoords };
        setMovedPoints(updatedMoved);
        doFetchDirections(effectiveCurrentSection, updatedMoved);
      }
      return;
    }

    const map = mapRef.current;
    if (!map) return;

    const layers = ['pl-current-start', 'pl-current-end', 'pl-current-splits'];
    const features = map.queryRenderedFeatures(e.point, { layers });
    if (features.length === 0) return;

    const clicked = features[0];
    const clickedId = clicked.properties._pointId;
    if (!clickedId) return;

    setIsMovingPoint({ pointId: clickedId, type: clicked.properties._pointType });
    showToast('Click on the map to reposition the point. Press Escape to cancel.');
  }, [isFinished, isMovingPoint, effectiveCurrentSection, movedPoints, doFetchDirections, showToast]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isMovingPoint) {
        setIsMovingPoint(null);
        showToast('Point move cancelled.');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMovingPoint, showToast]);

  const processedPolylinesGeoJson = useMemo(() => {
    const features = [];
    for (const ps of processedSections) {
      for (const sub of ps.subSectionFeatures) {
        features.push({
          type: 'Feature',
          geometry: sub.geometry,
          properties: { _type: 'processed' },
        });
      }
    }
    return { type: 'FeatureCollection', features };
  }, [processedSections]);

  const processedPointsGeoJson = useMemo(() => {
    const features = [];
    for (const ps of processedSections) {
      const subs = ps.subSectionFeatures;
      if (subs.length === 0) continue;
      const firstSub = subs[0];
      const lastSub = subs[subs.length - 1];
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: firstSub.startCoords },
        properties: { _pointType: 'start' },
      });
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: lastSub.endCoords },
        properties: { _pointType: 'end' },
      });
    }
    return { type: 'FeatureCollection', features };
  }, [processedSections]);

  const unprocessedPolylinesGeoJson = useMemo(() => {
    const features = [];
    for (let oi = currentOrderIndex + 1; oi < sectionOrder.length; oi++) {
      const i = sectionOrder[oi];
      if (processedOriginalIndices.has(i)) continue;
      const pre = prefetchedResults?.[i];
      if (pre && pre.subSections?.length > 0) {
        for (const sub of pre.subSections) {
          if (sub.geometry) {
            features.push({
              type: 'Feature',
              geometry: sub.geometry,
              properties: { _type: 'unprocessed' },
            });
          }
        }
      } else {
        const s = sections[i];
        const midPoints = s.mid_points || [];
        const allPoints = [s.start, ...midPoints, s.end];
        const coords = allPoints.map((p) => getPointCoords(p, movedPoints));
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { _type: 'unprocessed' },
        });
      }
    }
    return { type: 'FeatureCollection', features };
  }, [currentOrderIndex, sectionOrder, sections, movedPoints, prefetchedResults, processedOriginalIndices]);

  const unprocessedPointsGeoJson = useMemo(() => {
    const features = [];
    for (let oi = currentOrderIndex + 1; oi < sectionOrder.length; oi++) {
      const i = sectionOrder[oi];
      if (processedOriginalIndices.has(i)) continue;
      const s = sections[i];
      const startCoords = getPointCoords(s.start, movedPoints);
      const endCoords = getPointCoords(s.end, movedPoints);
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: startCoords },
        properties: { _pointType: 'start' },
      });
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: endCoords },
        properties: { _pointType: 'end' },
      });
    }
    return { type: 'FeatureCollection', features };
  }, [currentOrderIndex, sectionOrder, sections, movedPoints, processedOriginalIndices]);

  const currentPolylineGeoJson = useMemo(() => {
    if (!currentDirectionsResult) return { type: 'FeatureCollection', features: [] };
    const features = currentDirectionsResult.subSections.map((sub, i) => ({
      type: 'Feature',
      geometry: sub.geometry,
      properties: { _segIndex: i },
    }));
    return { type: 'FeatureCollection', features };
  }, [currentDirectionsResult]);

  const currentPointsGeoJson = useMemo(() => {
    if (!effectiveCurrentSection) return { type: 'FeatureCollection', features: [] };
    const midPoints = effectiveCurrentSection.mid_points || [];
    const features = [];

    const startCoords = getPointCoords(effectiveCurrentSection.start, movedPoints);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: startCoords },
      properties: {
        _pointType: 'start',
        _pointId: effectiveCurrentSection.start.properties?.id || 'start',
        _label: 'A',
        _isMoving: isMovingPoint?.pointId === (effectiveCurrentSection.start.properties?.id || 'start'),
      },
    });

    const endCoords = getPointCoords(effectiveCurrentSection.end, movedPoints);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: endCoords },
      properties: {
        _pointType: 'end',
        _pointId: effectiveCurrentSection.end.properties?.id || 'end',
        _label: 'B',
        _isMoving: isMovingPoint?.pointId === (effectiveCurrentSection.end.properties?.id || 'end'),
      },
    });

    midPoints.forEach((mp, i) => {
      const coords = getPointCoords(mp, movedPoints);
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coords },
        properties: {
          _pointType: 'split',
          _pointId: mp.properties?.id || `mid-${i}`,
          _label: String(i + 1),
          _isMoving: isMovingPoint?.pointId === (mp.properties?.id || `mid-${i}`),
        },
      });
    });

    return { type: 'FeatureCollection', features };
  }, [effectiveCurrentSection, movedPoints, isMovingPoint]);

  const initialViewState = useMemo(() => {
    if (currentSection) {
      const startCoords = currentSection.start.geometry.coordinates;
      const endCoords = currentSection.end.geometry.coordinates;
      return {
        longitude: (startCoords[0] + endCoords[0]) / 2,
        latitude: (startCoords[1] + endCoords[1]) / 2,
        zoom: 10,
      };
    }
    return { longitude: 10, latitude: 50, zoom: 5 };
  }, []);

  const interactiveLayerIds = isMovingPoint ? [] : ['pl-current-start', 'pl-current-end', 'pl-current-splits'];

  return (
    <div className="map-screen">
      <PolylineSidebar
        country={country}
        totalSections={sections.length}
        processedCount={currentOrderIndex}
        currentSectionIndex={currentOrderIndex}
        currentSection={effectiveCurrentSection}
        originalMidPoints={currentSection?.mid_points || []}
        removedMidIndices={removedMidIndices}
        directionsResult={currentDirectionsResult}
        isLoadingDirections={isLoadingDirections}
        directionsError={directionsError}
        warnings={warnings}
        isFinished={isFinished}
        isMovingPoint={isMovingPoint}
        onContinue={handleContinue}
        onDisregard={handleDisregard}
        onUndo={handleUndo}
        onRemoveSplitPoint={handleRemoveSplitPoint}
        onRemoveAllSplitPoints={handleRemoveAllSplitPoints}
        canContinue={!!currentDirectionsResult && !isLoadingDirections && !isFinished}
        canUndo={currentOrderIndex > 0}
        onFinish={handleFinish}
        storageWarning={storageWarning}
        disregardedCount={disregardedIndices.length}
        customDescription={customDescription}
        onCustomDescriptionChange={setCustomDescription}
      />
      <div className="map-container">
        <Map
          ref={mapRef}
          initialViewState={initialViewState}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/light-v11"
          onClick={handleMapClick}
          interactiveLayerIds={interactiveLayerIds}
          cursor={isMovingPoint ? 'crosshair' : 'pointer'}
        >
          {/* Processed polylines - green at 40% opacity */}
          <Source id="processed-polylines" type="geojson" data={processedPolylinesGeoJson}>
            <Layer
              id="pl-processed-lines"
              type="line"
              paint={{
                'line-color': '#22c55e',
                'line-width': 4,
                'line-opacity': 0.4,
              }}
            />
          </Source>

          {/* Start/end markers on processed sections (green=start, red=end) */}
          <Source id="processed-points" type="geojson" data={processedPointsGeoJson}>
            <Layer
              id="pl-processed-points"
              type="circle"
              paint={{
                'circle-radius': 6,
                'circle-color': ['match', ['get', '_pointType'], 'start', '#22c55e', 'end', '#ef4444', '#888888'],
                'circle-opacity': 0.6,
                'circle-stroke-width': 1,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-opacity': 0.4,
              }}
            />
          </Source>

          {/* Unprocessed polylines - red at 40% opacity */}
          <Source id="unprocessed-polylines" type="geojson" data={unprocessedPolylinesGeoJson}>
            <Layer
              id="pl-unprocessed-lines"
              type="line"
              paint={{
                'line-color': '#ef4444',
                'line-width': 2,
                'line-opacity': 0.4,
              }}
              layout={{
                'line-cap': 'round',
                'line-join': 'round',
              }}
            />
          </Source>

          {/* Start/end markers on unprocessed sections (green=start, red=end) */}
          <Source id="unprocessed-points" type="geojson" data={unprocessedPointsGeoJson}>
            <Layer
              id="pl-unprocessed-points"
              type="circle"
              paint={{
                'circle-radius': 6,
                'circle-color': ['match', ['get', '_pointType'], 'start', '#22c55e', 'end', '#ef4444', '#888888'],
                'circle-opacity': 0.6,
                'circle-stroke-width': 1,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-opacity': 0.4,
              }}
            />
          </Source>

          {/* Current section polylines - blue */}
          <Source id="current-polylines" type="geojson" data={currentPolylineGeoJson}>
            <Layer
              id="pl-current-lines"
              type="line"
              paint={{
                'line-color': '#3b82f6',
                'line-width': 5,
                'line-opacity': 0.85,
              }}
              layout={{
                'line-cap': 'round',
                'line-join': 'round',
              }}
            />
          </Source>

          {/* Current section points */}
          <Source id="current-points" type="geojson" data={currentPointsGeoJson}>
            <Layer
              id="pl-current-start"
              type="circle"
              filter={['==', ['get', '_pointType'], 'start']}
              paint={{
                'circle-radius': ['case', ['get', '_isMoving'], 16, 12],
                'circle-color': '#22c55e',
                'circle-stroke-width': 3,
                'circle-stroke-color': '#ffffff',
              }}
            />
            <Layer
              id="pl-current-start-label"
              type="symbol"
              filter={['==', ['get', '_pointType'], 'start']}
              layout={{
                'text-field': 'A',
                'text-size': 12,
                'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
                'text-allow-overlap': true,
              }}
              paint={{ 'text-color': '#ffffff' }}
            />
            <Layer
              id="pl-current-start-pulse"
              type="circle"
              filter={['==', ['get', '_pointType'], 'start']}
              paint={{
                'circle-radius': 20,
                'circle-color': '#22c55e',
                'circle-opacity': 0.2,
              }}
            />
            <Layer
              id="pl-current-end"
              type="circle"
              filter={['==', ['get', '_pointType'], 'end']}
              paint={{
                'circle-radius': ['case', ['get', '_isMoving'], 16, 12],
                'circle-color': '#ef4444',
                'circle-stroke-width': 3,
                'circle-stroke-color': '#ffffff',
              }}
            />
            <Layer
              id="pl-current-end-label"
              type="symbol"
              filter={['==', ['get', '_pointType'], 'end']}
              layout={{
                'text-field': 'B',
                'text-size': 12,
                'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
                'text-allow-overlap': true,
              }}
              paint={{ 'text-color': '#ffffff' }}
            />
            <Layer
              id="pl-current-splits"
              type="circle"
              filter={['==', ['get', '_pointType'], 'split']}
              paint={{
                'circle-radius': ['case', ['get', '_isMoving'], 14, 10],
                'circle-color': '#3b82f6',
                'circle-stroke-width': 3,
                'circle-stroke-color': '#ffffff',
              }}
            />
            <Layer
              id="pl-current-splits-label"
              type="symbol"
              filter={['==', ['get', '_pointType'], 'split']}
              layout={{
                'text-field': ['get', '_label'],
                'text-size': 11,
                'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
                'text-allow-overlap': true,
              }}
              paint={{ 'text-color': '#ffffff' }}
            />
          </Source>
        </Map>
        {warnings.length > 0 && !isFinished && (
          <div style={{
            position: 'absolute', top: 16, left: 16, zIndex: 10,
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(245, 158, 11, 0.2)', borderRadius: 24,
            padding: '6px 14px 6px 8px',
          }}>
            <span style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: '50%',
              background: '#f59e0b', color: '#fff',
              fontSize: 16, fontWeight: 700, flexShrink: 0,
            }}>&#9888;</span>
            <span style={{ color: '#92400e', fontSize: 13, fontWeight: 500 }}>
              {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
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
