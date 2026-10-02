// Servidor propio del turnero de Barberia Lux: `npm run barberia`.
// Pagina de turnos en "/", panel de la barberia en "/admin".
import "dotenv/config";
import express from "express";
import { crearBarberia } from "./app.js";

const app = express();
app.set("trust proxy", 1); // detras del proxy de Render, para que req.ip sea la IP real del cliente
app.use(crearBarberia());

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Barberia Lux escuchando en http://localhost:${PORT}`));
