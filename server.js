const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1/chat/completions';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

let backlogSummary = '';

function generateBacklogSummary() {
  try {
    const filePath = path.join(__dirname, 'GAMMA Sentinel', 'knowledge', 'files', 'BacklogGammaMantenimiento.txt');
    if (!fs.existsSync(filePath)) {
      console.log('Archivo de backlog no encontrado en: ' + filePath);
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    let total = 0;
    const statusCounts = {};
    const priorityCounts = {};
    const moduleCounts = {};
    const clientCounts = {};

    lines.forEach(line => {
      const parts = line.split(' | ');
      if (parts.length >= 13) {
        const tipo = parts[0].trim();
        if (tipo === 'Tarea' || tipo === 'Subtarea' || tipo === 'Error' || parts[1].trim().startsWith('MAN-')) {
          total++;
          
          const cliente = parts[6] ? parts[6].trim() : 'Desconocido';
          const modulo = parts[7] ? parts[7].trim() : 'Desconocido';
          const prioridad = parts[11] ? parts[11].trim() : 'Desconocido';
          const estado = parts[12] ? parts[12].trim() : 'Desconocido';

          statusCounts[estado] = (statusCounts[estado] || 0) + 1;
          priorityCounts[prioridad] = (priorityCounts[prioridad] || 0) + 1;
          moduleCounts[modulo] = (moduleCounts[modulo] || 0) + 1;
          clientCounts[cliente] = (clientCounts[cliente] || 0) + 1;
        }
      }
    });

    if (total === 0) return;

    let summary = `RESUMEN ESTADÍSTICO DEL BACKLOG DE MANTENIMIENTO (Jira):\n`;
    summary += `- Total de tickets/casos en el backlog: ${total}\n\n`;
    
    summary += `- Casos por Estado:\n`;
    for (const [status, count] of Object.entries(statusCounts)) {
      summary += `  * ${status}: ${count}\n`;
    }
    
    summary += `\n- Casos por Módulo/Componente (Top 10 más comprometidos):\n`;
    const sortedModules = Object.entries(moduleCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [mod, count] of sortedModules) {
      summary += `  * ${mod}: ${count} casos\n`;
    }

    summary += `\n- Casos por Prioridad:\n`;
    for (const [prio, count] of Object.entries(priorityCounts)) {
      summary += `  * ${prio}: ${count}\n`;
    }

    summary += `\n- Casos por Cliente/Provincia (Top 5):\n`;
    const sortedClients = Object.entries(clientCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [cli, count] of sortedClients) {
      summary += `  * ${cli}: ${count}\n`;
    }

    backlogSummary = summary;
    console.log('Resumen de backlog generado con éxito.');
  } catch (error) {
    console.error('Error generando resumen de backlog:', error);
  }
}

// Generar el resumen de estadísticas al arrancar
generateBacklogSummary();

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

    // Inyectar estadísticas y resumen general del backlog en el contexto
    let combinedContext = context || '';
    if (backlogSummary) {
      combinedContext = `ESTADÍSTICAS Y RESUMEN GENERAL DEL BACKLOG (Utiliza estos datos para responder preguntas generales de totales, conteos por estado, prioridades o módulos comprometidos):\n${backlogSummary}\n\n${combinedContext}`;
    }

    if (combinedContext && combinedContext.trim()) {
      systemInstruction = `Sos GAMMA Sentinel, un asistente operativo y técnico de soporte para el ecosistema GAMMA.
Tu objetivo es responder a la pregunta del usuario utilizando EXCLUSIVAMENTE la información provista en la Base de Conocimiento a continuación.

REGLAS ESTRICTAS DE RESPUESTA:
1. Basa tu respuesta ÚNICAMENTE en la información de la Base de Conocimiento proporcionada.
2. Si la respuesta no se puede responder directamente o deducir con certeza a partir de la Base de Conocimiento provista, debes responder EXACTAMENTE con esta frase: "Lo siento, la información solicitada no se encuentra en la base de conocimiento del repositorio."
3. NO utilices tu conocimiento general o entrenamiento previo para inventar detalles, módulos, procedimientos o nombres que no estén explícitamente en el texto provisto. No inventes nada.
4. Responde siempre en español.`;

      userContent = `Base de Conocimiento:\n${combinedContext.trim()}\n\nPregunta: ${message.trim()}`;
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
