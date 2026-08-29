// Datos de ejemplo para MOCK_SHEET=true (mientras no haya un Google Sheet real conectado).
// Los precios y capacidades son los reales de bisabuela-martina-rediseno.html. Los metros
// cuadrados y las fotos NO están aquí porque todavía no los tenemos confirmados por la
// posada -- en cuanto lleguen, se añaden a ROOMS y se sustituyen los SVG de la web por
// las fotos reales. No hay que fabricar ningún dato que no venga de la posada.

const ROOMS = [
  {
    roomId: 101,
    name: 'Doble Basic',
    units: 2,
    capacity: 2,
    prices: { d: 88, c: 98, b: 108, a: 118 },
    desc: 'La opción más sencilla, con todo lo esencial de la posada.',
  },
  {
    roomId: 102,
    name: 'Doble',
    units: 3,
    capacity: 2,
    prices: { d: 95, c: 110, b: 120, a: 130 },
    desc: 'Con más espacio y detalles decorativos cuidados.',
  },
  {
    roomId: 103,
    name: 'Triple',
    units: 1,
    capacity: 3,
    prices: { d: 150, c: 155, b: 165, a: 175 },
    desc: 'Ideal para familias pequeñas o grupos de amigos.',
  },
  {
    roomId: 104,
    name: 'Cuádruple',
    units: 1,
    capacity: 4,
    prices: { d: 160, c: 175, b: 185, a: 195 },
    desc: 'La más amplia, pensada para familias completas.',
  },
];
// 2+3+1+1 = 7 habitaciones, coincide con "7 habitaciones" de la web.

const SEASONS = [
  { code: 'a', from: '2026-07-31', to: '2026-08-23' },
  { code: 'b', from: '2026-06-19', to: '2026-07-30' },
  { code: 'c', from: '2026-04-01', to: '2026-06-18' },
  { code: 'd', from: '2026-01-01', to: '2026-03-31' },
];

function seasonForDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  for (const s of SEASONS) {
    if (d >= new Date(s.from + 'T00:00:00Z') && d <= new Date(s.to + 'T00:00:00Z')) return s;
  }
  return SEASONS[3];
}

// Mismo contenido que la fila de ejemplo del Excel/Sheet (calendario-bisabuela-martina.xlsx),
// para que la demo sea coherente con lo que el dueño va a ver y rellenar de verdad.
const MOCK_ROWS = [
  { room: 'Doble', checkin: '2026-08-10', checkout: '2026-08-14', origin: 'Booking', notes: 'Ej. de fila' },
];

module.exports = { ROOMS, SEASONS, seasonForDate, MOCK_ROWS };
