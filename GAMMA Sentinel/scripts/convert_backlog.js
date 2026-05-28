const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const FILES_DIR = path.join(__dirname, '..', 'knowledge', 'files');
const excelPath = path.join(FILES_DIR, 'Backlog Gamma Mantenimiento.xlsx');
const txtPath = path.join(FILES_DIR, 'BacklogGammaMantenimiento.txt');

if (!fs.existsSync(excelPath)) {
  console.error(`Error: No se encontró el archivo Excel en ${excelPath}`);
  process.exit(1);
}

try {
  console.log(`Leyendo Excel: ${excelPath}`);
  const workbook = XLSX.readFile(excelPath);
  const textContent = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    // Obtener las filas como arrays de celdas
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    if (rows.length > 0) {
      textContent.push(`=== HOJA: ${sheetName} ===`);
      rows.forEach((row) => {
        // Limpiar cada celda reemplazando saltos de línea por espacios
        const rowData = row.map((cell) => {
          if (cell === null || cell === undefined) return '';
          return String(cell).replace(/\r/g, ' ').replace(/\n/g, ' ').trim();
        });
        
        // Agregar la fila si tiene al menos un dato
        if (rowData.some(cell => cell.length > 0)) {
          textContent.push(rowData.join(' | '));
        }
      });
      textContent.push(''); // Espacio entre hojas
    }
  });

  fs.writeFileSync(txtPath, textContent.join('\n'), 'utf8');
  console.log(`-> Convertido con éxito a: ${txtPath}`);
} catch (error) {
  console.error('Error al convertir el backlog:', error.message);
  process.exit(1);
}
