// Toda la info de la barberia vive ACA: datos de contacto, servicios, barberos y horarios.
// Editar este archivo no requiere tocar nada mas del codigo (solo reiniciar el servidor).

export const NEGOCIO = {
  nombre: "Barbería Lux",
  zona: "Merlo Centro, Buenos Aires",
  // Calle y altura reales. Mientras este vacio, el link de "Como llegar" busca
  // "Barbería Lux Merlo Centro" en Google Maps.
  direccion: "",
  // WhatsApp de la barberia en formato internacional, sin + ni espacios (ej 5491123456789).
  // Si queda vacio no se muestran los botones de WhatsApp en la pagina.
  whatsapp: "",
  instagram: "", // usuario sin la @
  zonaHoraria: "America/Argentina/Buenos_Aires",
  // Codigo de area que se asume cuando un cliente deja su celular sin el (Merlo usa 11 para celulares).
  codigoArea: "11",
};

export const REGLAS = {
  intervaloMinutos: 30, // cada cuanto puede arrancar un turno (10:00, 10:30, 11:00...)
  diasHaciaAdelante: 21, // hasta cuantos dias para adelante se puede reservar
  anticipacionMinutos: 30, // no se ofrecen turnos que arranquen dentro de menos de esto
  cancelacionMinutos: 120, // el cliente puede cancelar desde la web hasta X minutos antes
  maxTurnosPorTelefono: 2, // turnos futuros activos por persona (evita que alguien bloquee la agenda)
};

// Horario de atencion. "dias": 0=domingo, 1=lunes, ... 6=sabado.
// Para cortar al mediodia, poner dos bloques (ej 10:00-13:00 y 14:00-20:00).
export const HORARIO = [
  { dias: [1, 2, 3, 4, 5, 6], desde: "10:00", hasta: "20:00" }, // lunes a sabado
];

// Feriados, vacaciones o dias puntuales sin atencion (AAAA-MM-DD).
export const DIAS_CERRADOS = ["2026-12-25", "2027-01-01"];

// "duracion" en minutos. "precio" en pesos: si queda en null no se muestra en la pagina.
export const SERVICIOS = [
  {
    id: "corte",
    titulo: "Corte",
    descripcion: "Máquina y tijera, terminación con navaja.",
    duracion: 30,
    precio: null,
  },
  {
    id: "corte-barba",
    titulo: "Corte + barba",
    descripcion: "Corte completo y perfilado de barba con toalla caliente.",
    duracion: 60,
    precio: null,
  },
  {
    id: "barba",
    titulo: "Barba",
    descripcion: "Perfilado, rebaje y navaja.",
    duracion: 30,
    precio: null,
  },
  {
    id: "corte-nino",
    titulo: "Corte niño",
    descripcion: "Hasta 12 años.",
    duracion: 30,
    precio: null,
  },
  {
    id: "color",
    titulo: "Color / platinado",
    descripcion: "Decoloración, platinado o reflejos.",
    duracion: 120,
    precio: null,
  },
];

// Cada barbero puede tener (opcional):
//  - "servicios": lista de ids de arriba, si no hace todos.
//  - "horario": mismo formato que HORARIO, si no trabaja en el horario general.
export const BARBEROS = [
  { id: "barbero-1", nombre: "Barbero 1" },
  { id: "barbero-2", nombre: "Barbero 2" },
  // Ejemplo de alguien que trabaja solo a la tarde y no hace color:
  // { id: "barbero-3", nombre: "Barbero 3", servicios: ["corte", "barba", "corte-barba", "corte-nino"],
  //   horario: [{ dias: [2, 3, 4, 5, 6], desde: "15:00", hasta: "20:00" }] },
];
