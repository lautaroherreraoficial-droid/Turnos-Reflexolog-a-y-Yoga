# Turnero de Barbería Lux (Merlo Centro, Buenos Aires)

Una página web para que los clientes reserven su turno solos, y un panel privado para que la
barbería vea la agenda del día. Es una app aparte dentro de este repo: no comparte datos ni
servidor con el bot de turnos de reflexología.

| Dirección | Para quién | Qué hace |
| --- | --- | --- |
| `/` | Clientes | Eligen servicio → barbero (o "cualquiera") → día → horario, dejan nombre y WhatsApp y listo. Solo se ofrecen horarios libres |
| `/admin` | La barbería (con usuario y contraseña) | Agenda por día y por barbero, marcar *Atendido* / *No vino* / *Cancelar*, recordatorio por WhatsApp con un toque, cargar turnos de gente que llama o pasa por el local |

## Qué tiene

**Para el cliente**

- Reserva en 5 toques desde el celular, sin crear cuenta.
- Solo ve horarios que de verdad están libres (cruza la duración de cada servicio con los turnos
  de cada barbero). Si elige "cualquiera", el turno va al barbero que tenga menos trabajo ese día.
- Si dos personas eligen el mismo horario a la vez, el segundo recibe un aviso y la agenda se
  actualiza sola para que elija otro.
- Al confirmar: botón para agregarlo a Google Calendar y (si la barbería cargó su WhatsApp) para
  avisar por WhatsApp.
- El turno queda guardado en su celular: al volver a entrar lo ve arriba de todo y puede
  cancelarlo hasta 2 horas antes (después le sugiere avisar por WhatsApp).
- Recuerda su nombre y teléfono para la próxima vez.

**Para la barbería**

- Agenda del día con la semana arriba (cuántos turnos hay cada día), filtro por barbero y números
  del día: turnos, por atender, atendidos, no vinieron (y lo facturado si se cargan precios).
- Botón de WhatsApp en cada turno con el recordatorio ya escrito ("Hola Juan! Te recordamos tu
  turno en Barbería Lux mañana a las 10:30...").
- "+ Nuevo turno" para quien llama o pasa: muestra los horarios libres y, si se pisa con otro o
  cae fuera de horario, pregunta antes de guardarlo igual.
- Se actualiza solo cada minuto y avisa cuando entra un turno nuevo desde la web (ideal para
  dejarlo abierto en la compu o tablet del mostrador).

**Protecciones**: máximo 2 turnos futuros por número de WhatsApp y hasta 21 días para adelante
(se cambian en `REGLAS` de `config.js`), y no más de 6 reservas por hora desde una misma conexión.

## 1. Cargar los datos reales (`barberia/server/config.js`)

Es el único archivo que hay que tocar. Mientras falte algo, el panel lo avisa con un cartel amarillo.

- `NEGOCIO.direccion` → calle y altura (se usa para el botón "Cómo llegar").
- `NEGOCIO.whatsapp` → número de la barbería, formato `5491123456789` (sin `+` ni espacios).
- `NEGOCIO.instagram` → usuario sin la `@` (opcional).
- `HORARIO` → días y horas de atención. Para cortar al mediodía, dos bloques por día.
- `DIAS_CERRADOS` → feriados o vacaciones (`"2026-12-25"`).
- `SERVICIOS` → nombre, descripción, duración en minutos y precio (si el precio queda en `null`
  no se muestra).
- `BARBEROS` → nombre de cada uno. Si alguno no hace todos los servicios o tiene otro horario, se
  indica ahí mismo (hay un ejemplo comentado).
- `REGLAS` → cada cuánto arranca un turno (30 min), cuántos días para adelante, cancelación, etc.

## 2. Probarlo en la compu

```bash
npm install
BARBERIA_ADMIN_USER=lux BARBERIA_ADMIN_PASSWORD=una-clave npm run barberia
```

- Página de clientes: <http://localhost:3001>
- Panel: <http://localhost:3001/admin> (usuario y contraseña de arriba)

Sin más configuración, los turnos se guardan en `barberia/data/turnos.json` (no se sube a git).

## 3. Dónde se guardan los turnos: Google Sheets

Para usarlo en serio conviene guardar los turnos en una planilla de Google: queda en el Drive de
la barbería, se puede mirar desde el celular, y no se pierde nunca (el disco del plan gratis de
Render se borra cada vez que el servidor se reinicia, así que **ahí el archivo local no sirve**;
el panel muestra un cartel rojo si pasa eso).

1. En <https://console.cloud.google.com/> crear un proyecto, activar **Google Sheets API** y crear
   una **cuenta de servicio** con una clave JSON (los mismos pasos 1 a 4 de la sección *Google* del
   [README principal](../README.md); si ya existe la cuenta de servicio de los otros turnos, se
   puede reutilizar).
2. Crear una planilla nueva en Google Sheets con una pestaña llamada exactamente **`Turnos`**.
   No hace falta poner encabezados: se escriben solos con el primer turno.
3. Compartir la planilla con el `client_email` de la cuenta de servicio, con permiso de **Editor**.
4. Cargar estas variables en el servidor:
   - `BARBERIA_SHEET_ID` → el código largo de la URL de la planilla (entre `/d/` y `/edit`).
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` y `GOOGLE_PRIVATE_KEY` → de la clave JSON.

Cada turno es una fila (fecha, hora, cliente, teléfono, servicio, barbero, estado...). Se puede
mirar y filtrar tranquilo, pero conviene cargar y cancelar turnos desde el panel: si se edita la
planilla a mano, que sea sin cambiar la columna `id` ni el orden de las columnas.

## 4. Publicarlo en Render

El `render.yaml` del repo ya trae un servicio aparte llamado `barberia-lux`:

1. En Render: **New → Blueprint** (o, si el Blueprint ya estaba creado, *Sync*) eligiendo este repo.
2. Completar las variables que pide para `barberia-lux`: `BARBERIA_ADMIN_USER`,
   `BARBERIA_ADMIN_PASSWORD`, `BARBERIA_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL` y
   `GOOGLE_PRIVATE_KEY`.
3. Render da una URL tipo `https://barberia-lux.onrender.com`: esa es la que se comparte con los
   clientes (link en la bio de Instagram, estado de WhatsApp, un QR en el espejo...). El panel queda
   en `https://barberia-lux.onrender.com/admin`.

En el plan gratis, si nadie entra por 15 minutos el servidor "se duerme" y la primera visita tarda
unos segundos en cargar. Con el plan pago más barato eso no pasa. También se le puede poner un
dominio propio (ej. `turnos.barberialux.com.ar`) desde Settings → Custom Domains.

## Archivos

| Archivo | Qué es |
| --- | --- |
| `server/config.js` | Datos de la barbería (lo único que hay que editar) |
| `server/agenda.js` | Lógica de horarios libres, reservas, cancelaciones (hora de Buenos Aires siempre) |
| `server/store.js` | Guardado en Google Sheets o en archivo local |
| `server/app.js` | Rutas de la API y de las páginas |
| `server/index.js` | Arranca el servidor (`npm run barberia`) |
| `web/` | Página de clientes |
| `admin/` | Panel de la barbería |
