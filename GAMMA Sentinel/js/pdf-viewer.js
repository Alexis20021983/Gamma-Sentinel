const PDFJS_VERSION = '4.10.38';
const params = new URLSearchParams(window.location.search);
const requestedFile = params.get('file');
const requestedPage = Number.parseInt(params.get('page') || '1', 10);
const status = document.getElementById('viewerStatus');
const pageInput = document.getElementById('pageNumber');
const pageCount = document.getElementById('pageCount');
const canvas = document.getElementById('pdfPage');
const context = canvas.getContext('2d');
const previousButton = document.getElementById('previousPage');
const nextButton = document.getElementById('nextPage');
const pageForm = document.getElementById('pageForm');
let pdfDocument;
let currentPage;
let renderTask;
let renderSequence = 0;

function setStatus(message) {
  status.textContent = message;
}

function updateControls() {
  pageInput.value = String(currentPage);
  previousButton.disabled = currentPage <= 1;
  nextButton.disabled = !pdfDocument || currentPage >= pdfDocument.numPages;
}

async function renderPage(pageNumber) {
  if (!pdfDocument || pageNumber < 1 || pageNumber > pdfDocument.numPages) return;

  currentPage = pageNumber;
  updateControls();
  setStatus(`Cargando página ${pageNumber} de ${pdfDocument.numPages}…`);

  const sequence = ++renderSequence;
  if (renderTask) renderTask.cancel();
  let task;

  try {
    const page = await pdfDocument.getPage(pageNumber);
    if (sequence !== renderSequence) return;

    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(
      (document.querySelector('.page-container').clientWidth || window.innerWidth) / baseViewport.width,
      1.5
    );
    const viewport = page.getViewport({ scale });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.ceil(viewport.width * pixelRatio);
    canvas.height = Math.ceil(viewport.height * pixelRatio);
    canvas.style.width = `${Math.ceil(viewport.width)}px`;
    canvas.style.height = `${Math.ceil(viewport.height)}px`;
    canvas.style.display = 'block';
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    task = page.render({ canvasContext: context, viewport });
    renderTask = task;
    await task.promise;
    if (sequence === renderSequence) setStatus(`Página ${pageNumber} de ${pdfDocument.numPages}`);
  } catch (error) {
    if (error.name !== 'RenderingCancelledException') throw error;
  } finally {
    if (renderTask === task) renderTask = null;
  }
}

function goToPage(value) {
  const page = Number.parseInt(value, 10);
  if (!Number.isInteger(page) || page < 1 || page > pdfDocument.numPages) {
    setStatus(`Escribe un número de página entre 1 y ${pdfDocument.numPages}.`);
    return;
  }
  renderPage(page).catch(error => {
    console.error('No se pudo mostrar la página del manual:', error);
    setStatus('No se pudo mostrar esta página. Prueba volver a cargar el visor.');
  });
}

async function loadViewer() {
  if (!requestedFile || !Number.isInteger(requestedPage) || requestedPage < 1) {
    setStatus('El enlace al manual o el número de página no es válido.');
    return;
  }

  let pdfUrl;
  try {
    pdfUrl = new URL(requestedFile, window.location.origin);
  } catch {
    setStatus('El enlace al manual no es válido.');
    return;
  }

  if (pdfUrl.origin !== window.location.origin ||
      !pdfUrl.pathname.startsWith('/knowledge/') ||
      !/\.pdf$/i.test(pdfUrl.pathname)) {
    setStatus('Solo se pueden abrir archivos PDF de la biblioteca.');
    return;
  }

  document.getElementById('originalPdf').href = pdfUrl.href;
  document.getElementById('documentTitle').textContent =
    decodeURIComponent(pdfUrl.pathname.split('/').pop()).replace(/[-_]/g, ' ');

  try {
    const pdfjs = await import(
      `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`
    );
    pdfjs.GlobalWorkerOptions.workerSrc =
      `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
    pdfDocument = await pdfjs.getDocument({ url: pdfUrl.href }).promise;
    pageInput.max = String(pdfDocument.numPages);
    pageCount.textContent = `de ${pdfDocument.numPages}`;

    if (requestedPage > pdfDocument.numPages) {
      currentPage = pdfDocument.numPages;
      updateControls();
      setStatus(`El manual tiene ${pdfDocument.numPages} páginas; no existe la página ${requestedPage}.`);
      return;
    }

    await renderPage(requestedPage);
  } catch (error) {
    console.error('No se pudo cargar el visor de PDF:', error);
    setStatus('No se pudo cargar el visor. Usa “Abrir PDF original” para abrir el documento.');
  }
}

pageForm.addEventListener('submit', event => {
  event.preventDefault();
  if (pdfDocument) goToPage(pageInput.value);
});

previousButton.addEventListener('click', () => goToPage(currentPage - 1));
nextButton.addEventListener('click', () => goToPage(currentPage + 1));

let resizeTimer;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (pdfDocument && currentPage) goToPage(currentPage);
  }, 150);
});

loadViewer();
