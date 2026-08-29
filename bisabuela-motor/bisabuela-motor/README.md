# Sistema de solicitudes de reserva — Bisabuela Martina

El huésped ve las 7 habitaciones, entra en la que le interesa, ve su calendario real
(libre/completo) y envía una solicitud de reserva -- sin pagar todavía. Al dueño le llega
un email con los datos; él comprueba y bloquea la fecha en Booking/Airbnb a mano, y le
responde al huésped con un enlace de pago de Stripe (Payment Link, sin código de por
medio). No hay PMS ni pasarela de pago conectados por API -- el "calendario" es un Google
Sheet que gestiona el propio dueño.

## Estado ahora mismo

Todo el código del backend (Google Sheets + email) está escrito y probado en **modo
demostración** (`MOCK_SHEET=true`). Ese es el código pensado para cuando esto se
despliegue de verdad en Vercel (ver más abajo).

El "calendario" real es este Google Sheet, ya creado:
[Calendario Bisabuela Martina](https://docs.google.com/spreadsheets/d/11dae-73L9JZUTUOP3h1lz-1COLled2UvR_9lc93kH3o/edit).
Tiene 7 pestañas, una por cada habitación física (2x Doble Basic, 3x Doble, Triple y
Cuádruple), cada una con un calendario día a día de la temporada (junio-agosto) y una
columna "Estado" con un desplegable Libre/Ocupado. Para bloquear un día a mano (por una
reserva de Booking/Airbnb, por ejemplo), basta con abrir la pestaña de esa habitación y
poner "Ocupado" en las filas de esas fechas -- se refleja solo en la web en cuanto esté
conectado (siguiente sección). El propio código, al recibir una solicitud por la web,
marca así de "Ocupado" las fechas correspondientes para que no se le ofrezcan a otra
persona mientras el dueño la confirma.

Como el calendario solo cubre junio-agosto de la temporada que viene, hay que avisar para
regenerarlo (pedírmelo) según se acerque cada nueva temporada.

La página publicada como demo (`bisabuela-martina-motor.html`) es distinta: al no tener un
servidor detrás todavía, no llama a ese backend -- lleva sus propios datos de ejemplo
incrustados en el HTML, para que se pueda probar el flujo entero (click en una habitación,
calendario real, elegir fechas, enviar solicitud) sin desplegar nada. Dos cosas están ya
configuradas ahí:

- **Calendario limitado a junio-agosto**, que es cuando abre la posada. Se ajusta solo a la
  próxima temporada que quede por delante (si la de este año ya ha pasado, salta a la
  siguiente), así que siempre se ve un junio-agosto real y reservable, se pruebe cuando se
  pruebe.
- **"Enviar solicitud" abre el correo del propio dueño** con la solicitud ya redactada,
  dirigida a `loscuatripolo@gmail.com` (tu email, de momento, para poder probarlo). Como la
  página no tiene servidor, no puede enviar el email ella sola sin exponer una clave de
  API en el propio HTML -- por eso abre el cliente de correo de quien prueba la demo con
  todo relleno, en vez de mandarlo en silencio. Cuando esto se despliegue de verdad (más
  abajo), el envío ya es automático y en silencio, vía Resend, tal como estaba pensado.

## Lo que falta para que sea real

1. ~~Subir el calendario a Google Sheets~~ -- ya está creado: [Calendario Bisabuela
   Martina](https://docs.google.com/spreadsheets/d/11dae-73L9JZUTUOP3h1lz-1COLled2UvR_9lc93kH3o/edit)
   (7 pestañas, una por habitación). Solo falta el paso 2 de abajo para conectarlo de
   verdad a la web.
2. ~~Crear la cuenta de servicio de Google~~ -- la política de seguridad de la
   organización de Google Cloud de guillem bloquea crear claves de cuenta de servicio, así
   que en su lugar el Sheet se lee (y se marca) a través de un Google Apps Script publicado
   como aplicación web (ver más abajo). Ya está montado y probado.
3. **Fotos reales de las 7 habitaciones**, y si es posible los **metros cuadrados** de cada
   una -- ahora mismo el modal usa un icono de sitio, no una foto, porque no hay fotos
   reales todavía. En cuanto lleguen, sustituyen a `.rm-gallery-ph` en el HTML.
4. **Una cuenta de email transaccional** (recomiendo Resend, resend.com, tiene plan
   gratuito) para que los avisos se envíen de verdad en vez de quedarse en los logs.
5. **El email real de la posada**, para `OWNER_EMAIL` (ahora mismo apunta a
   `loscuatripolo@gmail.com` para poder probar).

Nada de esto necesita esperar a Beds24 ni a ningún PMS -- por eso este camino es más rápido
que el que planteamos al principio.

## Conectar el Google Sheet

En vez de una cuenta de servicio (bloqueada por política de la organización), el Sheet se
lee y se marca a través de un **Google Apps Script** publicado como aplicación web,
ejecutándose con la propia cuenta que es dueña del Sheet -- no hace falta ninguna
credencial de Google Cloud.

- `GET  <url>`                       → `{ sheets: [...nombres de las 7 pestañas...] }`
- `GET  <url>?sheet=NombreDePestaña` → `{ sheet, rows: [{ Fecha, Día, Estado }, ...] }`
- `POST <url>` con `{ sheet, dates: ["YYYY-MM-DD", ...] }` → pone "Ocupado" en esas fechas
  de esa pestaña (lo usa el código al recibir una solicitud por la web).

Solo hace falta una variable de entorno en Vercel:

- `SHEETS_APPS_SCRIPT_URL`: la URL del Apps Script publicado (termina en `/exec`).

**Importante:** el `doPost` (para que las solicitudes por la web bloqueen la fecha en el
Sheet) tiene que estar publicado en el mismo Apps Script para que el paso 3 del ciclo
completo (más abajo) funcione. Si el Apps Script todavía solo tiene el `doGet`, las
solicitudes de reserva fallarán al intentar marcar la fecha como ocupada.

## Desplegar

Pensado para Vercel (ya tenéis GitHub conectado a Vercel de antes):

1. Subir esta carpeta a un repo de GitHub.
2. Importar el repo en Vercel.
3. Añadir en Vercel (Settings → Environment Variables) `SHEETS_APPS_SCRIPT_URL`,
   `RESEND_API_KEY`, `EMAIL_FROM` y `OWNER_EMAIL`.
4. Cambiar `MOCK_SHEET` a `false`.
5. Volver a desplegar (Deployments → Redeploy) -- las variables de entorno nuevas no se
   aplican al deployment que ya estaba corriendo, hace falta un redeploy.

## Cómo queda el ciclo completo

1. El huésped entra en la web, abre una habitación, ve el calendario real y elige fechas.
2. Pulsa "Enviar solicitud de reserva" -- no paga nada todavía.
3. El sistema marca esas fechas como "Ocupado" en el Google Sheet (para que no se le
   ofrezcan a otra persona mientras el dueño decide) y manda un email al dueño con todos
   los datos, y otro de confirmación al huésped.
4. El dueño comprueba disponibilidad de verdad, bloquea esas fechas en Booking.com y
   Airbnb, genera un enlace de pago en Stripe (Dashboard de Stripe → Payment Links) por el
   importe que corresponda, y se lo manda al huésped respondiendo a su email.
5. El huésped paga en ese enlace -- eso ya lo gestiona Stripe directamente, no pasa por
   nuestro código.
6. Cuando entra una reserva por Booking o Airbnb, el dueño marca esas fechas como
   "Ocupado" en la pestaña de esa habitación del Google Sheet, para que la web deje de
   ofrecerlas.

## Riesgo que hay que tener presente

Como la sincronización con Booking/Airbnb depende de que el dueño la haga a mano en los
dos sentidos, hay una ventana de tiempo en la que, en teoría, se podría duplicar una
reserva -- mientras el dueño no ha mirado el email o no ha actualizado la hoja. Con el
volumen de una posada de 7 habitaciones y temporada corta, el riesgo real es bajo, pero no
es cero. Vale la pena que el dueño revise el correo con cierta frecuencia en temporada alta.
