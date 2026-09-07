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

export function requireAdminAuth(req, res, next) {
  const usuario = process.env.ADMIN_USER;
  const clave = process.env.ADMIN_PASSWORD;

  if (!usuario || !clave) {
    return res.status(500).send("Falta configurar ADMIN_USER y ADMIN_PASSWORD en el servidor.");
  }

  const header = req.get("authorization") || "";
  const [tipo, credenciales] = header.split(" ");

  if (tipo === "Basic" && credenciales) {
    const [u, p] = Buffer.from(credenciales, "base64").toString("utf8").split(":");
    if (comparar(u, usuario) && comparar(p, clave)) return next();
  }

  res.set("WWW-Authenticate", 'Basic realm="Panel de administracion"');
  return res.status(401).send("Autenticacion requerida.");
}
