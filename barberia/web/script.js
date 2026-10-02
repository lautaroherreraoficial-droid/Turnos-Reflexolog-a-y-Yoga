// Pagina de turnos de Barberia Lux. Las rutas de la API son relativas ("api/...") para que la
// pagina funcione igual en la raiz de un dominio o montada bajo un prefijo.
const API = "api/";
const CLAVE_TURNOS = "lux.turnos"; // tokens de los turnos reservados desde este celular
const CLAVE_CLIENTE = "lux.cliente"; // nombre y telefono, para no tipearlos de nuevo

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const estado = {
  config: null,
  servicioId: null,
  barberoId: "cualquiera",
  fecha: null,
  hora: null,
  dias: [],
  pedido: 0, // para descartar respuestas viejas de disponibilidad
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
    throw new Error("No pudimos conectarnos. Revisá tu conexión y probá de nuevo.");
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(datos.error || "Algo falló. Probá de nuevo en un momento.");
    err.codigo = datos.codigo;
    err.status = res.status;
    throw err;
  }
  return datos;
}

function leerLocal(clave, porDefecto) {
  try {
    return JSON.parse(localStorage.getItem(clave)) ?? porDefecto;
  } catch {
    return porDefecto;
  }
}

function guardarLocal(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // modo incognito o almacenamiento lleno: la reserva funciona igual
  }
}

function partesFecha(fecha) {
  const [a, m, d] = fecha.split("-").map(Number);
  return { a, m, d, dow: new Date(Date.UTC(a, m - 1, d)).getUTCDay() };
}

function fechaLarga(fecha) {
  const { m, d, dow } = partesFecha(fecha);
  return `${DIAS_LARGOS[dow]} ${d} de ${MESES_LARGOS[m - 1]}`;
}

