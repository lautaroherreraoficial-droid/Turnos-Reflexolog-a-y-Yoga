// Panel de la barberia: agenda por dia, cambio de estado de los turnos y carga manual.
// Esta pagina vive en ".../admin/", por eso la API queda un nivel mas arriba.
const API = "../api/";
const CLAVE_FILTRO = "lux.panel.barbero";
const REFRESCO_MS = 60 * 1000;

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ESTADOS = { confirmado: "Confirmado", completado: "Atendido", ausente: "No vino", cancelado: "Cancelado" };

const estado = {
  config: null,
  hoy: null,
  fecha: null, // dia que se esta mirando
  turnos: [], // los de la semana del dia elegido y los proximos (para avisar de turnos nuevos)
  conocidos: null, // ids ya vistos, para resaltar los que entran mientras el panel esta abierto
  resaltados: new Set(),
  filtro: "todos",
};

const $ = (id) => document.getElementById(id);

// --- Utilidades ---

function el(tag, props = {}, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [clave, valor] of Object.entries(props)) {
    if (valor == null || valor === false) continue;
    if (clave === "class") nodo.className = valor;
    else if (clave.startsWith("on")) nodo.addEventListener(clave.slice(2), valor);
    else nodo.setAttribute(clave, valor === true ? "" : valor);
  }
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo != null && hijo !== false) nodo.append(hijo instanceof Node ? hijo : String(hijo));
  }
  return nodo;
}

async function pedir(ruta, opciones = {}) {
  let res;
  try {
    res = await fetch(API + ruta, { headers: { "Content-Type": "application/json" }, ...opciones });
  } catch {
    throw new Error("Sin conexión con el servidor.");
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(datos.error || `Error ${res.status}`);
    err.codigo = datos.codigo;
    err.status = res.status;
    throw err;
  }
  return datos;
}

function leerLocal(clave, porDefecto) {
  try {
    return localStorage.getItem(clave) ?? porDefecto;
  } catch {
    return porDefecto;
  }
}

function guardarLocal(clave, valor) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // sin almacenamiento: el filtro simplemente no se recuerda
  }
}

function aUTC(fecha) {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function sumarDias(fecha, n) {
  const f = aUTC(fecha);
  f.setUTCDate(f.getUTCDate() + n);
  return f.toISOString().slice(0, 10);
}

const diaDeSemana = (fecha) => aUTC(fecha).getUTCDay();
const lunesDe = (fecha) => sumarDias(fecha, -((diaDeSemana(fecha) + 6) % 7));

function fechaLarga(fecha) {
  const f = aUTC(fecha);
  return `${DIAS_LARGOS[f.getUTCDay()]} ${f.getUTCDate()} de ${MESES_LARGOS[f.getUTCMonth()]}`;
}

function cuandoRelativo(fecha) {
  const dif = (aUTC(fecha) - aUTC(estado.hoy.fecha)) / 86400000;
  return { 0: "Hoy", 1: "Mañana", [-1]: "Ayer" }[dif] || "";
}

const pesos = (n) => `$ ${Math.round(n).toLocaleString("es-AR")}`;

let temporizadorToast;
function toast(texto) {
  $("toast").textContent = texto;
  $("toast").hidden = false;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => ($("toast").hidden = true), 4500);
}

// --- Carga de datos ---

async function cargarEstado() {
  try {
    const info = await pedir("admin/estado");
    estado.hoy = info.hoy;
    const avisos = [];
    if (info.archivoEfimero) {
      avisos.push(
        el(
          "div",
          { class: "aviso aviso-error" },
          el("strong", {}, "Los turnos se pueden perder."),
          "Se están guardando en un archivo del servidor y Render lo borra cada vez que se reinicia. Conectá Google Sheets (variable ",
          el("code", {}, "BARBERIA_SHEET_ID"),
          ") para que queden guardados para siempre."
        )
      );
    }
    if (info.configPendiente.length) {
      avisos.push(
        el(
          "div",
          { class: "aviso aviso-alerta" },
          el("strong", {}, "Falta completar algunos datos de la barbería."),
          `Editá `,
          el("code", {}, "barberia/server/config.js"),
          ` y cargá ${info.configPendiente.join(", ")}.`
        )
      );
    }
    $("avisos").replaceChildren(...avisos);
  } catch (err) {
    $("avisos").replaceChildren(el("div", { class: "aviso aviso-error" }, `No se pudo conectar con el servidor: ${err.message}`));
    throw err;
  }
}

