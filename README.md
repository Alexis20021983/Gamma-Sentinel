# GAMMA Sentinel

GAMMA Sentinel reúne una biblioteca de manuales de usuario y una interfaz web
para consultarlos. Incluye un chat que busca en los documentos disponibles,
muestra índices y enlaces a páginas de PDF, y permite abrir directamente los
archivos de la biblioteca.

El repositorio también contiene archivos de configuración de un agente para
Copilot Studio. Esos archivos describen una configuración conversacional
independiente: no son el backend ni la fuente de respuestas del chat web.

## Índice

- [Qué hace el sistema](#qué-hace-el-sistema)
- [Arquitectura y flujo](#arquitectura-y-flujo)
- [Qué puede responder el chat](#qué-puede-responder-el-chat)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Biblioteca y actualización de documentos](#biblioteca-y-actualización-de-documentos)
- [Ejecución local](#ejecución-local)
- [API](#api)
- [Despliegue en Render](#despliegue-en-render)
- [Validación y utilidades](#validación-y-utilidades)
- [Copilot Studio](#copilot-studio)
- [Limitaciones y consideraciones](#limitaciones-y-consideraciones)

## Qué hace el sistema

- Ofrece una página web en español con la biblioteca de manuales y un chat.
- Permite consultar manuales de usuario de GAMMA, LoteMovil y NOA.
- Busca por coincidencia de palabras en archivos de texto y hojas de cálculo.
- Devuelve enlaces a documentos y, cuando hay información de páginas, permite
  abrir un PDF en una página concreta.
- Puede informar casos y métricas de backlog si se proporciona el archivo Excel
  de backlog esperado por el servidor.
- Incluye dictado de preguntas y lectura en voz alta mediante las funciones de
  voz disponibles en el navegador. También permite activar comandos por voz
  continuos: di «dictar pregunta», dicta la consulta y di «enviar»; para oír la
  respuesta más reciente, di «leer última respuesta». Di «limpiar chat» para
  borrar la conversación o «desactivar comandos por voz» para detener la escucha.

El chat web no genera respuestas con un modelo de lenguaje: el servidor aplica
reglas y búsqueda textual sobre los documentos cargados. Por eso, la respuesta
depende del contenido y formato de los archivos de la biblioteca.

## Arquitectura y flujo

El sistema web tiene tres partes:

1. **Frontend**: HTML, CSS y JavaScript sin framework, alojados en
   `GAMMA Sentinel/`. La página principal es `index.html`; `js/main.js` gestiona
   el chat, sus enlaces y las funciones de voz.
2. **API y servidor local**: `server.js`, con Node.js y Express. En ejecución
   local sirve también los archivos estáticos del frontend. En Render, la API y
   el sitio se publican como servicios separados.
3. **Biblioteca**: `GAMMA Sentinel/knowledge/`. El servidor lee los archivos al
   arrancar y mantiene los documentos procesables en memoria; no utiliza una
   base de datos.

Flujo de una consulta:

1. El usuario escribe o dicta una pregunta en el navegador.
2. `js/main.js` envía un `POST /api/chat` con el texto en formato JSON.
3. `server.js` evalúa reglas para casos, páginas, índices y selección de
   manuales; para otras consultas puntúa documentos por las palabras coincidentes.
4. La API devuelve una respuesta y, cuando corresponde, enlaces a los manuales o
   páginas.
5. El frontend presenta la respuesta y los enlaces. Los enlaces a PDF pueden
   abrir el visor integrado o el archivo original.

Cada petición al endpoint se procesa de forma independiente: la API no conserva
el historial de conversación entre mensajes.

## Qué puede responder el chat

Las reglas se evalúan en el servidor. Entre las consultas contempladas están:

- **Manuales**: pide, por ejemplo, `manual GAMMA`, `manual de usuario LoteMovil`
  o `manual NOA`. También puedes indicar tipo o versión si existe en la
  biblioteca.
- **Índices**: `índice del manual NOA`, `índice GAMMA` o `índice LoteMovil`.
  Las entradas disponibles se acompañan de enlaces a la página correspondiente.
- **Páginas**: `página 8 del manual de usuario LoteMovil` o una referencia a
  sección y página. El visor permite cambiar de página y abrir el PDF original.
- **Secciones de GAMMA**: hay descripciones y referencias específicas para
  secciones del manual GAMMA, como Alertas, Puntos de Ventas, Tesorería y Caja.
- **Casos**: si se carga un Excel de backlog, una clave como `GAMMA-123` busca
  el caso y muestra sus campos principales.
- **Backlog**: si se carga un Excel cuyo nombre incluye `backlog`, la consulta
  `backlog` muestra el total de filas y los estados abiertos y cerrados.
- **Búsqueda general**: si la consulta no coincide con esas reglas, el servidor
  busca palabras del mensaje en documentos `.txt` y hojas de Excel.

La búsqueda general es una coincidencia sencilla de palabras, no una búsqueda
semántica. Los documentos PDF se sirven y se pueden mostrar en el visor, pero el
servidor no extrae su texto durante la búsqueda: para indexar su contenido se
necesitan los archivos `.txt` correspondientes.

## Estructura del repositorio

```text
.
├── server.js                         # Servidor Express, carga de documentos y API
├── package.json                      # Dependencias y comandos npm
├── package-lock.json                 # Versiones fijadas para npm ci
├── render.yaml                       # Servicios de API y frontend en Render
├── .github/workflows/
│   └── validate-node.yml             # Validación de sintaxis en GitHub Actions
└── GAMMA Sentinel/
    ├── index.html                    # Sitio y biblioteca de manuales
    ├── pdf-viewer.html               # Interfaz del visor de páginas PDF
    ├── css/                          # Estilos del sitio y del visor
    ├── js/
    │   ├── config.js                 # URL del backend (vacía para ejecución local)
    │   ├── main.js                   # Chat y funciones de voz
    │   └── pdf-viewer.js             # Carga y renderizado del PDF
    ├── knowledge/                    # Documentos indexados por el servidor
    │   └── files/                    # Manuales y documentos de consulta
    ├── scripts/                      # Conversión, descarga y comparación de archivos
    ├── excel-tests/                  # Archivos para comparar libros Excel
    ├── topics/                       # Temas conversacionales de Copilot Studio
    ├── translations/                 # Traducciones de temas
    ├── agent.mcs.yml                 # Instrucciones del agente de Copilot Studio
    └── settings.mcs.yml              # Configuración del agente de Copilot Studio
```

## Biblioteca y actualización de documentos

El servidor recorre `GAMMA Sentinel/knowledge/` y sus subcarpetas al arrancar.
Reconoce archivos `.txt`, `.xlsx`, `.xls` y `.pdf`:

- **TXT**: se incorpora su contenido para la búsqueda textual. Algunos TXT de
  manuales pueden incluir marcadores como `--- PÁGINA 8 ---`; esos marcadores
  permiten extraer fragmentos de página y construir índices.
- **Excel**: cada hoja se convierte a filas de texto para buscar. Un libro Excel
  con nombre que contenga `backlog` también se utiliza para la búsqueda
  estructurada de casos y el resumen de estados.
- **PDF**: se registra para ofrecer enlaces y abrirlo en el sitio. No se extrae
  su texto para la búsqueda del chat.

Para agregar o actualizar documentación:

1. Coloca el archivo dentro de `GAMMA Sentinel/knowledge/` (normalmente en
   `knowledge/files/`).
2. Para hacer buscable un PDF, genera y agrega su TXT extraído, preservando los
   marcadores de página cuando se necesiten enlaces o extractos por página.
3. Comprueba que el nombre permite identificar el producto, el tipo de manual y
   la versión: el servidor usa esas palabras para escoger los documentos.
4. Reinicia el servidor local o despliega los cambios para volver a cargar la
   biblioteca.

El índice del PDF GAMMA v1.2 contiene una lista de páginas configurada en
`server.js`. Los índices de los otros manuales se obtienen de los TXT cuando
pueden reconocerse en su contenido. Si cambia un PDF o su paginación, revisa
también el TXT, los marcadores de página y la lista de índice correspondiente.

En la biblioteca incluida actualmente hay manuales PDF y TXT de GAMMA,
LoteMovil y NOA, además de un manual de administrador de LoteMovil, un Excel de
conocimiento GAMMA y un backlog en formato TXT. Como el backlog actual no es un
Excel, el resumen numérico y la búsqueda estructurada de casos no tienen datos
cargados hasta que se agregue un libro Excel de backlog.

## Ejecución local

Se recomienda Node.js 22, la versión utilizada por la validación automática del
repositorio.

```bash
npm ci
npm start
```

Abre <http://localhost:3000>. El servidor usa `PORT` si está definido en el
entorno y, en caso contrario, el puerto `3000`.

El frontend local llama a la API en el mismo origen. La configuración de
producción del frontend se genera durante el despliegue en Render.

No hace falta una clave de Groq para iniciar el servidor actual. Aunque los
archivos `.env.example` incluyen variables `GROQ_*` y `CORS_ORIGIN`, el
`server.js` vigente no las utiliza; la única variable de entorno que consulta es
`PORT`.

## API

### `GET /health`

Comprueba que el proceso responde y devuelve contadores de los datos cargados.
Los valores de este ejemplo dependen de los archivos presentes:

```json
{
  "ok": true,
  "backlog": 0,
  "docs": 8
}
```

`backlog` es la cantidad de filas del Excel de backlog encontrado y `docs` la
cantidad de entradas incorporadas a la base de conocimiento en memoria.

### `POST /api/chat`

Recibe JSON con el mensaje:

```json
{
  "message": "índice del manual NOA"
}
```

La respuesta contiene `reply` y, si hay documentos o páginas relacionados, una
lista `manuals` con objetos `{ "label": "...", "url": "..." }`. Si falta el
mensaje, responde con estado HTTP `400`; el resto de los resultados de consulta
se devuelve como JSON.

## Despliegue en Render

El archivo [`render.yaml`](render.yaml) define dos servicios:

- **`gamma-sentinel`**: servicio Node que ejecuta `npm ci` y `npm start`.
  Render utiliza `GET /health` como comprobación de salud.
- **`gamma-sentinel-site`**: sitio estático publicado desde `GAMMA Sentinel/`.
  Su comando de construcción escribe en `js/config.js` la URL pública de la API,
  agregando `.onrender.com` al host proporcionado por Render mediante
  `GAMMA_API_HOST`.

Para desplegar:

1. Conecta el repositorio a Render mediante **New + → Blueprint**.
2. Acepta la creación de los dos servicios definidos en `render.yaml`.
3. Espera a que ambos servicios estén disponibles y abre la URL del sitio
   estático.

La opción `autoDeploy` está activada en el Blueprint; la rama y la política
efectiva de despliegue se configuran en Render al conectar el repositorio. El
servicio estático llama a la API por su host público.

## Validación y utilidades

### Validación automática

El workflow [`.github/workflows/validate-node.yml`](.github/workflows/validate-node.yml)
se ejecuta en cambios a `main`, en pull requests y manualmente. Instala
dependencias con `npm ci` y verifica la sintaxis de `server.js` y los JavaScript
principales.

### Comparación de Excel

Coloca dos o más libros `.xlsx` o `.xls` en `GAMMA Sentinel/excel-tests/` y
ejecuta:

```bash
npm run compare-excel
```

También puedes indicar otra carpeta:

```bash
npm run compare-excel -- "GAMMA Sentinel/excel-tests"
```

El resultado se escribe en
`GAMMA Sentinel/excel-tests/output/compare-result.json`, con diferencias de
filas y hojas entre cada par de libros.

### Conversión y descarga de documentos

- `GAMMA Sentinel/scripts/convert_docs.py` extrae texto de PDF, DOCX y XLSX para
  los nombres de archivo contemplados en el propio script. Usa `pypdf`,
  `python-docx` y `openpyxl`.
- `GAMMA Sentinel/scripts/convert_backlog.js` convierte a texto un archivo Excel
  de backlog con el nombre esperado por el script.
- `GAMMA Sentinel/scripts/download-sharepoint-file.ps1` descarga un archivo de
  SharePoint mediante autenticación interactiva con PnP PowerShell. Revisa los
  parámetros del script y la ruta de destino antes de usarlo.

Estas utilidades no se ejecutan como parte del arranque web ni del despliegue
estándar, salvo que se las invoque expresamente.

## Copilot Studio

Los archivos `agent.mcs.yml`, `settings.mcs.yml`, `topics/` y `translations/`
son recursos de configuración conversacional para Copilot Studio. Incluyen
instrucciones, temas y traducciones del agente. El agente configurado allí puede
tener instrucciones y capacidades distintas del chat web.

El servidor Express no importa esos archivos: el chat de `index.html` usa
exclusivamente las reglas y documentos implementados en `server.js`. Para
publicar o modificar el agente de Copilot Studio, usa el proceso de importación
o publicación correspondiente a esa plataforma; desplegar la web en Render no
publica por sí mismo el agente.

## Limitaciones y consideraciones

- La búsqueda actual es por coincidencias de palabras; no es semántica ni usa
  un servicio de IA generativa en el backend web.
- Los PDF se sirven al navegador, pero el backend no los indexa directamente.
  Mantén TXT actualizados si se necesita buscar dentro de su contenido.
- El visor obtiene PDF.js desde jsDelivr; para renderizar páginas necesita
  acceso a ese CDN. El enlace al PDF original queda disponible como alternativa.
- La búsqueda de casos y los contadores de backlog necesitan un libro Excel cuyo
  nombre contenga `backlog`; si no existe, el chat no tendrá esos datos
  estructurados.
- Los índices y páginas dependen del texto extraído y de ciertas referencias
  configuradas en `server.js`; verifica los enlaces al actualizar los manuales.
- El dictado requiere permiso de micrófono y compatibilidad del navegador. La
  lectura en voz alta depende de las voces que ofrezca el dispositivo. El
  reconocimiento de voz puede utilizar servicios del navegador. Los comandos
  continuos solo escuchan después de activar «Activar comandos por voz» y se
  pueden detener desde el mismo botón o diciendo «desactivar comandos por voz».
  Para volver a activarlos se necesita pulsar el botón y conceder el permiso al
  micrófono.

## Créditos

Creado por Alexis Afonso - Tecno Accion La Pampa.
