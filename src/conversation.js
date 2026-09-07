import { SERVICIOS, LUGARES, FORMAS_DE_PAGO, NEGOCIO } from "./config.js";
import { sendText, sendButtons, sendList } from "./whatsapp.js";
import { appendRow } from "./google.js";
import { confirmarTurno } from "./turnos.js";
import { getSlotsDisponibles, formatearSlot } from "./availability.js";

// Sesiones en memoria: numero de telefono -> estado de la conversacion.
// Si el proceso se reinicia se pierden las conversaciones a medio hacer (no los turnos ya confirmados,
// esos ya quedaron en Calendar/Sheets). Para mas volumen, esto se puede pasar a una base real.
const sesiones = new Map();

function nuevaSesion() {
  return { paso: "inicio", datos: {} };
}

export async function manejarMensaje({ from, text, selectedId }) {
  const sesion = sesiones.get(from) || nuevaSesion();

  // "menu" o "hola" en cualquier momento reinicia la conversacion
  if (/^(hola|menu|inicio)$/i.test((text || "").trim())) {
    sesiones.set(from, nuevaSesion());
    return enviarMenuPrincipal(from);
  }

  switch (sesion.paso) {
    case "inicio":
      return enviarMenuPrincipal(from);

    case "menu_principal":
      return manejarMenuPrincipal(from, sesion, selectedId);

    case "eligiendo_servicio":
      return manejarEligiendoServicio(from, sesion, selectedId);

    case "eligiendo_lugar":
      return manejarEligiendoLugar(from, sesion, selectedId);

    case "eligiendo_horario":
      return manejarEligiendoHorario(from, sesion, selectedId);

    case "eligiendo_pago":
      return manejarEligiendoPago(from, sesion, selectedId);

    case "esperando_comentario":
      return manejarComentario(from, sesion, text);

    default:
      sesiones.set(from, nuevaSesion());
      return enviarMenuPrincipal(from);
  }
}

async function enviarMenuPrincipal(from) {
  sesiones.set(from, { paso: "menu_principal", datos: {} });
  await sendList(from, `Hola! Bienvenido/a a ${NEGOCIO.nombre}. ¿Qué querés hacer?`, "Ver opciones", [
    { id: "reservar", title: "Reservar un turno" },
    { id: "info", title: "Ver lugares y servicios" },
    { id: "comentario", title: "Dejar un comentario" },
    { id: "humano", title: "Hablar con una persona" },
  ]);
}

async function manejarMenuPrincipal(from, sesion, selectedId) {
  if (selectedId === "reservar") {
    sesion.paso = "eligiendo_servicio";
    sesiones.set(from, sesion);
    return sendList(
      from,
      "¿Qué servicio querés reservar?",
      "Elegir",
      SERVICIOS.map((s) => ({ id: s.id, title: s.titulo }))
    );
  }
  if (selectedId === "info") {
    const texto = LUGARES.map((l) => {
      const servicios = l.servicios
        .map((sid) => SERVICIOS.find((s) => s.id === sid)?.titulo)
        .join(", ");
      return `📍 *${l.nombre}*\n${l.direccion}\nServicios: ${servicios}`;
    }).join("\n\n");
    await sendText(from, texto);
    return enviarMenuPrincipal(from);
  }
  if (selectedId === "comentario") {
    sesion.paso = "esperando_comentario";
    sesiones.set(from, sesion);
    return sendText(from, "Contanos tu comentario o experiencia, lo leemos con mucho cariño 💛");
  }
  if (selectedId === "humano") {
    await sendText(from, "Listo, en breve te responde una persona por este mismo chat.");
    sesiones.delete(from);
    return;
  }
  return enviarMenuPrincipal(from);
}

