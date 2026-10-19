document.addEventListener('DOMContentLoaded', () => {

  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatMessages = document.getElementById('chatMessages');
  const clearChatBtn = document.getElementById('clearChatBtn');
  const initialGreeting = '¡Hola! Puedo ayudarte a consultar los manuales de usuario. Prueba con «índice del manual NOA», «¿cómo veo los puntos de venta en LoteMovil?» o «página 6 del manual GAMMA».';
  const requests = new Set();
  let conversationRevision = 0;

  /* ======================================================
   AGREGAR MENSAJE
  ====================================================== */
  const addMessage = (type, text, manuals = []) => {
    const message = document.createElement('article');
    message.className = `message ${type}`;

    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    message.appendChild(paragraph);

    if (type === 'bot' && Array.isArray(manuals) && manuals.length) {
      const links = document.createElement('div');
      links.className = 'manual-links';

      manuals.forEach((manual) => {
        if (!manual || typeof manual.label !== 'string' ||
            typeof manual.url !== 'string' || !manual.url.startsWith('/knowledge/')) {
          return;
        }

        const link = document.createElement('a');
        link.href = manual.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `Abrir ${manual.label}`;
        links.appendChild(link);
      });

      if (links.childElementCount) {
        message.appendChild(links);
      }
    }

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

    const requestRevision = conversationRevision;
    const controller = new AbortController();
    requests.add(controller);

    addMessage('user', question);
    chatInput.value = '';

    addMessage('bot', 'Consultando...');

    const pendingMessage = chatMessages.lastElementChild;

    try {
      const backend = window.__GAMMA_BACKEND_URL__ || '';
      const response = await fetch(`${backend}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message: question }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Error backend: ${response.status}`);
      }

      const data = await response.json();
      if (requestRevision !== conversationRevision) return;

      pendingMessage.remove();

      addMessage('bot', data.reply || 'Sin respuesta', data.manuals);

    } catch (error) {
      if (error.name === 'AbortError' || requestRevision !== conversationRevision) return;

      console.error('Error:', error);

      pendingMessage.remove();

      addMessage(
        'bot',
        'No se pudo conectar con el servidor. Verificá que Render esté activo o probá en local.'
      );
    } finally {
      requests.delete(controller);
    }
  };

  /* ======================================================
   EVENTOS
  ====================================================== */

  chatForm.addEventListener('submit', (event) => {
    event.preventDefault();
    sendMessage();
  });

  clearChatBtn.addEventListener('click', () => {
    conversationRevision += 1;
    requests.forEach((controller) => controller.abort());
    requests.clear();
    chatMessages.replaceChildren();
    chatInput.value = '';
    addMessage('bot', initialGreeting);
  });

  document.querySelectorAll('[data-suggestion]').forEach((button) => {
    button.addEventListener('click', () => {
      chatInput.value = button.dataset.suggestion;
      sendMessage();
    });
  });

  document.querySelectorAll('[data-question]').forEach((button) => {
    button.addEventListener('click', () => {
      chatInput.value = button.dataset.question;
      chatInput.focus();
      document.getElementById('chat').scrollIntoView({ behavior: 'smooth' });
    });
  });

});
