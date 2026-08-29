// Envío de los dos emails de la solicitud de reserva: uno al dueño (con los datos, para
// que bloquee Booking y mande el enlace de pago) y otro al huésped (confirmando que se ha
// recibido la solicitud). Usa Resend (resend.com) por ser el más simple de configurar --
// cambiar de proveedor solo implica reescribir este archivo, el resto del código no lo sabe.
//
// Si no hay RESEND_API_KEY configurada, no falla: escribe el email en los logs en vez de
// enviarlo, para poder probar el resto del flujo sin tener una cuenta de email todavía.

const HAS_RESEND = Boolean(process.env.RESEND_API_KEY);

async function send({ to, subject, html }) {
  if (!HAS_RESEND) {
    console.log('--- EMAIL SIMULADO (falta RESEND_API_KEY) ---');
    console.log('Para:', to);
    console.log('Asunto:', subject);
    console.log(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    console.log('----------------------------------------------');
    return { simulated: true };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Bisabuela Martina <reservas@bisabuelamartina.com>',
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    throw new Error(`Error enviando email: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// Construye un enlace mailto: con el email de aceptación ya redactado y dirigido al huésped,
// para que el dueño solo tenga que pulsarlo, revisar y darle a enviar desde su propio cliente
// de correo. No se envía nada automáticamente -- el dueño es quien decide y pulsa "Enviar".
function buildAcceptanceMailto({ guestEmail, guestName, room, checkin, checkout, nights, totalPrice }) {
  const subject = `Confirmación de tu reserva en Bisabuela Martina`;
  const body = `Hola ${guestName},

¡Tenemos buenas noticias! Confirmamos tu reserva en Bisabuela Martina:

Habitación: ${room}
Fechas: ${checkin} a ${checkout} (${nights} noches)
Precio total: ${totalPrice} €

En breve te enviaremos un enlace de pago para formalizar la reserva. Si tienes cualquier duda, puedes responder a este mismo email.

¡Te esperamos!

Un saludo,
Bisabuela Martina`;

  return `mailto:${encodeURIComponent(guestEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function sendOwnerRequestEmail({ ownerEmail, room, checkin, checkout, nights, totalPrice, guestName, guestEmail, guestPhone, guests }) {
  const acceptanceMailto = buildAcceptanceMailto({ guestEmail, guestName, room, checkin, checkout, nights, totalPrice });
  const html = `
    <h2>Nueva solicitud de reserva -- Bisabuela Martina</h2>
    <p><b>${room}</b> · ${checkin} a ${checkout} (${nights} noches) · ${guests || '?'} huéspedes</p>
    <p><b>Precio orientativo:</b> ${totalPrice} €</p>
    <hr>
    <p><b>Huésped:</b> ${guestName}<br>
    <b>Email:</b> ${guestEmail}<br>
    <b>Teléfono:</b> ${guestPhone || '(no indicado)'}</p>
    <hr>
    <p>Qué hacer ahora:</p>
    <ol>
      <li>Comprueba que esas fechas están libres de verdad (Booking/Airbnb y tu propio calendario).</li>
      <li>Bloquea esas fechas en Booking.com y Airbnb.</li>
      <li>Genera un enlace de pago en Stripe por ${totalPrice} € y respóndele a ${guestEmail} con el enlace.</li>
      <li>Marca la fila de esta solicitud en la hoja de cálculo como confirmada (o bórrala si no se puede atender).</li>
    </ol>
    <p>
      <a href="${acceptanceMailto}" style="display:inline-block;background:#2e7d32;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;">
        Aceptar reserva (redacta el email al huésped)
      </a>
    </p>
    <p style="color:#666;font-size:13px;">Este botón abre tu propio correo con un email de confirmación ya escrito para ${guestName}. Revísalo (por ejemplo, añade el enlace de pago si ya lo tienes) y dale a enviar cuando estés listo -- no se envía nada automáticamente.</p>
  `;
  return send({ to: process.env.OWNER_EMAIL || ownerEmail || 'loscuatripolo@gmail.com', subject: `Solicitud de reserva: ${room}, ${checkin}`, html });
}

async function sendGuestConfirmationEmail({ guestEmail, guestName, room, checkin, checkout }) {
  const html = `
    <p>Hola ${guestName},</p>
    <p>Hemos recibido tu solicitud de reserva para <b>${room}</b>, del ${checkin} al ${checkout}, en Bisabuela Martina.</p>
    <p>En breve te escribiremos a este mismo email para confirmar la disponibilidad y enviarte el enlace de pago.</p>
    <p>Un saludo,<br>Bisabuela Martina</p>
  `;
  return send({ to: guestEmail, subject: 'Hemos recibido tu solicitud -- Bisabuela Martina', html });
}

module.exports = { sendOwnerRequestEmail, sendGuestConfirmationEmail, HAS_RESEND };
