# Turnos Mamá — Bot de WhatsApp + panel privado para reservar masajes, reflexología y yoga

## Qué hace

Hay dos partes bien separadas:

1. **Para los clientes: solo WhatsApp.** Nadie tiene que entrar a ninguna web para reservar. Un
   cliente le escribe al WhatsApp del negocio → el bot le pregunta servicio, lugar y horario,
   cruza contra Google Calendar para ofrecer solo huecos libres, anota la forma de pago y confirma
   el turno solo. También hay una página pública (`/`) con los servicios, los lugares y un botón
   grande para arrancar el chat — es solo informativa/de presentación, no se reserva ahí.
2. **Para tu mamá: el panel privado (`/admin`).** Protegido con usuario y contraseña. Ahí ve
   automáticamente todos los turnos que van entrando por WhatsApp, con estadísticas rápidas
   (turnos próximos, de la semana, servicio más pedido). Además tiene un formulario para cargar
   ella misma un turno a mano — para cuando un cliente le escribe "suelto" sin pasar por el bot, o
   le avisa por otro medio. Todo (lo que carga el bot y lo que carga ella) termina en el mismo
   Google Calendar y la misma planilla de Google Sheets (en su Drive), así hay una sola fuente de
   verdad.

Los turnos quedan creados en Google Calendar y anotados en una planilla de Google Sheets (vive en
Drive). Los comentarios de clientes (por WhatsApp o desde la web) quedan en la misma planilla, se
muestran en la página pública y también los ve tu mamá en el panel.

Todo el código ya está escrito y probado localmente. Lo que falta es crear las cuentas externas
y cargar las credenciales reales. Son 3 partes: **Meta (WhatsApp)**, **Google (Calendar + Sheets)**
y **Hosting** (dónde vive el servidor 24/7).

---

## 1. Meta — WhatsApp Cloud API

1. Entrar a https://developers.facebook.com/ con una cuenta de Facebook (puede ser la personal,
   no hace falta una página de Facebook del negocio todavía).
2. "Mis apps" → "Crear app" → tipo **"Empresa"**.
3. Dentro de la app, agregar el producto **WhatsApp**.
4. Meta da automáticamente un **número de prueba** y un **token temporal** (dura 24hs) — sirve para
   probar todo el flujo ya mismo, sin esperar aprobaciones.
5. Anotar:
   - `WHATSAPP_TOKEN` → el token que te da ahí.
   - `WHATSAPP_PHONE_NUMBER_ID` → aparece en la misma pantalla ("Identificador del número de teléfono").
   - `WHATSAPP_APP_SECRET` → en Configuración de la app → Básica → "Clave secreta".
6. Configurar el webhook (una vez que el servidor ya esté desplegado, paso 3):
   - URL: `https://tu-dominio.com/webhook`
   - Token de verificación: el mismo valor que pongas en `WHATSAPP_VERIFY_TOKEN` (inventalo vos).
   - Suscribirse al campo `messages`.
7. Para pasar del número de prueba al número real de tu mamá (más adelante, cuando ya esté probado):
   hay que verificar la identidad del negocio ante Meta (Meta Business Manager) y agregar/portar el
   número. Esto puede tardar entre horas y unos pocos días. Mientras tanto se puede probar todo con
   el número de prueba (solo pueden escribirle los números que agregues como "destinatarios de prueba").

Con el token temporal alcanza para probar el sistema entero de punta a punta. Cuando esté todo
andando bien, se renueva por un token permanente (se genera un "usuario del sistema" en Meta
Business Manager — es un trámite de 10 minutos, te ayudo cuando llegue el momento).

---

## 2. Google — Calendar + Sheets (Drive)

1. Entrar a https://console.cloud.google.com/ (con la cuenta de Google que va a ser la "dueña"
   del calendario y la planilla — puede ser una cuenta de Gmail nueva creada para el negocio).
2. Crear un proyecto nuevo (arriba a la izquierda → "Nuevo proyecto").
3. "APIs y servicios" → "Biblioteca" → activar **Google Calendar API** y **Google Sheets API**.
4. "APIs y servicios" → "Credenciales" → "Crear credenciales" → **Cuenta de servicio**.
   - Le pone un nombre, ej. `turnos-bot`.
   - Una vez creada, entrar a la cuenta de servicio → pestaña "Claves" → "Agregar clave" → JSON.
   - Se descarga un archivo `.json`: ahí adentro está `client_email` (va en
     `GOOGLE_SERVICE_ACCOUNT_EMAIL`) y `private_key` (va en `GOOGLE_PRIVATE_KEY`, tal cual, con los
     `\n` incluidos).
5. Crear un **Google Calendar** normal (o usar uno existente) desde calendar.google.com. Ir a
   Configuración del calendario → "Compartir con determinadas personas" → agregar el
   `client_email` de la cuenta de servicio con permiso "Realizar cambios en eventos".
   - El `GOOGLE_CALENDAR_ID` está en esa misma pantalla de configuración ("Integrar calendario").
6. Crear una **Google Sheet** (planilla) con dos pestañas llamadas exactamente `Turnos` y
   `Comentarios` (no hace falta poner encabezados, el bot va agregando filas). Compartirla con el
   mismo `client_email` con permiso de Editor.
   - El `GOOGLE_SHEET_ID` es el valor largo que está en la URL de la planilla, entre
     `/d/` y `/edit`.

---

## 3. Desplegar el servidor (para que el webhook tenga una URL pública 24/7)

