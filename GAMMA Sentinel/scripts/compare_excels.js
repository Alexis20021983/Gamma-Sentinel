const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DEFAULT_TEST_DIR = path.join(__dirname, '..', 'excel-tests');
const OUTPUT_DIR = path.join(DEFAULT_TEST_DIR, 'output');

const EXCEL_EXTENSIONS = ['.xlsx', '.xls'];

function resolveTestFolder() {
  const folderArg = process.argv[2];
  const folderPath = folderArg ? path.resolve(folderArg) : DEFAULT_TEST_DIR;
  return folderPath;
}

function normalizeCell(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\r|\n/g, ' ').trim();
}

function rowToString(row) {
  return row.map(normalizeCell).join(' | ');
}

function readExcelFile(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true, dateNF: 'yyyy-mm-dd' });
  const result = {};

  workbook.SheetNames.forEach((sheetName) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: ''
    });
    result[sheetName] = rows.map((row) => row.map(normalizeCell));
  });

  return result;
}

function listExcelFiles(folder) {
  return fs.readdirSync(folder)
    .filter((file) => EXCEL_EXTENSIONS.includes(path.extname(file).toLowerCase()))
    .map((file) => path.join(folder, file));
}

function compareRows(rowsA, rowsB) {
  const setA = new Set(rowsA.map(rowToString));
  const setB = new Set(rowsB.map(rowToString));

  const onlyInA = rowsA
    .map(rowToString)
    .filter((row) => !setB.has(row));
  const onlyInB = rowsB
    .map(rowToString)
    .filter((row) => !setA.has(row));

  return {
    countA: rowsA.length,
    countB: rowsB.length,
    onlyInA: onlyInA.slice(0, 20),
    onlyInB: onlyInB.slice(0, 20),
    totalDifferences: onlyInA.length + onlyInB.length
  };
}

function compareWorkbooks(fileA, fileB) {
  const workbookA = readExcelFile(fileA);
  const workbookB = readExcelFile(fileB);

  const sheetsA = Object.keys(workbookA);
  const sheetsB = Object.keys(workbookB);
  const allSheets = Array.from(new Set([...sheetsA, ...sheetsB]));

  const sheetComparisons = allSheets.map((sheetName) => {
    const rowsA = workbookA[sheetName] || [];
    const rowsB = workbookB[sheetName] || [];
    const summary = compareRows(rowsA, rowsB);

    return {
      sheetName,
      presentInA: sheetsA.includes(sheetName),
      presentInB: sheetsB.includes(sheetName),
      ...summary
    };
  });

  return {
    fileA: path.basename(fileA),
    fileB: path.basename(fileB),
    sheetCountA: sheetsA.length,
    sheetCountB: sheetsB.length,
    sheetComparisons,
    extraSheetsA: sheetsA.filter((name) => !sheetsB.includes(name)),
    extraSheetsB: sheetsB.filter((name) => !sheetsA.includes(name))
  };
}

function saveOutput(result) {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputPath = path.join(OUTPUT_DIR, 'compare-result.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
  return outputPath;
}

function main() {
  const testFolder = resolveTestFolder();

  if (!fs.existsSync(testFolder)) {
    console.error(`No existe la carpeta: ${testFolder}`);
    console.error('Crea la carpeta y coloca allí tus archivos .xlsx para comparar.');
    process.exit(1);
  }

  const files = listExcelFiles(testFolder);

  if (files.length === 0) {
    console.error(`No se encontraron archivos .xlsx o .xls en ${testFolder}`);
    process.exit(1);
  }

  console.log(`Carpeta de comparación: ${testFolder}`);
  console.log(`Archivos encontrados: ${files.map((f) => path.basename(f)).join(', ')}`);

  const comparisons = [];

  for (let i = 0; i < files.length; i += 1) {
    for (let j = i + 1; j < files.length; j += 1) {
      comparisons.push(compareWorkbooks(files[i], files[j]));
    }
  }

  const result = {
    folder: testFolder,
    fileCount: files.length,
    comparisons,
    generatedAt: new Date().toISOString()
  };

  const outputPath = saveOutput(result);

  console.log('Comparación completa.');
  console.log(`Resultado guardado en: ${outputPath}`);
  console.log('Abre el archivo JSON para revisar diferencias por hoja y por fila.');
}

main();