async function cargarTurnos({ silencioso = false } = {}) {
  // Pedimos la semana que se esta mirando y, ademas, los proximos 30 dias: asi nos enteramos de
  // las reservas nuevas aunque sean para otra semana.
  const lunes = lunesDe(estado.fecha);
  const desde = [lunes, estado.hoy.fecha].sort()[0];
  const hasta = [sumarDias(lunes, 6), sumarDias(estado.hoy.fecha, 30)].sort()[1];
  let turnos;
  try {
    ({ turnos } = await pedir(`admin/turnos?desde=${desde}&hasta=${hasta}`));
  } catch (err) {
    if (!silencioso) $("agenda").replaceChildren(el("p", { class: "vacio" }, `No se pudieron cargar los turnos: ${err.message}`));
    return;
  }

  if (estado.conocidos) {
    const nuevos = turnos.filter((t) => !estado.conocidos.has(t.id) && t.origen === "web");
    nuevos.forEach((t) => estado.resaltados.add(t.id));
    if (nuevos.length === 1) {
      const t = nuevos[0];
      toast(`Nuevo turno: ${t.cliente} · ${cuandoRelativo(t.fecha) || fechaLarga(t.fecha)} ${t.hora} (${t.barbero})`);
    } else if (nuevos.length > 1) {
      toast(`Entraron ${nuevos.length} turnos nuevos.`);
    }
  }
  estado.conocidos = new Set([...(estado.conocidos || []), ...turnos.map((t) => t.id)]);
  estado.turnos = turnos;
  renderizar();
}

// --- Pantalla ---

function turnosDelDia(fecha) {
  return estado.turnos.filter((t) => t.fecha === fecha);
}

function aplicarFiltro(turnos) {
  return estado.filtro === "todos" ? turnos : turnos.filter((t) => t.barberoId === estado.filtro);
}

function renderizar() {
  renderizarCabecera();
  renderizarSemana();
  renderizarFiltros();
  renderizarStats();
  renderizarAgenda();
}

function renderizarCabecera() {
  const relativo = cuandoRelativo(estado.fecha);
  const cerrado = !estado.config.horarioSemanal[diaDeSemana(estado.fecha)].length;
  $("titulo-dia").textContent = fechaLarga(estado.fecha);
  $("subtitulo-dia").textContent = [relativo, cerrado && "la barbería no abre"].filter(Boolean).join(" · ") || " ";
  $("selector-fecha").value = estado.fecha;
}

function renderizarSemana() {
  const lunes = lunesDe(estado.fecha);
  $("semana").replaceChildren(
    ...Array.from({ length: 7 }, (_, i) => {
      const fecha = sumarDias(lunes, i);
      const cantidad = turnosDelDia(fecha).filter((t) => t.estado !== "cancelado").length;
      return el(
        "button",
        {
          type: "button",
          class: `dia-semana${fecha === estado.hoy.fecha ? " hoy" : ""}`,
          "aria-current": fecha === estado.fecha ? "date" : null,
          "aria-label": `${fechaLarga(fecha)}: ${cantidad} turnos`,
          onclick: () => irAFecha(fecha),
        },
        DIAS_CORTOS[diaDeSemana(fecha)],
        el("strong", {}, aUTC(fecha).getUTCDate()),
        el("span", { class: "cuenta" }, cantidad || "")
      );
    })
  );
}

function renderizarFiltros() {
  const { barberos } = estado.config;
  if (barberos.length < 2) {
    $("filtros").hidden = true;
    return;
  }
  const delDia = turnosDelDia(estado.fecha).filter((t) => t.estado !== "cancelado");
  const chip = (valor, texto, cantidad) =>
    el(
      "button",
      {
        type: "button",
        class: "chip",
        "aria-pressed": String(estado.filtro === valor),
        onclick: () => {
          estado.filtro = valor;
          guardarLocal(CLAVE_FILTRO, valor);
          renderizar();
        },
      },
      `${texto} (${cantidad})`
    );
  $("filtros").replaceChildren(
    chip("todos", "Todos", delDia.length),
    ...barberos.map((b) => chip(b.id, b.nombre, delDia.filter((t) => t.barberoId === b.id).length))
  );
}

