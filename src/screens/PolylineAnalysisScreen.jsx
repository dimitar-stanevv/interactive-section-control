import { useState, useMemo, useCallback } from 'react';
import { getCountryLabel } from '../utils/countries';
import { haversineMeters, formatDistance } from '../utils/geo';
import { countApiCalls } from '../utils/directions';
import { hasPolylineProgress } from '../utils/storage';

const API_CALL_LIMIT = 300;
const MIN_STRAIGHT_LINE_M = 200;

export default function PolylineAnalysisScreen({ sectionsData, onFetchGeometry, onStartDirect, onBack }) {
  const country = sectionsData.country;
  const sections = sectionsData.sections;

  const analysis = useMemo(() => {
    let withMidPoints = 0;
    let withoutMidPoints = 0;
    let totalMidPoints = 0;
    let totalPolylines = 0;
    const midPointDistribution = {};

    const distances = [];

    for (const s of sections) {
      const midCount = (s.mid_points || []).length;
      if (midCount > 0) {
        withMidPoints++;
        totalMidPoints += midCount;
        midPointDistribution[midCount] = (midPointDistribution[midCount] || 0) + 1;
        totalPolylines += midCount + 1;
      } else {
        withoutMidPoints++;
        totalPolylines += 1;
      }

      const [sLng, sLat] = s.start.geometry.coordinates;
      const [eLng, eLat] = s.end.geometry.coordinates;
      distances.push(haversineMeters(sLat, sLng, eLat, eLng));
    }

    const distributionEntries = Object.entries(midPointDistribution)
      .map(([count, freq]) => ({ midCount: Number(count), frequency: freq }))
      .sort((a, b) => a.midCount - b.midCount);

    const avg = distances.length > 0 ? distances.reduce((a, b) => a + b, 0) / distances.length : 0;
    const sorted = [...distances].sort((a, b) => a - b);
    const median = sorted.length === 0 ? 0
      : sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];

    const apiCallCount = countApiCalls(sections);
    const shortSectionCount = distances.filter((d) => d < MIN_STRAIGHT_LINE_M).length;

    return {
      totalSections: sections.length,
      withMidPoints,
      withoutMidPoints,
      totalMidPoints,
      totalPolylines,
      distributionEntries,
      distances,
      avg,
      median,
      apiCallCount,
      shortSectionCount,
    };
  }, [sections]);

  const exceedsLimit = analysis.apiCallCount > API_CALL_LIMIT;

  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = useCallback((col) => {
    if (sortCol === col) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }, [sortCol]);

  const sortedIndices = useMemo(() => {
    const indices = sections.map((_, i) => i);
    if (!sortCol) return indices;
    indices.sort((a, b) => {
      let va, vb;
      if (sortCol === 'midPts') {
        va = (sections[a].mid_points || []).length;
        vb = (sections[b].mid_points || []).length;
      } else if (sortCol === 'distance') {
        va = analysis.distances[a];
        vb = analysis.distances[b];
      } else {
        return 0;
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return indices;
  }, [sections, analysis.distances, sortCol, sortDir]);

  const sortArrow = (col) => {
    if (sortCol !== col) return ' \u2195';
    return sortDir === 'asc' ? ' \u2191' : ' \u2193';
  };

  const handleStartDirect = useCallback(() => {
    const existing = hasPolylineProgress(sectionsData.country);
    if (existing) {
      const resume = window.confirm(
        `Found saved progress for ${getCountryLabel(sectionsData.country)}. Resume where you left off?\n\nClick OK to resume, Cancel to start fresh.`
      );
      if (!resume) {
        localStorage.removeItem('sct-polyline-' + sectionsData.country);
      }
    }
    onStartDirect();
  }, [sectionsData.country, onStartDirect]);

  return (
    <div className="screen analysis-screen">
      <div className="analysis-header">
        <button className="btn btn-secondary" onClick={onBack}>&larr; Back</button>
        <h1>Preliminary Polylines Analysis</h1>
      </div>

      <div style={{ width: '100%', maxWidth: 900 }}>
        <div className="info-row" style={{ fontSize: 16, marginBottom: 8 }}>
          <span className="info-label">Country</span>
          <span className="info-value">{getCountryLabel(country)}</span>
        </div>
        <div className="info-row" style={{ fontSize: 16, marginBottom: 8 }}>
          <span className="info-label">Total sections</span>
          <span className="info-value">{analysis.totalSections}</span>
        </div>
        {sectionsData.generated_at && (
          <div className="info-row" style={{ fontSize: 16, marginBottom: 16 }}>
            <span className="info-label">Generated at</span>
            <span className="info-value">{new Date(sectionsData.generated_at).toLocaleString()}</span>
          </div>
        )}
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Count</th>
              <th>Resulting polylines</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Sections without mid points</td>
              <td>{analysis.withoutMidPoints}</td>
              <td>{analysis.withoutMidPoints}</td>
            </tr>
            <tr>
              <td>Sections with mid points</td>
              <td>{analysis.withMidPoints}</td>
              <td>{analysis.totalPolylines - analysis.withoutMidPoints}</td>
            </tr>
            <tr style={{ fontWeight: 600 }}>
              <td>Total</td>
              <td>{analysis.totalSections}</td>
              <td><strong>{analysis.totalPolylines}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      {analysis.distributionEntries.length > 0 && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Mid points per section</th>
                <th>Number of sections</th>
                <th>Resulting polylines</th>
              </tr>
            </thead>
            <tbody>
              {analysis.distributionEntries.map(({ midCount, frequency }) => (
                <tr key={midCount}>
                  <td>{midCount} mid point{midCount !== 1 ? 's' : ''}</td>
                  <td>{frequency}</td>
                  <td>{frequency * (midCount + 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{
        width: '100%', maxWidth: 900,
        background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
        padding: '16px 20px', marginBottom: 24,
      }}>
        <strong style={{ color: '#1e40af' }}>How mid points are handled</strong>
        <p style={{ color: '#1e3a5f', marginTop: 8, lineHeight: 1.6, fontSize: 14 }}>
          Sections with mid points will be split into individual sub-sections. For example, a section
          A &rarr; M &rarr; B becomes two polylines: A &rarr; M and M &rarr; B. This is because the
          mobile app uses only start and end points with LineString geometry, without a concept of mid points.
          The Mapbox Directions API will be called for each sub-section to obtain the actual driving route geometry.
        </p>
        {analysis.totalMidPoints > 0 && (
          <p style={{ color: '#1e3a5f', marginTop: 8, lineHeight: 1.6, fontSize: 14 }}>
            This dataset has <strong>{analysis.totalMidPoints}</strong> mid points across{' '}
            <strong>{analysis.withMidPoints}</strong> sections, which will produce{' '}
            <strong>{analysis.totalPolylines}</strong> total polylines.
          </p>
        )}
      </div>

      {analysis.shortSectionCount > 0 && (
        <div className="warning-summary" style={{ width: '100%', maxWidth: 900, marginBottom: 16 }}>
          <strong>Short sections detected</strong>
          <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5 }}>
            {analysis.shortSectionCount} section{analysis.shortSectionCount !== 1 ? 's have' : ' has'} a
            straight-line distance under {MIN_STRAIGHT_LINE_M} m. These may be too short for average speed
            tracking and could be better represented as fixed speed cameras.
          </p>
        </div>
      )}

      <div className="section-table-container" style={{ width: '100%', maxWidth: 900, marginBottom: 24 }}>
        <div className="table-container" style={{ marginBottom: 0 }}>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Road</th>
                  <th>Start ID</th>
                  <th>End ID</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('midPts')}>Mid Pts{sortArrow('midPts')}</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('distance')}>Straight-line Dist.{sortArrow('distance')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedIndices.map((i) => {
                  const s = sections[i];
                  const road = s.start.properties?.osm_road?.road_ref || s.end.properties?.osm_road?.road_ref || '-';
                  const startId = s.start.properties?.id || '-';
                  const endId = s.end.properties?.id || '-';
                  const midCount = (s.mid_points || []).length;
                  const isShort = analysis.distances[i] < MIN_STRAIGHT_LINE_M;
                  return (
                    <tr key={i} className={isShort ? 'row-discrepancy' : ''}>
                      <td>{i + 1}</td>
                      <td>{road}</td>
                      <td style={{ fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{startId}</td>
                      <td style={{ fontSize: 11, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{endId}</td>
                      <td>{midCount || '-'}</td>
                      <td>{formatDistance(analysis.distances[i])}</td>
                      <td>{isShort && <span className="badge-warn">&#9888;</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{
          display: 'flex', gap: 24, justifyContent: 'center',
          padding: '12px 16px', background: '#f9fafb', borderRadius: '0 0 8px 8px',
          border: '1px solid rgba(0,0,0,0.06)', borderTop: 'none',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Average</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{formatDistance(analysis.avg)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Median</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{formatDistance(analysis.median)}</div>
          </div>
        </div>
      </div>

      <div className="analysis-footer">
        {exceedsLimit ? (
          <>
            <div style={{
              background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8,
              padding: '12px 16px', marginBottom: 16, width: '100%', maxWidth: 900,
            }}>
              <p style={{ color: '#991b1b', fontSize: 13, lineHeight: 1.5 }}>
                This dataset requires <strong>{analysis.apiCallCount}</strong> Mapbox Directions API calls,
                which exceeds the API rate limit of {API_CALL_LIMIT} requests per minute.
                Bulk geometry fetching is not available for this country.
                Geometry will be fetched per-section during processing instead.
              </p>
            </div>
            <button className="btn btn-primary btn-large" onClick={handleStartDirect}>
              Start Processing
            </button>
          </>
        ) : (
          <>
            <div style={{
              background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8,
              padding: '12px 16px', marginBottom: 16, width: '100%', maxWidth: 900,
            }}>
              <p style={{ color: '#92400e', fontSize: 13, lineHeight: 1.5 }}>
                This will make <strong>{analysis.apiCallCount}</strong> requests to the Mapbox Directions API
                to fetch real driving geometries for all sections.
                {analysis.withMidPoints > 0 && (
                  <> For sections with mid points, additional requests are made for sub-segments and A-to-B validation.</>
                )}
              </p>
            </div>
            <button className="btn btn-primary btn-large" onClick={onFetchGeometry}>
              Fetch Actual Geometry
            </button>
          </>
        )}
      </div>
    </div>
  );
}
