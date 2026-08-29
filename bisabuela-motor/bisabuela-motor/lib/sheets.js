// Cliente del Google Sheet que hace de "calendario" de habitaciones ocupadas.
//
// Usa la Google Sheets API v4 con una cuenta de servicio (no una cuenta de Google
// normal -- ver README.md para cómo se crea y se comparte con la hoja).
//
// La hoja tiene 7 pestañas, una por cada habitación física (unidad), con columnas
// Fecha | Día | Estado (fila 1 es la cabecera, los datos empiezan en la fila 2). La
// columna Estado tiene un desplegable con dos opciones: "Libre" u "Ocupado". Para marcar
// un día como ocupado, el dueño cambia esa celda a "Ocupado"; en blanco o "Libre" es que
// ese día está libre. El propio calendario ya viene generado con las fechas puestas --
// solo hay que cambiar el desplegable de Estado a mano.

const mock = require('./mock-data');

const MOCK = String(process.env.MOCK_SHEET || 'true').toLowerCase() === 'true';

// Fila 2 de cada pestaña de calendario = este día. Tiene que coincidir con la fecha
// que hay de verdad en la celda A2 del Google Sheet (ver README). Cubre la temporada
// de apertura de la posada (junio-agosto); hay que regenerar el Sheet y actualizar
// estas dos constantes cuando se acerque la siguiente temporada.
const START_DATE = '2027-06-01';
// Cuántos días de calendario hay generados en cada pestaña (filas 2..1+CALENDAR_DAYS).
// 2027-06-01 a 2027-08-31 = 30 + 31 + 31 días.
const CALENDAR_DAYS = 92;

// Qué pestañas (unidades físicas) corresponden a cada tipo de habitación.
const ROOM_UNITS = {
  'Doble Basic': ['Doble Basic 1', 'Doble Basic 2'],
  Doble: ['Doble 1', 'Doble 2', 'Doble 3'],
  Triple: ['Triple'],
  Cuádruple: ['Cuádruple'],
};

let sheetsClient = null;

async function getClient() {
  if (sheetsClient) return sheetsClient;

  const { google } = require('googleapis');
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!keyJson) {
    throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON (la clave de la cuenta de servicio). Ver README.md.');
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

function rowForDate(dateStr) {
  const days = Math.round((new Date(dateStr + 'T00:00:00Z') - new Date(START_DATE + 'T00:00:00Z')) / 86400000);
  return 2 + days; // la fila 1 es la cabecera
}

function dateForRow(row) {
  return addDays(START_DATE, row - 2);
}

// Una celda de la columna Estado cuenta como "ocupado" solo si dice literalmente
// "Ocupado" (el desplegable de validación de datos solo permite "Libre" u "Ocupado") --
// cualquier otra cosa (en blanco, o "Libre") es un día libre.
function isOcupado(cellValue) {
  return String(cellValue || '').trim().toLowerCase() === 'ocupado';
}

// Lee las 7 pestañas de calendario y las convierte en bloques ocupados
// { room, checkin, checkout, origin, notes }, igual que si viniera de una lista de
// reservas -- así el resto del código (getAvailability, getMonthAvailability...) no
// necesita saber nada del formato de calendario.
async function readRows() {
  if (MOCK) return mock.MOCK_ROWS;

  const sheets = await getClient();
  const rows = [];
  for (const [roomName, units] of Object.entries(ROOM_UNITS)) {
    for (const unitName of units) {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId(),
        range: `'${unitName}'!C2:C${1 + CALENDAR_DAYS}`,
      });
      const values = res.data.values || [];
      let blockStartRow = null;
      for (let i = 0; i < values.length; i++) {
        const occupied = isOcupado(values[i][0]);
        const row = i + 2;
        if (occupied && blockStartRow === null) blockStartRow = row;
        if (!occupied && blockStartRow !== null) {
          rows.push({ room: roomName, checkin: dateForRow(blockStartRow), checkout: dateForRow(row), origin: unitName, notes: '' });
          blockStartRow = null;
        }
      }
      if (blockStartRow !== null) {
        rows.push({ room: roomName, checkin: dateForRow(blockStartRow), checkout: dateForRow(2 + values.length), origin: unitName, notes: '' });
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

  const sheets = await getClient();
  const rowStart = rowForDate(checkin);
  const rowEndExclusive = rowForDate(checkout);
  for (const unitName of units) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId(),
      range: `'${unitName}'!C${rowStart}:C${rowEndExclusive - 1}`,
    });
    const values = res.data.values || [];
    const allFree = values.every((r) => !isOcupado(r[0]));
    if (allFree) return unitName;
  }
  return null;
}

// Marca como "Ocupado", en una unidad libre de ese tipo de habitación, todos los días
// del rango (usado por api/request.js en cuanto entra una solicitud web, para que esas
// fechas no se le ofrezcan a otra persona mientras el dueño la confirma).
async function appendRow({ room, checkin, checkout, origin, notes }) {
  if (MOCK) {
    mock.MOCK_ROWS.push({ room, checkin, checkout, origin, notes });
    return;
  }

  const unitName = await findFreeUnit(room, checkin, checkout);
  if (!unitName) {
    throw new Error(`No hay ninguna unidad libre de "${room}" para esas fechas.`);
  }

  const sheets = await getClient();
  const rowStart = rowForDate(checkin);
  const rowEndExclusive = rowForDate(checkout);
  // La columna Estado solo admite "Libre" u "Ocupado" (desplegable de validación de
  // datos) -- el nombre del huésped y demás detalles van en el email al dueño, no en la
  // hoja.
  const values = [];
  for (let r = rowStart; r < rowEndExclusive; r++) values.push(['Ocupado']);

  await sheets.spreadsheets.values.update({
    spreadsheetId: spreadsheetId(),
    range: `'${unitName}'!C${rowStart}:C${rowEndExclusive - 1}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
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