function renderizarStats() {
  const delDia = aplicarFiltro(turnosDelDia(estado.fecha));
  const contar = (e) => delDia.filter((t) => t.estado === e).length;
  const stats = [
    ["Turnos", delDia.filter((t) => t.estado !== "cancelado").length],
    ["Por atender", contar("confirmado")],
    ["Atendidos", contar("completado")],
    ["No vinieron", contar("ausente")],
  ];
  const conPrecio = delDia.filter((t) => t.precio != null);
  if (conPrecio.length) {
    const cobrado = conPrecio.filter((t) => t.estado === "completado").reduce((s, t) => s + Number(t.precio), 0);
    stats.push(["Atendido ($)", pesos(cobrado)]);
  }
  $("stats").replaceChildren(
    ...stats.map(([label, valor]) => el("div", { class: "stat" }, el("span", { class: "stat-numero" }, valor), el("span", { class: "stat-label" }, label)))
  );
}

function mensajeRecordatorio(t) {
  const cuando = t.fecha === estado.hoy.fecha ? "hoy" : t.fecha === sumarDias(estado.hoy.fecha, 1) ? "mañana" : `el ${fechaLarga(t.fecha)}`;
  const nombre = t.cliente.split(" ")[0];
  return `Hola ${nombre}! Te recordamos tu turno en ${estado.config.negocio.nombre} ${cuando} a las ${t.hora} con ${t.barbero} (${t.servicio}). Si no podés venir, avisanos por acá. ¡Te esperamos!`;
}

function renderizarAgenda() {
  const delDia = aplicarFiltro(turnosDelDia(estado.fecha));
  if (!delDia.length) {
    $("agenda").replaceChildren(el("p", { class: "vacio" }, "No hay turnos para este día."));
    return;
  }
  $("agenda").replaceChildren(...delDia.map(tarjetaTurno));
}

function tarjetaTurno(t) {
  const detalle = [t.servicio, estado.config.barberos.length > 1 && t.barbero, t.precio != null && pesos(t.precio)].filter(Boolean).join(" · ");
  const accion = (texto, clase, nuevoEstado) =>
    el("button", { type: "button", class: `boton ${clase}`, onclick: (e) => cambiarEstado(t, nuevoEstado, e.currentTarget) }, texto);

  return el(
    "article",
    { class: `turno estado-${t.estado}${estado.resaltados.has(t.id) ? " nuevo" : ""}` },
    el("div", { class: "turno-hora" }, el("strong", {}, t.hora), el("span", {}, t.horaFin)),
    el(
      "div",
      {},
      el(
        "div",
        { class: "turno-cabecera" },
        el("span", { class: "turno-cliente" }, t.cliente),
        el("span", { class: `badge badge-${t.estado}` }, ESTADOS[t.estado] || t.estado),
        el("span", { class: "badge" }, t.origen === "web" ? "Web" : "Panel")
      ),
      el("div", { class: "turno-detalle" }, detalle, t.telefono && [" · ", el("a", { href: `tel:${t.telefono.replace(/[^\d+]/g, "")}` }, t.telefono)]),
      t.nota && el("div", { class: "turno-nota" }, t.nota),
      el(
        "div",
        { class: "turno-acciones" },
        t.telefonoWa &&
          t.estado === "confirmado" &&
          el("a", { class: "boton boton-wsp", href: `https://wa.me/${t.telefonoWa}?text=${encodeURIComponent(mensajeRecordatorio(t))}`, target: "_blank", rel: "noopener" }, "WhatsApp"),
        t.estado === "confirmado"
          ? [accion("✓ Atendido", "boton-ok", "completado"), accion("No vino", "", "ausente"), accion("Cancelar", "boton-peligro", "cancelado")]
          : accion("Deshacer", "", "confirmado")
      )
    )
  );
}

