const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

/* =========================
   LIMPIEZA DE CONTEXTO
========================= */
function cleanContext(text) {
  if (!text) return '';

  return text
    .replace(/--- PÁGINA \d+ ---/gi, '')
    .replace(/===.*?===/g, '')
    .replace(/\|/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* =========================
   BACKLOG SUMMARY
========================= */
let backlogSummary = '';

function generateBacklogSummary() {
  try {
    const filePath = path.join(
      __dirname,
      'GAMMA Sentinel',
      'knowledge',
      'files',
      'BacklogGammaMantenimiento.txt'
    );

    if (!fs.existsSync(filePath)) return;

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    let total = 0;
    const statusCounts = {};
    const priorityCounts = {};
    const moduleCounts = {};

    lines.forEach((line) => {
      const parts = line.split(' | ');
      if (parts.length >= 13) {
        total++;

        const modulo = parts[7] || 'Desconocido';
        const prioridad = parts[11] || 'Desconocido';
        const estado = parts[12] || 'Desconocido';

        statusCounts[estado] = (statusCounts[estado] || 0) + 1;
        priorityCounts[prioridad] = (priorityCounts[prioridad] || 0) + 1;
        moduleCounts[modulo] = (moduleCounts[modulo] || 0) + 1;
      }
    });

    let summary = `Resumen del backlog:\n`;
    summary += `Total de casos: ${total}\n`;

    summary += `Estados: `;
    summary += Object.entries(statusCounts)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');

    summary += `\nPrioridades: `;
    summary += Object.entries(priorityCounts)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');

    summary += `\nMódulos más afectados: `;
    summary += Object.entries(moduleCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');

    backlogSummary = summary;
    console.log('✅ Backlog summary generado');
  } catch (err) {
    console.error('Error backlog:', err);
  }
}

generateBacklogSummary();

/* =========================
   HEALTH CHECK
========================= */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

/* =========================
   CHAT ENDPOINT
========================= */
app.post('/api/chat', async (req, res) => {
  const { message, context } = req.body || {};

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Falta el mensaje' });
  }

  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: 'API key no configurada' });
  }

  try {
    const cleanCtx = cleanContext(context || '');

    let combinedContext = cleanCtx;

    if (backlogSummary) {
      combinedContext =
        `Contexto de backlog:\n${backlogSummary}\n\n` + combinedContext;
    }

    const systemInstruction = `
Sos GAMMA Sentinel, un asistente experto en el sistema GAMMA.

Tu objetivo es:
- Explicar la información de forma clara y profesional
- Traducir contenido técnico en respuestas entendibles
- NO mostrar tablas crudas, logs o texto sin procesar
- Dar respuestas útiles y accionables

Si la información es parcial:
- Explica lo que se puede inferir
- No inventes datos inexistentes

Responde siempre en español.
`;

    const userContent = `
Contexto relevante:
${combinedContext}

Pregunta:
${message}

Respuesta clara:
`;

    const response = await fetch(GROQ_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userContent }
        ]
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: payload?.error?.message || 'Error IA'
      });
    }

    let reply = payload?.choices?.[0]?.message?.content || '';

    // Limpieza final
    reply = reply
      .replace(/---.*?---/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!reply) {
      reply = 'No se pudo generar una respuesta clara.';
    }

    return res.json({ reply });
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Error interno'
    });
  }
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`🚀 GAMMA Sentinel corriendo en puerto ${PORT}`);
});