function aMinutos(hora) {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

function duracionTexto(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h} h ${min % 60}` : `${h} h`;
}

function precioTexto(precio) {
  return precio == null ? null : `$ ${Number(precio).toLocaleString("es-AR")}`;
}

function iniciales(nombre) {
  return nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

const servicioActual = () => estado.config.servicios.find((s) => s.id === estado.servicioId);
const barberoPorId = (id) => estado.config.barberos.find((b) => b.id === id);
const diaActual = () => estado.dias.find((d) => d.fecha === estado.fecha);

function irA(nodo) {
  // Pequena pausa para que el paso se desbloquee antes de desplazar.
  setTimeout(() => nodo.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
}

function linkWhatsapp(numero, texto) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

function linkMapa() {
  const { nombre, zona, direccion } = estado.config.negocio;
  const consulta = direccion ? `${direccion}, ${zona}` : `${nombre} ${zona}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`;
}

function linkCalendario(turno) {
  const { negocio } = estado.config;
  const compacta = (fecha, hora) => `${fecha.replaceAll("-", "")}T${hora.replace(":", "")}00`;
  const urlTurno = `${location.origin}${location.pathname}?turno=${turno.token}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${turno.servicio} · ${negocio.nombre}`,
    dates: `${compacta(turno.fecha, turno.hora)}/${compacta(turno.fecha, turno.horaFin)}`,
    ctz: "America/Argentina/Buenos_Aires",
    location: negocio.direccion ? `${negocio.direccion}, ${negocio.zona}` : `${negocio.nombre}, ${negocio.zona}`,
    details: `Con ${turno.barbero}.\nPara ver o cancelar tu turno: ${urlTurno}`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

// --- Cabecera y pie ---

function textoEstadoHoy({ horarioSemanal, hoy }) {
  const dow = partesFecha(hoy.fecha).dow;
  const bloquesHoy = hoy.cerrado ? [] : horarioSemanal[dow];
  const actual = bloquesHoy.find(([desde, hasta]) => hoy.minutos >= aMinutos(desde) && hoy.minutos < aMinutos(hasta));
  if (actual) return { abierto: true, texto: `Abierto ahora · hasta las ${actual[1]}` };
  const masTarde = bloquesHoy.find(([desde]) => aMinutos(desde) > hoy.minutos);
  if (masTarde) return { abierto: false, texto: `Cerrado ahora · abre hoy a las ${masTarde[0]}` };
  for (let i = 1; i <= 7; i++) {
    const dia = (dow + i) % 7;
    if (horarioSemanal[dia].length) {
      const cuando = i === 1 ? "mañana" : `el ${DIAS_LARGOS[dia]}`;
      return { abierto: false, texto: `Cerrado ahora · abre ${cuando} a las ${horarioSemanal[dia][0][0]}` };
    }
  }
  return null;
}

// Agrupa dias seguidos con el mismo horario: "Lunes a sábado · 10:00 – 20:00".
function horariosAgrupados(horarioSemanal) {
  const grupos = [];
  for (const dia of [1, 2, 3, 4, 5, 6, 0]) {
    const texto = horarioSemanal[dia].map(([d, h]) => `${d} – ${h}`).join(" y ") || "Cerrado";
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.texto === texto) ultimo.hasta = dia;
    else grupos.push({ desde: dia, hasta: dia, texto });
  }
  const mayuscula = (s) => s[0].toUpperCase() + s.slice(1);
  return grupos.map((g) => ({
    dias: g.desde === g.hasta ? mayuscula(DIAS_LARGOS[g.desde]) : `${mayuscula(DIAS_LARGOS[g.desde])} a ${DIAS_LARGOS[g.hasta]}`,
    texto: g.texto,
  }));
}

function renderizarNegocio() {
  const { negocio, horarioSemanal } = estado.config;
  $("zona").textContent = negocio.direccion ? `${negocio.direccion} · ${negocio.zona}` : negocio.zona.replace(", ", " · ");

  const hoy = textoEstadoHoy(estado.config);
  if (hoy) {
    $("estado-hoy-texto").textContent = hoy.texto;
    $("estado-hoy").classList.toggle("abierto", hoy.abierto);
    $("estado-hoy").hidden = false;
  }

  $("como-llegar").href = linkMapa();
  $("mapa").href = linkMapa();
  $("direccion").textContent = negocio.direccion ? `${negocio.direccion}, ${negocio.zona}` : negocio.zona;
  $("horarios").replaceChildren(
    ...horariosAgrupados(horarioSemanal).map((g) => el("li", {}, el("span", {}, g.dias), el("span", {}, g.texto)))
  );

  if (negocio.whatsapp) {
    $("pie-whatsapp").href = linkWhatsapp(negocio.whatsapp, "Hola! Tengo una consulta.");
    $("pie-whatsapp").hidden = false;
  }
  if (negocio.instagram) {
    $("pie-instagram").href = `https://instagram.com/${negocio.instagram}`;
    $("pie-instagram").textContent = `Instagram @${negocio.instagram}`;
    $("pie-instagram").hidden = false;
  }
  $("pie-contacto").hidden = !negocio.whatsapp && !negocio.instagram;
}

// --- Pasos de la reserva ---

function numerarPasos() {
  let n = 0;
  document.querySelectorAll(".paso").forEach((paso) => {
    if (!paso.hidden) paso.querySelector(".paso-num").textContent = String(++n).padStart(2, "0");
  });
}

function actualizarBloqueos() {
  $("paso-barbero").classList.toggle("bloqueado", !estado.servicioId);
  $("paso-dia").classList.toggle("bloqueado", !estado.servicioId);
  $("paso-hora").classList.toggle("bloqueado", !estado.fecha);
  $("paso-datos").classList.toggle("bloqueado", !estado.hora);
}

function marcar(contenedor, valor) {
  contenedor.querySelectorAll("[role=radio]").forEach((b) => {
    b.setAttribute("aria-checked", String(b.dataset.valor === valor));
  });
}

function renderizarServicios() {
  const lista = estado.config.servicios.map((s) =>
    el(
      "button",
      { type: "button", class: "opcion-servicio", role: "radio", "aria-checked": "false", "data-valor": s.id, onclick: () => elegirServicio(s.id) },
      el("strong", {}, s.titulo),
      s.descripcion && el("span", { class: "desc" }, s.descripcion),
      el("span", { class: "meta" }, el("span", {}, duracionTexto(s.duracion)), precioTexto(s.precio) && el("span", { class: "precio" }, precioTexto(s.precio))),
      el("span", { class: "marca-check", "aria-hidden": "true" }, "✓")
    )
  );
  $("lista-servicios").replaceChildren(...lista);
}

