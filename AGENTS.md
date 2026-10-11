# Contexto del proyecto para asistentes de IA

Este archivo es la memoria compartida del repo. Lo leen Claude Code (a través de `CLAUDE.md`),
Codex / ChatGPT y cualquier otro asistente. **Leelo entero antes de tocar nada** y, al terminar
una sesión de trabajo, actualizá la sección "Estado actual" con lo que cambió.

El contexto general (no solo de código) vive en Notion, en la página **🧠 Segundo cerebro**
(https://app.notion.com/p/3f687034c69d81908705d7405b7d1c1d) y en **Notion Memory**. Si tenés
acceso a Notion, leelos también.

## Quién y para qué

- Dueño: Lautaro Herrera. Habla en español rioplatense (vos, tuteo argentino): respondé así.
- El proyecto es para **la mamá de Lautaro**, que da masajes, reflexología y yoga. Ella no es
  técnica: todo lo que vea (panel, mensajes del bot) tiene que ser simple y en castellano llano.
- El README está escrito como guía paso a paso para alguien sin experiencia: mantené ese tono.

## Qué hay en el repo

Tres cosas independientes servidas por el mismo servidor Express (`src/server.js`, Node con ES
modules, sin build):

1. **Turnos (lo principal)**
   - Bot de WhatsApp (WhatsApp Cloud API de Meta): el cliente escribe, el bot pregunta servicio →
     lugar → horario libre (cruza con Google Calendar) → forma de pago, y confirma.
     Flujo en `src/conversation.js`; las sesiones de chat viven en memoria (se pierden si se
     reinicia el proceso, los turnos confirmados no).
   - Página pública informativa (`frontend/`, ruta `/`): servicios, lugares, comentarios y un botón
     a WhatsApp. **No se reserva desde la web.**
   - Panel privado de la mamá (`admin/`, ruta `/admin`, Basic Auth con `ADMIN_USER` /
     `ADMIN_PASSWORD`): ve los turnos y puede cargar uno a mano.
   - Fuente de verdad: Google Calendar + una Google Sheet con pestañas `Turnos` y `Comentarios`
     (`src/google.js`, cuenta de servicio).
   - **Toda la info del negocio** (servicios, lugares, horarios, duración, formas de pago) está en
     `src/config.js`. Cambios de negocio van ahí, no desparramados por el código.
2. **Dashboard de finanzas personales** (`finanzas/index.html`, ruta `/finanzas`)
   - No tiene nada que ver con los turnos. Es un solo HTML con CSS y JS adentro, Chart.js por CDN,
     datos en `localStorage`.
   - Sincroniza ingresos y gastos (no inversiones) con la base de Notion **Finanzas Personales →
     Movimientos** vía `/api/finanzas` (`src/finanzasApi.js`, `src/notionFinanzas.js`), protegido
     por `FINANZAS_TOKEN`. El token de Notion nunca va al navegador.
   - Se publica también en GitHub Pages con `.github/workflows/pages.yml` (solo `finanzas/`).
3. **Estrella financiera** (`finanzas/estrella.html`, ruta `/finanzas/estrella.html`)
   - Herramienta suelta para analizar cualquier negocio en 5 puntas (rentabilidad, liquidez,
     endeudamiento, eficiencia, crecimiento), cada una de 0 a 5 estrellas. Un solo HTML sin
     dependencias, datos en `localStorage`, importa/exporta CSV o JSON.
   - Escalas de puntaje en `ESCALAS` y consejos en `CONSEJOS`, dentro del mismo archivo.
   - Como vive en `finanzas/`, también sale en GitHub Pages.

## Cómo correrlo

```bash
npm install
cp .env.example .env   # completar con credenciales reales
npm start              # http://localhost:3000  (npm run dev = con --watch)
```

No hay tests ni linter configurados. Para probar cambios: levantar el servidor y entrar a `/`,
`/admin` y `/finanzas`. El webhook de WhatsApp necesita URL pública (ngrok o el deploy).

Deploy: Render, con `render.yaml` (plan free). Las variables secretas están listadas ahí y
explicadas en `.env.example`.

## Reglas para trabajar acá

- **Nunca** escribas credenciales reales en el repo, en este archivo ni en Notion. Van solo en
  `.env` (ignorado por git) o en las variables de Render.
- Mantené el estilo del código existente: JS plano, comentarios en castellano sin tildes en el
  código, nada de frameworks ni pasos de build nuevos sin preguntar.
- Commits en castellano, en infinitivo y cortos ("Agregar ...", "Aclarar ...").
- Si agregás una variable de entorno: sumala a `.env.example`, a `render.yaml` y al README.
- Cambios que afectan lo que ve la mamá o los clientes: explicalos en criollo en el README.

## Estado actual

_Última actualización: 2026-10-11_

Hecho:
- Código del bot, la web pública, el panel `/admin` y el dashboard `/finanzas` completos y
  probados localmente.
- Base "Movimientos" creada en Notion y sincronización implementada.
- Workflow de GitHub Pages para el dashboard.
- Estrella financiera (`finanzas/estrella.html`): análisis de 5 puntas con carga manual,
  importación CSV/JSON y gráfico de estrella.

Pendiente (lo hace Lautaro, no se resuelve con código):
- Crear la app en Meta y conseguir las credenciales de WhatsApp.
- Crear la cuenta de servicio de Google, el calendario y la planilla, y compartirlos.
- Desplegar en Render y cargar las variables.
- Activar GitHub Pages a mano (Settings → Pages → Source: GitHub Actions).

Pendiente en el código antes de recibir clientes reales:
- `src/config.js`: nombre real del negocio (hoy dice "[Nombre de tu mama]"), lugares,
  direcciones y horarios reales.
- `frontend/script.js`: número real en `NUMERO_WHATSAPP` (hoy es `5490000000000`).
- Confirmar `duracionTurnoMinutos`.

Ideas a futuro (sin decidir):
- Guardar las sesiones del bot en una base en vez de en memoria si crece el volumen.
