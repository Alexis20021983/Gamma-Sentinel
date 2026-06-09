require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* ======================================================
 PATH
====================================================== */
const KNOWLEDGE_DIR = path.join(
  __dirname,
  'GAMMA Sentinel',
  'knowledge',
  'files'
);

/* ======================================================
 STORAGE
====================================================== */
const knowledgeBase = [];
let backlogStats = {
  total: 0,
  abiertos: 0,
  cerrados: 0
};

/* ======================================================
 LOAD KNOWLEDGE
====================================================== */
function loadKnowledge() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.log('❌ No existe carpeta knowledge');
    return;
  }

  const files = fs.readdirSync(KNOWLEDGE_DIR);

  files.forEach(file => {
    if (!file.endsWith('.txt')) return;

    const content = fs.readFileSync(
      path.join(KNOWLEDGE_DIR, file),
      'utf-8'
    );

    knowledgeBase.push({ file, content });
  });

  console.log(`📚 Docs cargados: ${knowledgeBase.length}`);
}

/* ======================================================
 BACKLOG XLS
====================================================== */
let backlogData = [];

function loadBacklogExcel() {
  try {
    const file = path.join(
      KNOWLEDGE_DIR,
      'Backlog Gamma Mantenimiento.xlsx'
    );

    if (!fs.existsSync(file)) {
      console.log('⚠️ No existe backlog XLS');
      return;
    }

    const workbook = XLSX.readFile(file);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    backlogData = XLSX.utils.sheet_to_json(sheet);

    backlogStats.total = backlogData.length;

    backlogData.forEach(r => {
      const estado = String(r['Estado'] || r['Estado actual'] || '').toLowerCase();

      if (estado.includes('abierto')) backlogStats.abiertos++;
      if (estado.includes('cerrado')) backlogStats.cerrados++;
    });

    console.log('✅ Backlog cargado');
  } catch (e) {
    console.log('❌ Error cargando backlog:', e.message);
  }
}

/* ======================================================
 MANUALES
====================================================== */
function detectManual(q) {
  q = q.toLowerCase();

  if (q.includes('lote') || q.includes('movil') || q.includes('lotemovil')) {
    return knowledgeBase.find(d =>
      d.file.toLowerCase().includes('lotemovil')
    );
  }

  if (q.includes('gamma')) {
    return knowledgeBase.find(d =>
      d.file.toLowerCase().includes('gamma')
    );
  }

  if (q.includes('noa')) {
    return knowledgeBase.find(d =>
      d.file.toLowerCase().includes('noa')
    );
  }

  return null;
}

function extractManualIndex(text) {
  const lines = text.split('\n');

  let capture = false;
  const index = [];

  lines.forEach(l => {
    const t = l.toLowerCase();

    if (t.includes('indice')) {
      capture = true;
      return;
    }

    if (capture && index.length < 20) {
      if (!l.trim()) return;
      index.push(l.trim());
    }
  });

  return index;
}

/* ======================================================
 CASOS (COPILOT)
====================================================== */
function findCase(question) {
  const match = question.match(/[a-z]*-?\d+/i);

  if (!match) return null;

  const key = match[0].toLowerCase();

  return backlogData.find(row =>
    String(row['Clave'] || row['ID'] || '')
      .toLowerCase()
      .includes(key)
  );
}

/* ======================================================
 API
====================================================== */

/* ✅ ROOT (nuevo) */
app.get('/', (req, res) => {
  res.json({
    app: 'GAMMA Sentinel PRO',
    status: 'online'
  });
});

/* ✅ HEALTH (FIX CRÍTICO) */
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    backlog: backlogStats.total,
    docs: knowledgeBase.length
  });
});

/* ======================================================
 CHAT
====================================================== */
app.post('/api/chat', (req, res) => {

  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ reply: 'Mensaje vacío' });
  }

  const q = message.toLowerCase();

  /* ===== CASOS ===== */
  if (q.includes('caso') || q.match(/[a-z]*-?\d+/)) {

    const c = findCase(message);

    if (!c) {
      return res.json({
        reply: 'Por favor especificá la clave del caso (ej: GAMMA-123)'
      });
    }

    return res.json({
      reply: `
Caso: ${c['Clave'] || c['ID']}

Título: ${c['Resumen'] || c['Título']}
Estado: ${c['Estado']}

Descripción:
${c['Descripción'] || 'Sin descripción'}
`
    });
  }

  /* ===== MANUALES ===== */
  const manual = detectManual(q);

  if (manual) {
    const idx = extractManualIndex(manual.content);

    let name = 'Manual';

    if (manual.file.toLowerCase().includes('lote')) name = 'LoteMovil';
    if (manual.file.toLowerCase().includes('gamma')) name = 'GAMMA';
    if (manual.file.toLowerCase().includes('noa')) name = 'NOA';

    return res.json({
      reply: `Índice del manual de ${name}:\n\n${idx.join('\n')}`
    });
  }

  /* ===== BACKLOG ===== */
  if (q.includes('backlog')) {
    return res.json({
      reply: `
Resumen backlog:

Total: ${backlogStats.total}
Abiertos: ${backlogStats.abiertos}
Cerrados: ${backlogStats.cerrados}
`
    });
  }

  /* ===== DEFAULT ===== */
  return res.json({
    reply: 'Consulta no reconocida. Probá con manual, caso o backlog.'
  });
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
  console.log(`🚀 Servidor en ${PORT}`);
});