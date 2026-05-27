const fs = require('fs');
const path = require('path');

const repoConfig = {
  owner: 'Alexis20021983',
  repo: 'Gamma-Sentinel',
  branch: 'main'
};

const knowledgeSources = [
  'README.md',
  'agent.mcs.yml',
  'settings.mcs.yml',
  'knowledge/files/BacklogGammaMantenimiento.txt',
  'knowledge/files/GAMMA-ManualdeUsuariov1.0.txt',
  'knowledge/files/LoteMovil-ManualdeUsuariov1.2.txt',
  'knowledge/files/LoteMovil-ManualdeAdministradorv1.2.txt',
  'knowledge/files/NOA-ManualdeUsuariov1.2.txt'
];

const stopWords = new Set([
  'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'este', 'o', 'ese', 'eso', 'aquello', 'estos', 'estas', 'es', 'son', 'unos', 'unas', 'mi', 'mis', 'tu', 'tus', 'yo', 'me', 'te', 'le', 'nos', 'os', 'les', 'qué', 'dónde', 'donde', 'cómo', 'como', 'cuándo', 'cuando', 'quién', 'quiénes', 'quien', 'quienes', 'cuál', 'cuáles', 'cual', 'cuales', 'hace', 'hacer', 'explicame', 'ayudame', 'dame', 'mostrame', 'genera', 'generá', 'pasame', 'saber', 'sobre'
]);

const removeAccents = (str) => {
  return str
    .replace(/[áàäâ]/g, 'a')
    .replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o')
    .replace(/[úùüû]/g, 'u');
};

const cleanText = (value) =>
  value
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/\uFEFF/g, '')
    .trim();

const normalizeText = (value) =>
  removeAccents(
    cleanText(value)
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúüñ\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );

const summarizeText = (value) => {
  const compact = cleanText(value).replace(/\n+/g, ' ');
  return compact.length > 300 ? `${compact.slice(0, 300).trim()}...` : compact;
};

const loadRepoKnowledge = () => {
  const loadedSections = [];
  const baseDir = path.join(__dirname, '..', 'GAMMA Sentinel');

  knowledgeSources.forEach((srcPath) => {
    const fullPath = path.join(baseDir, srcPath);
    if (!fs.existsSync(fullPath)) {
      console.log(`Warning: File not found ${srcPath}`);
      return;
    }
    const text = fs.readFileSync(fullPath, 'utf8');
    const clean = cleanText(text);
    if (!clean) return;

    // Improved split logic
    const sections = clean
      .split(/\n\s*\n+|(?=--- PÁGINA \d+ ---)|(?==== HOJA:)/i)
      .map((section) => section.trim())
      .filter(Boolean);

    sections.forEach((section) => {
      loadedSections.push({
        path: srcPath,
        text: section
      });
    });
  });

  return loadedSections;
};

const getRepoReply = (question, loadedKnowledge) => {
  const normalizedQuestion = normalizeText(question);
  const terms = normalizedQuestion
    .split(' ')
    .filter(Boolean)
    .filter((term) => term.length > 1 && !stopWords.has(term));

  console.log('Search terms:', terms);

  if (terms.length === 0) {
    return 'Te puedo ayudar con temas específicos...';
  }

  const scored = loadedKnowledge
    .filter((entry) => {
      const pathLower = entry.path.toLowerCase();
      return !pathLower.endsWith('.yml') && !pathLower.endsWith('.yaml') && !pathLower.includes('readme.md');
    })
    .map((entry) => {
      const normalizedText = normalizeText(entry.text);
      const matches = terms.filter((term) => normalizedText.includes(term)).length;

      return {
        entry,
        matches
      };
    })
    .filter((item) => item.matches > 0)
    .sort((a, b) => {
      if (b.matches !== a.matches) {
        return b.matches - a.matches;
      }
      // Prioritize manuals / base_conocimiento
      const aIsManual = a.entry.path.toLowerCase().includes('manual') || a.entry.path.toLowerCase().includes('base_conocimiento');
      const bIsManual = b.entry.path.toLowerCase().includes('manual') || b.entry.path.toLowerCase().includes('base_conocimiento');
      if (aIsManual && !bIsManual) return -1;
      if (!aIsManual && bIsManual) return 1;
      return 0;
    });

  if (scored.length === 0) {
    return 'No encontré una coincidencia directa.';
  }

  // Print top 5 matches for debugging
  console.log('\nTop 5 Matches:');
  scored.slice(0, 5).forEach((item, index) => {
    console.log(`${index + 1}. Path: ${item.entry.path} (Matches: ${item.matches})`);
    console.log(`   Snippet: ${summarizeText(item.entry.text).slice(0, 150)}...\n`);
  });

  const best = scored[0].entry;
  return `Basado en ${best.path}: ${summarizeText(best.text)}`;
};

const knowledge = loadRepoKnowledge();
console.log(`Loaded ${knowledge.length} sections in total.`);

const query = 'Qué hace el módulo Tesorería?';
console.log(`\nQuery: "${query}"`);
const reply = getRepoReply(query, knowledge);
console.log('FINAL BOT REPLY:\n', reply);
