// Caché muy simple en memoria con TTL, para no llamar a la API de Beds24 en cada
// visita a la web (Beds24 pide explícitamente no hacer eso -- ver lib/beds24.js).
//
// En Vercel, cada función serverless puede "enfriarse" y perder este estado -- eso está
// bien, simplemente se recalcula. Para más tráfico, cambiar esto por Vercel KV / Upstash
// Redis manteniendo la misma interfaz (get/set/clear).

const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function set(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// Usado por el webhook de Beds24: cuando llega una reserva nueva (por cualquier canal),
// se borra la caché de disponibilidad para que la siguiente visita a la web pida datos
// frescos en vez de servir el precio/disponibilidad antiguo.
function clearPrefix(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

module.exports = { get, set, clearPrefix };
