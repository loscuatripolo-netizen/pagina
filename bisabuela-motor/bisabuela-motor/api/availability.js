// GET /api/availability?checkin=2026-08-10&checkout=2026-08-14
//   -> precio y unidades libres de cada una de las 4 habitaciones, para las tarjetas.
// GET /api/availability?room=Doble&year=2026&month=8
//   -> disponibilidad día a día de esa habitación en ese mes, para pintar el calendario.

const sheets = require('../lib/sheets');
const cache = require('../lib/cache');

const TTL_MS = 3 * 60 * 1000; // 3 minutos

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const { checkin, checkout, room, year, month } = req.query || {};

  try {
    if (room && year && month) {
      const key = `month:${room}:${year}:${month}`;
      let days = cache.get(key);
      if (!days) {
        days = await sheets.getMonthAvailability({ roomName: room, year: Number(year), month: Number(month) });
        cache.set(key, days, TTL_MS);
      }
      res.status(200).json({ days, mock: sheets.MOCK });
      return;
    }

    if (!checkin || !checkout) {
      res.status(400).json({ error: 'Faltan checkin y checkout (YYYY-MM-DD), o room+year+month.' });
      return;
    }
    if (checkin >= checkout) {
      res.status(400).json({ error: 'checkout debe ser posterior a checkin' });
      return;
    }

    const key = `rooms:${checkin}:${checkout}`;
    let rooms = cache.get(key);
    if (!rooms) {
      rooms = await sheets.getAvailability({ checkin, checkout });
      cache.set(key, rooms, TTL_MS);
    }
    res.status(200).json({ rooms, mock: sheets.MOCK });
  } catch (err) {
    console.error('Error consultando disponibilidad:', err);
    res.status(502).json({ error: 'No se pudo consultar la disponibilidad ahora mismo.' });
  }
};
