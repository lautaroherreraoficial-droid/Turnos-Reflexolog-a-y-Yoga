// Toda la info del negocio vive ACA. Editar este archivo no requiere tocar nada mas del codigo.

export const NEGOCIO = {
  nombre: "Reflexologia y Yoga con [Nombre de tu mama]",
  duracionTurnoMinutos: 60, // cuanto dura cada sesion, ajustalo si varia por servicio
};

// Cada servicio: id interno, texto que ve el cliente, y en que lugares se ofrece.
export const SERVICIOS = [
  { id: "masaje", titulo: "Masajes" },
  { id: "reflexologia", titulo: "Reflexologia" },
  { id: "yoga", titulo: "Yoga" },
];

// Cada lugar: id interno, nombre/direccion, y horario de atencion.
// "dias": 0=domingo, 1=lunes, ... 6=sabado
// "servicios": que servicios de la lista de arriba se dan en ese lugar
export const LUGARES = [
  {
    id: "lugar_a",
    nombre: "Consultorio Centro",
    direccion: "Direccion 1, Ciudad",
    servicios: ["masaje", "reflexologia"],
    horario: [
      { dias: [1, 3], desde: "09:00", hasta: "13:00" }, // lunes y miercoles
    ],
  },
  {
    id: "lugar_b",
    nombre: "Estudio Yoga Norte",
    direccion: "Direccion 2, Ciudad",
    servicios: ["yoga"],
    horario: [
      { dias: [2, 4], desde: "18:00", hasta: "21:00" }, // martes y jueves
    ],
  },
  // Agregar mas lugares copiando el bloque de arriba.
];

export const FORMAS_DE_PAGO = ["Efectivo", "Transferencia"];