function renderizarBarberos() {
  const { barberos } = estado.config;
  // Con un solo barbero no hay nada que elegir.
  $("paso-barbero").hidden = barberos.length < 2;
  numerarPasos();

  const disponibles = barberos.filter((b) => !b.servicios || !estado.servicioId || b.servicios.includes(estado.servicioId));
  if (estado.barberoId !== "cualquiera" && !disponibles.some((b) => b.id === estado.barberoId)) {
    estado.barberoId = "cualquiera";
  }

  const opcion = (valor, avatar, nombre, sub) =>
    el(
      "button",
      { type: "button", class: "opcion-barbero", role: "radio", "aria-checked": "false", "data-valor": valor, onclick: () => elegirBarbero(valor) },
      el("span", { class: "avatar", "aria-hidden": "true" }, avatar),
      el("span", {}, el("span", { class: "nombre" }, nombre), sub && el("span", { class: "sub" }, sub))
    );

  $("lista-barberos").replaceChildren(
    opcion("cualquiera", "✦", "Cualquiera", "El primero que esté libre"),
    ...disponibles.map((b) => opcion(b.id, iniciales(b.nombre), b.nombre))
  );
  marcar($("lista-barberos"), estado.barberoId);
}

function elegirServicio(id) {
  const primeraVez = !estado.servicioId;
  estado.servicioId = id;
  marcar($("lista-servicios"), id);
  renderizarBarberos();
  cargarDisponibilidad();
  if (primeraVez) irA($("paso-barbero").hidden ? $("paso-dia") : $("paso-barbero"));
}

function elegirBarbero(id) {
  estado.barberoId = id;
  marcar($("lista-barberos"), id);
  cargarDisponibilidad();
  irA($("paso-dia"));
}

async function cargarDisponibilidad() {
  const pedido = ++estado.pedido;
  $("lista-dias").replaceChildren(...Array.from({ length: 7 }, () => el("div", { class: "dia esqueleto", "aria-hidden": "true" })));
  $("lista-horas").replaceChildren(el("p", { class: "cargando" }, "Buscando horarios libres…"));
  actualizarBloqueos();

  let dias;
  try {
    const params = new URLSearchParams({ servicio: estado.servicioId, barbero: estado.barberoId });
    ({ dias } = await pedir(`disponibilidad?${params}`));
  } catch (err) {
    if (pedido !== estado.pedido) return;
    $("lista-dias").replaceChildren(el("p", { class: "vacio" }, err.message));
    $("lista-horas").replaceChildren();
    return;
  }
  if (pedido !== estado.pedido) return;

  estado.dias = dias;
  // Si el dia elegido sigue teniendo lugar lo mantenemos; si no, saltamos al primero con lugar.
  const elegido = diaActual();
  if (!elegido || !elegido.horarios.length) estado.fecha = dias.find((d) => d.horarios.length)?.fecha || null;
  if (estado.hora && !diaActual()?.horarios.some((h) => h.hora === estado.hora)) estado.hora = null;

  renderizarDias();
  renderizarHoras();
  actualizarBloqueos();
  actualizarResumen();
}

function renderizarDias() {
  const hoy = estado.config.hoy.fecha;
  if (!estado.dias.some((d) => d.horarios.length)) {
    $("lista-dias").replaceChildren(
      el("p", { class: "vacio" }, `No quedan horarios libres en los próximos ${estado.config.reglas.diasHaciaAdelante} días.`)
    );
    return;
  }
  const botones = estado.dias.map((dia, i) => {
    const { m, d, dow } = partesFecha(dia.fecha);
    let etiqueta = "";
    if (!dia.abierto) etiqueta = "Cerrado";
    else if (!dia.horarios.length) etiqueta = dia.fecha === hoy ? "Sin lugar" : "Completo";
    else if (dia.fecha === hoy) etiqueta = "Hoy";
    else if (i === 1) etiqueta = "Mañana";
    return el(
      "button",
      {
        type: "button",
        class: "dia",
        role: "radio",
        "aria-checked": "false",
        "data-valor": dia.fecha,
        "aria-label": `${fechaLarga(dia.fecha)}${etiqueta ? `, ${etiqueta.toLowerCase()}` : ""}`,
        disabled: !dia.horarios.length,
        onclick: () => elegirDia(dia.fecha),
      },
      el("span", { class: "dow" }, DIAS_CORTOS[dow]),
      el("span", { class: "num" }, d),
      el("span", { class: "mes" }, MESES[m - 1]),
      el("span", { class: "etiqueta" }, etiqueta)
    );
  });
  $("lista-dias").replaceChildren(...botones);
  marcar($("lista-dias"), estado.fecha);
  // Solo scroll horizontal de la tira (scrollIntoView tambien moveria la pagina).
  const elegido = $("lista-dias").querySelector("[aria-checked=true]");
  if (elegido) $("lista-dias").scrollLeft = Math.max(0, elegido.offsetLeft - 16);
}

