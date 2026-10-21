require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_PASSWORD = process.env.SITE_PASSWORD;
const WEBSITE_DIR = path.join(__dirname, 'GAMMA Sentinel');

if (!SITE_PASSWORD) {
  throw new Error('SITE_PASSWORD es obligatorio para iniciar el servidor.');
}

function requireSitePassword(req, res, next) {
  if (req.method === 'GET' && req.path === '/health') {
    return next();
  }

  const credentialsHeader = req.get('authorization') || '';
  const credentialsMatch = /^Basic\s+([A-Za-z0-9+/]+={0,2})$/i.exec(credentialsHeader);
  const credentials = credentialsMatch
    ? Buffer.from(credentialsMatch[1], 'base64').toString('utf8')
    : '';
  const separatorIndex = credentials.indexOf(':');
  const username = separatorIndex >= 0 ? credentials.slice(0, separatorIndex) : '';
  const password = separatorIndex >= 0 ? credentials.slice(separatorIndex + 1) : '';
  const passwordMatches = crypto.timingSafeEqual(
    crypto.createHash('sha256').update(password).digest(),
    crypto.createHash('sha256').update(SITE_PASSWORD).digest()
  );

  if (username === 'gamma' && passwordMatches) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="GAMMA Sentinel", charset="UTF-8"');
  return res.status(401).send('Ingresa la clave compartida para acceder a GAMMA Sentinel.');
}

