const PREFIX = 'sct-progress-';
const POLYLINE_PREFIX = 'sct-polyline-';

export function saveProgress(countryCode, data) {
  const key = PREFIX + countryCode;
  const payload = { ...data, timestamp: new Date().toISOString() };
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (e) {
    console.error('Failed to save progress:', e);
  }
}

export function loadProgress(countryCode) {
  const key = PREFIX + countryCode;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load progress:', e);
    return null;
  }
}

export function clearProgress(countryCode) {
  const key = PREFIX + countryCode;
  localStorage.removeItem(key);
}

export function hasProgress(countryCode) {
  return localStorage.getItem(PREFIX + countryCode) !== null;
}

export function savePolylineProgress(countryCode, data) {
  const key = POLYLINE_PREFIX + countryCode;
  const payload = { ...data, timestamp: new Date().toISOString() };
  try {
    localStorage.setItem(key, JSON.stringify(payload));
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      console.warn('localStorage quota exceeded for polyline progress');
      return false;
    }
    console.error('Failed to save polyline progress:', e);
    return false;
  }
}

export function loadPolylineProgress(countryCode) {
  const key = POLYLINE_PREFIX + countryCode;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load polyline progress:', e);
    return null;
  }
}

export function clearPolylineProgress(countryCode) {
  const key = POLYLINE_PREFIX + countryCode;
  localStorage.removeItem(key);
}

export function hasPolylineProgress(countryCode) {
  return localStorage.getItem(POLYLINE_PREFIX + countryCode) !== null;
}

export function getStorageUsageBytes() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const value = localStorage.getItem(key);
    total += (key.length + value.length) * 2;
  }
  return total;
}

export function formatStorageSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
