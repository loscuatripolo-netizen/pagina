// GET /api/availability?checkin=2026-08-10&checkout=2026-08-14
//   -> precio y disponibilidad de cada una de las 7 habitaciones, para las tarjetas.
// GET /api/availability?room=Habitación 3&year=2026&month=8
//   -> disponibilidad día a día de esa habitación en ese mes, para pintar el calendario.
//
// Sin caché: cada función serverless de Vercel arranca como su propia instancia con su
// propia memoria, así que un caché en memoria (Map) no se comparte entre esta función y
// la que marca "Ocupado" al recibir una reserva (api/request.js) -- el resultado real,
// comprobado en producción, era que la web podía seguir enseñando una fecha como libre
// varios minutos después de haberse ocupado. Como la fuente real (Google Sheet vía Apps
// Script) responde en un instante y el tráfico de una posada de 7 habitaciones es bajo,
// se pide siempre en directo: prioriza que la disponibilidad sea exacta sobre ahorrar
// una llamada.

const sheets = require('../lib/sheets');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const { checkin, checkout, room, year, month } = req.query || {};

  try {
    if (room && year && month) {
      const days = await sheets.getMonthAvailability({ roomName: room, year: Number(year), month: Number(month) });
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

    const rooms = await sheets.getAvailability({ checkin, checkout });
    res.status(200).json({ rooms, mock: sheets.MOCK });
  } catch (err) {
    console.error('Error consultando disponibilidad:', err);
    res.status(502).json({ error: 'No se pudo consultar la disponibilidad ahora mismo.' });
  }
};
