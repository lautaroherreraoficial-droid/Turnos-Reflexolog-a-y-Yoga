// Sincronizacion bidireccional entre el dashboard de finanzas (/finanzas) y una
// base de datos de Notion.
//
// Idea general:
//  - La fuente local es el localStorage del navegador; la fuente remota es Notion.
//  - Cada movimiento local lleva un `id` propio que se guarda en Notion en la
//    propiedad "ID local". Ese id es lo que empareja los dos lados.
//  - Para resolver conflictos se compara `updatedAt` (local) contra
//    `last_edited_time` (Notion): gana el mas reciente.
//  - Las bajas locales viajan en una "papelera" (tombstones) para poder archivar
//    la pagina correspondiente en Notion.
//
// El cliente HTTP es inyectable para poder testear la logica sin tocar la API real.
import axios from "axios";

const API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

// Nombres de las propiedades en Notion. Si alguien las renombra en la base,
// alcanza con cambiarlas aca (o via variables de entorno).
export const PROPS = {
  desc: process.env.NOTION_PROP_DESC || "Descripción",
  tipo: process.env.NOTION_PROP_TIPO || "Tipo",
  monto: process.env.NOTION_PROP_MONTO || "Monto USD",
  fecha: process.env.NOTION_PROP_FECHA || "Fecha",
  categoria: process.env.NOTION_PROP_CATEGORIA || "Categoría",
  cuenta: process.env.NOTION_PROP_CUENTA || "Cuenta",
  recurrente: process.env.NOTION_PROP_RECURRENTE || "Recurrente",
  idLocal: process.env.NOTION_PROP_ID || "ID local",
  origen: process.env.NOTION_PROP_ORIGEN || "Origen",
};

const LIMITE_MOVIMIENTOS = 1000; // freno de mano para no inundar Notion por accidente

/* ------------------------------------------------------------------ */
/* Cliente                                                             */
/* ------------------------------------------------------------------ */

export function crearCliente({ token = process.env.NOTION_TOKEN, request } = {}) {
  const pedir =
    request ||
    (async (method, url, data) => {
      const res = await axios({
        method,
        url: API + url,
        data,
        timeout: 20000,
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
      });
      return res.data;
    });

  return {
    /** Trae todas las paginas vivas de la base (pagina de a 100). */
    async listar(dbId) {
      const filas = [];
      let cursor;
      do {
        const body = { page_size: 100, sorts: [{ property: PROPS.fecha, direction: "descending" }] };
        if (cursor) body.start_cursor = cursor;
        const data = await pedir("post", `/databases/${dbId}/query`, body);
        for (const page of data.results || []) {
          if (page.archived || page.in_trash) continue;
          filas.push({ pageId: page.id, lastEdited: page.last_edited_time, tx: deNotion(page) });
        }
        cursor = data.has_more ? data.next_cursor : null;
      } while (cursor);
      return filas;
    },

    async crear(dbId, tx) {
      return pedir("post", "/pages", { parent: { database_id: dbId }, properties: aNotion(tx) });
    },

    async actualizar(pageId, tx) {
      return pedir("patch", `/pages/${pageId}`, { properties: aNotion(tx) });
    },

    async archivar(pageId) {
      return pedir("patch", `/pages/${pageId}`, { archived: true });
    },

    /** Datos de la base: sirve para verificar el token y mostrar el nombre. */
    async base(dbId) {
      const db = await pedir("get", `/databases/${dbId}`);
      return {
        id: db.id,
        titulo: (db.title || []).map((t) => t.plain_text).join("") || "Movimientos",
        url: db.url,
        propiedades: Object.keys(db.properties || {}),
      };
    },

    /** Crea la base con el esquema que espera el dashboard (uso opcional). */
    async crearBase(parentPageId, titulo = "Movimientos") {
      return pedir("post", "/databases", {
        parent: { type: "page_id", page_id: parentPageId },
        title: [{ type: "text", text: { content: titulo } }],
        properties: {
          [PROPS.desc]: { title: {} },
          [PROPS.tipo]: { select: { options: [{ name: "Gasto", color: "red" }, { name: "Ingreso", color: "green" }] } },
          [PROPS.monto]: { number: { format: "dollar" } },
          [PROPS.fecha]: { date: {} },
          [PROPS.categoria]: { select: {} },
          [PROPS.cuenta]: { select: {} },
          [PROPS.recurrente]: { checkbox: {} },
          [PROPS.idLocal]: { rich_text: {} },
          [PROPS.origen]: { select: { options: [{ name: "Dashboard", color: "blue" }, { name: "Notion", color: "gray" }] } },
        },
      });
    },
  };
}

/* ------------------------------------------------------------------ */
/* Mapeo movimiento <-> pagina de Notion                               */
/* ------------------------------------------------------------------ */

const texto = (prop) => (prop?.rich_text || prop?.title || []).map((t) => t.plain_text).join("").trim();

/** Pagina de Notion -> movimiento del dashboard. */
export function deNotion(page) {
  const p = page.properties || {};
  const tipoRaw = (p[PROPS.tipo]?.select?.name || "").toLowerCase();
  const idLocal = texto(p[PROPS.idLocal]);
  return {
    id: idLocal || `ntn-${String(page.id).replace(/-/g, "").slice(0, 12)}`,
    notionId: page.id,
    type: tipoRaw.startsWith("ing") ? "income" : "expense",
    amount: Math.abs(Number(p[PROPS.monto]?.number) || 0),
    date: (p[PROPS.fecha]?.date?.start || page.created_time || "").slice(0, 10),
    desc: texto(p[PROPS.desc]) || "Sin descripción",
    cat: p[PROPS.categoria]?.select?.name || "Otros",
    account: p[PROPS.cuenta]?.select?.name || "",
    recurrent: !!p[PROPS.recurrente]?.checkbox,
    updatedAt: page.last_edited_time,
  };
}

