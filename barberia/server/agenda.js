// Logica de la agenda: que horarios estan libres, validar reservas, cancelaciones y cambios de estado.
// No toca el disco ni Google: recibe la lista de turnos y devuelve resultados, asi se puede probar sola.
import crypto from "crypto";
import { NEGOCIO, REGLAS, HORARIO, DIAS_CERRADOS, SERVICIOS, BARBEROS } from "./config.js";

export const ESTADOS = ["confirmado", "completado", "ausente", "cancelado"];

export class ErrorTurno extends Error {
  constructor(mensaje, status = 400, codigo = "invalido") {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

// --- Fechas y horas: siempre en hora de Buenos Aires, aunque el servidor corra en UTC ---
// Las fechas viajan como "AAAA-MM-DD" y las horas como "HH:MM", sin objetos Date de por medio.

const formatoAhora = new Intl.DateTimeFormat("en-CA", {
  timeZone: NEGOCIO.zonaHoraria,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function ahoraLocal(momento = new Date()) {
  const p = Object.fromEntries(formatoAhora.formatToParts(momento).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, minutos: Number(p.hour) * 60 + Number(p.minute) };
}

export function aMinutos(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
}

export function aHora(minutos) {
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

function aUTC(fecha) {
  const [a, m, d] = String(fecha).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

export function sumarDias(fecha, n) {
  const f = aUTC(fecha);
  f.setUTCDate(f.getUTCDate() + n);
  return f.toISOString().slice(0, 10);
}

export function diaDeSemana(fecha) {
  return aUTC(fecha).getUTCDay();
}

export function esFechaValida(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const f = aUTC(fecha);
  return !Number.isNaN(f.getTime()) && f.toISOString().slice(0, 10) === fecha; // descarta 2026-02-31
}

function esHoraValida(hora) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hora);
}

// Minutos que faltan para que empiece el turno (negativo si ya empezo).
function minutosHasta(turno, ahora) {
  const dias = (aUTC(turno.fecha) - aUTC(ahora.fecha)) / 86400000;
  return dias * 1440 + aMinutos(turno.hora) - ahora.minutos;
}

// --- Telefonos ---

export function soloDigitos(tel) {
  return String(tel ?? "").replace(/\D/g, "");
}

// Pasa lo que escribe la gente ("11 15 2345-6789", "011 2345 6789", "+54 9 11...") al formato
// que usa wa.me (5491123456789). Devuelve "" si no se puede interpretar.
export function telefonoWhatsapp(tel, codigoArea = NEGOCIO.codigoArea) {
  const original = soloDigitos(tel);
  let d = original;
  if (!d) return "";
  if (d.startsWith("549") && d.length === 13) return d;
  if (d.startsWith("54")) d = d.slice(2);
  if (d.startsWith("9") && d.length === 11) d = d.slice(1);
  if (d.startsWith("0")) d = d.slice(1);
  // El "15" de los celulares va despues del codigo de area (que tiene 2, 3 o 4 digitos).
  if (d.length === 12) {
    for (const largo of [2, 3, 4]) {
      if (d.slice(largo, largo + 2) === "15") {
        d = d.slice(0, largo) + d.slice(largo + 2);
        break;
      }
    }
  }
  const largoLocal = 10 - codigoArea.length; // sin codigo de area
  if (d.startsWith("15") && d.length === largoLocal + 2) d = codigoArea + d.slice(2);
  else if (d.length === largoLocal) d = codigoArea + d;
  if (d.length === 10) return "549" + d;
  // Numero de otro pais escrito con su codigo: lo dejamos como vino.
  return original.length >= 11 && original.length <= 15 ? original : "";
}

function mismoTelefono(a, b) {
  const clave = (t) => telefonoWhatsapp(t) || soloDigitos(t);
  return Boolean(clave(a)) && clave(a) === clave(b);
}

// --- Horarios ---

function bloquesDe(horario, dia) {
  return horario
    .filter((b) => b.dias.includes(dia))
    .map((b) => ({ desde: aMinutos(b.desde), hasta: aMinutos(b.hasta) }))
    .sort((a, b) => a.desde - b.desde);
}

function bloquesDelBarbero(barbero, fecha) {
  if (DIAS_CERRADOS.includes(fecha)) return [];
  return bloquesDe(barbero.horario || HORARIO, diaDeSemana(fecha));
}

function hace(barbero, servicioId) {
  return !barbero.servicios || barbero.servicios.includes(servicioId);
}

const ocupaLugar = (t) => t.estado !== "cancelado";

function turnoQueSePisa(turnos, barberoId, fecha, inicio, fin, ignorarId) {
  return turnos.find(
    (t) =>
      ocupaLugar(t) &&
      t.id !== ignorarId &&
      t.barberoId === barberoId &&
      t.fecha === fecha &&
      inicio < aMinutos(t.hora) + Number(t.duracion) &&
      fin > aMinutos(t.hora)
  );
}

// Desde que minuto del dia se puede reservar por la web (no se ofrecen horarios pasados ni muy encima).
function primerMinutoReservable(fecha, ahora) {
  if (fecha < ahora.fecha) return Infinity;
  if (fecha === ahora.fecha) return ahora.minutos + REGLAS.anticipacionMinutos;
  return 0;
}

// Horarios de la grilla en los que `barbero` puede arrancar `servicio` el dia `fecha`.
function horariosLibresDelBarbero({ barbero, servicio, fecha, turnos, desdeMinuto }) {
  const libres = [];
  for (const bloque of bloquesDelBarbero(barbero, fecha)) {
    for (let inicio = bloque.desde; inicio + servicio.duracion <= bloque.hasta; inicio += REGLAS.intervaloMinutos) {
      if (inicio < desdeMinuto) continue;
      if (!turnoQueSePisa(turnos, barbero.id, fecha, inicio, inicio + servicio.duracion)) libres.push(inicio);
    }
  }
  return libres;
}

function buscarServicio(servicioId) {
  const servicio = SERVICIOS.find((s) => s.id === servicioId);
  if (!servicio) throw new ErrorTurno("Elegí un servicio.");
  return servicio;
}

// "cualquiera" (o vacio) = cualquier barbero que haga ese servicio.
function buscarBarberos(servicio, barberoId) {
  if (!barberoId || barberoId === "cualquiera") return BARBEROS.filter((b) => hace(b, servicio.id));
  const barbero = BARBEROS.find((b) => b.id === barberoId);
  if (!barbero) throw new ErrorTurno("Ese barbero no existe.");
  if (!hace(barbero, servicio.id)) {
    throw new ErrorTurno(`${barbero.nombre} no hace ${servicio.titulo.toLowerCase()}.`);
  }
  return [barbero];
}

// Lo que muestra la pagina: los proximos dias, cada uno con sus horarios libres y que barberos
// estan libres en cada horario.
export function disponibilidad({ servicioId, barberoId, turnos, ahora = ahoraLocal() }) {
  const servicio = buscarServicio(servicioId);
  const barberos = buscarBarberos(servicio, barberoId);

  const dias = [];
  for (let i = 0; i < REGLAS.diasHaciaAdelante; i++) {
    const fecha = sumarDias(ahora.fecha, i);
    const desdeMinuto = primerMinutoReservable(fecha, ahora);
    const porHora = new Map();
    for (const barbero of barberos) {
      for (const inicio of horariosLibresDelBarbero({ barbero, servicio, fecha, turnos, desdeMinuto })) {
        if (!porHora.has(inicio)) porHora.set(inicio, []);
        porHora.get(inicio).push(barbero.id);
      }
    }
    dias.push({
      fecha,
      abierto: barberos.some((b) => bloquesDelBarbero(b, fecha).length > 0),
      horarios: [...porHora.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([inicio, ids]) => ({ hora: aHora(inicio), barberos: ids })),
    });
  }
  return dias;
}

function limpiar(valor, max) {
  return String(valor ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// Arma un turno nuevo con lo que manda la web (origen "web") o el panel (origen "panel"), validado
// contra la agenda. Desde el panel se puede cargar sin telefono, en dias pasados y fuera de la grilla
// de horarios; y con forzar=true, pisar otro turno o salir del horario de atencion.
export function nuevoTurno(datos, { turnos, origen = "web", forzar = false, ahora = ahoraLocal() }) {
  const esWeb = origen === "web";
  const servicio = buscarServicio(datos.servicioId);
  const candidatos = buscarBarberos(servicio, datos.barberoId);
  if (!candidatos.length) throw new ErrorTurno(`Nadie hace ${servicio.titulo.toLowerCase()} por ahora.`);

  const fecha = String(datos.fecha ?? "");
  const hora = String(datos.hora ?? "");
  if (!esFechaValida(fecha) || !esHoraValida(hora)) throw new ErrorTurno("Fecha u hora inválida.");

  const cliente = limpiar(datos.cliente, 60);
  if (cliente.length < 2) throw new ErrorTurno("Dejanos tu nombre.");
  const telefono = limpiar(datos.telefono, 30);
  if (esWeb && !telefonoWhatsapp(telefono)) {
    throw new ErrorTurno("Revisá el número de WhatsApp (por ejemplo: 11 2345-6789).");
  }
  const nota = limpiar(datos.nota, 200);

  if (esWeb) {
    if (fecha > sumarDias(ahora.fecha, REGLAS.diasHaciaAdelante - 1)) {
      throw new ErrorTurno("Todavía no se pueden reservar turnos para esa fecha.");
    }
    const activos = turnos.filter(
      (t) => t.estado === "confirmado" && minutosHasta(t, ahora) > 0 && mismoTelefono(t.telefono, telefono)
    );
    if (activos.length >= REGLAS.maxTurnosPorTelefono) {
      throw new ErrorTurno(
        `Ya tenés ${activos.length} turnos reservados con ese número. Si necesitás otro, escribinos.`,
        409,
        "limite"
      );
    }
  }

  const inicio = aMinutos(hora);
  const fin = inicio + servicio.duracion;
  const desdeMinuto = esWeb ? primerMinutoReservable(fecha, ahora) : -Infinity;

  // Para cada barbero posible: si puede atender a esa hora y, si no, por que.
  const evaluados = candidatos.map((barbero) => {
    const bloques = bloquesDelBarbero(barbero, fecha);
    const enHorario = bloques.some((b) => inicio >= b.desde && fin <= b.hasta);
    const enGrilla = bloques.some((b) => (inicio - b.desde) % REGLAS.intervaloMinutos === 0);
    const pisado = turnoQueSePisa(turnos, barbero.id, fecha, inicio, fin);
    const ok = enHorario && !pisado && inicio >= desdeMinuto && (!esWeb || enGrilla);
    return { barbero, ok, enHorario, pisado };
  });

  let elegidos = evaluados.filter((e) => e.ok);
  if (!elegidos.length) {
    if (esWeb) {
      throw new ErrorTurno("Ese horario se acaba de ocupar o ya no está disponible. Elegí otro.", 409, "ocupado");
    }
    if (!forzar) {
      const conPisado = evaluados.find((e) => e.pisado);
      if (candidatos.length === 1 && conPisado) {
        throw new ErrorTurno(
          `Se pisa con el turno de ${conPisado.pisado.cliente} (${conPisado.pisado.hora}).`,
          409,
          "ocupado"
        );
      }
      if (evaluados.some((e) => !e.enHorario)) {
        throw new ErrorTurno("Está fuera del horario de atención.", 409, "fuera-de-horario");
      }
      throw new ErrorTurno("No hay ningún barbero libre a esa hora.", 409, "ocupado");
    }
    elegidos = evaluados;
  }

  // Con "cualquiera" se lo damos al que menos turnos tiene ese dia, para repartir el trabajo.
  const cargaDelDia = (barberoId) =>
    turnos.filter((t) => ocupaLugar(t) && t.fecha === fecha && t.barberoId === barberoId).length;
  const { barbero } = elegidos.reduce((mejor, e) =>
    cargaDelDia(e.barbero.id) < cargaDelDia(mejor.barbero.id) ? e : mejor
  );

  return {
    id: crypto.randomBytes(5).toString("hex"),
    token: crypto.randomBytes(16).toString("hex"), // lo usa el cliente para ver o cancelar su turno
    creado: new Date().toISOString(),
    fecha,
    hora,
    duracion: servicio.duracion,
    servicioId: servicio.id,
    servicio: servicio.titulo,
    barberoId: barbero.id,
    barbero: barbero.nombre,
    cliente,
    telefono,
    nota,
    estado: "confirmado",
    origen,
    precio: servicio.precio ?? null,
  };
}

// El cliente cancela desde la web: solo turnos confirmados y con cierta anticipacion.
export function validarCancelacion(turno, ahora = ahoraLocal()) {
  if (turno.estado === "cancelado") throw new ErrorTurno("Este turno ya estaba cancelado.", 409, "cancelado");
  if (turno.estado !== "confirmado") throw new ErrorTurno("Este turno ya no se puede cancelar.", 409);
  if (minutosHasta(turno, ahora) < REGLAS.cancelacionMinutos) {
    throw new ErrorTurno(
      "Falta muy poco para el turno y ya no se puede cancelar desde acá: avisanos por WhatsApp.",
      409,
      "tarde"
    );
  }
}

// La barberia cambia el estado desde el panel. Si "descancela" un turno, chequea que el lugar siga libre.
export function validarCambioEstado(turno, estado, { turnos, forzar = false }) {
  if (!ESTADOS.includes(estado)) throw new ErrorTurno("Estado inválido.");
  if (turno.estado === "cancelado" && estado !== "cancelado" && !forzar) {
    const inicio = aMinutos(turno.hora);
    const pisado = turnoQueSePisa(
      turnos,
      turno.barberoId,
      turno.fecha,
      inicio,
      inicio + Number(turno.duracion),
      turno.id
    );
    if (pisado) {
      throw new ErrorTurno(`Ese horario ya lo tomó ${pisado.cliente} (${pisado.hora}).`, 409, "ocupado");
    }
  }
}

// --- Como se muestra cada turno ---

function horaFin(turno) {
  return aHora(aMinutos(turno.hora) + Number(turno.duracion));
}

// Para el cliente: sin telefono ni datos internos.
export function vistaPublica(turno, ahora = ahoraLocal()) {
  return {
    token: turno.token,
    fecha: turno.fecha,
    hora: turno.hora,
    horaFin: horaFin(turno),
    servicio: turno.servicio,
    barbero: turno.barbero,
    cliente: turno.cliente,
    estado: turno.estado,
    yaPaso: minutosHasta(turno, ahora) < 0,
    cancelable: turno.estado === "confirmado" && minutosHasta(turno, ahora) >= REGLAS.cancelacionMinutos,
  };
}

// Para el panel: todo menos el token del cliente, mas el telefono listo para wa.me.
export function vistaPanel(turno) {
  const { token, ...resto } = turno;
  return { ...resto, horaFin: horaFin(turno), telefonoWa: telefonoWhatsapp(turno.telefono) };
}

export function configPublica(ahora = ahoraLocal()) {
  return {
    negocio: {
      nombre: NEGOCIO.nombre,
      zona: NEGOCIO.zona,
      direccion: NEGOCIO.direccion,
      whatsapp: NEGOCIO.whatsapp,
      instagram: NEGOCIO.instagram,
    },
    reglas: {
      diasHaciaAdelante: REGLAS.diasHaciaAdelante,
      cancelacionMinutos: REGLAS.cancelacionMinutos,
    },
    servicios: SERVICIOS.map(({ id, titulo, descripcion, duracion, precio }) => ({
      id,
      titulo,
      descripcion,
      duracion,
      precio: precio ?? null,
    })),
    barberos: BARBEROS.map((b) => ({ id: b.id, nombre: b.nombre, servicios: b.servicios || null })),
    // Indice 0 = domingo. Cada dia: lista de [desde, hasta].
    horarioSemanal: [0, 1, 2, 3, 4, 5, 6].map((dia) =>
      bloquesDe(HORARIO, dia).map((b) => [aHora(b.desde), aHora(b.hasta)])
    ),
    hoy: { ...ahora, cerrado: DIAS_CERRADOS.includes(ahora.fecha) },
  };
}

// Datos que faltan completar en config.js, para avisarle a la barberia desde el panel.
export function configPendiente() {
  const faltan = [];
  if (!NEGOCIO.direccion) faltan.push("la dirección");
  if (!NEGOCIO.whatsapp) faltan.push("el WhatsApp");
  if (BARBEROS.some((b) => /^Barbero \d+$/.test(b.nombre))) faltan.push("los nombres de los barberos");
  if (SERVICIOS.every((s) => s.precio == null)) faltan.push("los precios (opcional)");
  return faltan;
}
