let CONFIG = { servicios: [], lugares: [], formasDePago: [] };
let TURNOS = [];

async function cargarConfig() {
  const res = await fetch("/api/admin/config");
  CONFIG = await res.json();

  llenarSelect(document.getElementById("filtro-servicio"), CONFIG.servicios, "Todos los servicios", true);
  llenarSelect(document.getElementById("filtro-lugar"), CONFIG.lugares, "Todos los lugares", true);
  llenarSelect(document.getElementById("turno-servicio"), CONFIG.servicios, null, false);
  llenarSelect(
    document.getElementById("turno-pago"),
    CONFIG.formasDePago.map((f) => ({ id: f, titulo: f })),
    null,
    false
  );
  actualizarLugaresDelFormulario();
}

function llenarSelect(select, items, placeholder, conPlaceholder) {
  select.innerHTML = "";
  if (conPlaceholder) {
    const op = document.createElement("option");
    op.value = "";
    op.textContent = placeholder;
    select.appendChild(op);
  }
  items.forEach((item) => {
    const op = document.createElement("option");
    op.value = item.id;
    op.textContent = item.nombre || item.titulo;
    select.appendChild(op);
  });
}

function actualizarLugaresDelFormulario() {
  const servicioId = document.getElementById("turno-servicio").value;
  const lugares = CONFIG.lugares.filter((l) => l.servicios.includes(servicioId));
  llenarSelect(document.getElementById("turno-lugar"), lugares, null, false);
}
document.getElementById("turno-servicio").addEventListener("change", actualizarLugaresDelFormulario);

// --- Cargar turnos y comentarios ---
async function cargarTurnos() {
  const tbody = document.querySelector("#tabla-turnos tbody");
  try {
    const res = await fetch("/api/admin/turnos");
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "error del servidor");
    TURNOS = data;
    renderizarStats();
    renderizarTabla();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="cargando">No se pudieron cargar los turnos: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function cargarComentarios() {
  const contenedor = document.getElementById("comentarios");
  let comentarios;
  try {
    const res = await fetch("/api/admin/comentarios");
    comentarios = await res.json();
    if (!res.ok) throw new Error(comentarios?.error || "error del servidor");
  } catch (err) {
    contenedor.innerHTML = `<p class="cargando">No se pudieron cargar los comentarios: ${escapeHtml(err.message)}</p>`;
    return;
  }
  if (comentarios.length === 0) {
    contenedor.innerHTML = "<p class='cargando'>Todavía no hay comentarios.</p>";
    return;
  }
  contenedor.innerHTML = comentarios
    .slice()
    .reverse()
    .map(
      (c) => `
      <div class="comentario">
        <p>${escapeHtml(c.texto)}</p>
        <div class="meta">${new Date(c.fecha).toLocaleString("es-AR")} · ${c.origen === "web" ? "desde la web" : "por WhatsApp"}</div>
      </div>`
    )
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function renderizarStats() {
  const ahora = new Date();
  const en7dias = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000);
  const proximos = TURNOS.filter((t) => new Date(t.inicio) >= ahora);
  const estaSemana = proximos.filter((t) => new Date(t.inicio) <= en7dias);

  const conteoServicio = {};
  proximos.forEach((t) => (conteoServicio[t.servicio] = (conteoServicio[t.servicio] || 0) + 1));
  const top = Object.entries(conteoServicio).sort((a, b) => b[1] - a[1])[0];

  document.getElementById("stat-total").textContent = proximos.length;
  document.getElementById("stat-semana").textContent = estaSemana.length;
  document.getElementById("stat-top").textContent = top ? top[0] : "–";
}

function renderizarTabla() {
  const filtroServicio = document.getElementById("filtro-servicio").value;
  const filtroLugarId = document.getElementById("filtro-lugar").value;
  const nombreLugarFiltrado = CONFIG.lugares.find((l) => l.id === filtroLugarId)?.nombre;

  const ahora = new Date();
  const filas = TURNOS.filter((t) => {
    if (filtroServicio) {
      const tituloServicio = CONFIG.servicios.find((s) => s.id === filtroServicio)?.titulo;
      if (t.servicio !== tituloServicio) return false;
    }
    if (nombreLugarFiltrado && t.lugar !== nombreLugarFiltrado) return false;
    return true;
  }).sort((a, b) => new Date(a.inicio) - new Date(b.inicio));

  const tbody = document.querySelector("#tabla-turnos tbody");
  if (filas.length === 0) {
    tbody.innerHTML = "<tr><td colspan='6' class='cargando'>No hay turnos para mostrar.</td></tr>";
    return;
  }

  tbody.innerHTML = filas
    .map((t) => {
      const esPasado = new Date(t.inicio) < ahora;
      return `
      <tr class="${esPasado ? "pasado" : ""}">
        <td>${new Date(t.inicio).toLocaleString("es-AR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
        <td>${escapeHtml(t.servicio)}</td>
        <td>${escapeHtml(t.lugar)}</td>
        <td>${escapeHtml(t.cliente)}</td>
        <td>${escapeHtml(t.pago)}</td>
        <td class="${t.origen === "manual" ? "origen-manual" : ""}">${t.origen === "manual" ? "Cargado a mano" : "WhatsApp"}</td>
      </tr>`;
    })
    .join("");
}

document.getElementById("filtro-servicio").addEventListener("change", renderizarTabla);
document.getElementById("filtro-lugar").addEventListener("change", renderizarTabla);

// --- Formulario de carga manual ---
document.getElementById("form-turno").addEventListener("submit", async (e) => {
  e.preventDefault();
  const mensaje = document.getElementById("turno-mensaje");
  const cuerpo = {
    servicioId: document.getElementById("turno-servicio").value,
    lugarId: document.getElementById("turno-lugar").value,
    fechaHora: document.getElementById("turno-fecha").value,
    cliente: document.getElementById("turno-cliente").value.trim(),
    pago: document.getElementById("turno-pago").value,
  };

  try {
    const res = await fetch("/api/admin/turnos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "no se pudo guardar");

    mensaje.hidden = false;
    mensaje.textContent = "¡Turno guardado!";
    document.getElementById("form-turno").reset();
    actualizarLugaresDelFormulario();
    cargarTurnos();
  } catch (err) {
    mensaje.hidden = false;
    mensaje.textContent = "Error: " + err.message;
  }
});

(async function iniciar() {
  await cargarConfig();
  await Promise.all([cargarTurnos(), cargarComentarios()]);
})();
