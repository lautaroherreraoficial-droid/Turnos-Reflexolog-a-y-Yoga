// Donde se guardan los turnos. Dos opciones, con la misma interfaz (listar / agregar / actualizar):
//
//  - Google Sheets (si esta BARBERIA_SHEET_ID): la planilla vive en el Drive de la barberia, se puede
//    mirar desde el celular y no se pierde nunca. Es la opcion para produccion en Render gratis.
//  - Archivo JSON local (si no): sirve para probar en la compu o en un servidor con disco propio.
//    OJO: en el plan gratis de Render el disco se borra en cada reinicio.
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Orden de las columnas en la planilla (la fila 1 son estos encabezados, se escriben solos).
export const COLUMNAS = [
  "id",
  "fecha",
  "hora",
  "duracion",
  "cliente",
  "telefono",
  "servicio",
  "barbero",
  "estado",
  "nota",
  "precio",
  "origen",
  "creado",
  "actualizado",
  "servicioId",
  "barberoId",
  "token",
];
const ULTIMA_COLUMNA = String.fromCharCode(64 + COLUMNAS.length);

export function crearStore() {
  if (process.env.BARBERIA_SHEET_ID) {
    return crearStoreSheets({
      obtenerSheets: clienteSheets,
      spreadsheetId: process.env.BARBERIA_SHEET_ID,
    });
  }
  return crearStoreArchivo(process.env.BARBERIA_DATA_FILE || path.join(__dirname, "..", "data", "turnos.json"));
}

// --- Archivo JSON ---

export function crearStoreArchivo(archivo) {
  let turnos = null;

  async function cargar() {
    if (turnos) return turnos;
    try {
      turnos = JSON.parse(await fs.readFile(archivo, "utf8"));
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      turnos = [];
    }
    return turnos;
  }

  // Se escribe a un temporal y se renombra, asi un corte a mitad de camino no deja el archivo roto.
  async function guardar() {
    await fs.mkdir(path.dirname(archivo), { recursive: true });
    const temporal = `${archivo}.tmp`;
    await fs.writeFile(temporal, JSON.stringify(turnos, null, 2));
    await fs.rename(temporal, archivo);
  }

  return {
    tipo: "archivo",
    async listar() {
      return (await cargar()).map((t) => ({ ...t }));
    },
    async agregar(turno) {
      (await cargar()).push({ ...turno });
      await guardar();
    },
    async actualizar(id, cambios) {
      const turno = (await cargar()).find((t) => t.id === id);
      if (!turno) return null;
      Object.assign(turno, cambios);
      await guardar();
      return { ...turno };
    },
  };
}

// --- Google Sheets ---

async function clienteSheets() {
  const { google } = await import("googleapis");
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

// Si alguien edita la planilla a mano, Sheets puede convertir "2026-10-03" en fecha y "10:30" en
// hora (numeros de serie). Los volvemos a pasar a texto.
function fechaDeCelda(valor) {
  if (typeof valor !== "number") return String(valor ?? "");
  return new Date(Date.UTC(1899, 11, 30) + Math.round(valor) * 86400000).toISOString().slice(0, 10);
}

function horaDeCelda(valor) {
  if (typeof valor !== "number") return String(valor ?? "");
  const minutos = Math.round((valor % 1) * 1440);
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

function filaATurno(fila) {
  const t = Object.fromEntries(COLUMNAS.map((col, i) => [col, fila[i] ?? ""]));
  t.id = String(t.id);
  t.fecha = fechaDeCelda(t.fecha);
  t.hora = horaDeCelda(t.hora);
  t.duracion = Number(t.duracion) || 0;
  t.precio = t.precio === "" ? null : Number(t.precio);
  t.telefono = String(t.telefono);
  t.token = String(t.token);
  return t;
}

function turnoAFila(turno) {
  return COLUMNAS.map((col) => turno[col] ?? "");
}

export function crearStoreSheets({ obtenerSheets, spreadsheetId, pestana = "Turnos", cacheMs = 10_000 }) {
  let sheetsPromesa = null;
  let cache = null;
  let cacheHasta = 0;
  let encabezadoListo = false;

  const sheets = () => (sheetsPromesa ??= obtenerSheets());

  async function leerFilas() {
    const res = await (await sheets()).spreadsheets.values.get({
      spreadsheetId,
      range: `${pestana}!A2:${ULTIMA_COLUMNA}`,
      valueRenderOption: "UNFORMATTED_VALUE",
    });
    return res.data.values || [];
  }

  async function asegurarEncabezado() {
    if (encabezadoListo) return;
    const res = await (await sheets()).spreadsheets.values.get({ spreadsheetId, range: `${pestana}!A1:${ULTIMA_COLUMNA}1` });
    if (!res.data.values?.length) {
      await (await sheets()).spreadsheets.values.update({
        spreadsheetId,
        range: `${pestana}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [COLUMNAS] },
      });
    }
    encabezadoListo = true;
  }

  return {
    tipo: "sheets",
    // `fresco` saltea el cache: se usa antes de escribir, para validar contra lo ultimo.
    async listar({ fresco = false } = {}) {
      if (fresco || !cache || Date.now() > cacheHasta) {
        cache = (await leerFilas()).map(filaATurno).filter((t) => t.id);
        cacheHasta = Date.now() + cacheMs;
      }
      return cache.map((t) => ({ ...t }));
    },
    async agregar(turno) {
      await asegurarEncabezado();
      // RAW: que Sheets no convierta fechas, horas ni telefonos a su manera.
      await (await sheets()).spreadsheets.values.append({
        spreadsheetId,
        range: `${pestana}!A1`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [turnoAFila(turno)] },
      });
      cache = null;
    },
    async actualizar(id, cambios) {
      const filas = await leerFilas();
      const indice = filas.findIndex((f) => String(f[0]) === id);
      if (indice === -1) return null;
      const turno = { ...filaATurno(filas[indice]), ...cambios };
      const fila = indice + 2; // +1 por el encabezado, +1 porque las filas arrancan en 1
      await (await sheets()).spreadsheets.values.update({
        spreadsheetId,
        range: `${pestana}!A${fila}:${ULTIMA_COLUMNA}${fila}`,
        valueInputOption: "RAW",
        requestBody: { values: [turnoAFila(turno)] },
      });
      cache = null;
      return turno;
    },
  };
}
