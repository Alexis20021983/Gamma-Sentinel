# Pruebas de Excel

Coloca tus archivos de prueba `.xlsx` o `.xls` en esta carpeta para compararlos.

## Uso

Desde el directorio raíz del repositorio ejecuta:

```bash
npm run compare-excel
```

Si quieres usar otra carpeta, pasa la ruta como argumento:

```bash
npm run compare-excel -- "GAMMA Sentinel/excel-tests"
```

## Salida

El script genera un archivo JSON en:

- `GAMMA Sentinel/excel-tests/output/compare-result.json`

Ahí verás los resultados de la comparación entre los archivos.
