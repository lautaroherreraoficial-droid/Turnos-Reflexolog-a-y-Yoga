import { google } from "googleapis";

// Una sola autenticacion de cuenta de servicio, compartida por Calendar y Sheets.
function getAuth() {
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });
}

const auth = getAuth();
const calendar = google.calendar({ version: "v3", auth });
const sheets = google.sheets({ version: "v4", auth });

// Devuelve los bloques ocupados del calendario entre dos fechas (ISO).
export async function getBusyTimes(timeMin, timeMax) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: [{ id: calendarId }],
    },
  });
  return res.data.calendars[calendarId]?.busy || []; // [{start, end}, ...]
}

// Crea el turno como evento de Google Calendar.
export async function createEvent({ resumen, descripcion, inicioISO, finISO, ubicacion }) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: resumen,
      description: descripcion,
      location: ubicacion,
      start: { dateTime: inicioISO },
      end: { dateTime: finISO },
    },
  });
  return res.data;
}

// Agrega una fila al final de una hoja (pestana) de la planilla.
export async function appendRow(sheetName, values) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [values] },
  });
}

// Lee todas las filas de una hoja (para mostrar comentarios en la web, por ejemplo).
export async function readRows(sheetName) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A1:Z1000`,
  });
  return res.data.values || [];
}
