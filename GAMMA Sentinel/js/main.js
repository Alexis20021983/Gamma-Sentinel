document.addEventListener('DOMContentLoaded', () => {

  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatMessages = document.getElementById('chatMessages');
  const sendBtn = document.getElementById('sendBtn');

  /* ======================================================
   CONFIG BACKEND
  ====================================================== */
  const getBackendUrl = () => {
    // Producción (GitHub Pages)
    if (window.__GAMMA_BACKEND_URL__) {
      return window.__GAMMA_BACKEND_URL__;
    }

    // Local (Node)
    return 'http://localhost:3000';
  };

  /* ======================================================
   AGREGAR MENSAJE
  ====================================================== */
  const addMessage = (type, text) => {
    const message = document.createElement('article');
    message.className = `message ${type}`;
    message.innerHTML = `<p>${text}</p>`;

    chatMessages.appendChild(message);

    // ✅ SIEMPRE SCROLL ABAJO
    chatMessages.scrollTop = chatMessages.scrollHeight;
  };

  /* ======================================================
   ENVÍO DE MENSAJE
  ====================================================== */
  const sendMessage = async () => {

    const question = chatInput.value.trim();
    if (!question) return;

    addMessage('user', question);
    chatInput.value = '';

    // mensaje temporal
    addMessage('bot', 'Consultando...');

    try {
      const backend = getBackendUrl();

      console.log('Conectando a:', backend);

      const response = await fetch(`${backend}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: question })
      });

      if (!response.ok) {
        throw new Error(`Error backend: ${response.status}`);
      }

      const data = await response.json();

      // eliminar "Consultando..."
      chatMessages.lastElementChild.remove();

      addMessage('bot', data.reply || 'Sin respuesta');

    } catch (error) {
      console.error('Error:', error);

      chatMessages.lastElementChild.remove();

      addMessage(
        'bot',
        'No se pudo conectar con el backend. Verificá que Railway esté activo o probá en local.'
      );
    }
  };

  /* ======================================================
   EVENTOS
  ====================================================== */

  // ✅ BOTÓN
  if (sendBtn) {
    sendBtn.addEventListener('click', sendMessage);
  }

  // ✅ ENTER EN INPUT
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      sendMessage();
    }
  });

  // ✅ EVITAR SUBMIT HTML (extra seguridad)
  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  }

});
