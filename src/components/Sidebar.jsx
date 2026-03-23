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
  onRemoveMid,
}) {
  const discrepancy = startCount !== endCount;
  const progressPct = totalStartPoints > 0 ? (processedCount / totalStartPoints) * 100 : 0;

  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <h2>Section Control Tool</h2>
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
            <h3>Current Road: {currentRoadRef}</h3>
          </div>

          <div className="sidebar-section">
            <h3>Current Start Point</h3>
            <PointInfo feature={currentStartPoint} />
          </div>

          <div className="sidebar-section">
            <h3>Selected End Point</h3>
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
                {selectedMidFeatures.map((f, i) => (
                  <li key={f.properties.id}>
                    <span className="mid-order">{i + 1}</span>
                    <span className="mid-id">ID: {f.properties.id}</span>
                    <button className="btn-remove" onClick={() => onRemoveMid(f.properties.id)}>&times;</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="sidebar-actions">
            <button className="btn btn-primary" onClick={onContinue} disabled={!canContinue}>
              Continue
            </button>
            <button className="btn btn-warning" onClick={onNoEndPoint}>
              No End Point
            </button>
            <button className="btn btn-secondary" onClick={onUndo} disabled={!canUndo}>
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
