# Sistema de solicitudes de reserva — Bisabuela Martina

El huésped ve las 7 habitaciones, entra en la que le interesa, ve su calendario real
(libre/completo) y envía una solicitud de reserva -- sin pagar todavía. Al dueño le llega
un email con los datos; él comprueba y bloquea la fecha en Booking/Airbnb a mano, y le
responde al huésped con un enlace de pago de Stripe (Payment Link, sin código de por
medio). No hay PMS ni pasarela de pago conectados por API -- el "calendario" es un Google
Sheet que gestiona el propio dueño.

## Estado ahora mismo

Todo el código del backend (Google Sheets + email) está escrito y probado en **modo
demostración** (`MOCK_SHEET=true`), con los mismos datos que hay en
`calendario-bisabuela-martina.xlsx`: una reserva de ejemplo (Doble, por Booking). Ese es el
código pensado para cuando esto se despliegue de verdad en Vercel (ver más abajo).

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

1. **Subir `calendario-bisabuela-martina.xlsx` a Google Sheets** (Archivo → Importar en
   sheets.google.com) y compartirlo con el dueño para que lo pueda editar desde su cuenta.
2. **Crear la cuenta de servicio de Google** que usa el código para leer y escribir en esa
   hoja (ver más abajo). Esto lo puede montar guillem con su propia cuenta de Google, no
   depende de la posada.
3. **Fotos reales de las 7 habitaciones**, y si es posible los **metros cuadrados** de cada
   una -- ahora mismo el modal usa un icono de sitio, no una foto, porque no hay fotos
   reales todavía. En cuanto lleguen, sustituyen a `.rm-gallery-ph` en el HTML.
4. **Una cuenta de email transaccional** (recomiendo Resend, resend.com, tiene plan
   gratuito) para que los avisos se envíen de verdad en vez de quedarse en los logs.
5. **El email real de la posada**, para `OWNER_EMAIL` (ahora mismo apunta a
   `loscuatripolo@gmail.com` para poder probar).

Nada de esto necesita esperar a Beds24 ni a ningún PMS -- por eso este camino es más rápido
que el que planteamos al principio.

## Conectar el Google Sheet (paso técnico, lo hace guillem)

1. En [console.cloud.google.com](https://console.cloud.google.com), crear un proyecto
   nuevo (gratis) y activar la "Google Sheets API".
2. Crear una cuenta de servicio (IAM y administración → Cuentas de servicio → Crear), y
   generar una clave en formato JSON -- se descarga un archivo.
3. Copiar el contenido de ese archivo JSON, en una sola línea, a `GOOGLE_SERVICE_ACCOUNT_JSON`.
4. Compartir el Google Sheet real con el email de esa cuenta de servicio (algo tipo
   `nombre@proyecto.iam.gserviceaccount.com`), como si fuera un colaborador más, con
   permiso de "Editor".
5. Copiar el ID de la hoja (el trozo largo de la URL) a `SHEET_SPREADSHEET_ID`.

## Desplegar

Pensado para Vercel (ya tenéis GitHub conectado a Vercel de antes):

1. Subir esta carpeta a un repo de GitHub.
2. Importar el repo en Vercel.
3. Añadir las variables de entorno de `.env.example` en el proyecto de Vercel.
4. Cambiar `MOCK_SHEET` a `false`.

## Cómo queda el ciclo completo

1. El huésped entra en la web, abre una habitación, ve el calendario real y elige fechas.
2. Pulsa "Enviar solicitud de reserva" -- no paga nada todavía.
3. El sistema anota esas fechas como "Pendiente-Web" en el Google Sheet (para que no se le
   ofrezcan a otra persona mientras el dueño decide) y manda un email al dueño con todos
   los datos, y otro de confirmación al huésped.
4. El dueño comprueba disponibilidad de verdad, bloquea esas fechas en Booking.com y
   Airbnb, genera un enlace de pago en Stripe (Dashboard de Stripe → Payment Links) por el
   importe que corresponda, y se lo manda al huésped respondiendo a su email.
5. El huésped paga en ese enlace -- eso ya lo gestiona Stripe directamente, no pasa por
   nuestro código.
6. Cuando entra una reserva por Booking o Airbnb, el dueño añade esa fila a mano en el
   Google Sheet, para que la web dejе de ofrecer esas fechas.

## Riesgo que hay que tener presente

Como la sincronización con Booking/Airbnb depende de que el dueño la haga a mano en los
dos sentidos, hay una ventana de tiempo en la que, en teoría, se podría duplicar una
reserva -- mientras el dueño no ha mirado el email o no ha actualizado la hoja. Con el
volumen de una posada de 7 habitaciones y temporada corta, el riesgo real es bajo, pero no
es cero. Vale la pena que el dueño revise el correo con cierta frecuencia en temporada alta.
