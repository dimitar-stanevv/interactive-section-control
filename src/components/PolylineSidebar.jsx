import { getCountryLabel } from '../utils/countries';
import { formatDistance } from '../utils/geo';
import { getStorageUsageBytes, formatStorageSize } from '../utils/storage';

function SpeedLimitSign({ maxSpeed }) {
  const isEmpty = maxSpeed == null;
  return (
    <div style={{
      width: 44, height: 44, borderRadius: '50%',
      border: '4px solid #dc2626',
      background: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      {!isEmpty && (
        <span style={{
          fontSize: maxSpeed >= 100 ? 14 : 16,
          fontWeight: 800, color: '#1a1a1a', lineHeight: 1,
        }}>{maxSpeed}</span>
      )}
    </div>
  );
}

function streetViewUrl(lat, lng) {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
}

function PointInfo({ feature, label }) {
  if (!feature) return null;
  const props = feature.properties || {};
  const [lng, lat] = feature.geometry.coordinates;
  const road = props.osm_road;
  return (
    <div className="point-info">
      {label && <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>}
      <div className="info-row"><span className="info-label">ID</span><span className="info-value">{props.id}</span></div>
      {props.description && (
        <div className="info-row"><span className="info-label">Desc</span><span className="info-value">{props.description}</span></div>
      )}
      {road && (
        <div className="info-row"><span className="info-label">Road</span><span className="info-value">{road.road_ref || 'N/A'} ({road.road_class})</span></div>
      )}
      {road?.maxspeed_tag != null && (
        <div className="info-row"><span className="info-label">Max speed</span><span className="info-value">{road.maxspeed_tag}</span></div>
      )}
      <div className="info-row">
        <span className="info-label">Coords</span>
        <span className="info-value">
          {lat.toFixed(5)}, {lng.toFixed(5)}
          {' '}
          <a
            href={streetViewUrl(lat, lng)}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Google Street View"
            style={{ color: '#3b82f6', fontSize: 11, textDecoration: 'none' }}
          >
            Street View ↗
          </a>
        </span>
      </div>
    </div>
  );
}

export default function PolylineSidebar({
  country,
  totalSections,
  processedCount,
  currentSectionIndex,
  currentSection,
  originalMidPoints,
  removedMidIndices,
  directionsResult,
  isLoadingDirections,
  directionsError,
  warnings,
  isFinished,
  isMovingPoint,
  onContinue,
  onDisregard,
  onUndo,
  onRemoveSplitPoint,
  onRemoveAllSplitPoints,
  canContinue,
  canUndo,
  onFinish,
  storageWarning,
  disregardedCount,
  customDescription,
  onCustomDescriptionChange,
}) {
  const progressPct = totalSections > 0 ? (processedCount / totalSections) * 100 : 0;
  const storageBytes = getStorageUsageBytes();
  const midPoints = currentSection?.mid_points || [];
  const subSectionCount = midPoints.length + 1;
  const startMaxSpeed = currentSection?.start?.properties?.max_speed;
  const originalMids = originalMidPoints || [];
  const removedSet = removedMidIndices || new Set();
  const hasRemovals = removedSet.size > 0;
  const remainingCount = originalMids.length - removedSet.size;

  return (
    <div className="sidebar" style={isMovingPoint ? { opacity: 0.5, pointerEvents: 'none', position: 'relative' } : {}}>
      {isMovingPoint && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10, pointerEvents: 'none',
        }}>
          <div style={{
            background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '16px 24px',
            borderRadius: 8, fontSize: 14, textAlign: 'center', maxWidth: 280,
          }}>
            Point Move Mode<br />
            <span style={{ fontSize: 12, color: '#9ca3af' }}>Click on the map to reposition. Press Escape to cancel.</span>
          </div>
        </div>
      )}

      <div className="sidebar-section">
        <h2 style={{ marginBottom: 8 }}>Create Polylines</h2>
        <div className="info-row"><span className="info-label">Country</span><span className="info-value">{getCountryLabel(country)}</span></div>
        <div className="info-row"><span className="info-label">Total sections</span><span className="info-value">{totalSections}</span></div>
        <div className="info-row">
          <span className="info-label">Storage</span>
          <span className="info-value" style={storageWarning ? { color: '#f59e0b' } : {}}>{formatStorageSize(storageBytes)} used</span>
        </div>
      </div>

      <div className="sidebar-section">
        <div className="info-row">
          <span className="info-label">Progress</span>
          <span className="info-value">{processedCount} / {totalSections} sections</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {!isFinished && currentSection && (
        <>
          <div className="sidebar-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: midPoints.length > 0 ? 8 : 0 }}>
              <h3 style={{ marginBottom: 0 }}>Section {currentSectionIndex + 1} of {totalSections}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {startMaxSpeed !== undefined && currentSection.start.properties?.is_variable && (
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: '#d97706',
                    background: '#fef3c7', padding: '2px 6px', borderRadius: 4,
                    lineHeight: 1.2,
                  }}>VAR</span>
                )}
                {startMaxSpeed !== undefined && !currentSection.start.properties?.is_variable && (
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: '#6b7280',
                    background: '#f3f4f6', padding: '2px 6px', borderRadius: 4,
                    lineHeight: 1.2,
                  }}>FIXED</span>
                )}
                <SpeedLimitSign maxSpeed={startMaxSpeed} />
              </div>
            </div>
            {originalMids.length > 0 && (
              <div className="info-row">
                <span className="info-label">Mid points</span>
                <span className="info-value">
                  {hasRemovals ? `${remainingCount} of ${originalMids.length}` : originalMids.length} ({subSectionCount} sub-section{subSectionCount !== 1 ? 's' : ''})
                </span>
              </div>
            )}
          </div>

          <div className="sidebar-section">
            <PointInfo feature={currentSection.start} label="Start point (green)" />
          </div>

          <div className="sidebar-section">
            <PointInfo feature={currentSection.end} label="End point (red)" />
          </div>

          {originalMids.length > 0 && (
            <div className="sidebar-section">
              <h3>Split Points ({remainingCount})</h3>
              <ul className="mid-list">
                {originalMids.map((mp, i) => {
                  if (removedSet.has(i)) return null;
                  return (
                    <li key={mp.properties?.id || i}>
                      <span className="mid-order">{i + 1}</span>
                      <span className="mid-id" style={{ fontSize: 12 }}>
                        {mp.properties?.id || `Mid ${i + 1}`}
                        {(() => {
                          const [mLng, mLat] = mp.geometry.coordinates;
                          return (
                            <a
                              href={streetViewUrl(mLat, mLng)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open in Google Street View"
                              style={{ color: '#3b82f6', fontSize: 10, textDecoration: 'none', marginLeft: 4 }}
                            >
                              SV ↗
                            </a>
                          );
                        })()}
                      </span>
                      <button
                        className="btn-remove"
                        title="Remove this split point"
                        onClick={() => onRemoveSplitPoint(i)}
                      >
                        &times;
                      </button>
                    </li>
                  );
                })}
              </ul>
              {remainingCount > 1 && (
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); onRemoveAllSplitPoints(); }}
                  style={{
                    display: 'block', marginTop: 6, fontSize: 12,
                    color: '#ef4444', textDecoration: 'none',
                  }}
                >
                  Remove all split points
                </a>
              )}
              {remainingCount === 1 && (
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); onRemoveAllSplitPoints(); }}
                  style={{
                    display: 'block', marginTop: 6, fontSize: 12,
                    color: '#ef4444', textDecoration: 'none',
                  }}
                >
                  Remove split point
                </a>
              )}
              {hasRemovals && remainingCount === 0 && (
                <div style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', marginTop: 4 }}>
                  All split points removed — section will be a single A → B polyline.
                </div>
              )}
            </div>
          )}

          <div className="sidebar-section">
            <h3>Distances</h3>
            {isLoadingDirections && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                <div className="loading-spinner" />
                <span style={{ fontSize: 13, color: '#6b7280' }}>Fetching routes...</span>
              </div>
            )}
            {directionsError && (
              <div className="warning-banner" style={{ marginBottom: 8 }}>
                <strong>Error:</strong> {directionsError}
              </div>
            )}
            {directionsResult && (
              <table className="distance-table">
                <thead>
                  <tr>
                    <th>Segment</th>
                    <th>Straight</th>
                    <th>Route</th>
                  </tr>
                </thead>
                <tbody>
                  {directionsResult.subSections.map((sub, i) => (
                    <tr key={i}>
                      <td>{midPoints.length > 0 ? `Seg ${i + 1}` : 'A → B'}</td>
                      <td>{formatDistance(sub.haversineDistance)}</td>
                      <td>{formatDistance(sub.distance)}</td>
                    </tr>
                  ))}
                  {directionsResult.subSections.length > 1 && (
                    <tr style={{ fontWeight: 600 }}>
                      <td>Total</td>
                      <td>{formatDistance(directionsResult.subSections.reduce((s, r) => s + r.haversineDistance, 0))}</td>
                      <td>{formatDistance(directionsResult.subSections.reduce((s, r) => s + r.distance, 0))}</td>
                    </tr>
                  )}
                  {directionsResult.directAtoBResult && (
                    <tr style={{ borderTop: '2px solid #e5e7eb' }}>
                      <td>Direct A→B</td>
                      <td>-</td>
                      <td>{formatDistance(directionsResult.directAtoBResult.distance)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {warnings.length > 0 && (
            <div className="sidebar-section">
              <h3 style={{ color: '#d97706' }}>Warnings</h3>
              {warnings.map((w, i) => (
                <div key={i} className="warning-banner" style={{ marginBottom: 6 }}>
                  {w}
                </div>
              ))}
            </div>
          )}

          <div className="sidebar-section">
            <h3>Operator Notes</h3>
            <textarea
              rows={3}
              value={customDescription}
              onChange={(e) => onCustomDescriptionChange(e.target.value)}
              placeholder="Optional comments for this section..."
              style={{
                width: '100%',
                resize: 'vertical',
                fontSize: 13,
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                fontFamily: 'inherit',
                lineHeight: 1.4,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div className="sidebar-actions">
            <button className="btn btn-primary" onClick={onContinue} disabled={!canContinue}>
              Confirm
            </button>
            <button className="btn btn-danger" onClick={onDisregard} disabled={!canContinue}>
              Disregard
            </button>
            <button className="btn btn-secondary" onClick={onUndo} disabled={!canUndo}>
              Undo
            </button>
          </div>

          {storageWarning && (
            <div className="sidebar-section" style={{ background: '#fef3c7', fontSize: 12, color: '#92400e' }}>
              Storage limit approaching. Consider exporting your work.
            </div>
          )}
        </>
      )}

      {isFinished && (
        <div className="sidebar-section finished-box">
          <h3>Processing Complete!</h3>
          <p>All sections have been processed.</p>
          <div style={{ fontSize: 13, margin: '12px 0', textAlign: 'left' }}>
            <div className="info-row">
              <span className="info-label">Confirmed</span>
              <span className="info-value">{processedCount - (disregardedCount || 0)}</span>
            </div>
            {disregardedCount > 0 && (
              <div className="info-row" style={{ color: '#ef4444' }}>
                <span className="info-label">Disregarded</span>
                <span className="info-value">{disregardedCount}</span>
              </div>
            )}
          </div>
          <button className="btn btn-primary" onClick={onFinish}>
            Continue to Export
          </button>
          <button className="btn btn-secondary" onClick={onUndo} disabled={!canUndo} style={{ marginTop: 8 }}>
            Undo Last
          </button>
        </div>
      )}
    </div>
  );
}
