import { SERVICIOS, LUGARES, NEGOCIO } from "./config.js";
import { createEvent, appendRow } from "./google.js";

// Punto unico donde se confirma un turno: lo crea en Google Calendar y lo anota en la planilla.
// Lo usan tanto el bot de WhatsApp (origen "whatsapp") como el formulario del panel de mama
// (origen "manual"), asi el Drive de tu mama termina siendo la misma fuente de verdad para los dos.
export async function confirmarTurno({ servicioId, lugarId, inicio, cliente, pago, origen = "whatsapp" }) {
  const servicio = SERVICIOS.find((s) => s.id === servicioId);
  const lugar = LUGARES.find((l) => l.id === lugarId);
  if (!servicio) throw new Error("Servicio invalido");
  if (!lugar) throw new Error("Lugar invalido");

  const fin = new Date(inicio.getTime() + NEGOCIO.duracionTurnoMinutos * 60 * 1000);
  const inicioISO = inicio.toISOString();
  const finISO = fin.toISOString();
  const resumen = `${servicio.titulo} - ${lugar.nombre}`;
  const descripcion = `Cliente: ${cliente}\nServicio: ${servicio.titulo}\nPago: ${pago}\nOrigen: ${origen}`;

  await createEvent({ resumen, descripcion, inicioISO, finISO, ubicacion: lugar.direccion });
  await appendRow("Turnos", [
    new Date().toISOString(), // cuando se cargo el turno
    cliente,
    servicio.titulo,
    lugar.nombre,
    inicioISO, // cuando es el turno (se formatea recien al mostrarlo)
    pago,
    origen,
  ]);

  return { servicio, lugar, inicio, fin };
}