async function cambiarEstado(turno, nuevoEstado, boton, forzar = false) {
  if (nuevoEstado === "cancelado" && !confirm(`¿Cancelar el turno de ${turno.cliente} (${turno.hora})? El horario queda libre.`)) return;
  boton.disabled = true;
  try {
    const actualizado = await pedir(`admin/turnos/${turno.id}/estado`, {
      method: "POST",
      body: JSON.stringify({ estado: nuevoEstado, forzar }),
    });
    estado.turnos = estado.turnos.map((t) => (t.id === actualizado.id ? actualizado : t));
    renderizar();
  } catch (err) {
    boton.disabled = false;
    if (err.codigo === "ocupado" && confirm(`${err.message}\n¿Volver a confirmarlo igual? Van a quedar dos turnos a la misma hora.`)) {
      return cambiarEstado(turno, nuevoEstado, boton, true);
    }
    if (err.codigo !== "ocupado") alert(err.message);
  }
}

function irAFecha(fecha) {
  if (!fecha) return;
  const otraSemana = lunesDe(fecha) !== lunesDe(estado.fecha);
  estado.fecha = fecha;
  if (otraSemana) {
    renderizarCabecera();
    $("agenda").replaceChildren(el("p", { class: "vacio" }, "Cargando turnos…"));
    cargarTurnos();
  } else {
    renderizar();
  }
}

$("dia-anterior").addEventListener("click", () => irAFecha(sumarDias(estado.fecha, -1)));
$("dia-siguiente").addEventListener("click", () => irAFecha(sumarDias(estado.fecha, 1)));
$("boton-hoy").addEventListener("click", () => irAFecha(estado.hoy.fecha));
$("selector-fecha").addEventListener("change", (e) => irAFecha(e.target.value));

document.addEventListener("keydown", (e) => {
  if ($("dialogo-nuevo").open || e.target.closest("input, select, textarea")) return;
  if (e.key === "ArrowLeft") irAFecha(sumarDias(estado.fecha, -1));
  if (e.key === "ArrowRight") irAFecha(sumarDias(estado.fecha, 1));
});

// --- Nuevo turno ---

let disponibilidadCache = {};

function llenarSelect(select, opciones, valor) {
  select.replaceChildren(...opciones.map(([v, texto]) => el("option", { value: v }, texto)));
  if (opciones.some(([v]) => v === valor)) select.value = valor;
}

function actualizarBarberosDelForm(preferido) {
  const servicioId = $("nuevo-servicio").value;
  const barberos = estado.config.barberos.filter((b) => !b.servicios || b.servicios.includes(servicioId));
  llenarSelect(
    $("nuevo-barbero"),
    [["cualquiera", "Cualquiera (el que esté libre)"], ...barberos.map((b) => [b.id, b.nombre])],
    preferido ?? $("nuevo-barbero").value
  );
}

async function cargarLibres() {
  const servicio = $("nuevo-servicio").value;
  const barbero = $("nuevo-barbero").value;
  const fecha = $("nuevo-fecha").value;
  const contenedor = $("nuevo-libres");
  contenedor.replaceChildren(el("span", { class: "sin-libres" }, "Buscando…"));

  const clave = `${servicio}|${barbero}`;
  try {
    disponibilidadCache[clave] ??= pedir(`disponibilidad?servicio=${encodeURIComponent(servicio)}&barbero=${encodeURIComponent(barbero)}`);
    const { dias } = await disponibilidadCache[clave];
    // Si mientras tanto cambiaron el formulario, esta respuesta ya no sirve.
    if (clave !== `${$("nuevo-servicio").value}|${$("nuevo-barbero").value}` || fecha !== $("nuevo-fecha").value) return;
    const dia = dias.find((d) => d.fecha === fecha);
    if (!dia) {
      contenedor.replaceChildren(el("span", { class: "sin-libres" }, "Esa fecha está fuera de la agenda online: escribí la hora a mano."));
      return;
    }
    if (!dia.horarios.length) {
      contenedor.replaceChildren(el("span", { class: "sin-libres" }, dia.abierto ? "No quedan horarios libres ese día." : "Ese día la barbería no abre."));
      return;
    }
    contenedor.replaceChildren(
      ...dia.horarios.map((h) =>
        el(
          "button",
          {
            type: "button",
            class: "chip",
            "aria-pressed": String($("nuevo-hora").value === h.hora),
            onclick: () => {
              $("nuevo-hora").value = h.hora;
              contenedor.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c.textContent === h.hora)));
            },
          },
          h.hora
        )
      )
    );
  } catch (err) {
    delete disponibilidadCache[clave];
    contenedor.replaceChildren(el("span", { class: "sin-libres" }, err.message));
  }
}

