document.addEventListener('DOMContentLoaded', () => {

  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatMessages = document.getElementById('chatMessages');

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

    addMessage('user', question);
    chatInput.value = '';

    // mensaje temporal
    addMessage('bot', 'Consultando...');

    const pendingMessage = chatMessages.lastElementChild;

    try {
      const backend = window.__GAMMA_BACKEND_URL__ || '';
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
      pendingMessage.remove();

      addMessage('bot', data.reply || 'Sin respuesta', data.manuals);

    } catch (error) {
      console.error('Error:', error);

      pendingMessage.remove();

      addMessage(
        'bot',
        'No se pudo conectar con el servidor. Verificá que Render esté activo o probá en local.'
      );
    }
  };

  /* ======================================================
   EVENTOS
  ====================================================== */

  chatForm.addEventListener('submit', (event) => {
    event.preventDefault();
    sendMessage();
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
