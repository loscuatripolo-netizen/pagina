// Cliente del Google Sheet que hace de "calendario" de habitaciones ocupadas.
//
// La política de seguridad de la organización de Google Cloud del dueño bloquea crear
// claves de cuenta de servicio, así que en vez de la API de Sheets con credenciales,
// leemos (y marcamos) el Sheet a través de un Google Apps Script publicado como
// aplicación web, que se ejecuta con la propia cuenta que es dueña del Sheet -- no hace
// falta ninguna credencial de Google Cloud.
//
//   GET  <SHEETS_APPS_SCRIPT_URL>                       -> { sheets: [...pestañas...] }
//   GET  <SHEETS_APPS_SCRIPT_URL>?sheet=NombreDePestaña -> { sheet, rows: [{ Fecha, Día, Estado }, ...] }
//   POST <SHEETS_APPS_SCRIPT_URL>  { sheet, dates: [...] } -> pone "Ocupado" en esas fechas de esa pestaña
//
// La hoja tiene 7 pestañas, una por cada habitación física (unidad), con columnas
// Fecha | Día | Estado (fila 1 es la cabecera). La columna Estado tiene un desplegable
// con dos opciones: "Libre" u "Ocupado". Para marcar un día como ocupado a mano, el dueño
// cambia esa celda a "Ocupado"; en blanco o "Libre" es que ese día está libre.

const mock = require('./mock-data');

const MOCK = String(process.env.MOCK_SHEET || 'true').toLowerCase() === 'true';

// Qué pestañas (unidades físicas) corresponden a cada tipo de habitación.
const ROOM_UNITS = {
  'Doble Basic': ['Doble Basic 1', 'Doble Basic 2'],
  Doble: ['Doble 1', 'Doble 2', 'Doble 3'],
  Triple: ['Triple'],
  Cuádruple: ['Cuádruple'],
};

function scriptUrl() {
  const url = process.env.SHEETS_APPS_SCRIPT_URL;
  if (!url) throw new Error('Falta SHEETS_APPS_SCRIPT_URL (la URL del Apps Script publicado). Ver README.md.');
  return url;
}

// Una celda de la columna Estado cuenta como "ocupado" solo si dice literalmente
// "Ocupado" (el desplegable de validación de datos solo permite "Libre" u "Ocupado") --
// cualquier otra cosa (en blanco, o "Libre") es un día libre.
function isOcupado(cellValue) {
  return String(cellValue || '').trim().toLowerCase() === 'ocupado';
}

// Pide al Apps Script las filas (Fecha/Día/Estado) de una pestaña.
async function fetchUnitRows(unitName) {
  const res = await fetch(`${scriptUrl()}?sheet=${encodeURIComponent(unitName)}`);
  if (!res.ok) {
    throw new Error(`El Apps Script del Sheet respondió ${res.status} al pedir la pestaña "${unitName}".`);
  }
  const data = await res.json();
  if (!data || !Array.isArray(data.rows)) {
    throw new Error(`Respuesta inesperada del Apps Script del Sheet para "${unitName}".`);
  }
  return data.rows; // [{ Fecha: 'YYYY-MM-DD', Día: '...', Estado: 'Libre' | 'Ocupado' }, ...]
}

// Convierte las filas (en orden de fecha) de una pestaña en bloques ocupados contiguos.
function rowsToBlocks(rows) {
  const blocks = [];
  let blockStart = null;
  let lastDate = null;
  for (const row of rows) {
    const occupied = isOcupado(row.Estado);
    if (occupied && blockStart === null) blockStart = row.Fecha;
    if (!occupied && blockStart !== null) {
      blocks.push({ checkin: blockStart, checkout: row.Fecha });
      blockStart = null;
    }
    lastDate = row.Fecha;
  }
  if (blockStart !== null) {
    blocks.push({ checkin: blockStart, checkout: addDays(lastDate, 1) });
  }
  return blocks;
}

// Lee las 7 pestañas de calendario y las convierte en bloques ocupados
// { room, checkin, checkout, origin, notes }, igual que si viniera de una lista de
// reservas -- así el resto del código (getAvailability, getMonthAvailability...) no
// necesita saber nada del formato de calendario.
async function readRows() {
  if (MOCK) return mock.MOCK_ROWS;

  const rows = [];
  for (const [roomName, units] of Object.entries(ROOM_UNITS)) {
    for (const unitName of units) {
      const unitRows = await fetchUnitRows(unitName);
      for (const block of rowsToBlocks(unitRows)) {
        rows.push({ room: roomName, checkin: block.checkin, checkout: block.checkout, origin: unitName, notes: '' });
      }
    }
  }
  return rows;
}

