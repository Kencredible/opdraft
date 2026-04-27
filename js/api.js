import { FALLBACK_CHARACTERS } from './data/fallbackCharacters.js';

const API_BASE   = 'https://api.api-onepiece.com/v2';
const CORS_PROXY = 'https://corsproxy.io/?';
const TIMEOUT_MS = 7000;

async function tryFetch(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export async function fetchCharacters() {
  const endpoint = `${API_BASE}/characters/en`;

  // 1. Direct request
  let data = await tryFetch(endpoint);
  if (Array.isArray(data) && data.length > 10) {
    console.log(`Loaded ${data.length} characters from API`);
    return data;
  }

  // 2. CORS proxy
  data = await tryFetch(`${CORS_PROXY}${encodeURIComponent(endpoint)}`);
  if (Array.isArray(data) && data.length > 10) {
    console.log(`Loaded ${data.length} characters via CORS proxy`);
    return data;
  }

  // 3. Bundled fallback
  console.warn('Using bundled fallback character data');
  return FALLBACK_CHARACTERS;
}
