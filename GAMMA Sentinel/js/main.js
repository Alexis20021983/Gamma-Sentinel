document.addEventListener('DOMContentLoaded', () => {

  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatMessages = document.getElementById('chatMessages');
  const sendBtn = document.getElementById('sendBtn');

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
      chatMessages.lastElementChild.remove();

      addMessage('bot', data.reply || 'Sin respuesta', data.manuals);

    } catch (error) {
      console.error('Error:', error);

      chatMessages.lastElementChild.remove();

      addMessage(
        'bot',
        'No se pudo conectar con el servidor. Verificá que Render esté activo o probá en local.'
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