app.use(requireSitePassword);
app.use(cors());
app.use(express.json());
app.use(express.static(WEBSITE_DIR));

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
    if (['.txt', '.xlsx', '.xls', '.pdf'].includes(ext)) {
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

    if (ext === '.pdf') {
      knowledgeBase.push({ file, content: file, type: 'pdf' });
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
  return findSpecificManual(q);
}

function searchKnowledge(query) {
  const tokens = (query || '')
    .toLowerCase()
    .match(/\w+/g) || [];

  if (!tokens.length) return null;

  const results = knowledgeBase
    .filter(doc =>
      !doc.file.toLowerCase().includes('manual') || isUserManual(doc)
    )
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

function normalizeSearch(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseSectionPageRequest(text) {
  const query = String(text || '');
  const sectionMatch = query.match(/(.+?)\s*:\s*p[áa]gina\s*(\d+)/i);
  const pageMatch = sectionMatch || query.match(/\bp[áa]g(?:ina)?\.?\s*(\d+)\b/i);
  if (!pageMatch) return null;

  return {
    sectionName: sectionMatch ? normalizeSearch(sectionMatch[1].trim()) : '',
    page: parseInt(sectionMatch ? sectionMatch[2] : pageMatch[1], 10)
  };
}

function parseManualPagesFromText(doc) {
  if (doc.type !== 'text' || !doc.content) return;
  const lines = doc.content.split('\n');
  const pages = {};
  let currentPage = null;
  let buffer = [];

  lines.forEach(line => {
    const match = line.match(/^---\s*P[aá]gina\s+(\d+)\s*---/i);
    if (match) {
      if (currentPage !== null) {
        pages[currentPage] = buffer.join('\n').trim();
      }
      currentPage = parseInt(match[1], 10);
      buffer = [];
      return;
    }
    if (currentPage !== null) {
      buffer.push(line);
    }
  });

  if (currentPage !== null) {
    pages[currentPage] = buffer.join('\n').trim();
  }

  doc.manualPages = pages;
}

function getManualPageExcerptFromDoc(doc, page, length = 1000) {
  if (!doc || !page || !doc.file) return null;

  if (doc.type === 'text' && doc.manualPages && doc.manualPages[page]) {
    const content = doc.manualPages[page].trim();
    const excerpt = content.slice(0, length);
    const fileLabel = doc.file.replace(/\\/g, '/');
    return `Página ${page} de ${fileLabel}:\n\n${excerpt}${content.length > length ? '...' : ''}\n\nAbre el archivo: ${fileLabel}`;
  }

  return null;
}

function inferManualForSectionRequest(query, sectionRequest) {
  const specificManual = findSpecificManual(query);
  if (specificManual) return specificManual;

  const sectionText = sectionRequest?.sectionName || '';
  if (!sectionText) return null;

  const manuals = knowledgeBase.filter(doc =>
    doc.file.toLowerCase().includes('manual') && isUserManual(doc)
  );
  const matches = manuals.filter(doc => {
    if (!doc.manualIndex) return false;
    return doc.manualIndex.some(item => {
      const title = normalizeSearch(item.title);
      return title.includes(sectionText) || sectionText.includes(title) || item.page === sectionRequest.page;
    });
  });

  return matches.length ? matches[0] : manuals[0] || null;
}

function parseManualIndexWithPages(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const start = lines.findIndex(line =>
    normalizeSearch(line).replace(/\s+/g, '').includes('indice')
  );
  if (start === -1) return [];

  const indexLines = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^---\s*p[aá]gina/i.test(line) || /^manual de usuario/i.test(line)) break;
    indexLines.push(line);
  }

  const entries = [];
  let pendingTitles = [];
  let pendingPages = [];

  const flushPending = () => {
    pendingPages.forEach((page, idx) => {
      const title = pendingTitles[idx];
      if (title) {
        entries.push({ title, page });
      }
    });
    pendingTitles = [];
    pendingPages = [];
  };

  indexLines.forEach(line => {
    const onlyNumbers = line.match(/^\d+(?:\s+\d+)*$/);
    if (onlyNumbers) {
      pendingPages.push(...line.split(/\s+/).map(n => parseInt(n, 10)).filter(Boolean));
      if (pendingPages.length >= pendingTitles.length) flushPending();
      return;
    }

    const direct = line.match(/^[•\-*\s]*(.+?)\s*(\d+)$/);
    if (direct && direct[1].trim() && /[a-zA-ZñÑáéíóúÁÉÍÓÚüÜ]/.test(direct[1])) {
      const title = direct[1].trim();
      const page = parseInt(direct[2], 10);
      if (!Number.isNaN(page)) {
        pendingTitles.push(title);
        pendingPages.push(page);
        if (pendingPages.length >= pendingTitles.length) flushPending();
        return;
      }
    }

    pendingTitles.push(line.replace(/^[•\-*\s]+/, ''));
  });

  if (pendingTitles.length && pendingPages.length) flushPending();

  return entries.sort((a, b) => a.page - b.page);
}

function formatManualIndexWithPages(doc) {
  if (!doc.manualIndex || !doc.manualIndex.length) {
    return `No encontré índice con páginas para ${doc.file}`;
  }

  return `Índice de ${doc.file}:\n${doc.manualIndex.map(item => `- ${item.title}: página ${item.page}`).join('\n')}`;
}

function getManualIndexString(doc) {
  if (doc.manualIndex && doc.manualIndex.length) {
    return formatManualIndexWithPages(doc);
  }

  return getManualIndex(doc);
}

function buildManualIndexes() {
  const knownManualIndexes = {
    'files/GAMMA - Manual de Usuario v1.2.pdf': [
      { title: 'Introducción', page: 3 },
      { title: 'Ingreso al sistema', page: 4 },
      { title: 'Funcionalidades', page: 5 },
      { title: 'Alertas', page: 6 },
      { title: 'Puntos de Ventas', page: 7 },
      { title: 'Juegos', page: 8 },
      { title: 'Calendario', page: 10 },
      { title: 'Contabilidad', page: 11 },
      { title: 'Lotería', page: 16 },
      { title: 'Usuarios', page: 23 },
      { title: 'Liquidación', page: 24 },
      { title: 'Tesorería', page: 25 },
      { title: 'Descuentos y Bonificaciones', page: 31 },
      { title: 'Caja', page: 35 },
      { title: 'Configuración', page: 38 }
    ]
  };

  knowledgeBase.forEach(doc => {
    if (!doc.file.toLowerCase().includes('manual')) return;

    if (doc.type === 'text') {
      doc.manualIndex = parseManualIndexWithPages(doc.content);
      parseManualPagesFromText(doc);
      return;
    }

    if (knownManualIndexes[doc.file]) {
      doc.manualIndex = knownManualIndexes[doc.file];
    }
  });
}

function getManualIndexSources(manuals) {
  const groups = new Map();

  manuals.forEach(doc => {
    if (!doc.manualIndex?.length) return;

    const file = normalizeSearch(doc.file);
    const product = file.includes('lotemovil')
      ? 'lotemovil'
      : file.includes('noa')
        ? 'noa'
        : file.includes('gamma')
          ? 'gamma'
          : '';
    const role = file.includes('administrador') ? 'administrador' : 'usuario';
    const key = `${product}:${role}`;
    const current = groups.get(key);

    if (!current || (doc.type === 'pdf' && current.type !== 'pdf')) {
      groups.set(key, doc);
    }
  });

  return Array.from(groups.values());
}

function findCaseKey(text) {
  const match = text.match(/\b(?:GAMMA|MAN|SF|[A-Z]{2,})-\d+\b/i);
  return match ? match[0].toUpperCase() : null;
}

function formatManualReference(doc) {
  const label = doc.file.replace(/\\/g, '/');
  return `${label} (${doc.type === 'pdf' ? 'PDF' : 'TXT'})`;
}

function getManualLinks(manuals) {
  return manuals.map(doc => ({
    label: `${path.basename(doc.file)} (${doc.type === 'pdf' ? 'PDF' : 'TXT'})`,
    url: `/knowledge/${doc.file.split('/').map(encodeURIComponent).join('/')}`
  }));
}

function isUserManual(doc) {
  return normalizeSearch(doc.file).includes('usuario');
}

function getManualPageLinks(doc, page) {
  if (!Number.isInteger(page) || page < 1) return [];

  const manuals = knowledgeBase.filter(candidate =>
    candidate.file.toLowerCase().includes('manual') && isUserManual(candidate)
  );
  const normalizedFile = normalizeSearch(doc.file);
  const product = normalizedFile.includes('lotemovil')
    ? 'lotemovil'
    : normalizedFile.includes('noa')
      ? 'noa'
      : 'gamma';
  const role = normalizedFile.includes('administrador') ? 'administrador' : 'usuario';
  const version = normalizedFile.match(/\bv\d+[.,]\d+\b/);

  const pdfs = manuals.filter(candidate => {
    if (candidate.type !== 'pdf') return false;
    const file = normalizeSearch(candidate.file);
    return file.includes(product) &&
      file.includes(role);
  });
  const pdf = pdfs.find(candidate => {
    const file = normalizeSearch(candidate.file);
    return !version || file.includes(version[0].replace(',', '.'));
  }) || (pdfs.length === 1 ? pdfs[0] : null);
  const target = pdf || doc;
  const baseUrl = `/knowledge/${target.file.split('/').map(encodeURIComponent).join('/')}`;
  const pageUrl = pdf
    ? `/pdf-viewer.html?file=${encodeURIComponent(baseUrl)}&page=${page}`
    : baseUrl;

  return [{
    label: pdf
      ? `Abrir ${path.basename(pdf.file)} en la página ${page}`
      : `Abrir ${path.basename(doc.file)} (página ${page} en texto)`,
    url: pageUrl
  }];
}

function getManualIndexPageLinks(manuals) {
  return manuals.flatMap(doc => (doc.manualIndex || []).map(item => {
    const [link] = getManualPageLinks(doc, item.page);
    return { ...link, label: `${item.title}: página ${item.page}` };
  }));
}

function summarizeManualCategories(manuals) {
  const categories = {
    GAMMA: [],
    LoteMovil: [],
    NOA: []
  };

  manuals.forEach(doc => {
    const file = doc.file.toLowerCase();
    if (file.includes('gamma')) categories.GAMMA.push(formatManualReference(doc));
    else if (file.includes('lotemovil')) categories.LoteMovil.push(formatManualReference(doc));
    else if (file.includes('noa')) categories.NOA.push(formatManualReference(doc));
  });

  return Object.entries(categories)
    .filter(([, list]) => list.length)
    .map(([name, list]) => `${name}: ${list.join(', ')}`)
    .join('\n');
}

function findManualReferences(query) {
  const q = normalizeSearch(query);
  let candidates = knowledgeBase.filter(doc =>
    doc.file.toLowerCase().includes('manual') && isUserManual(doc)
  );

  if (!candidates.length) return [];

  const categories = [];
  if (q.includes('gamma') || q.includes('gama')) categories.push('gamma');
  if (q.includes('lote') || q.includes('movil')) categories.push('lotemovil');
  if (q.includes('noa')) categories.push('noa');

  if (categories.length) {
    candidates = candidates.filter(doc => {
      const file = normalizeSearch(doc.file);
      return categories.some(category => file.includes(category));
    });
  }

  if (q.includes('administrador') || q.includes('admin')) {
    candidates = candidates.filter(doc => normalizeSearch(doc.file).includes('administrador'));
  } else if (q.includes('usuario') || q.includes('user')) {
    candidates = candidates.filter(doc => normalizeSearch(doc.file).includes('usuario'));
  }

  const version = q.match(/\b1[.,]\d+\b/);
  if (version) {
    const requestedVersion = version[0].replace(',', '.');
    candidates = candidates.filter(doc => normalizeSearch(doc.file).includes(requestedVersion));
  }

  return candidates;
}

function findSpecificManual(query) {
  const q = query.toLowerCase();
  const manuals = knowledgeBase.filter(doc =>
    doc.file.toLowerCase().includes('manual') && isUserManual(doc)
  );

  if (!manuals.length) return null;

  const kind = q.includes('gamma') || q.includes('gama')
    ? 'gamma'
    : q.includes('lote') || q.includes('movil') || q.includes('lotemovil')
      ? 'lotemovil'
      : q.includes('noa')
        ? 'noa'
        : null;

  const candidates = kind
    ? manuals.filter(doc => doc.file.toLowerCase().includes(kind))
    : manuals;

  if (!candidates.length) return null;

  const requestedManuals = findManualReferences(query);
  if (requestedManuals.length) {
    return requestedManuals.find(doc => doc.type === 'text') || requestedManuals[0];
  }

  const normalizedQuery = normalizeSearch(query);
  const hasSpecificFilter =
    normalizedQuery.includes('administrador') ||
    normalizedQuery.includes('admin') ||
    normalizedQuery.includes('usuario') ||
    normalizedQuery.includes('user') ||
    /\b1[.,]\d+\b/.test(normalizedQuery);

  if (hasSpecificFilter) return null;

  return candidates.find(doc => doc.type === 'text') || candidates[0];
}

function getManualIndex(doc) {
  return doc.manualIndex?.length
    ? formatManualIndexWithPages(doc)
    : `No encontré índice con páginas para ${doc.file}`;
}

const manualSectionMap = {
  gamma: {
    alertas: {
      title: 'Alertas',
      description: 'Sección Alertas del manual GAMMA. Aquí se explica cómo visualizar y gestionar las alertas del sistema, las notificaciones de eventos y los estados de los PDV.',
      path: 'GAMMA Sentinel/knowledge/files/GAMMA - Manual de Usuario v1.2.pdf',
      page: 6
    },
    introduccion: {
      title: 'Introducción',
      description: 'Sección Introducción del manual GAMMA. Contiene el alcance del sistema, requisitos y conceptos generales.',
      path: 'GAMMA Sentinel/knowledge/files/GAMMA - Manual de Usuario v1.2.pdf',
      page: 3
    },
    'ingreso al sistema': {
      title: 'Ingreso al sistema',
      description: 'Sección Ingreso al sistema del manual GAMMA. Explica cómo iniciar sesión y los permisos asociados.',
      path: 'GAMMA Sentinel/knowledge/files/GAMMA - Manual de Usuario v1.2.pdf',
      page: 4
    },
    funcionalidades: {
      title: 'Funcionalidades',
      description: 'Sección Funcionalidades del manual GAMMA. Describe los módulos principales y las opciones del menú.',
      path: 'GAMMA Sentinel/knowledge/files/GAMMA - Manual de Usuario v1.2.pdf',
      page: 5
    },
    'puntos de ventas': {
      title: 'Puntos de Ventas',
      description: 'Sección Puntos de Ventas del manual GAMMA. Describe la gestión de puntos de venta y su control.',
      path: 'GAMMA Sentinel/knowledge/files/GAMMA - Manual de Usuario v1.2.pdf',
      page: 7
    },
    juegos: {
      title: 'Juegos',
      description: 'Sección Juegos del manual GAMMA. Explica la administración y consulta de juegos en el sistema.',
      path: 'GAMMA Sentinel/knowledge/files/GAMMA - Manual de Usuario v1.2.pdf',
      page: 8,
      content: `Son aquellos cuya propiedad 
pertenece a la Lotería.
Son operados por la lotería,
pero pertenecen a
diferentes proveedores.

JUEGOS PROPIOS
JUEGOS DE
TERCEROS JUEGOS

Cada juego se muestra
en una tarjeta e incluye:
- Nombre de juego.
- Próximo sorteo a cerrar.
`
    },
    calendario: {
      title: 'Calendario',
      description: 'Sección Calendario del manual GAMMA. Contiene la gestión de fechas, turnos y programación del sistema.',
      path: 'GAMMA Sentinel/knowledge/files/GAMMA - Manual de Usuario v1.2.pdf',
      page: 10
    },
    contabilidad: {
      title: 'Contabilidad',
      description: 'Sección Contabilidad del manual GAMMA. Describe los estados contables y los procesos de registro.',
      path: 'GAMMA Sentinel/knowledge/files/GAMMA - Manual de Usuario v1.2.pdf',
      page: 11
    },
    loteria: {
      title: 'Lotería',
      description: 'Sección Lotería del manual GAMMA. Explica los módulos específicos relacionados con juegos y sorteos.',
      path: 'GAMMA Sentinel/knowledge/files/GAMMA - Manual de Usuario v1.2.pdf',
      page: 16
    },
    usuarios: {
      title: 'Usuarios',
      description: 'Sección Usuarios del manual GAMMA. Describe la administración de usuarios y permisos.',
      path: 'GAMMA Sentinel/knowledge/files/GAMMA - Manual de Usuario v1.2.pdf',
      page: 23
    },
    liquidacion: {
      title: 'Liquidación',
      description: 'Sección Liquidación del manual GAMMA. Detalla el proceso de cierre y cálculo de liquidaciones.',
      path: 'GAMMA Sentinel/knowledge/files/GAMMA - Manual de Usuario v1.2.pdf',
      page: 24,
      content: `Este módulo permite generar las liquidaciones a los PDV (Puntos de Venta). El proceso se
compone de seis etapas:
1. En la etapa Datos, se visualizan los datos generales de liquidación, los mínimos
vigentes de débito y crédito y muestra la última liquidación con su saldo, también
permite cancelarla o exceptuar sorteos específicos.
2. En Reporte por Imputación, se organizan los movimientos contables agrupados por
tipo de operación, permitiendo verificar cómo impactan en las cuentas contables.
3. En Movimientos por Agencia, se desglosa el detalle financiero de cada punto de
venta.
4. Luego, en el Resumen de Obligaciones, se presenta una vista consolidada de los
montos que cada agencia debe abonar.
5. En la etapa Pagos, es la que nos permite la generación del archivo bancario en donde
seleccionamos las liquidaciones a incluir en dicho archivo.
6. Finalmente, en Archivos, se generan y almacenan los documentos exportables que
respaldan todo el proceso, integrables con otros sistemas contables o utilizados para
auditorías.`
    },
    tesoreria: {
      title: 'Tesorería',
      description: 'Sección Tesorería del manual GAMMA. Contiene información sobre las funciones financieras y la gestión de pagos y cobros.',
      path: 'GAMMA Sentinel/knowledge/files/GAMMA - Manual de Usuario v1.2.pdf',
      page: 25,
      content: `Este módulo permite gestionar de forma integral la
cancelación de resúmenes a través de archivos
bancarios. Está compuesto por cinco funciones
principales:
- Registración de cobros.
- Archivos de cobros generados.
- Panel de auditoría.
- Registración de pagos.
- Archivos de pagos generados.

Cada una enfocada en una etapa clave del proceso
financiero, veamos cómo funciona cada una de ellas.`
    },
    'descuentos y bonificaciones': {
      title: 'Descuentos y Bonificaciones',
      description: 'Sección Descuentos y Bonificaciones del manual GAMMA. Describe cómo gestionar descuentos, promociones y bonificaciones.',
      path: 'GAMMA Sentinel/knowledge/files/GAMMA - Manual de Usuario v1.2.pdf',
      page: 31
    },
    caja: {
      title: 'Caja',
      description: 'Sección Caja del manual GAMMA. Explica los procesos de control de caja y arqueo.',
      path: 'GAMMA Sentinel/knowledge/files/GAMMA - Manual de Usuario v1.2.pdf',
      page: 35
    },
    configuracion: {
      title: 'Configuración',
      description: 'Sección Configuración del manual GAMMA. Incluye parámetros y ajustes del sistema.',
      path: 'GAMMA Sentinel/knowledge/files/GAMMA - Manual de Usuario v1.2.pdf',
      page: 38
    }
  }
};

function findManualSection(query) {
  const q = normalizeSearch(query);
  const gammaSections = manualSectionMap.gamma;

  for (const key of Object.keys(gammaSections)) {
    if (q.includes(key)) {
      return gammaSections[key];
    }
  }

  return null;
}

function getManualSectionResponse(section) {
  const pageText = section.page ? `Página ${section.page}.\n\n` : '';
  const contentText = section.content ? `Contenido de la página:\n\n${section.content}\n\n` : '';
  return `Te llevo a la sección *${section.title}* del manual de usuario GAMMA.\n\n${pageText}${section.description}\n\n${contentText}Abre el archivo: ${section.path}`;
}

/* ======================================================
 CASOS (COPILOT)
====================================================== */
function findCase(question) {
  const key = findCaseKey(question);
  if (!key) return null;

  return backlogData.find(row =>
    String(row['Clave'] || row['ID'] || '')
      .toUpperCase()
      .includes(key)
  );
}

/* ======================================================
 API
====================================================== */

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
  const caseKey = findCaseKey(message);
  if (caseKey) {

    const c = findCase(message);

    if (!c) {
      return res.json({
        reply: 'No encontré ese caso en el backlog. Por favor verificá la clave exacta (ej: GAMMA-123).'
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
  const specificManual = findSpecificManual(message);
  const sectionRequest = parseSectionPageRequest(message);

  if (sectionRequest) {
    let pageQuery = message;
    const normalizedQuery = normalizeSearch(message);
    const indexedGammaSection = sectionRequest.sectionName &&
      manualSectionMap.gamma[sectionRequest.sectionName];

    if (indexedGammaSection) {
      pageQuery += ' GAMMA usuario';
    } else if (!normalizedQuery.includes('administrador') &&
        !normalizedQuery.includes('admin') &&
        !normalizedQuery.includes('usuario') &&
        !normalizedQuery.includes('user')) {
      pageQuery += ' usuario';
    }

    const requestedManuals = findManualReferences(pageQuery);
    const products = new Set(requestedManuals.map(doc => {
      const file = normalizeSearch(doc.file);
      return file.includes('lotemovil') ? 'LoteMovil' : file.includes('noa') ? 'NOA' : 'GAMMA';
    }));

    if (products.size > 1) {
      return res.json({
        reply: 'Indica de qué manual necesitas la página: GAMMA, LoteMovil o NOA.',
        manuals: []
      });
    }

    const manualForPage = inferManualForSectionRequest(pageQuery, sectionRequest);
    const excerpt = getManualPageExcerptFromDoc(manualForPage, sectionRequest.page, 1000);
    if (excerpt) {
      return res.json({
        reply: excerpt,
        manuals: getManualPageLinks(manualForPage, sectionRequest.page)
      });
    }

    const requestedSection = manualSectionMap.gamma[sectionRequest.sectionName];
    if (requestedSection && requestedSection.page === sectionRequest.page) {
      const legacyExcerpt = getManualPageExcerpt(requestedSection, 1000);
      if (legacyExcerpt) {
        const manualForLink = requestedManuals.find(doc => doc.type === 'pdf') ||
          requestedManuals.find(doc => doc.type === 'text');
        return res.json({
          reply: legacyExcerpt,
          manuals: manualForLink
            ? getManualPageLinks(manualForLink, sectionRequest.page)
            : []
        });
      }
    }

    if (manualForPage) {
      return res.json({
        reply: `Abre el manual ${path.basename(manualForPage.file)} en la página ${sectionRequest.page}.`,
        manuals: getManualPageLinks(manualForPage, sectionRequest.page)
      });
    }
  }

  const manualSection = findManualSection(message);

  if (manualSection && specificManual && specificManual.file.toLowerCase().includes('gamma')) {
    return res.json({
      reply: getManualSectionResponse(manualSection),
      manuals: getManualLinks(findManualReferences(message))
    });
  }

  if (q.includes('indice') || q.includes('índice')) {
    const manuals = findManualReferences(message);
    const hasManualFilter =
      /gamma|gama|lote|movil|noa|administrador|admin|usuario|user/.test(normalizeSearch(message)) ||
      /\b1[.,]\d+\b/.test(normalizeSearch(message));
    const indexSources = getManualIndexSources(manuals.length
      ? manuals
      : hasManualFilter
        ? []
        : knowledgeBase.filter(doc =>
          doc.file.toLowerCase().includes('manual') && isUserManual(doc)
        ));

    if (indexSources.length) {
      return res.json({
        reply: indexSources.map(formatManualIndexWithPages).join('\n\n'),
        manuals: getManualIndexPageLinks(indexSources)
      });
    }

    return res.json({
      reply: 'No encontré ese índice entre los manuales de usuario. Indica si buscas GAMMA, LoteMovil o NOA.',
      manuals: []
    });
  }

  if (q.includes('manual')) {
    const refs = findManualReferences(message);
    if (!refs.length) {
      return res.json({
        reply: 'No encontré un manual que coincida con ese producto, tipo o versión. Pregunta por GAMMA, LoteMovil o NOA.',
        manuals: []
      });
    }

    const categoriesText = summarizeManualCategories(refs);

    return res.json({
      reply: `Manuales de usuario disponibles:\n${categoriesText}\n\nSelecciona un enlace para abrir el documento o pregunta por una sección específica.`,
      manuals: getManualLinks(refs)
    });
  }

  const manual = detectManual(q);

  if (manual) {
    return res.json({
      reply: getManualIndexString(manual),
      manuals: getManualLinks(findManualReferences(message))
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

    const manuals = findManualReferences(message);
    const manualsText = manuals.length
      ? `\n\nManuales relacionados:\n- ${manuals.map(formatManualReference).join('\n- ')}`
      : '';

    return res.json({
      reply: `Consulta basada en ${label}:

${knowledgeResult.excerpt}${manualsText}`,
      manuals: getManualLinks(manuals)
    });
  }

  /* ===== DEFAULT ===== */
  return res.json({
    reply: 'No encontré esa información en los manuales de usuario. Prueba indicando GAMMA, LoteMovil o NOA y el tema que buscas.'
  });
});

/* ======================================================
 INIT
====================================================== */
loadKnowledge();
buildManualIndexes();
loadBacklogExcel();

/* ======================================================
 START
====================================================== */
app.listen(PORT, () => {
  console.log(`🚀 Servidor en ${PORT}`);
});