async function manejarEligiendoServicio(from, sesion, selectedId) {
  const servicio = SERVICIOS.find((s) => s.id === selectedId);
  if (!servicio) return sendText(from, "Elegí una opción de la lista, por favor 🙏");

  sesion.datos.servicio = servicio;
  const lugares = LUGARES.filter((l) => l.servicios.includes(servicio.id));
  if (lugares.length === 0) {
    await sendText(from, "Por ahora no tenemos ese servicio disponible en ningún lugar.");
    return enviarMenuPrincipal(from);
  }

  sesion.paso = "eligiendo_lugar";
  sesiones.set(from, sesion);
  return sendList(
    from,
    `Perfecto, ${servicio.titulo}. ¿En qué lugar preferís?`,
    "Elegir lugar",
    lugares.map((l) => ({ id: l.id, title: l.nombre, description: l.direccion }))
  );
}

async function manejarEligiendoLugar(from, sesion, selectedId) {
  const lugar = LUGARES.find((l) => l.id === selectedId);
  if (!lugar) return sendText(from, "Elegí un lugar de la lista, por favor 🙏");

  sesion.datos.lugar = lugar;
  const slots = await getSlotsDisponibles(lugar.id);
  if (slots.length === 0) {
    await sendText(from, "No encontramos horarios libres en los próximos días para ese lugar. Probá con otro servicio/lugar o escribí 'humano' para que te ayude una persona.");
    return enviarMenuPrincipal(from);
  }

  sesion.datos.slots = slots;
  sesion.paso = "eligiendo_horario";
  sesiones.set(from, sesion);
  return sendList(
    from,
    `Estos son los próximos horarios libres en ${lugar.nombre}:`,
    "Elegir horario",
    slots.map((slot, i) => ({ id: `slot_${i}`, title: formatearSlot(slot) }))
  );
}

async function manejarEligiendoHorario(from, sesion, selectedId) {
  const match = /^slot_(\d+)$/.exec(selectedId || "");
  const slot = match ? sesion.datos.slots?.[Number(match[1])] : null;
  if (!slot) return sendText(from, "Elegí un horario de la lista, por favor 🙏");

  sesion.datos.slot = slot;
  sesion.paso = "eligiendo_pago";
  sesiones.set(from, sesion);
  return sendButtons(
    from,
    "¿Cómo preferís pagar? (se paga en el lugar, esto es solo para que quede anotado)",
    FORMAS_DE_PAGO.map((f) => ({ id: `pago_${f}`, title: f }))
  );
}

async function manejarEligiendoPago(from, sesion, selectedId) {
  const forma = FORMAS_DE_PAGO.find((f) => selectedId === `pago_${f}`);
  if (!forma) return sendText(from, "Elegí una forma de pago de las opciones, por favor 🙏");

  const { servicio, lugar, slot } = sesion.datos;

  try {
    await confirmarTurno({
      servicioId: servicio.id,
      lugarId: lugar.id,
      inicio: slot.inicio,
      cliente: from,
      pago: forma,
      origen: "whatsapp",
    });
  } catch (err) {
    console.error("Error confirmando turno:", err.message);
    await sendText(from, "Tuvimos un problema anotando el turno. Escribí 'humano' para que te ayudemos a mano.");
    return;
  }

  await sendText(
    from,
    `¡Turno confirmado! ✅\n\n${servicio.titulo}\n📍 ${lugar.nombre} (${lugar.direccion})\n🗓️ ${formatearSlot(slot)}\n💳 Pago: ${forma}\n\n¡Te esperamos!`
  );
  sesiones.delete(from);
}

async function manejarComentario(from, sesion, text) {
  if (!text || !text.trim()) return sendText(from, "Escribí el comentario en un mensaje de texto, por favor 🙏");

  try {
    await appendRow("Comentarios", [new Date().toISOString(), from, text.trim()]);
  } catch (err) {
    console.error("Error guardando comentario:", err.message);
  }
  await sendText(from, "¡Muchas gracias por tu comentario! 💛");
  sesiones.delete(from);
}
