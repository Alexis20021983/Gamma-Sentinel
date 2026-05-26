const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1/chat/completions';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/chat', async (req, res) => {
  const { message, context } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Falta el mensaje' });
  }

  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY no configurada' });
  }

  try {
    let systemInstruction = 'Sos GAMMA Sentinel, un asistente operativo y técnico de soporte para el ecosistema GAMMA. Responde en español, con claridad funcional y recomendaciones accionables.';
    let userContent = message.trim();

    if (context && context.trim()) {
      systemInstruction = `Sos GAMMA Sentinel, un asistente operativo y técnico de soporte para el ecosistema GAMMA.
Tu objetivo es responder a la pregunta del usuario utilizando EXCLUSIVAMENTE la información provista en la Base de Conocimiento a continuación.

REGLAS ESTRICTAS DE RESPUESTA:
1. Basa tu respuesta ÚNICAMENTE en la información de la Base de Conocimiento proporcionada.
2. Si la respuesta no se puede responder directamente o deducir con certeza a partir de la Base de Conocimiento provista, debes responder EXACTAMENTE con esta frase: "Lo siento, la información solicitada no se encuentra en la base de conocimiento del repositorio."
3. NO utilices tu conocimiento general o entrenamiento previo para inventar detalles, módulos, procedimientos o nombres que no estén explícitamente en el texto provisto. No inventes nada.
4. Responde siempre en español.`;

      userContent = `Base de Conocimiento:\n${context.trim()}\n\nPregunta: ${message.trim()}`;
    } else {
      systemInstruction = `Sos GAMMA Sentinel, un asistente operativo y técnico de soporte para el ecosistema GAMMA.
REGLA CRÍTICA: Responde en español. No inventes datos, números, módulos o procedimientos sobre el sistema GAMMA que no conozcas con absoluta certeza. Si la pregunta requiere detalles específicos del repositorio y no se proporcionó contexto, responde exactamente: "Lo siento, la información solicitada no se encuentra en la base de conocimiento del repositorio."`;
    }

    const response = await fetch(GROQ_BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: systemInstruction
          },
          { role: 'user', content: userContent }
        ]
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: payload?.error?.message || 'Error al consultar la IA'
      });
    }

    const reply = payload?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return res.status(502).json({ error: 'La IA no devolvió contenido utilizable' });
    }

    return res.json({ reply });
  } catch (error) {
    return res.status(500).json({
      error: error?.message || 'Error interno del backend'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
});
