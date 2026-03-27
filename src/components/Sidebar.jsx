import { getCountryLabel } from '../utils/countries';

export default function Sidebar({
  country,
  totalCameras,
  startCount,
  endCount,
  midCount,
  processedCount,
  totalStartPoints,
  currentRoadRef,
  currentStartPoint,
  selectedEndFeature,
  selectedMidFeatures,
  onContinue,
  onNoEndPoint,
  onUndo,
  canContinue,
  canUndo,
  isFinished,
  onFinish,
  onAutoMatch,
  onRemoveMid,
  autonomousRunning,
  onToggleAutonomous,
  zoomLevel,
  onZoomLevelChange,
}) {
  const discrepancy = startCount !== endCount;
  const progressPct = totalStartPoints > 0 ? (processedCount / totalStartPoints) * 100 : 0;

  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ marginBottom: 0 }}>Section Control Tool</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {autonomousRunning && (
              <span className="autonomous-pulse" />
            )}
            <span style={{
              fontSize: 11,
              color: autonomousRunning ? '#d97706' : '#6b7280',
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}>
              Autonomous Mode
            </span>
            <button
              className={`btn ${autonomousRunning ? 'btn-warning' : 'btn-secondary'}`}
              style={{ fontSize: '0.7em', padding: '2px 10px' }}
              onClick={onToggleAutonomous}
              disabled={isFinished || !currentStartPoint}
            >
              {autonomousRunning ? 'Stop' : 'Start'}
            </button>
          </div>
        </div>
        <div className="info-row"><span className="info-label">Country</span><span className="info-value">{getCountryLabel(country)}</span></div>
        <div className="info-row"><span className="info-label">Total cameras</span><span className="info-value">{totalCameras}</span></div>
        <div className="info-row">
          <span className="info-label">Start / End / Mid</span>
          <span className="info-value">{startCount} / {endCount} / {midCount}</span>
        </div>
      </div>

      {discrepancy && (
        <div className="sidebar-section warn-box">
          <strong>&#9888; Discrepancy</strong>
          <p>{startCount} start points vs {endCount} end points &mdash; {Math.abs(startCount - endCount)} unmatched {startCount > endCount ? 'start' : 'end'} points</p>
        </div>
      )}

      <div className="sidebar-section">
        <div className="info-row">
          <span className="info-label">Progress</span>
          <span className="info-value">{processedCount} / {totalStartPoints} start points</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {!isFinished && currentStartPoint && (
        <>
          <div className="sidebar-section">
            <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Current Road: {currentRoadRef}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <kbd style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 22, height: 22, borderRadius: 4,
                  background: '#e5e7eb', border: '1px solid #d1d5db',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                  fontSize: 11, fontWeight: 600, fontFamily: 'inherit', color: '#374151',
                }}>M</kbd>
                <button className="btn btn-secondary" style={{ fontSize: '0.8em', padding: '4px 12px' }} onClick={onAutoMatch} disabled={autonomousRunning}>
                  Auto Match
                </button>
              </span>
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span className="info-label" style={{ fontSize: 12 }}>Zoom level</span>
              <select
                value={zoomLevel}
                onChange={(e) => onZoomLevelChange(Number(e.target.value))}
                style={{
                  padding: '2px 6px', borderRadius: 4,
                  border: '1px solid #d1d5db', fontSize: 12,
                  background: '#fff', color: '#374151',
                }}
              >
                {[7, 8, 9, 10, 11, 12, 13, 14].map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="sidebar-section">
            <h3>Current Start Point</h3>
            <PointInfo feature={currentStartPoint} />
          </div>

          <div className="sidebar-section">
            <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Selected End Point</span>
              {selectedEndFeature && (() => {
                const startId = String(currentStartPoint.properties.id);
                const endId = String(selectedEndFeature.properties.id);
                const matches = endId.includes(startId);
                return matches
                  ? <span style={{ color: '#16a34a', fontWeight: 'bold', fontSize: '1em' }}>ID match</span>
                  : <span style={{ color: '#f59e0b', fontSize: '1em' }}>No ID match</span>;
              })()}
            </h3>
            {selectedEndFeature ? (
              <PointInfo feature={selectedEndFeature} />
            ) : (
              <p className="hint">Click a red point on the map to select an end point</p>
            )}
          </div>

          <div className="sidebar-section">
            <h3>Selected Mid Points ({selectedMidFeatures.length})</h3>
            {selectedMidFeatures.length === 0 ? (
              <p className="hint">Click blue points on the map to add mid points (optional)</p>
            ) : (
              <ul className="mid-list">
                {selectedMidFeatures.map((f, i) => {
                  const startId = String(currentStartPoint.properties.id);
                  const midId = String(f.properties.id);
                  const matches = midId.includes(startId);
                  return (
                    <li key={f.properties.id}>
                      <span className="mid-order">{i + 1}</span>
                      <span className="mid-id">ID: {f.properties.id}</span>
                      {matches
                        ? <span style={{ marginLeft: 6, color: '#16a34a', fontWeight: 'bold', fontSize: '0.85em' }}>ID match</span>
                        : <span style={{ marginLeft: 6, color: '#f59e0b', fontSize: '0.85em' }}>No ID match</span>}
                      <button className="btn-remove" onClick={() => onRemoveMid(f.properties.id)} disabled={autonomousRunning}>&times;</button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="sidebar-actions">
            <button className="btn btn-primary" onClick={onContinue} disabled={!canContinue || autonomousRunning}>
              Continue
            </button>
            <button className="btn btn-warning" onClick={onNoEndPoint} disabled={autonomousRunning}>
              No End Point
            </button>
            <button className="btn btn-secondary" onClick={onUndo} disabled={!canUndo || autonomousRunning}>
              Undo
            </button>
          </div>
        </>
      )}

      {isFinished && (
        <div className="sidebar-section finished-box">
          <h3>Processing Complete!</h3>
          <p>All start points have been processed.</p>
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

function PointInfo({ feature }) {
  const props = feature.properties;
  const [lng, lat] = feature.geometry.coordinates;
  const road = props.osm_road;
  return (
    <div className="point-info">
      <div className="info-row"><span className="info-label">ID</span><span className="info-value">{props.id}</span></div>
      {props.description && (
        <div className="info-row"><span className="info-label">Description</span><span className="info-value">{props.description}</span></div>
      )}
      {road && (
        <div className="info-row"><span className="info-label">Road</span><span className="info-value">{road.road_ref || 'N/A'} ({road.road_class})</span></div>
      )}
      {props.max_speed != null && (
        <div className="info-row"><span className="info-label">Max speed</span><span className="info-value">{props.max_speed} km/h</span></div>
      )}
      {road?.maxspeed_tag && (
        <div className="info-row"><span className="info-label">Road speed</span><span className="info-value">{road.maxspeed_tag} km/h</span></div>
      )}
      <div className="info-row"><span className="info-label">Coords</span><span className="info-value">{lat.toFixed(5)}, {lng.toFixed(5)}</span></div>
      {props.rev_geocode?.full_address && (
        <div className="info-row"><span className="info-label">Address</span><span className="info-value">{props.rev_geocode.full_address}</span></div>
      )}
    </div>
  );
}