El proyecto ya tiene un repositorio git local (con el primer commit hecho) y un archivo
`render.yaml` listo para desplegar en **Render** (https://render.com) de forma casi automática.

1. Crear un repositorio nuevo y vacío en https://github.com/new (con tu cuenta de GitHub).
2. Conectar este proyecto local a ese repo y subirlo:
   ```bash
   git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
   git branch -M main
   git push -u origin main
   ```
3. Crear una cuenta en https://render.com (podés entrar directo con GitHub).
4. "New" → **"Blueprint"** → elegir el repo que acabás de subir. Render lee el `render.yaml` solo
   y te va a pedir que completes las variables marcadas como secretas (son las mismas del
   `.env.example`, con los valores reales que juntaste en los pasos 1 y 2 de este README).
5. Una vez desplegado, Render te da una URL tipo `https://turnos-mama.onrender.com`. Esa es la que
   se usa en el webhook de Meta (paso 1.6) y, si querés, para el botón de la web.
6. (Opcional) comprar un dominio propio (ej. en Namecheap o Google Domains) y apuntarlo a esa URL
   — no es necesario para que funcione, es solo estético/de marca.

---

## 4. Panel privado de tu mamá (`/admin`)

No requiere ninguna cuenta externa, solo definir un usuario y contraseña en el `.env`:

```
ADMIN_USER=mama
ADMIN_PASSWORD=elegi-algo-que-solo-ella-sepa
```

Con eso, entrando a `https://tu-dominio.com/admin` el navegador va a pedir ese usuario y
contraseña (un cartel nativo del navegador, no hay que programar nada más). Ahí ve los turnos
que van entrando por WhatsApp y puede cargar uno a mano.

---

## 5. Antes de recibir clientes de verdad

- Editar `src/config.js` con los lugares, direcciones y horarios reales.
- Editar `frontend/script.js` y poner el número real de WhatsApp en `NUMERO_WHATSAPP`.
- Probar todo el flujo con el número de prueba de Meta antes de pasar al número real.
- Revisar que la duración de turno (`duracionTurnoMinutos` en config.js) sea la correcta.

## Correr en la computadora para probar

```bash
npm install
cp .env.example .env
# completar .env con las credenciales reales
npm start
```

Abrí `http://localhost:3000` para ver la web. Para probar el webhook de WhatsApp desde tu compu
vas a necesitar exponerla a internet temporalmente (por ejemplo con `ngrok http 3000`) porque
Meta necesita una URL pública para mandar los mensajes.

---

## 6. Dashboard de finanzas personales e inversiones (`/finanzas`)

Es un extra que vive en el mismo proyecto pero **no tiene nada que ver con los turnos**: un
dashboard privado para seguir el patrimonio, la cartera de inversiones y el flujo de caja.

- **Un solo archivo**: `finanzas/index.html` (HTML + CSS + JS adentro, sin build ni dependencias
  que instalar; sólo usa Chart.js por CDN).
- **Los datos no salen del dispositivo**: todo se guarda en el `localStorage` del navegador. El
  servidor sirve el archivo y nada más — no ve ni guarda ningún dato financiero.
- Arranca con **datos de demostración realistas** para que se entienda al instante; se borran con
  el primer cambio que hagas, o con "Restaurar datos demo" en Configuración.

### Qué trae

| Sección | Qué muestra |
| --- | --- |
| Resumen | Patrimonio neto (activos − pasivos), liquidez inmediata y meses de gastos cubiertos, capital invertido con ROI, cash flow del período, tasa de ahorro, evolución del patrimonio, asignación de activos y balance general |
| Inversiones | Portfolio tracker (ticker, cantidad, PPC, precio actual, valor, P&L $ y %, peso), rebalanceo actual vs. objetivo con el monto exacto a comprar/vender, rendimiento anualizado, diversificación por sector y geografía, y dividendos/cupones proyectados |
| Flujo de caja | Ingresos vs. gastos mes a mes, gastos por categoría, tasa de ahorro, gasto promedio, runway y la lista completa de movimientos |

Filtros: período (Este mes / YTD / 1 año / Todo), moneda (USD o local con el tipo de cambio que
cargues), clase de activo, sector, y buscador en vivo por ticker, nombre, categoría o descripción.

### Cómo verlo en el celular

1. Desplegado, entrá a `https://tu-dominio.com/finanzas` desde el celular.
2. **iPhone**: botón Compartir → "Agregar a inicio". **Android**: menú ⋮ → "Agregar a pantalla
   principal". Queda con ícono propio y abre a pantalla completa, como una app.
3. Los datos quedan en ese dispositivo. Para pasarlos a otro: Configuración → Exportar JSON, y en
   el otro → Importar JSON.

### Cargar un gasto con el Action Button del iPhone (sin abrir nada)

El dashboard acepta datos por URL, así que un Atajo de iOS alcanza:

1. App Atajos → nuevo atajo → acción **"Pedir entrada"** (Número, pregunta: "¿Cuánto gastaste?").
2. Acción **"Abrir URL"** con:
   `https://tu-dominio.com/finanzas/?tipo=gasto&monto=[Entrada proporcionada]&cat=Comida&desc=Gasto%20rapido`
3. Ajustes → Botón de Acción → Atajo → elegí ese atajo.

Parámetros: `tipo` (`gasto` o `ingreso`), `monto`, `cat`, `desc` y `fecha` (opcional, `AAAA-MM-DD`).
Al abrirse, el movimiento queda cargado, se recalculan los KPIs y aparece el aviso de confirmación.
La URL exacta, lista para copiar, está dentro del dashboard en Configuración.

### Notion (si más adelante lo querés)

Hoy el puente es manual pero sirve: **Exportar CSV (Notion/Excel)** genera un archivo con todos los
movimientos y posiciones que Notion importa como base de datos. Una sincronización automática de
ida y vuelta necesita una integración de Notion con token y un endpoint en el servidor; se puede
agregar después sin tocar nada de lo que ya está.
