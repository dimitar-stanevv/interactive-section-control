# AGENTS.md

## Project Overview

**Section Control Tool** is a client-side React SPA for transforming messy section-control (average-speed enforcement) camera datasets into structured sections. Users upload a GeoJSON file of camera points, then manually or semi-automatically pair **start** points with their corresponding **end** points (and optional **mid** points) on an interactive Mapbox map. The output is a structured JSON of paired sections and a GeoJSON of unpaired ("dangling") points.

There is no backend — all data stays in the browser. Progress is persisted in `localStorage`.

## Tech Stack

- **React 19** with JSX (no TypeScript)
- **Vite 8** for dev server and bundling
- **Mapbox GL JS** via `react-map-gl/mapbox` for the interactive map
- **ES Modules** throughout (`"type": "module"`)
- No test framework, no linter config, no CI pipeline

## Running the Project

```bash
npm install
npm run dev      # Vite dev server
npm run build    # Production build to dist/
npm run preview  # Preview production build
```

## Architecture

The app is a four-screen wizard controlled by `App.jsx`:

```
Welcome → Analysis → Map → Export
```

### Directory Structure

```
src/
  main.jsx                  # React entry point
  App.jsx                   # Screen router, top-level state
  App.css                   # All styles (single file)
  screens/
    WelcomeScreen.jsx       # File upload + GeoJSON validation
    AnalysisScreen.jsx      # Dataset summary, country selection
    MapScreen.jsx           # Core pairing logic + Mapbox map (largest file)
    ExportScreen.jsx        # Download sections JSON + dangling GeoJSON
  components/
    Sidebar.jsx             # Map screen sidebar UI, progress, point info
  utils/
    storage.js              # localStorage persistence (key prefix: sct-progress-)
    countries.js            # European ISO country code → name mapping
config.json                 # Mapbox access token
data/
  example_section_control_dataset.geojson  # Sample dataset
```

## Domain Concepts

### Point Types
Each GeoJSON feature has a `properties.type`:
- **`section_start`** — Camera at the beginning of a speed enforcement section
- **`section_end`** — Camera at the end of a section
- **`section_mid`** — Intermediate camera within a section (optional)

### Feature Properties
Features carry metadata in `properties`:
- `id` — Unique identifier; end/mid IDs often contain the start ID as a substring
- `country` — ISO country code (e.g., `NL`, `DE`)
- `osm_road` — Object with `road_ref`, `road_class`, `maxspeed_tag`
- `rev_geocode` — Reverse geocoding result with `full_address`
- `max_speed` — Enforcement speed limit
- `description` — Human-readable camera description
- `is_variable` — Whether the speed limit is variable

### Pairing Logic (MapScreen.jsx)
The core algorithm in `MapScreen.jsx`:

1. **`buildStartPointOrder`** — Groups start points by `road_ref`, sorts within groups (latitude descending, then longitude ascending), orders groups largest-first with `__no_ref__` last.
2. **`findClosestEndPoint`** — Finds the nearest unprocessed end point on the same `road_ref`, excluding pairs closer than **300 meters**.
3. **`hasNearbyMidPoints`** — Checks if unprocessed mid points exist within a threshold distance (default **20 km**), used to halt autonomous mode.
4. **ID match validation** — Warns when end/mid point IDs don't contain the start point ID as a substring.

### Matching Modes
- **Manual** — User clicks end/mid points on the map
- **Auto Match** (`M` key) — Automatically selects the closest valid end point
- **Autonomous Mode** — Timed loop that auto-matches and advances, stopping on: no match, ID mismatch, or mid points closer than the matched end point

### Output
- `sections_<country>.json` — Array of `{ start, end, mid_points }` feature objects with metadata
- `dangling_<country>.geojson` — FeatureCollection of unpaired start and end points

## Key Conventions

### Code Style
- Functional components with hooks only (no class components)
- `useCallback` for all handler functions passed as props
- `useMemo` for derived/computed data
- `useRef` for mutable values that shouldn't trigger re-renders (map instance, timers, autonomous state)
- Inline styles for one-off styling; CSS classes in `App.css` for shared styles
- No prop-types or TypeScript — props are documented implicitly through destructuring

### State Management
- All state lives in React (`useState`/`useRef`) — no external state library
- `App.jsx` holds screen navigation + data passed between screens
- `MapScreen.jsx` holds all pairing state (completed sections, current index, selections)
- `localStorage` used for persistence across sessions via `src/utils/storage.js`

### Map Layers
Mapbox layers follow a naming convention based on point type and state:
- `start-points`, `start-points-processed`, `current-start-point`, `current-start-pulse`
- `end-points`, `end-points-processed`, `end-point-selected`, `end-point-selected-label`
- `mid-points`, `mid-points-processed`, `mid-points-selected`, `mid-points-selected-label`

Internal properties prefixed with `_` (`_isProcessed`, `_isCurrent`, `_isSelectedEnd`, `_midOrder`) are computed per-render and used only for layer filtering.

### Color Scheme
- **Green** (`#22c55e`) — Start points
- **Red** (`#ef4444`) — End points
- **Blue** (`#3b82f6`) — Mid points
- **Amber** (`#f59e0b`) — Warnings and autonomous mode indicator

## Important Rules for AI Agents

1. **Do not modify `config.json`** — it contains the Mapbox token needed at runtime.
2. **Do not restructure the screen wizard flow** without explicit instruction — the Welcome → Analysis → Map → Export pipeline is intentional.
3. **Preserve the pairing algorithm constants**: 300m minimum distance in `findClosestEndPoint`, 20km default threshold in `hasNearbyMidPoints`. These are tuned for real-world section control data.
4. **`MapScreen.jsx` is the core module** — changes here affect pairing correctness. The autonomous mode relies on refs to avoid stale closures; understand the `stateRef`/`callbacksRef` pattern before modifying.
5. **All styles live in `App.css`** — this project uses a single CSS file. Do not introduce CSS modules or styled-components unless asked.
6. **GeoJSON data shape matters** — the app expects `FeatureCollection` with Point features having the property schema described above. Do not change property access patterns without understanding the input data format.
7. **No backend** — this is a purely client-side tool. Do not add server dependencies or API calls (beyond Mapbox tile fetching).
8. **`localStorage` keys** use the prefix `sct-progress-` followed by country code. Changing this prefix breaks existing saved progress.