function elegirDia(fecha) {
  estado.fecha = fecha;
  estado.hora = null;
  marcar($("lista-dias"), fecha);
  renderizarHoras();
  actualizarBloqueos();
  actualizarResumen();
  irA($("paso-hora"));
}

function renderizarHoras() {
  const dia = diaActual();
  $("detalle-dia").textContent = dia ? fechaLarga(dia.fecha) : "";
  if (!dia) {
    $("lista-horas").replaceChildren();
    return;
  }
  const grupos = [
    { titulo: "Mañana", horas: dia.horarios.filter((h) => aMinutos(h.hora) < 13 * 60) },
    { titulo: "Tarde", horas: dia.horarios.filter((h) => aMinutos(h.hora) >= 13 * 60) },
  ].filter((g) => g.horas.length);

  $("lista-horas").replaceChildren(
    ...grupos.map((g) =>
      el(
        "div",
        { class: "grupo-horas" },
        el("h4", {}, g.titulo),
        el(
          "div",
          { class: "horas", role: "radiogroup", "aria-label": `Horarios a la ${g.titulo.toLowerCase()}` },
          g.horas.map((h) =>
            el("button", { type: "button", class: "hora", role: "radio", "aria-checked": String(h.hora === estado.hora), "data-valor": h.hora, onclick: () => elegirHora(h.hora) }, h.hora)
          )
        )
      )
    )
  );
}

function elegirHora(hora) {
  const primeraVez = !estado.hora;
  estado.hora = hora;
  marcar($("lista-horas"), hora);
  actualizarBloqueos();
  actualizarResumen();
  if (primeraVez) irA($("paso-datos"));
}

function actualizarResumen() {
  const servicio = estado.servicioId && servicioActual();
  if (!servicio || !estado.fecha || !estado.hora) {
    $("resumen").replaceChildren(el("p", { class: "cargando" }, "Elegí servicio, día y horario."));
    return;
  }
  const libres = diaActual()?.horarios.find((h) => h.hora === estado.hora)?.barberos || [];
  const barbero =
    estado.barberoId !== "cualquiera"
      ? barberoPorId(estado.barberoId).nombre
      : libres.length === 1
        ? barberoPorId(libres[0])?.nombre
        : "El primero que esté libre";
  const fin = aMinutos(estado.hora) + servicio.duracion;
  const horaFin = `${String(Math.floor(fin / 60)).padStart(2, "0")}:${String(fin % 60).padStart(2, "0")}`;

  const filas = [
    ["Servicio", servicio.titulo + (precioTexto(servicio.precio) ? ` · ${precioTexto(servicio.precio)}` : "")],
    ["Cuándo", `${fechaLarga(estado.fecha)}, ${estado.hora} a ${horaFin}`],
    ["Barbero", barbero],
  ];
  $("resumen").replaceChildren(el("dl", {}, filas.map(([k, v]) => [el("dt", {}, k), el("dd", {}, v)])));
}

// --- Enviar la reserva ---

function mostrarError(texto) {
  $("error-reserva").textContent = texto;
  $("error-reserva").hidden = !texto;
}