function abrirNuevo() {
  disponibilidadCache = {}; // cada vez que se abre, horarios frescos
  $("form-nuevo").reset();
  llenarSelect($("nuevo-servicio"), estado.config.servicios.map((s) => [s.id, `${s.titulo} (${s.duracion} min)`]));
  actualizarBarberosDelForm(estado.filtro === "todos" ? "cualquiera" : estado.filtro);
  $("nuevo-fecha").value = estado.fecha;
  $("nuevo-error").hidden = true;
  $("dialogo-nuevo").showModal();
  cargarLibres();
}

$("boton-nuevo").addEventListener("click", abrirNuevo);
$("nuevo-cancelar").addEventListener("click", () => $("dialogo-nuevo").close());
$("nuevo-servicio").addEventListener("change", () => {
  actualizarBarberosDelForm();
  cargarLibres();
});
$("nuevo-barbero").addEventListener("change", cargarLibres);
$("nuevo-fecha").addEventListener("change", cargarLibres);
$("nuevo-hora").addEventListener("input", () => {
  $("nuevo-libres").querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c.textContent === $("nuevo-hora").value)));
});

$("form-nuevo").addEventListener("submit", async (e) => {
  e.preventDefault();
  const datos = {
    servicioId: $("nuevo-servicio").value,
    barberoId: $("nuevo-barbero").value,
    fecha: $("nuevo-fecha").value,
    hora: $("nuevo-hora").value,
    cliente: $("nuevo-cliente").value.trim(),
    telefono: $("nuevo-telefono").value.trim(),
    nota: $("nuevo-nota").value.trim(),
  };
  const boton = $("nuevo-guardar");
  boton.disabled = true;
  $("nuevo-error").hidden = true;
  try {
    let turno;
    try {
      turno = await pedir("admin/turnos", { method: "POST", body: JSON.stringify(datos) });
    } catch (err) {
      // Se pisa con otro turno o cae fuera de horario: la barberia decide si lo carga igual.
      if (err.status !== 409 || !confirm(`${err.message}\n¿Guardarlo igual?`)) throw err;
      turno = await pedir("admin/turnos", { method: "POST", body: JSON.stringify({ ...datos, forzar: true }) });
    }
    estado.conocidos?.add(turno.id);
    $("dialogo-nuevo").close();
    toast(`Turno guardado: ${turno.cliente} · ${turno.hora} con ${turno.barbero}`);
    estado.fecha = turno.fecha;
    await cargarTurnos();
  } catch (err) {
    $("nuevo-error").textContent = err.message;
    $("nuevo-error").hidden = false;
  } finally {
    boton.disabled = false;
  }
});

// --- Arranque ---

(async function iniciar() {
  try {
    [estado.config] = await Promise.all([pedir("config"), cargarEstado()]);
  } catch {
    $("agenda").replaceChildren(el("p", { class: "vacio" }, "No se pudo cargar el panel. Recargá la página."));
    return;
  }
  const filtroGuardado = leerLocal(CLAVE_FILTRO, "todos");
  estado.filtro = estado.config.barberos.some((b) => b.id === filtroGuardado) ? filtroGuardado : "todos";
  estado.fecha = estado.hoy.fecha;
  await cargarTurnos();

  // Refresco automatico mientras el panel esta a la vista (ej. la compu del mostrador).
  // Tambien se vuelve a pedir el estado, asi "hoy" cambia solo si el panel queda abierto de un dia para otro.
  setInterval(async () => {
    if (document.visibilityState !== "visible" || $("dialogo-nuevo").open) return;
    await cargarEstado().catch(() => {});
    cargarTurnos({ silencioso: true });
  }, REFRESCO_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") cargarTurnos({ silencioso: true });
  });
})();
