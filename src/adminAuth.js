import crypto from "crypto";

// Autenticacion basica (usuario/contrasena) para el panel de administracion.
// El navegador muestra su propio cartel de login y recuerda las credenciales
// mientras la pestana este abierta, asi que no hace falta armar un sistema de sesiones.
function comparar(a, b) {
  const bufA = Buffer.from(a || "");
  const bufB = Buffer.from(b || "");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Arma el middleware leyendo usuario y contrasena de las variables de entorno indicadas,
// asi cada panel (el de turnos, el de la barberia) tiene sus propias credenciales.
export function crearAuthBasica(varUsuario, varClave, realm = "Panel de administracion") {
  return function (req, res, next) {
    const usuario = process.env[varUsuario];
    const clave = process.env[varClave];

    if (!usuario || !clave) {
      return res.status(500).send(`Falta configurar ${varUsuario} y ${varClave} en el servidor.`);
    }

    const header = req.get("authorization") || "";
    const [tipo, credenciales] = header.split(" ");

    if (tipo === "Basic" && credenciales) {
      // Se corta en el primer ":" (la contrasena si puede tener dos puntos).
      const texto = Buffer.from(credenciales, "base64").toString("utf8");
      const corte = texto.indexOf(":");
      const [u, p] = corte === -1 ? [texto, ""] : [texto.slice(0, corte), texto.slice(corte + 1)];
      if (comparar(u, usuario) && comparar(p, clave)) return next();
    }

    res.set("WWW-Authenticate", `Basic realm="${realm}"`);
    return res.status(401).send("Autenticacion requerida.");
  };
}

export const requireAdminAuth = crearAuthBasica("ADMIN_USER", "ADMIN_PASSWORD");
