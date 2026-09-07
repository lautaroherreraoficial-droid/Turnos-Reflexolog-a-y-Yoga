import { LUGARES, NEGOCIO } from "./config.js";
import { getBusyTimes } from "./google.js";

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Genera los horarios candidatos (segun el horario configurado del lugar) para los proximos `dias` dias,
// y descarta los que se pisan con algo ya agendado en Google Calendar.
export async function getSlotsDisponibles(lugarId, dias = 7, maxResultados = 8) {
  const lugar = LUGARES.find((l) => l.id === lugarId);
  if (!lugar) return [];

  const ahora = new Date();
  const limite = new Date(ahora.getTime() + dias * 24 * 60 * 60 * 1000);
  const ocupados = await getBusyTimes(ahora.toISOString(), limite.toISOString());
  const duracionMs = NEGOCIO.duracionTurnoMinutos * 60 * 1000;

  const candidatos = [];
  for (let d = 0; d < dias && candidatos.length < maxResultados * 3; d++) {
    const fecha = new Date(ahora);
    fecha.setDate(fecha.getDate() + d);
    const diaSemana = fecha.getDay();

    const bloques = lugar.horario.filter((h) => h.dias.includes(diaSemana));
    for (const bloque of bloques) {
      const desdeMin = toMinutes(bloque.desde);
      const hastaMin = toMinutes(bloque.hasta);
      for (let min = desdeMin; min + NEGOCIO.duracionTurnoMinutos <= hastaMin; min += NEGOCIO.duracionTurnoMinutos) {
        const inicio = new Date(fecha);
        inicio.setHours(0, min, 0, 0);
        if (inicio < ahora) continue; // no ofrecer horarios ya pasados
        const fin = new Date(inicio.getTime() + duracionMs);
        candidatos.push({ inicio, fin });
      }
    }
  }

  const libres = candidatos.filter(({ inicio, fin }) => {
    return !ocupados.some((b) => {
      const busyStart = new Date(b.start);
      const busyEnd = new Date(b.end);
      return inicio < busyEnd && fin > busyStart; // se superponen
    });
  });

  return libres.slice(0, maxResultados);
}

export function formatearSlot(slot) {
  const opciones = { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" };
  return slot.inicio.toLocaleString("es-AR", opciones);
}
