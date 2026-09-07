// Numero de WhatsApp del negocio en formato internacional sin "+" (ej 5493511234567).
// Cambialo por el numero real conectado a la WhatsApp Cloud API.
const NUMERO_WHATSAPP = "5490000000000";

const linksWhatsapp = [
  document.getElementById("whatsapp-cta"),
  document.getElementById("whatsapp-cta-2"),
  document.getElementById("whatsapp-cta-footer"),
  document.getElementById("nav-cta"),
  document.getElementById("whatsapp-flotante"),
].filter(Boolean);

function actualizarLinksWhatsapp(servicio) {
  const texto = servicio
    ? `Hola! Quiero reservar un turno de ${servicio}.`
    : "Hola! Quiero reservar un turno.";
  const url = `https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(texto)}`;
  linksWhatsapp.forEach((a) => (a.href = url));
}

actualizarLinksWhatsapp();

// --- Elegir un servicio resalta la tarjeta y prepara el mensaje de WhatsApp ---
const tarjetasServicio = document.querySelectorAll(".tarjeta-servicio");
tarjetasServicio.forEach((tarjeta) => {
  tarjeta.addEventListener("click", () => {
    const yaSeleccionada = tarjeta.classList.contains("seleccionada");
    tarjetasServicio.forEach((t) => t.classList.remove("seleccionada"));
    if (yaSeleccionada) {
      actualizarLinksWhatsapp();
      return;
    }
    tarjeta.classList.add("seleccionada");
    actualizarLinksWhatsapp(tarjeta.dataset.texto);
  });
});

// --- Aparecer suavemente al hacer scroll ---
const observer = new IntersectionObserver(
  (entradas) => {
    entradas.forEach((entrada) => {
      if (entrada.isIntersecting) {
        entrada.target.classList.add("visible");
        observer.unobserve(entrada.target);
      }
    });
  },
  { threshold: 0.15 }
);
document.querySelectorAll(".tarjeta").forEach((el, i) => {
  el.style.transitionDelay = `${(i % 3) * 60}ms`;
  observer.observe(el);
});

// --- Boton flotante de WhatsApp, aparece despues del hero ---
const flotante = document.getElementById("whatsapp-flotante");
const hero = document.querySelector(".hero");
if (flotante && hero) {
  flotante.hidden = false;
  const heroObserver = new IntersectionObserver(
    ([entrada]) => {
      flotante.classList.toggle("visible", !entrada.isIntersecting);
    },
    { threshold: 0 }
  );
  heroObserver.observe(hero);
}

// --- Comentarios ---
async function cargarComentarios() {
  const contenedor = document.getElementById("comentarios");
  try {
    const res = await fetch("/api/comments");
    const comentarios = await res.json();
    if (!res.ok) throw new Error(comentarios?.error || "error del servidor");
    if (comentarios.length === 0) {
      contenedor.innerHTML = "<p class='cargando'>Todavía no hay comentarios, ¡sé el primero!</p>";
      return;
    }
    contenedor.innerHTML = comentarios
      .slice()
      .reverse()
      .map(
        (c) => `
        <div class="comentario">
          <p>${escapeHtml(c.texto)}</p>
          <div class="fecha">${new Date(c.fecha).toLocaleDateString("es-AR")}</div>
        </div>`
      )
      .join("");
  } catch {
    contenedor.innerHTML = "<p class='cargando'>No se pudieron cargar los comentarios.</p>";
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.getElementById("form-comentario").addEventListener("submit", async (e) => {
  e.preventDefault();
  const textarea = document.getElementById("texto-comentario");
  const mensaje = document.getElementById("mensaje-form");
  const texto = textarea.value.trim();
  if (!texto) return;

  try {
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
    if (!res.ok) throw new Error("error");
    textarea.value = "";
    mensaje.hidden = false;
    mensaje.textContent = "¡Gracias por tu comentario!";
    cargarComentarios();
  } catch {
    mensaje.hidden = false;
    mensaje.textContent = "No se pudo enviar, probá de nuevo en un rato.";
  }
});

cargarComentarios();
