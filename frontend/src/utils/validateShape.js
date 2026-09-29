export function ensureArray(v) { 
  return Array.isArray(v) ? v : []; 
}

export function ensureObj(v, fallback = {}) { 
  return v && typeof v === 'object' ? v : fallback; 
}

export function field(v, key, fallback = '—') {
  const x = v && v[key];
  return x === undefined || x === null ? fallback : x;
}
