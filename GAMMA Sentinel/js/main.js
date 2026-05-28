document.addEventListener('DOMContentLoaded', () => {

  const chatForm = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const chat = document.getElementById('chatMessages');
  const sendBtn = document.getElementById('sendBtn');

  /* ======================================================
   AGREGAR MENSAJE
  ====================================================== */
  const addMessage = (type, text) => {
    const message = document.createElement('article');
    message.className = `message ${type}`;
    message.innerHTML = `<p>${text}</p>`;

    chat.appendChild(message);

    // ✅ SCROLL AUTOMÁTICO
    chat.scrollTop = chat.scrollHeight;
  };

  /* ======================================================
   ENVIAR MENSAJE
  ====================================================== */
  const sendMessage = async () => {

    const question = input.value.trim();

    if (!question) return;

    addMessage('user', question);
    input.value = '';

    // mensaje temporal
    addMessage('bot', 'Consultando...');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: question
        })
      });

      const data = await res.json();

      // eliminar "Consultando..."
      chat.lastElementChild.remove();

      addMessage('bot', data.reply || 'Sin respuesta');

    } catch (error) {
      chat.lastElementChild.remove();
      addMessage('bot', 'Error conectando con el servidor');
    }
  };

  /* ======================================================
   EVENTOS
  ====================================================== */

  // ✅ BOTÓN
  sendBtn.addEventListener('click', () => {
    sendMessage();
  });

  // ✅ ENTER en el input (IMPORTANTE)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // 🔥 evita salto arriba
      e.stopPropagation();
      sendMessage();
    }
  });

});