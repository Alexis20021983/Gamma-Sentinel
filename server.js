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
  'knowledge'
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
 COMMON HELPERS
====================================================== */
function normalizeCell(value) {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}

function normalizeText(text = '') {
  return String(text)
    .replace(/\r/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

function readExcelAsText(filePath, fileName) {
  const workbook = XLSX.readFile(filePath, {
    cellDates: true,
    dateNF: 'yyyy-mm-dd'
  });

  workbook.SheetNames.forEach(sheetName => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: ''
    });

    const lines = rows
      .map(row => row.map(normalizeCell).join(' | '))
      .filter(line => line.trim().length > 0);

    const content = [
      `=== EXCEL: ${fileName}`,
      `=== HOJA: ${sheetName}`,
      ...lines
    ].join('\n');

    knowledgeBase.push({
      file: fileName,
      sheet: sheetName,
      type: 'excel',
      content
    });
  });
}

/* ======================================================
 LOAD KNOWLEDGE
====================================================== */
function walkKnowledgeDir(directory) {
  const filePaths = [];

  if (!fs.existsSync(directory)) return filePaths;

  const entries = fs.readdirSync(directory, { withFileTypes: true });

  entries.forEach(entry => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      filePaths.push(...walkKnowledgeDir(fullPath));
      return;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (['.txt', '.xlsx', '.xls'].includes(ext)) {
      filePaths.push(fullPath);
    }
  });

  return filePaths;
}

function loadKnowledge() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.log('❌ No existe carpeta knowledge');
    return;
  }

  const files = walkKnowledgeDir(KNOWLEDGE_DIR);

  files.forEach(fullPath => {
    const ext = path.extname(fullPath).toLowerCase();
    const relativePath = path.relative(KNOWLEDGE_DIR, fullPath);
    const file = relativePath.replace(/\\/g, '/');

    if (ext === '.txt') {
      const content = fs.readFileSync(fullPath, 'utf-8');
      knowledgeBase.push({ file, content, type: 'text' });
      return;
    }

    if (ext === '.xlsx' || ext === '.xls') {
      try {
        readExcelAsText(fullPath, file);
        return;
      } catch (err) {
        console.error(`❌ Error leyendo Excel ${file}:`, err.message);
      }
    }
  });

  console.log(`📚 Docs cargados: ${knowledgeBase.length}`);
}

/* ======================================================
 BACKLOG XLS
====================================================== */
let backlogData = [];

function findBacklogExcelFile() {
  const allFiles = walkKnowledgeDir(KNOWLEDGE_DIR);
  return allFiles.find(filePath =>
    path.basename(filePath).toLowerCase().includes('backlog') &&
    ['.xlsx', '.xls'].includes(path.extname(filePath).toLowerCase())
  );
}

function loadBacklogExcel() {
  try {
    const file = findBacklogExcelFile();

    if (!file) {
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

    console.log('✅ Backlog cargado:', path.relative(KNOWLEDGE_DIR, file));
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

function searchKnowledge(query) {
  const tokens = (query || '')
    .toLowerCase()
    .match(/\w+/g) || [];

  if (!tokens.length) return null;

  const results = knowledgeBase
    .map(doc => {
      const text = doc.content.toLowerCase();
      const score = tokens.reduce((acc, token) => {
        return acc + (text.includes(token) ? 1 : 0);
      }, 0);

      return { doc, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!results.length) return null;

  const match = results[0];
  const lowerQuery = query.toLowerCase();
  const excerpt = match.doc.content
    .split('\n')
    .filter(line =>
      tokens.some(token => line.toLowerCase().includes(token))
    )
    .slice(0, 10)
    .join('\n');

  return {
    doc: match.doc,
    excerpt: excerpt || match.doc.content.slice(0, 400)
  };
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

  /* ===== EXCEL / DOCUMENTOS ===== */
  const knowledgeResult = searchKnowledge(message);

  if (knowledgeResult) {
    const label = knowledgeResult.doc.type === 'excel'
      ? `Excel ${knowledgeResult.doc.file} - hoja ${knowledgeResult.doc.sheet}`
      : knowledgeResult.doc.file;

    return res.json({
      reply: `Consulta basada en ${label}:

${knowledgeResult.excerpt}`
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