$("form-datos").addEventListener("submit", async (e) => {
  e.preventDefault();
  mostrarError("");
  const cliente = $("cliente").value.trim();
  const telefono = $("telefono").value.trim();
  $("cliente").setAttribute("aria-invalid", String(cliente.length < 2));
  $("telefono").setAttribute("aria-invalid", String(telefono.replace(/\D/g, "").length < 8));
  if (cliente.length < 2) return mostrarError("Dejanos tu nombre.");
  if (telefono.replace(/\D/g, "").length < 8) return mostrarError("Dejanos un WhatsApp para avisarte si hay algún cambio.");

  const boton = $("boton-confirmar");
  boton.disabled = true;
  boton.textContent = "Reservando…";
  try {
    const turno = await pedir("turnos", {
      method: "POST",
      body: JSON.stringify({
        servicioId: estado.servicioId,
        barberoId: estado.barberoId,
        fecha: estado.fecha,
        hora: estado.hora,
        cliente,
        telefono,
        nota: $("nota").value.trim(),
      }),
    });
    guardarLocal(CLAVE_CLIENTE, { cliente, telefono });
    guardarLocal(CLAVE_TURNOS, [...new Set([...leerLocal(CLAVE_TURNOS, []), turno.token])]);
    mostrarConfirmacion(turno);
  } catch (err) {
    mostrarError(err.message);
    if (err.codigo === "ocupado") {
      // Alguien gano de mano ese horario: refrescamos la agenda para que elija otro.
      estado.hora = null;
      await cargarDisponibilidad();
      irA($("paso-hora"));
    }
  } finally {
    boton.disabled = false;
    boton.textContent = "Confirmar turno";
  }
});

function fichaTurno(turno) {
  const { negocio } = estado.config;
  return el(
    "div",
    { class: "ficha" },
    el("div", { class: "cuando" }, fechaLarga(turno.fecha)),
    el("div", { class: "hora-ficha" }, `${turno.hora} a ${turno.horaFin} hs`),
    el(
      "ul",
      {},
      el("li", {}, "Servicio: ", el("strong", {}, turno.servicio)),
      el("li", {}, "Barbero: ", el("strong", {}, turno.barbero)),
      el("li", {}, "A nombre de: ", el("strong", {}, turno.cliente)),
      el("li", {}, "Dónde: ", el("strong", {}, negocio.direccion || `${negocio.nombre}, ${negocio.zona}`))
    )
  );
}

function mensajeParaLaBarberia(turno, accion = "Reservé") {
  return `Hola! ${accion} un turno por la web: ${turno.servicio}, ${fechaLarga(turno.fecha)} a las ${turno.hora} con ${turno.barbero}. A nombre de ${turno.cliente}.`;
}

function mostrarConfirmacion(turno) {
  const { negocio } = estado.config;
  const nombre = turno.cliente.split(" ")[0];
  $("confirmacion").replaceChildren(
    el("div", { class: "check-grande", "aria-hidden": "true" }, "✓"),
    el("h3", {}, `¡Listo, ${nombre}!`),
    el("p", {}, "Tu turno quedó reservado. Te esperamos."),
    fichaTurno(turno),
    el(
      "div",
      { class: "acciones" },
      el("a", { class: "boton boton-oro", href: linkCalendario(turno), target: "_blank", rel: "noopener" }, "Agregar al calendario"),
      negocio.whatsapp &&
        el("a", { class: "boton boton-wsp", href: linkWhatsapp(negocio.whatsapp, mensajeParaLaBarberia(turno)), target: "_blank", rel: "noopener" }, "Avisar por WhatsApp")
    ),
    el("button", { type: "button", class: "boton-texto", onclick: reiniciar }, "Reservar otro turno")
  );
  $("pasos").hidden = true;
  $("confirmacion").hidden = false;
  $("reservar").scrollIntoView({ behavior: "smooth", block: "start" });
  $("confirmacion").focus({ preventScroll: true });
  $("mis-turnos").hidden = true; // la confirmacion ya muestra el turno; la tarjeta vuelve al reservar otro
}

function reiniciar() {
  estado.hora = null;
  $("nota").value = "";
  mostrarError("");
  $("confirmacion").hidden = true;
  $("pasos").hidden = false;
  cargarMisTurnos();
  cargarDisponibilidad();
  irA($("reservar"));
}

// --- Turnos ya reservados desde este celular ---

