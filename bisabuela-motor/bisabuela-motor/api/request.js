// POST /api/request
// body: { roomId, roomName, checkin, checkout, guests, guestName, guestEmail, guestPhone }
//
// No cobra nada -- eso lo hace el dueño a mano con un Payment Link de Stripe. Este endpoint:
//   1. Vuelve a comprobar disponibilidad (para no aceptar una solicitud de algo ya ocupado).
//   2. Añade una fila "Pendiente-Web" en el Google Sheet, para que esas fechas dejen de
//      ofrecerse a otra persona mientras el dueño decide.
//   3. Manda un email al dueño con todos los datos y los siguientes pasos.
//   4. Manda un email de confirmación al huésped.

const sheets = require('../lib/sheets');
const email = require('../lib/email');
const cache = require('../lib/cache');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' });
    return;
  }

  const { roomName, checkin, checkout, guests, guestName, guestEmail, guestPhone } = req.body || {};

  if (!roomName || !checkin || !checkout || !guestName || !guestEmail) {
    res.status(400).json({ error: 'Faltan datos obligatorios de la solicitud' });
    return;
  }

  try {
    const rooms = await sheets.getAvailability({ checkin, checkout });
    const room = rooms.find((r) => r.name === roomName);
    if (!room || room.availableUnits < 1) {
      res.status(409).json({ error: 'Esa habitación ya no tiene disponibilidad para esas fechas. Elige otras fechas u otra habitación.' });
      return;
    }

    await sheets.appendRow({
      room: roomName,
      checkin,
      checkout,
      origin: 'Pendiente-Web',
      notes: `${guestName} · ${guestEmail} · ${guestPhone || 'sin teléfono'} · ${guests || '?'} huéspedes`,
    });

    // Ya no vale lo que había en caché -- refrescar en la próxima consulta.
    cache.clearPrefix('rooms:');
    cache.clearPrefix('month:');

    await email.sendOwnerRequestEmail({
      ownerEmail: process.env.OWNER_EMAIL,
      room: roomName,
      checkin,
      checkout,
      nights: room.nights,
      totalPrice: room.totalPrice,
      guestName,
      guestEmail,
      guestPhone,
      guests,
    });

    await email.sendGuestConfirmationEmail({ guestEmail, guestName, room: roomName, checkin, checkout });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Error procesando la solicitud de reserva:', err);
    res.status(502).json({ error: 'No se pudo enviar la solicitud ahora mismo. Inténtalo de nuevo en un momento.' });
  }
};