// Busca, entre las unidades de ese tipo de habitación, una que esté libre en todo el
// rango de fechas pedido.
async function findFreeUnit(roomName, checkin, checkout) {
  const units = ROOM_UNITS[roomName];
  if (!units) throw new Error(`Habitación desconocida: ${roomName}`);

  for (const unitName of units) {
    const rows = await fetchUnitRows(unitName);
    const allFree = rows
      .filter((r) => r.Fecha >= checkin && r.Fecha < checkout)
      .every((r) => !isOcupado(r.Estado));
    if (allFree) return unitName;
  }
  return null;
}

// Marca como "Ocupado", en una unidad libre de ese tipo de habitación, todos los días
// del rango (usado por api/request.js en cuanto entra una solicitud web, para que esas
// fechas no se le ofrezcan a otra persona mientras el dueño la confirma).
//
// El Apps Script tiene un doPost que acepta
// { sheet: "<nombre de pestaña>", dates: ["YYYY-MM-DD", ...] } y pone "Ocupado" en la
// columna Estado de esas fechas, en esa pestaña. El body se manda como texto plano (no
// application/json) para que el navegador nunca dispare un preflight OPTIONS -- esta
// llamada sale siempre de nuestro backend (servidor a servidor), pero así queda blindado
// aunque en algún momento saliera desde el propio navegador del visitante. El doPost
// siempre responde 200 (incluso si falla), con el error dentro del cuerpo como
// { error: "..." }, así que hay que mirar el cuerpo además del status.
async function appendRow({ room, checkin, checkout, origin, notes }) {
  if (MOCK) {
    mock.MOCK_ROWS.push({ room, checkin, checkout, origin, notes });
    return;
  }

  const unitName = await findFreeUnit(room, checkin, checkout);
  if (!unitName) {
    throw new Error(`No hay ninguna unidad libre de "${room}" para esas fechas.`);
  }

  const dates = [];
  for (let d = checkin; d < checkout; d = addDays(d, 1)) dates.push(d);

  const res = await fetch(scriptUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ sheet: unitName, dates }),
  });
  if (!res.ok) {
    throw new Error(`El Apps Script del Sheet no pudo marcar "${unitName}" como ocupado (${res.status}).`);
  }
  const data = await res.json().catch(() => null);
  if (data && data.error) {
    throw new Error(`El Apps Script del Sheet no pudo marcar "${unitName}" como ocupado: ${data.error}`);
  }
}

// Disponibilidad por tipo de habitación para un rango de fechas: cuántas unidades quedan
// libres cada noche (mínimo del rango).
async function getAvailability({ checkin, checkout }) {
  const rows = await readRows();
  return mock.ROOMS.map((room) => {
    const availableUnits = minAvailableUnits(room, rows, checkin, checkout);
    return {
      roomId: room.roomId,
      name: room.name,
      capacity: room.capacity,
      units: room.units,
      desc: room.desc,
      availableUnits,
      totalPrice: totalPrice(room, checkin, checkout),
      nights: nightsBetween(checkin, checkout),
    };
  });
}

// Para pintar el calendario de un mes: para cada día, cuántas unidades de esa habitación
// quedan libres esa noche (0 = completo).
async function getMonthAvailability({ roomName, year, month }) {
  const rows = await readRows();
  const room = mock.ROOMS.find((r) => r.name === roomName);
  if (!room) throw new Error(`Habitación desconocida: ${roomName}`);

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const nextDateStr = addDays(dateStr, 1);
    days[dateStr] = room.units - unitsBookedOnNight(room.name, rows, dateStr, nextDateStr);
  }
  return days;
}

function unitsBookedOnNight(roomName, rows, night, nextNight) {
  return rows.filter((r) => r.room === roomName && r.checkin <= night && r.checkout > night).length;
}

function minAvailableUnits(room, rows, checkin, checkout) {
  let min = room.units;
  let d = checkin;
  while (d < checkout) {
    const next = addDays(d, 1);
    const booked = unitsBookedOnNight(room.name, rows, d, next);
    min = Math.min(min, room.units - booked);
    d = next;
  }
  return Math.max(0, min);
}

function nightsBetween(checkin, checkout) {
  return Math.max(1, Math.round((new Date(checkout) - new Date(checkin)) / 86400000));
}

function totalPrice(room, checkin, checkout) {
  let total = 0;
  let d = checkin;
  while (d < checkout) {
    total += room.prices[mock.seasonForDate(d).code];
    d = addDays(d, 1);
  }
  return total;
}

function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

module.exports = { readRows, appendRow, getAvailability, getMonthAvailability, MOCK };