async function cargarMisTurnos() {
  const tokens = leerLocal(CLAVE_TURNOS, []);
  if (!tokens.length) {
    $("mis-turnos").hidden = true;
    return;
  }
  const resultados = await Promise.all(
    tokens.map((token) =>
      pedir(`turnos/${encodeURIComponent(token)}`).catch((err) => (err.status === 404 ? null : { token, error: true }))
    )
  );
  // Nos quedamos con los que siguen vigentes (los errores de red se conservan para reintentar despues).
  const vigentes = resultados.filter((t) => t && (t.error || (!t.yaPaso && t.estado === "confirmado")));
  guardarLocal(CLAVE_TURNOS, vigentes.map((t) => t.token));

  const tarjetas = vigentes.filter((t) => !t.error).map(tarjetaMiTurno);
  $("mis-turnos").replaceChildren(...tarjetas);
  $("mis-turnos").hidden = !tarjetas.length;
}

function tarjetaMiTurno(turno) {
  const { negocio } = estado.config;
  const aviso = el("p", { class: "aviso", role: "status" });
  const tarjeta = el(
    "article",
    { class: "turno-guardado" },
    el("p", { class: "eyebrow" }, "Tu turno"),
    el("div", { class: "cuando" }, `${fechaLarga(turno.fecha)} · ${turno.hora}`),
    el("p", { class: "detalle" }, `${turno.servicio} con ${turno.barbero}`),
    el(
      "div",
      { class: "acciones" },
      el("a", { class: "boton boton-linea", href: linkCalendario(turno), target: "_blank", rel: "noopener" }, "Agregar al calendario"),
      turno.cancelable &&
        el("button", { type: "button", class: "boton boton-linea", onclick: (e) => cancelar(turno, e.currentTarget, tarjeta, aviso) }, "Cancelar turno"),
      !turno.cancelable &&
        negocio.whatsapp &&
        el("a", { class: "boton boton-linea", href: linkWhatsapp(negocio.whatsapp, mensajeParaLaBarberia(turno, "No voy a poder ir a")), target: "_blank", rel: "noopener" }, "Avisar que no voy")
    ),
    aviso
  );
  if (!turno.cancelable) aviso.textContent = "Falta poco para tu turno: si no podés venir, avisanos por WhatsApp.";
  return tarjeta;
}

async function cancelar(turno, boton, tarjeta, aviso) {
  if (!confirm(`¿Cancelar tu turno del ${fechaLarga(turno.fecha)} a las ${turno.hora}?`)) return;
  boton.disabled = true;
  try {
    await pedir(`turnos/${encodeURIComponent(turno.token)}/cancelar`, { method: "POST" });
    tarjeta.classList.add("cancelado");
    tarjeta.querySelector(".acciones").remove();
    aviso.textContent = "Turno cancelado. ¡Gracias por avisar! El horario ya quedó libre para otra persona.";
    guardarLocal(CLAVE_TURNOS, leerLocal(CLAVE_TURNOS, []).filter((t) => t !== turno.token));
    if (estado.servicioId) cargarDisponibilidad();
  } catch (err) {
    aviso.textContent = err.message;
    boton.disabled = false;
  }
}

// --- Arranque ---

(async function iniciar() {
  // Link "?turno=..." (por ejemplo, desde el evento del calendario): lo sumamos a este celular.
  const params = new URLSearchParams(location.search);
  const token = params.get("turno");
  if (token && /^[a-f0-9]{16,64}$/.test(token)) {
    guardarLocal(CLAVE_TURNOS, [...new Set([...leerLocal(CLAVE_TURNOS, []), token])]);
    history.replaceState(null, "", location.pathname);
  }

  try {
    estado.config = await pedir("config");
  } catch (err) {
    $("lista-servicios").replaceChildren(el("p", { class: "vacio" }, `No pudimos cargar la agenda. ${err.message}`));
    return;
  }

  const guardado = leerLocal(CLAVE_CLIENTE, {});
  if (guardado.cliente) $("cliente").value = guardado.cliente;
  if (guardado.telefono) $("telefono").value = guardado.telefono;

  renderizarNegocio();
  renderizarServicios();
  renderizarBarberos();
  actualizarResumen();
  cargarMisTurnos();
})();
