// Cliente del Google Sheet que hace de "base de datos" de reservas ocupadas
// (calendario-bisabuela-martina.xlsx, subido a Google Sheets).
//
// Usa la Google Sheets API v4 con una cuenta de servicio (no una cuenta de Google
// normal -- ver README.md para cómo se crea y se comparte con la hoja).
//
// La hoja tiene una pestaña "Reservas" con columnas: Habitación | Entrada | Salida | Origen | Notas
// (fila 1-3 son título/subtítulo, fila 4 es la cabecera, los datos empiezan en la fila 5).

const mock = require('./mock-data');

const MOCK = String(process.env.MOCK_SHEET || 'true').toLowerCase() === 'true';
const SHEET_NAME = 'Reservas';
const DATA_RANGE = `${SHEET_NAME}!A5:E304`; // deja margen de sobra bajo el ejemplo

let sheetsClient = null;

async function getClient() {
  if (sheetsClient) return sheetsClient;

  const { google } = require('googleapis');
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!keyJson) {
    throw new Error(
      'Falta GOOGLE_SERVICE_ACCOUNT_JSON (la clave de la cuenta de servicio, en una sola línea). ' +
      'Ver README.md -- "Conectar el Google Sheet".'
    );
  }
  const credentials = JSON.parse(keyJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

function spreadsheetId() {
  const id = process.env.SHEET_SPREADSHEET_ID;
  if (!id) throw new Error('Falta SHEET_SPREADSHEET_ID (el ID de la hoja, en la URL de Google Sheets).');
  return id;
}

// Lee todas las filas de la pestaña "Reservas" y las convierte en objetos.
async function readRows() {
  if (MOCK) return mock.MOCK_ROWS;

  const sheets = await getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId(),
    range: DATA_RANGE,
  });
  const rows = res.data.values || [];
  return rows
    .filter((r) => r[0] && r[1] && r[2]) // habitación + entrada + salida como mínimo
    .map((r) => ({
      room: r[0],
      checkin: toISODate(r[1]),
      checkout: toISODate(r[2]),
      origin: r[3] || '',
      notes: r[4] || '',
    }));
}

// Añade una fila nueva al final de los datos (usado por api/request.js para dejar la
// solicitud como "Pendiente-Web" en cuanto entra, y así no se le ofrezca dos veces a otra
// persona mientras el dueño la confirma).
async function appendRow({ room, checkin, checkout, origin, notes }) {
  if (MOCK) {
    mock.MOCK_ROWS.push({ room, checkin, checkout, origin, notes });
    return;
  }
  const sheets = await getClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: spreadsheetId(),
    range: DATA_RANGE,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[room, formatDMY(checkin), formatDMY(checkout), origin, notes]] },
  });
}

function toISODate(value) {
  // Los valores de Sheets pueden llegar como "10/08/2026" (texto) o como número de serie
  // de fecha -- de(1900). Aquí solo cubrimos el caso texto DD/MM/AAAA, que es el formato
  // que pide el propio Excel/Sheet.
  const m = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return String(value);
  const [, d, mo, y] = m;
  return `${y}-${mo}-${d}`;
}

function formatDMY(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

// Disponibilidad por tipo de habitación para un rango de fechas: cuántas unidades quedan
// libres cada noche (mínimo del rango), igual que se explicó en el Excel de referencia.
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
