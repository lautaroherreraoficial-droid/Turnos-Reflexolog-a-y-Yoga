// Turnero de la barberia: pagina para clientes, panel privado y la API de los dos.
// Todo cuelga de un Router con rutas relativas, asi se puede servir en la raiz de un dominio
// propio (barberia/server/index.js) o montado en otra app bajo un prefijo.
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { crearAuthBasica } from "../../src/adminAuth.js";
import { crearStore } from "./store.js";
import {
  ErrorTurno,
  ahoraLocal,
  configPendiente,
  configPublica,
  disponibilidad,
  esFechaValida,
  nuevoTurno,
  validarCambioEstado,
  validarCancelacion,
  vistaPanel,
  vistaPublica,
} from "./agenda.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const carpetaWeb = path.join(__dirname, "..", "web");
const carpetaAdmin = path.join(__dirname, "..", "admin");

// Las escrituras van de a una: asi dos personas no pueden reservar el mismo horario al mismo tiempo
// (se valida contra la agenda y se guarda sin que nadie se meta en el medio).
function crearCola() {
  let ultima = Promise.resolve();
  return (tarea) => {
    const resultado = ultima.then(tarea, tarea);
    ultima = resultado.catch(() => {});
    return resultado;
  };
}

// Freno simple contra abusos: cuantas reservas puede hacer una misma IP en una ventana de tiempo.
// Solo cuentan las reservas que se guardaron (equivocarse de dato no gasta intentos).
function crearLimite({ maximo, ventanaMs }) {
  const reservas = new Map();
  const recientes = (ip) => (reservas.get(ip) || []).filter((t) => Date.now() - t < ventanaMs);
  return {
    alcanzado: (ip) => recientes(ip).length >= maximo,
    anotar(ip) {
      if (reservas.size > 5000) reservas.clear();
      reservas.set(ip, [...recientes(ip), Date.now()]);
    },
  };
}

function responderError(res, err) {
  if (err instanceof ErrorTurno) return res.status(err.status).json({ error: err.message, codigo: err.codigo });
  console.error("Error en el turnero de la barberia:", err);
  return res.status(500).json({ error: "Algo falló de nuestro lado. Probá de nuevo en un momento." });
}

export function crearBarberia({ store = crearStore() } = {}) {
  const router = express.Router();
  const enCola = crearCola();
  const auth = crearAuthBasica("BARBERIA_ADMIN_USER", "BARBERIA_ADMIN_PASSWORD", "Barberia Lux");
  const limiteReservas = crearLimite({ maximo: 6, ventanaMs: 60 * 60 * 1000 });

  console.log(`Barberia: turnos guardados en ${store.tipo === "sheets" ? "Google Sheets" : "archivo local"}.`);

  router.use(express.json({ limit: "20kb" }));

  // Panel privado: va antes que la pagina publica para que nada de /admin se sirva sin contrasena.
  router.use("/admin", auth, express.static(carpetaAdmin));
  router.use("/api/admin", auth);
  router.use(express.static(carpetaWeb));

  // --- API publica ---

  router.get("/api/config", (_req, res) => {
    res.json(configPublica());
  });

  router.get("/api/disponibilidad", async (req, res) => {
    try {
      const turnos = await store.listar();
      res.json({
        dias: disponibilidad({ servicioId: req.query.servicio, barberoId: req.query.barbero, turnos }),
      });
    } catch (err) {
      responderError(res, err);
    }
  });

  router.post("/api/turnos", async (req, res) => {
    if (limiteReservas.alcanzado(req.ip)) {
      return res.status(429).json({ error: "Demasiadas reservas seguidas desde esta conexión. Probá más tarde." });
    }
    try {
      const turno = await enCola(async () => {
        const turnos = await store.listar({ fresco: true });
        const nuevo = nuevoTurno(req.body || {}, { turnos, origen: "web" });
        await store.agregar(nuevo);
        return nuevo;
      });
      limiteReservas.anotar(req.ip);
      res.status(201).json(vistaPublica(turno));
    } catch (err) {
      responderError(res, err);
    }
  });

  // El cliente consulta su turno con el token que recibio al reservar (queda guardado en su celular).
  router.get("/api/turnos/:token", async (req, res) => {
    try {
      const turno = (await store.listar()).find((t) => t.token === req.params.token);
      if (!turno) return res.status(404).json({ error: "No encontramos ese turno." });
      res.json(vistaPublica(turno));
    } catch (err) {
      responderError(res, err);
    }
  });

  router.post("/api/turnos/:token/cancelar", async (req, res) => {
    try {
      const turno = await enCola(async () => {
        const actual = (await store.listar({ fresco: true })).find((t) => t.token === req.params.token);
        if (!actual) throw new ErrorTurno("No encontramos ese turno.", 404);
        validarCancelacion(actual);
        return store.actualizar(actual.id, { estado: "cancelado", actualizado: new Date().toISOString() });
      });
      res.json(vistaPublica(turno));
    } catch (err) {
      responderError(res, err);
    }
  });

  // --- API del panel (protegida con BARBERIA_ADMIN_USER / BARBERIA_ADMIN_PASSWORD) ---

  router.get("/api/admin/estado", (_req, res) => {
    res.json({
      almacenamiento: store.tipo,
      // En Render gratis el disco se borra al reiniciar: si se guarda en archivo, avisamos.
      archivoEfimero: store.tipo === "archivo" && Boolean(process.env.RENDER),
      configPendiente: configPendiente(),
      hoy: ahoraLocal(),
    });
  });

  router.get("/api/admin/turnos", async (req, res) => {
    const hoy = ahoraLocal().fecha;
    const desde = esFechaValida(req.query.desde) ? req.query.desde : hoy;
    const hasta = esFechaValida(req.query.hasta) ? req.query.hasta : desde;
    try {
      const turnos = (await store.listar())
        .filter((t) => t.fecha >= desde && t.fecha <= hasta)
        .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
        .map(vistaPanel);
      res.json({ desde, hasta, turnos });
    } catch (err) {
      responderError(res, err);
    }
  });

  // Turno cargado por la barberia (alguien que llamo o paso por el local).
  router.post("/api/admin/turnos", async (req, res) => {
    const { forzar, ...datos } = req.body || {};
    try {
      const turno = await enCola(async () => {
        const turnos = await store.listar({ fresco: true });
        const nuevo = nuevoTurno(datos, { turnos, origen: "panel", forzar: forzar === true });
        await store.agregar(nuevo);
        return nuevo;
      });
      res.status(201).json(vistaPanel(turno));
    } catch (err) {
      responderError(res, err);
    }
  });

  router.post("/api/admin/turnos/:id/estado", async (req, res) => {
    const { estado, forzar } = req.body || {};
    try {
      const turno = await enCola(async () => {
        const turnos = await store.listar({ fresco: true });
        const actual = turnos.find((t) => t.id === req.params.id);
        if (!actual) throw new ErrorTurno("No encontramos ese turno.", 404);
        validarCambioEstado(actual, estado, { turnos, forzar: forzar === true });
        return store.actualizar(actual.id, { estado, actualizado: new Date().toISOString() });
      });
      res.json(vistaPanel(turno));
    } catch (err) {
      responderError(res, err);
    }
  });

  return router;
}
