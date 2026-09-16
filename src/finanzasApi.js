// API del dashboard de finanzas (/finanzas). Solo se usa para la sincronizacion
// con Notion: el dashboard sigue funcionando entero sin esto (los datos viven en
// el navegador), pero si hay token configurado puede subir y bajar movimientos.
//
// Seguridad: todo el router pide un token propio (FINANZAS_TOKEN) que el
// dashboard guarda en el navegador. El token de Notion nunca sale del servidor.
import crypto from "crypto";
import express from "express";
import { crearCliente, sincronizar } from "./notionFinanzas.js";

const router = express.Router();

function comparar(a, b) {
  const bufA = Buffer.from(String(a || ""));
  const bufB = Buffer.from(String(b || ""));
  if (bufA.length !== bufB.length || !bufA.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requiereToken(req, res, next) {
  const esperado = process.env.FINANZAS_TOKEN;
  if (!esperado) {
    return res.status(503).json({ error: "El servidor no tiene FINANZAS_TOKEN configurado." });
  }
  const recibido = req.get("x-finanzas-token") || req.query.token;
  if (!comparar(recibido, esperado)) return res.status(401).json({ error: "Token invalido." });
  next();
}

function configNotion() {
  return {
    token: process.env.NOTION_TOKEN,
    dbId: (process.env.NOTION_DB_MOVIMIENTOS || "").replace(/-/g, ""),
    parentPageId: (process.env.NOTION_PARENT_PAGE_ID || "").replace(/-/g, ""),
  };
}

// Traduce los errores de la API de Notion a algo que se entienda en pantalla.
function explicar(err) {
  const data = err.response?.data;
  const code = data?.code;
  if (code === "unauthorized") return "El token de Notion no es valido o fue revocado.";
  if (code === "restricted_resource" || code === "object_not_found") {
    return "La integracion no tiene acceso a la base. Abrila en Notion → ••• → Conexiones → agregala.";
  }
  if (code === "validation_error") return `Notion rechazo los datos: ${data?.message || "revisa el esquema de la base"}`;
  if (code === "rate_limited") return "Notion pidio bajar el ritmo (rate limit). Probá de nuevo en un minuto.";
  if (err.code === "ECONNABORTED") return "Notion no respondio a tiempo.";
  return data?.message || err.message || "Error desconocido hablando con Notion.";
}

/** Estado de la integracion: sirve para el cartel de Configuracion del dashboard. */
router.get("/estado", requiereToken, async (_req, res) => {
  const { token, dbId } = configNotion();
  if (!token || !dbId) {
    return res.json({
      conectado: false,
      motivo: !token ? "Falta NOTION_TOKEN en el servidor." : "Falta NOTION_DB_MOVIMIENTOS en el servidor.",
    });
  }
  try {
    const base = await crearCliente({ token }).base(dbId);
    res.json({ conectado: true, base });
  } catch (err) {
    res.json({ conectado: false, motivo: explicar(err) });
  }
});

/** Sincronizacion bidireccional. Devuelve la lista final ya conciliada. */
router.post("/sync", requiereToken, async (req, res) => {
  const { transactions = [], papelera = [], modo = "merge" } = req.body || {};
  if (!Array.isArray(transactions) || !Array.isArray(papelera)) {
    return res.status(400).json({ error: "Formato invalido." });
  }
  if (!["merge", "subir", "bajar"].includes(modo)) {
    return res.status(400).json({ error: "Modo invalido." });
  }

  const { token, dbId } = configNotion();
  if (!token || !dbId) return res.status(503).json({ error: "Notion no esta configurado en el servidor." });

  try {
    const resultado = await sincronizar({
      cliente: crearCliente({ token }),
      dbId,
      locales: transactions,
      papelera,
      modo,
    });
    res.json({ ok: true, ...resultado, sincronizado: new Date().toISOString() });
  } catch (err) {
    console.error("Error sincronizando con Notion:", err.response?.data || err.message);
    res.status(err.status || 502).json({ error: explicar(err) });
  }
});

/** Crea la base con el esquema correcto dentro de una pagina (uso opcional). */
router.post("/crear-base", requiereToken, async (_req, res) => {
  const { token, parentPageId } = configNotion();
  if (!token || !parentPageId) {
    return res.status(503).json({ error: "Falta NOTION_TOKEN o NOTION_PARENT_PAGE_ID en el servidor." });
  }
  try {
    const db = await crearCliente({ token }).crearBase(parentPageId);
    res.json({ ok: true, id: db.id, url: db.url, nota: "Copia este id en NOTION_DB_MOVIMIENTOS." });
  } catch (err) {
    res.status(502).json({ error: explicar(err) });
  }
});

export default router;
