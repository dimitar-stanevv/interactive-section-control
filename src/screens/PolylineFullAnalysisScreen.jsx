import { useState, useEffect, useCallback, useMemo } from 'react';
import { getCountryLabel } from '../utils/countries';
import { haversineMeters, formatDistance } from '../utils/geo';
import { fetchAllSectionsDirections } from '../utils/directions';
import { hasPolylineProgress } from '../utils/storage';

export default function PolylineFullAnalysisScreen({ sectionsData, onResultsFetched, onStart, onBack }) {
  const country = sectionsData.country;
  const sections = sectionsData.sections;

  const [fetchState, setFetchState] = useState('idle');
  const [progress, setProgress] = useState({ completed: 0, total: sections.length });
  const [results, setResults] = useState(null);
  const [expandedWarnings, setExpandedWarnings] = useState(false);
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

  const sortArrow = useCallback((col) => {
    if (sortCol !== col) return ' \u2195';
    return sortDir === 'asc' ? ' \u2191' : ' \u2193';
  }, [sortCol, sortDir]);

  useEffect(() => {
    let cancelled = false;
    setFetchState('fetching');
    setProgress({ completed: 0, total: sections.length });

    fetchAllSectionsDirections(sections, (p) => {
      if (!cancelled) setProgress(p);
    }).then((res) => {
      if (cancelled) return;
      setResults(res);
      setFetchState('done');
      onResultsFetched(res);
    }).catch((err) => {
      if (cancelled) return;
      setFetchState('error');
      console.error('Bulk fetch failed:', err);
    });

    return () => { cancelled = true; };
  }, [sections]);

  const analysis = useMemo(() => {
    if (!results) return null;

    let haversineWarnCount = 0;
    let midpointWarnCount = 0;
    let shortSectionWarnCount = 0;
    let errorCount = 0;
    const sectionsWithWarnings = [];
    const routeDistances = [];

    for (let i = 0; i < sections.length; i++) {
      const r = results[i];
      if (!r) continue;

      if (r.error) {
        errorCount++;
        continue;
      }

      const totalRouteDist = r.subSections.reduce((s, sub) => s + sub.distance, 0);
      routeDistances.push(totalRouteDist);

      if (r.warnings.length > 0) {
        sectionsWithWarnings.push({ index: i, section: sections[i], warnings: r.warnings });
      }

      for (const w of r.warnings) {
        if (w.includes('too short')) shortSectionWarnCount++;
        else if (w.includes('straight-line')) haversineWarnCount++;
        else if (w.includes('mid point')) midpointWarnCount++;
      }
    }

    const avg = routeDistances.length > 0
      ? routeDistances.reduce((a, b) => a + b, 0) / routeDistances.length : 0;
    const sorted = [...routeDistances].sort((a, b) => a - b);
    const median = sorted.length === 0 ? 0
      : sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];

    return {
      haversineWarnCount,
      midpointWarnCount,
      shortSectionWarnCount,
      errorCount,
      sectionsWithWarnings,
      routeDistances,
      avg,
      median,
      totalWarnings: sectionsWithWarnings.length,
    };
  }, [results, sections]);

  const handleStart = useCallback(() => {
    const existing = hasPolylineProgress(country);
    if (existing) {
      const resume = window.confirm(
        `Found saved progress for ${getCountryLabel(country)}. Resume where you left off?\n\nClick OK to resume, Cancel to start fresh.`
      );
      if (!resume) {
        localStorage.removeItem('sct-polyline-' + country);
      }
    }
    onStart();
  }, [country, onStart]);

  if (fetchState === 'fetching' || fetchState === 'idle') {
    const pct = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;
    return (
      <div className="screen" style={{ justifyContent: 'center' }}>
        <div className="fetch-progress">
          <div className="loading-spinner" style={{ width: 40, height: 40, borderWidth: 4 }} />
          <h2 style={{ marginTop: 24, marginBottom: 8 }}>Fetching Geometry</h2>
          <p style={{ color: '#6b7280', marginBottom: 20 }}>
            {progress.completed} / {progress.total} sections...
          </p>
          <div className="fetch-progress-bar">
            <div className="fetch-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    );
  }

  if (fetchState === 'error') {
    return (
      <div className="screen" style={{ justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: '#ef4444', marginBottom: 12 }}>Fetch Failed</h2>
          <p style={{ color: '#6b7280', marginBottom: 20 }}>An error occurred while fetching geometries.</p>
          <button className="btn btn-secondary" onClick={onBack}>&larr; Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen analysis-screen">
      <div className="analysis-header">
        <button className="btn btn-secondary" onClick={onBack}>&larr; Back</button>
        <h1>Polylines Analysis</h1>
      </div>

      <div style={{ width: '100%', maxWidth: 900 }}>
        <div className="info-row" style={{ fontSize: 16, marginBottom: 8 }}>
          <span className="info-label">Country</span>
          <span className="info-value">{getCountryLabel(country)}</span>
        </div>
        <div className="info-row" style={{ fontSize: 16, marginBottom: 16 }}>
          <span className="info-label">Total sections</span>
          <span className="info-value">{sections.length}</span>
        </div>
      </div>

      {analysis && (
        <>
          {(analysis.totalWarnings > 0 || analysis.errorCount > 0) && (
            <div className="warning-summary" style={{ width: '100%', maxWidth: 900, marginBottom: 24 }}>
              <strong>Warnings Summary</strong>
              <ul style={{ margin: '8px 0 0 0', padding: '0 0 0 20px', fontSize: 13, lineHeight: 1.8 }}>
                {analysis.shortSectionWarnCount > 0 && (
                  <li>{analysis.shortSectionWarnCount} section{analysis.shortSectionWarnCount !== 1 ? 's' : ''} too short for average speed tracking (may be better as fixed speed cameras)</li>
                )}
                {analysis.haversineWarnCount > 0 && (
                  <li>{analysis.haversineWarnCount} section{analysis.haversineWarnCount !== 1 ? 's' : ''} with route distance &gt;25% different from straight-line</li>
                )}
                {analysis.midpointWarnCount > 0 && (
                  <li>{analysis.midpointWarnCount} section{analysis.midpointWarnCount !== 1 ? 's' : ''} with mid-point distance discrepancy</li>
                )}
                {analysis.errorCount > 0 && (
                  <li style={{ color: '#dc2626' }}>{analysis.errorCount} section{analysis.errorCount !== 1 ? 's' : ''} had fetch errors</li>
                )}
              </ul>
            </div>
          )}

          {analysis.totalWarnings === 0 && analysis.errorCount === 0 && (
            <div style={{
              width: '100%', maxWidth: 900, marginBottom: 24,
              background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8,
              padding: '12px 16px', color: '#065f46', fontSize: 14,
            }}>
              All sections fetched successfully with no warnings.
            </div>
          )}

          <FullAnalysisTable
            sections={sections}
            results={results}
            sortCol={sortCol}
            sortDir={sortDir}
            onSort={handleSort}
            sortArrow={sortArrow}
            avgDist={analysis.avg}
            medianDist={analysis.median}
          />

          {analysis.sectionsWithWarnings.length > 0 && (
            <div style={{ width: '100%', maxWidth: 900, marginBottom: 24 }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 13 }}
                onClick={() => setExpandedWarnings(!expandedWarnings)}
              >
                {expandedWarnings ? 'Hide' : 'Show'} Warning Details ({analysis.sectionsWithWarnings.length} sections)
              </button>
              {expandedWarnings && (
                <div style={{ marginTop: 12 }}>
                  {analysis.sectionsWithWarnings.map(({ index, section, warnings }) => (
                    <div key={index} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#374151' }}>
                        Section {index + 1}: {section.start.properties?.osm_road?.road_ref || 'N/A'}
                        {' '}({section.start.properties?.id} &rarr; {section.end.properties?.id})
                      </div>
                      {warnings.map((w, wi) => (
                        <div key={wi} className="warning-banner" style={{ marginBottom: 4 }}>{w}</div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="analysis-footer">
            <button className="btn btn-primary btn-large" onClick={handleStart}>
              Start Processing
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function FullAnalysisTable({ sections, results, sortCol, sortDir, onSort, sortArrow, avgDist, medianDist }) {
  const sortedIndices = useMemo(() => {
    const indices = sections.map((_, i) => i);
    if (!sortCol) return indices;
    indices.sort((a, b) => {
      let va, vb;
      if (sortCol === 'midPts') {
        va = (sections[a].mid_points || []).length;
        vb = (sections[b].mid_points || []).length;
      } else if (sortCol === 'straightLine') {
        const [saLng, saLat] = sections[a].start.geometry.coordinates;
        const [eaLng, eaLat] = sections[a].end.geometry.coordinates;
        va = haversineMeters(saLat, saLng, eaLat, eaLng);
        const [sbLng, sbLat] = sections[b].start.geometry.coordinates;
        const [ebLng, ebLat] = sections[b].end.geometry.coordinates;
        vb = haversineMeters(sbLat, sbLng, ebLat, ebLng);
      } else if (sortCol === 'routeDist') {
        const ra = results[a];
        const rb = results[b];
        va = ra && !ra.error ? ra.subSections.reduce((s, sub) => s + sub.distance, 0) : -1;
        vb = rb && !rb.error ? rb.subSections.reduce((s, sub) => s + sub.distance, 0) : -1;
      } else {
        return 0;
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return indices;
  }, [sections, results, sortCol, sortDir]);

  return (
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
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort('midPts')}>Mid Pts{sortArrow('midPts')}</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort('straightLine')}>Straight-line{sortArrow('straightLine')}</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => onSort('routeDist')}>Route Dist.{sortArrow('routeDist')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedIndices.map((i) => {
                const s = sections[i];
                const r = results[i];
                const road = s.start.properties?.osm_road?.road_ref || s.end.properties?.osm_road?.road_ref || '-';
                const startId = s.start.properties?.id || '-';
                const endId = s.end.properties?.id || '-';
                const midCount = (s.mid_points || []).length;
                const [sLng, sLat] = s.start.geometry.coordinates;
                const [eLng, eLat] = s.end.geometry.coordinates;
                const haversineDist = haversineMeters(sLat, sLng, eLat, eLng);
                const routeDist = r && !r.error ? r.subSections.reduce((sum, sub) => sum + sub.distance, 0) : null;
                const hasWarnings = r && r.warnings && r.warnings.length > 0;
                const hasError = r && r.error;
                return (
                  <tr key={i} className={hasWarnings ? 'row-discrepancy' : ''}>
                    <td>{i + 1}</td>
                    <td>{road}</td>
                    <td style={{ fontSize: 11, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{startId}</td>
                    <td style={{ fontSize: 11, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{endId}</td>
                    <td>{midCount || '-'}</td>
                    <td>{formatDistance(haversineDist)}</td>
                    <td>{hasError ? <span style={{ color: '#dc2626', fontSize: 12 }}>Error</span> : routeDist !== null ? formatDistance(routeDist) : '-'}</td>
                    <td>{hasWarnings && <span className="badge-warn">&#9888;</span>}</td>
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
          <div style={{ fontSize: 12, color: '#6b7280' }}>Avg Route Distance</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{formatDistance(avgDist)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Median Route Distance</div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{formatDistance(medianDist)}</div>
        </div>
      </div>
    </div>
  );
}
