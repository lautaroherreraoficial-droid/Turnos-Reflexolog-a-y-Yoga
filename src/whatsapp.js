import axios from "axios";
import crypto from "crypto";

const GRAPH_VERSION = "v20.0";

function apiUrl() {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    "Content-Type": "application/json",
  };
}

// Manda un mensaje de texto simple
export async function sendText(to, body) {
  return axios.post(
    apiUrl(),
    { messaging_product: "whatsapp", to, type: "text", text: { body } },
    { headers: authHeaders() }
  );
}

// Manda hasta 3 botones (para elecciones cortas: si/no, forma de pago, etc)
export async function sendButtons(to, bodyText, buttons) {
  return axios.post(
    apiUrl(),
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: {
          buttons: buttons.map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    },
    { headers: authHeaders() }
  );
}

// Manda una lista desplegable (para elegir servicio, lugar u horario: mas de 3 opciones)
export async function sendList(to, bodyText, buttonText, rows) {
  return axios.post(
    apiUrl(),
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText },
        action: {
          button: buttonText.slice(0, 20),
          sections: [
            {
              title: "Opciones",
              rows: rows.map((r) => ({
                id: r.id,
                title: r.title.slice(0, 24),
                description: (r.description || "").slice(0, 72),
              })),
            },
          ],
        },
      },
    },
    { headers: authHeaders() }
  );
}

// Extrae el mensaje entrante de la forma cruda que manda Meta al webhook.
// Devuelve null si el payload no trae un mensaje de usuario (ej. es una notificacion de estado).
export function parseIncomingMessage(body) {
  try {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];
    if (!message) return null;

    const from = message.from; // numero del cliente
    let text = null;
    let selectedId = null;

    if (message.type === "text") {
      text = message.text.body;
    } else if (message.type === "interactive") {
      const interactive = message.interactive;
      if (interactive.type === "button_reply") {
        selectedId = interactive.button_reply.id;
        text = interactive.button_reply.title;
      } else if (interactive.type === "list_reply") {
        selectedId = interactive.list_reply.id;
        text = interactive.list_reply.title;
      }
    }

    return { from, text, selectedId, raw: message };
  } catch {
    return null;
  }
}

// Valida que el webhook realmente venga de Meta (firma HMAC con el App Secret).
export function verifySignature(rawBody, signatureHeader) {
  if (!process.env.WHATSAPP_APP_SECRET || !signatureHeader) return false;
  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", process.env.WHATSAPP_APP_SECRET)
      .update(rawBody)
      .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}