/** Movimiento del dashboard -> propiedades de Notion. */
export function aNotion(tx) {
  const props = {
    [PROPS.desc]: { title: [{ type: "text", text: { content: String(tx.desc || "Sin descripción").slice(0, 200) } }] },
    [PROPS.tipo]: { select: { name: tx.type === "income" ? "Ingreso" : "Gasto" } },
    [PROPS.monto]: { number: Math.abs(Number(tx.amount) || 0) },
    [PROPS.fecha]: { date: { start: String(tx.date || "").slice(0, 10) } },
    [PROPS.categoria]: { select: { name: String(tx.cat || "Otros").slice(0, 100) } },
    [PROPS.recurrente]: { checkbox: !!tx.recurrent },
    [PROPS.idLocal]: { rich_text: [{ type: "text", text: { content: String(tx.id || "") } }] },
    [PROPS.origen]: { select: { name: "Dashboard" } },
  };
  // Los select vacios rompen la API: la cuenta solo se manda si tiene valor.
  if (tx.account) props[PROPS.cuenta] = { select: { name: String(tx.account).slice(0, 100) } };
  return props;
}

/** Compara los campos que viajan a Notion para no escribir de gusto. */
function iguales(a, b) {
  return (
    a.type === b.type &&
    Math.abs((Number(a.amount) || 0) - (Number(b.amount) || 0)) < 0.005 &&
    String(a.date).slice(0, 10) === String(b.date).slice(0, 10) &&
    String(a.desc || "") === String(b.desc || "") &&
    String(a.cat || "") === String(b.cat || "") &&
    String(a.account || "") === String(b.account || "") &&
    !!a.recurrent === !!b.recurrent
  );
}

/* ------------------------------------------------------------------ */
/* Sincronizacion                                                      */
/* ------------------------------------------------------------------ */

/**
 * @param {object}   opts
 * @param {object}   opts.cliente   cliente creado con crearCliente()
 * @param {string}   opts.dbId      id de la base de Notion
 * @param {Array}    opts.locales   movimientos del navegador
 * @param {Array}    opts.papelera  bajas locales pendientes [{id, notionId}]
 * @param {string}   opts.modo      "merge" | "subir" | "bajar"
 * @returns {Promise<{transactions: Array, resumen: object}>} lista final ya conciliada
 */
export async function sincronizar({ cliente, dbId, locales = [], papelera = [], modo = "merge" }) {
  if (locales.length > LIMITE_MOVIMIENTOS) {
    throw Object.assign(new Error(`Demasiados movimientos (${locales.length}). Limite: ${LIMITE_MOVIMIENTOS}.`), { status: 400 });
  }

  const remotas = await cliente.listar(dbId);
  const resumen = { creados: 0, actualizados: 0, archivados: 0, bajados: 0, borradosLocal: 0, sinCambios: 0 };

  // "bajar": Notion manda, no se escribe nada alla.
  if (modo === "bajar") {
    resumen.bajados = remotas.length;
    return { transactions: remotas.map((r) => r.tx), resumen };
  }

  const porId = new Map();
  remotas.forEach((r) => {
    // Si dos paginas comparten ID local (copiar/pegar en Notion), gana la mas nueva.
    const previa = porId.get(r.tx.id);
    if (!previa || Date.parse(r.lastEdited) > Date.parse(previa.lastEdited)) porId.set(r.tx.id, r);
  });

  const enPapelera = new Set();
  papelera.forEach((p) => { if (p?.id) enPapelera.add(p.id); });

  const finales = [];

  for (const loc of locales) {
    if (enPapelera.has(loc.id)) continue;
    const rem = porId.get(loc.id);

    if (!rem) {
      // Ya habia viajado a Notion y alla no esta: lo archivaron desde Notion.
      if (loc.notionId && modo === "merge") { resumen.borradosLocal++; continue; }
      const page = await cliente.crear(dbId, loc);
      resumen.creados++;
      finales.push({ ...loc, notionId: page.id, updatedAt: page.last_edited_time || new Date().toISOString() });
      continue;
    }

    porId.delete(loc.id);
    const localMs = Date.parse(loc.updatedAt || 0) || 0;
    const remotoMs = Date.parse(rem.lastEdited) || 0;
    const localGana = modo === "subir" || localMs > remotoMs + 1000;

    if (localGana && !iguales(loc, rem.tx)) {
      const page = await cliente.actualizar(rem.pageId, loc);
      resumen.actualizados++;
      finales.push({ ...loc, notionId: rem.pageId, updatedAt: page?.last_edited_time || new Date().toISOString() });
    } else if (!iguales(loc, rem.tx)) {
      // Gana Notion: el movimiento local se reemplaza por la version remota.
      resumen.bajados++;
      finales.push({ ...rem.tx, id: loc.id });
    } else {
      resumen.sinCambios++;
      finales.push({ ...loc, notionId: rem.pageId, updatedAt: rem.lastEdited });
    }
  }

  // Lo que quedo sin pareja solo existe en Notion.
  for (const rem of porId.values()) {
    const borradoLocal = enPapelera.has(rem.tx.id) || papelera.some((p) => p?.notionId === rem.pageId);
    if (borradoLocal || modo === "subir") {
      await cliente.archivar(rem.pageId);
      resumen.archivados++;
      continue;
    }
    resumen.bajados++;
    finales.push(rem.tx);
  }

  finales.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { transactions: finales, resumen };
}
