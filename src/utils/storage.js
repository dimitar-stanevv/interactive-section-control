const PREFIX = 'sct-progress-';

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
