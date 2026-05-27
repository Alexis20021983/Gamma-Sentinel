require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const app = express();

const PORT = process.env.PORT || 3000;

const GROQ_API_KEY = process.env.GROQ_API_KEY;

const GROQ_MODEL =
  process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

const GROQ_BASE_URL =
  'https://api.groq.com/openai/v1/chat/completions';

app.use(cors());

app.use(express.json());

/* ======================================================
   KNOWLEDGE PATH
====================================================== */

const KNOWLEDGE_DIR = path.join(
  __dirname,
  'GAMMA Sentinel',
  'knowledge',
  'files'
);

/* ======================================================
   MEMORY
====================================================== */

const knowledgeBase = [];

let backlogStats = {
  total: 0,
  abiertos: 0,
  cerrados: 0,
  modulos: {},
  estados: {},
  prioridades: {},
  topCasos: []
};

/* ======================================================
   CLEAN TEXT
====================================================== */

function cleanText(text = '') {
  return text
    .replace(/--- PÁGINA \d+ ---/gi, ' ')
    .replace(/===.*?===/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ======================================================
   SPLIT CHUNKS
====================================================== */

function splitChunks(text, size = 1400) {
  const chunks = [];

  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }

  return chunks;
}

/* ======================================================
   LOAD KNOWLEDGE FILES
====================================================== */

function loadKnowledge() {

  if (!fs.existsSync(KNOWLEDGE_DIR)) {

    console.log('❌ No existe knowledge/files');

    return;
  }

  const files = fs.readdirSync(KNOWLEDGE_DIR);

  files.forEach(file => {

    if (!file.endsWith('.txt')) return;

    try {

      const fullPath = path.join(KNOWLEDGE_DIR, file);

      const raw = fs.readFileSync(fullPath, 'utf-8');

      const content = cleanText(raw);

      knowledgeBase.push({
        file,
        content,
        chunks: splitChunks(content)
      });

      console.log(`✅ Archivo cargado: ${file}`);

    } catch (err) {

      console.error(`❌ Error leyendo ${file}`);

      console.error(err.message);
    }

  });

  console.log(`📚 Total documentos: ${knowledgeBase.length}`);
}

/* ======================================================
   LOAD BACKLOG XLSX
====================================================== */

function loadBacklogExcel() {

  try {

    const file = path.join(
      KNOWLEDGE_DIR,
      'Backlog Gamma Mantenimiento.xlsx'
    );

    if (!fs.existsSync(file)) {

      console.log('⚠️ No existe backlog XLSX');

      return;
    }

    const workbook = XLSX.readFile(file);

    const sheetName = workbook.SheetNames[0];

    const sheet = workbook.Sheets[sheetName];

    const data = XLSX.utils.sheet_to_json(sheet);

    backlogStats.total = data.length;

    data.forEach(row => {

      const estado =
        String(
          row['Estado'] ||
          row['Estado actual'] ||
          ''
        ).toLowerCase();

      const modulo =
        String(
          row['Componente'] ||
          row['Módulo'] ||
          'General'
        );

      const prioridad =
        String(
          row['Prioridad'] ||
          'Media'
        );

      if (
        estado.includes('abierto') ||
        estado.includes('backlog') ||
        estado.includes('desarrollo') ||
        estado.includes('qa')
      ) {
        backlogStats.abiertos++;
      }

      if (
        estado.includes('cerrado') ||
        estado.includes('finalizado')
      ) {
        backlogStats.cerrados++;
      }

      backlogStats.modulos[modulo] =
        (backlogStats.modulos[modulo] || 0) + 1;

      backlogStats.estados[estado] =
        (backlogStats.estados[estado] || 0) + 1;

      backlogStats.prioridades[prioridad] =
        (backlogStats.prioridades[prioridad] || 0) + 1;

    });

    backlogStats.topCasos = Object.entries(
      backlogStats.modulos
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    console.log('✅ Backlog XLSX cargado');

  } catch (err) {

    console.error('❌ Error backlog');

    console.error(err.message);
  }
}

/* ======================================================
   DETECT INTENT
====================================================== */

function detectIntent(q = '') {

  q = q.toLowerCase();

  if (
    q.includes('backlog') ||
    q.includes('casos') ||
    q.includes('jira') ||
    q.includes('incidencias')
  ) {
    return 'backlog';
  }

  if (
    q.includes('error') ||
    q.includes('falla') ||
    q.includes('problema') ||
    q.includes('diagnostico')
  ) {
    return 'diagnostico';
  }

  if (
    q.includes('qué es') ||
    q.includes('que es') ||
    q.includes('modulo') ||
    q.includes('módulo') ||
    q.includes('explicame') ||
    q.includes('explicame')
  ) {
    return 'funcional';
  }

  return 'general';
}

/* ======================================================
   SEARCH CONTEXT
====================================================== */

function searchContext(question, topK = 6) {

  const q = question.toLowerCase();

  const words = q
    .split(/\s+/)
    .filter(w => w.length > 2);

  const results = [];

  knowledgeBase.forEach(doc => {

    doc.chunks.forEach(chunk => {

      let score = 0;

      const chunkLower = chunk.toLowerCase();

      words.forEach(word => {

        if (chunkLower.includes(word)) {
          score += 2;
        }

      });

      if (
        chunkLower.includes(q)
      ) {
        score += 10;
      }

      if (score > 0) {

        results.push({
          file: doc.file,
          chunk,
          score
        });

      }

    });

  });

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/* ======================================================
   BUILD CONTEXT
====================================================== */

function buildContext(question) {

  const results = searchContext(question);

  if (!results.length) {
    return 'No se encontró información relevante.';
  }

  return results
    .map(r => {

      return `
Archivo: ${r.file}

${r.chunk}
`;

    })
    .join('\n\n');
}

/* ======================================================
   BACKLOG SUMMARY
====================================================== */

function buildBacklogSummary() {

  return `
Resumen general backlog:

Total de casos: ${backlogStats.total}

Casos abiertos: ${backlogStats.abiertos}

Casos cerrados: ${backlogStats.cerrados}

Módulos con más incidencias:
${backlogStats.topCasos
  .map(x => `- ${x[0]} (${x[1]})`)
  .join('\n')}
`;
}

/* ======================================================
   SYSTEM PROMPT
====================================================== */

function buildSystemPrompt(intent) {

  return `
Sos GAMMA Sentinel.

Tu tarea es responder utilizando únicamente
la documentación cargada del repositorio.

Productos conocidos:
- GAMMA
- NOA
- LoteMovil
- Ábaco

Módulos conocidos:
- Caja
- Liquidación
- Tesorería
- Calendario
- Usuarios
- Juegos
- Alertas
- Contabilidad
- Configuración

REGLAS:
- Nunca inventar información
- Responder en español
- Explicar funcionalmente
- Ser claro y técnico
- No copiar grandes bloques textuales
- Priorizar contexto encontrado
- Si no existe información suficiente indicarlo

TIPO RESPUESTA:
- funcional → explicar módulo
- backlog → resumen y métricas
- diagnostico → pasos técnicos
- general → respuesta contextual

Intent detectado: ${intent}
`;
}

/* ======================================================
   HEALTH
====================================================== */

app.get('/health', (_req, res) => {

  res.json({
    ok: true,
    knowledgeFiles: knowledgeBase.length,
    backlog: backlogStats.total
  });

});

/* ======================================================
   ROOT
====================================================== */

app.get('/', (_req, res) => {

  res.json({
    app: 'GAMMA Sentinel PRO',
    status: 'online'
  });

});

/* ======================================================
   CHAT
====================================================== */

app.post('/api/chat', async (req, res) => {

  try {

    const { message } = req.body;

    if (!message) {

      return res.status(400).json({
        error: 'Mensaje vacío'
      });

    }

    const intent = detectIntent(message);

    let context = '';

    if (intent === 'backlog') {

      context = buildBacklogSummary();

    } else {

      context = buildContext(message);

    }

    if (intent === 'diagnostico') {

      context += `

Guía técnica sugerida:
- Verificar logs
- Validar servicios
- Revisar configuración
- Buscar incidencias similares
- Confirmar impacto funcional
`;

    }

    if (context.length > 12000) {

      context = context.slice(0, 12000);

    }

    const system = buildSystemPrompt(intent);

    const response = await fetch(GROQ_BASE_URL, {

      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`
      },

      body: JSON.stringify({

        model: GROQ_MODEL,

        temperature: 0.2,

        messages: [

          {
            role: 'system',
            content: system
          },

          {
            role: 'user',
            content: `
Contexto:

${context}

Pregunta:

${message}

Respuesta:
`
          }

        ]

      })

    });

    const data = await response.json();

    console.log(JSON.stringify(data, null, 2));

    let reply =
      data?.choices?.[0]?.message?.content ||
      'No pude generar respuesta.';

    reply = cleanText(reply);

    return res.json({
      reply
    });

  } catch (err) {

    console.error(err);

    return res.status(500).json({
      error: err.message
    });

  }

});

/* ======================================================
   INIT
====================================================== */

loadKnowledge();

loadBacklogExcel();

/* ======================================================
   START
====================================================== */

app.listen(PORT, () => {

  console.log(`
🚀 GAMMA Sentinel PRO iniciado
📍 Puerto: ${PORT}
📚 Docs cargados: ${knowledgeBase.length}
📊 Casos backlog: ${backlogStats.total}
`);

});