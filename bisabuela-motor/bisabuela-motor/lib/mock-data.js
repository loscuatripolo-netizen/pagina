// Datos de ejemplo para MOCK_SHEET=true (mientras no haya un Google Sheet real conectado).
const ROOMS = [
  { roomId: 101, name: 'Doble Basic', units: 2, capacity: 2, prices: { d: 88, c: 98, b: 108, a: 118 }, desc: 'La opción más sencilla, con todo lo esencial de la posada.' },
  { roomId: 102, name: 'Doble', units: 3, capacity: 2, prices: { d: 95, c: 110, b: 120, a: 130 }, desc: 'Con más espacio y detalles decorativos cuidados.' },
  { roomId: 103, name: 'Triple', units: 1, capacity: 3, prices: { d: 150, c: 155, b: 165, a: 175 }, desc: 'Ideal para familias pequeñas o grupos de amigos.' },
  { roomId: 104, name: 'Cuádruple', units: 1, capacity: 4, prices: { d: 160, c: 175, b: 185, a: 195 }, desc: 'La más amplia, pensada para familias completas.' },
];
function currentSeasonYear() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const seasonEnd = new Date(Date.UTC(y, 7, 23));
  return now > seasonEnd ? y + 1 : y;
}
const SEASON_YEAR = currentSeasonYear();
const SEASONS = [
  { code: 'a', from: `${SEASON_YEAR}-07-31`, to: `${SEASON_YEAR}-08-23` },
  { code: 'b', from: `${SEASON_YEAR}-06-19`, to: `${SEASON_YEAR}-07-30` },
  { code: 'c', from: `${SEASON_YEAR}-04-01`, to: `${SEASON_YEAR}-06-18` },
  { code: 'd', from: `${SEASON_YEAR}-01-01`, to: `${SEASON_YEAR}-03-31` },
];
function seasonForDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  for (const s of SEASONS) {
    if (d >= new Date(s.from + 'T00:00:00Z') && d <= new Date(s.to + 'T00:00:00Z')) return s;
  }
  return SEASONS[3];
}
const MOCK_ROWS = [];
module.exports = { ROOMS, SEASONS, seasonForDate, MOCK_ROWS, SEASON_YEAR };
