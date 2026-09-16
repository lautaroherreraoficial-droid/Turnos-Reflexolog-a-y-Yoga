import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { parseIncomingMessage, verifySignature } from "./whatsapp.js";
import { manejarMensaje } from "./conversation.js";
import { appendRow, readRows } from "./google.js";
import { requireAdminAuth } from "./adminAuth.js";
import { confirmarTurno } from "./turnos.js";
import { SERVICIOS, LUGARES, FORMAS_DE_PAGO } from "./config.js";
import finanzasApi from "./finanzasApi.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Guardamos el body crudo (ademas de parseado) porque hace falta para validar la firma de Meta.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(express.static(path.join(__dirname, "..", "frontend")));

// Dashboard personal de finanzas e inversiones (/finanzas).
// Es un unico archivo HTML que guarda todo en el localStorage del navegador: el
// servidor solo lo sirve, nunca ve ni almacena los datos financieros.
app.use("/finanzas", express.static(path.join(__dirname, "..", "finanzas")));

// Sincronizacion del dashboard con Notion (opcional: solo funciona si estan
// cargadas FINANZAS_TOKEN, NOTION_TOKEN y NOTION_DB_MOVIMIENTOS).
app.use("/api/finanzas", finanzasApi);

// Panel privado para el negocio (usuario/contrasena definidos en .env)
app.use("/admin", requireAdminAuth, express.static(path.join(__dirname, "..", "admin")));

// --- Verificacion del webhook (Meta la llama una sola vez al configurarlo) ---
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// --- Mensajes entrantes de WhatsApp ---
app.post("/webhook", async (req, res) => {
  // Respondemos rapido (Meta reintenta si tarda), y procesamos despues.
  res.sendStatus(200);

  const signature = req.get("x-hub-signature-256");
  if (process.env.WHATSAPP_APP_SECRET && !verifySignature(req.rawBody, signature)) {
    console.warn("Firma de webhook invalida, se ignora el mensaje.");
    return;
  }

  const mensaje = parseIncomingMessage(req.body);
  if (!mensaje) return; // notificaciones de estado (entregado/leido), no son mensajes de usuario

  try {
    await manejarMensaje(mensaje);
  } catch (err) {
    console.error("Error manejando mensaje entrante:", err);
  }
});

// --- API para la web ---

// Comentarios aprobados para mostrar en la pagina
app.get("/api/comments", async (_req, res) => {
  try {
    const rows = await readRows("Comentarios");
    // Columnas: [fecha, telefono, texto] -> no exponemos el telefono en la web
    const comentarios = rows.map((r) => ({ fecha: r[0], texto: r[2] })).filter((c) => c.texto);
    res.json(comentarios);
  } catch (err) {
    console.error("Error leyendo comentarios:", err.message);
    res.status(500).json({ error: "no se pudieron cargar los comentarios" });
  }
});

// Comentario dejado desde el formulario de la web (ademas del que se puede dejar por WhatsApp)
app.post("/api/comments", async (req, res) => {
  const { texto } = req.body || {};
  if (!texto || !texto.trim()) return res.status(400).json({ error: "falta el texto" });

  try {
    await appendRow("Comentarios", [new Date().toISOString(), "web", texto.trim()]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Error guardando comentario web:", err.message);
    res.status(500).json({ error: "no se pudo guardar" });
  }
});

// --- API del panel privado ---

// Config del negocio, para que el panel arme sus selects sin duplicar los datos de config.js
app.get("/api/admin/config", requireAdminAuth, (_req, res) => {
  res.json({
    servicios: SERVICIOS,
    lugares: LUGARES.map((l) => ({ id: l.id, nombre: l.nombre, servicios: l.servicios })),
    formasDePago: FORMAS_DE_PAGO,
  });
});

app.get("/api/admin/turnos", requireAdminAuth, async (_req, res) => {
  try {
    const rows = await readRows("Turnos");
    // Columnas guardadas por turnos.js: [creado, cliente, servicio, lugar, inicioISO, pago, origen]
    const turnos = rows.map((r) => ({
      creado: r[0],
      cliente: r[1],
      servicio: r[2],
      lugar: r[3],
      inicio: r[4],
      pago: r[5],
      origen: r[6] || "whatsapp",
    }));
    res.json(turnos);
  } catch (err) {
    console.error("Error leyendo turnos:", err.message);
    res.status(500).json({ error: "no se pudieron cargar los turnos" });
  }
});

// Carga manual de un turno (cuando el cliente le escribe suelto y mama lo anota ella misma)
app.post("/api/admin/turnos", requireAdminAuth, async (req, res) => {
  const { servicioId, lugarId, fechaHora, cliente, pago } = req.body || {};
  if (!servicioId || !lugarId || !fechaHora || !cliente || !pago) {
    return res.status(400).json({ error: "faltan datos" });
  }
  const inicio = new Date(fechaHora);
  if (Number.isNaN(inicio.getTime())) {
    return res.status(400).json({ error: "fecha/hora invalida" });
  }

  try {
    await confirmarTurno({ servicioId, lugarId, inicio, cliente, pago, origen: "manual" });
    res.json({ ok: true });
  } catch (err) {
    console.error("Error creando turno manual:", err.message);
    res.status(400).json({ error: err.message || "no se pudo crear el turno" });
  }
});

app.get("/api/admin/comentarios", requireAdminAuth, async (_req, res) => {
  try {
    const rows = await readRows("Comentarios");
    const comentarios = rows.map((r) => ({ fecha: r[0], origen: r[1], texto: r[2] }));
    res.json(comentarios);
  } catch (err) {
    console.error("Error leyendo comentarios:", err.message);
    res.status(500).json({ error: "no se pudieron cargar los comentarios" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en http://localhost:${PORT}`));
