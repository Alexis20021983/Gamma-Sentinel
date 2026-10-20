document.addEventListener('DOMContentLoaded', () => {

  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatMessages = document.getElementById('chatMessages');
  const clearChatBtn = document.getElementById('clearChatBtn');
  const voiceInputBtn = document.getElementById('voiceInputBtn');
  const readResponseBtn = document.getElementById('readResponseBtn');
  const stopReadingBtn = document.getElementById('stopReadingBtn');
  const voiceStatus = document.getElementById('voiceStatus');
  const initialGreeting = '¡Hola! Puedo ayudarte a consultar los manuales de usuario. Prueba con «índice del manual NOA», «¿cómo veo los puntos de venta en LoteMovil?» o «página 6 del manual GAMMA».';
  const requests = new Set();
  let conversationRevision = 0;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const speechSynthesis = window.speechSynthesis;
  let recognition;
  let isRecognizing = false;
  let speechRevision = 0;

  const setVoiceStatus = (message) => {
    voiceStatus.textContent = message;
  };

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'es-AR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.addEventListener('start', () => {
      isRecognizing = true;
      voiceInputBtn.setAttribute('aria-pressed', 'true');
      voiceInputBtn.textContent = 'Escuchando…';
      setVoiceStatus('Te escucho. Habla ahora.');
    });

    recognition.addEventListener('result', (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (!transcript) {
        setVoiceStatus('No se reconoció voz. Inténtalo otra vez o escribe tu pregunta.');
        return;
      }

      chatInput.value = transcript;
      chatInput.focus();
      setVoiceStatus('Pregunta dictada. Revísala y pulsa Enviar.');
    });

    recognition.addEventListener('error', (event) => {
      const messages = {
        'not-allowed': 'No se autorizó el micrófono. Revisa los permisos del navegador.',
        'service-not-allowed': 'El navegador no permite usar el servicio de dictado.',
        'no-speech': 'No se detectó voz. Inténtalo otra vez.',
        'audio-capture': 'No se encontró un micrófono disponible.',
        'language-not-supported': 'El dictado en español no está disponible en este navegador.'
      };
      setVoiceStatus(messages[event.error] || 'No se pudo iniciar el dictado. Puedes escribir tu pregunta.');
    });

    recognition.addEventListener('end', () => {
      isRecognizing = false;
      voiceInputBtn.setAttribute('aria-pressed', 'false');
      voiceInputBtn.textContent = 'Dictar pregunta';
    });
  } else {
    voiceInputBtn.disabled = true;
    setVoiceStatus('El dictado por voz no está disponible en este navegador. Puedes escribir tu pregunta.');
  }

  if (!speechSynthesis) {
    readResponseBtn.disabled = true;
    stopReadingBtn.disabled = true;
    setVoiceStatus(
      SpeechRecognition
        ? 'La lectura en voz alta no está disponible en este navegador.'
        : 'El dictado y la lectura en voz alta no están disponibles en este navegador.'
    );
  }

  voiceInputBtn.addEventListener('click', () => {
    if (!recognition) return;
    try {
      recognition.start();
    } catch (error) {
      if (error.name !== 'InvalidStateError') {
        console.error('No se pudo iniciar el dictado:', error);
        setVoiceStatus('No se pudo iniciar el dictado. Comprueba los permisos del micrófono.');
      }
    }
  });

  readResponseBtn.addEventListener('click', () => {
    const replies = chatMessages.querySelectorAll('.message.bot p');
    const latestReply = [...replies].reverse().find(paragraph =>
      paragraph.textContent.trim() && paragraph.textContent.trim() !== 'Consultando...'
    );

    if (!latestReply) {
      setVoiceStatus('Todavía no hay una respuesta para leer.');
      return;
    }

    const revision = ++speechRevision;
    speechSynthesis.cancel();
    try {
      const speechText = latestReply.textContent
        .replace(/^\s*P[aá]gina\s+\d+\s+de\s+[^:\r\n]+:\s*/i, '')
        .replace(/\s*Abre el archivo:\s*[^\r\n]*(?:\r?\n|$)[\s\S]*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!speechText) {
        setVoiceStatus('La respuesta no contiene texto para leer.');
        return;
      }

      const utterance = new SpeechSynthesisUtterance(speechText);
      utterance.lang = 'es-AR';
      utterance.addEventListener('start', () => {
        if (revision !== speechRevision) return;
        stopReadingBtn.disabled = false;
        setVoiceStatus('Leyendo la última respuesta.');
      });
      utterance.addEventListener('end', () => {
        if (revision !== speechRevision) return;
        stopReadingBtn.disabled = true;
        setVoiceStatus('Terminó la lectura.');
      });
      utterance.addEventListener('error', () => {
        if (revision !== speechRevision) return;
        stopReadingBtn.disabled = true;
        setVoiceStatus('No se pudo leer la respuesta en voz alta.');
      });
      speechSynthesis.speak(utterance);
    } catch (error) {
      console.error('No se pudo leer la respuesta en voz alta:', error);
      stopReadingBtn.disabled = true;
      setVoiceStatus('No se pudo iniciar la lectura en voz alta.');
    }
  });

  stopReadingBtn.addEventListener('click', () => {
    speechRevision += 1;
    speechSynthesis.cancel();
    stopReadingBtn.disabled = true;
    setVoiceStatus('Lectura detenida.');
  });

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
        if (!manual || typeof manual.label !== 'string' || typeof manual.url !== 'string') {
          return;
        }

        const manualUrl = new URL(manual.url, window.location.origin);
        const isLibraryFile = manualUrl.pathname.startsWith('/knowledge/');
        const isPdfViewer = manualUrl.pathname === '/pdf-viewer.html';
        if (manualUrl.origin !== window.location.origin ||
            (!isLibraryFile && !isPdfViewer)) {
          return;
        }

        if (isPdfViewer) links.classList.add('manual-page-links');

        const link = document.createElement('a');
        link.href = manualUrl.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = manual.label;
        links.appendChild(link);
      });

      if (links.childElementCount) {
        message.classList.add('has-manual-links');
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
    if (isRecognizing) recognition.abort();
    if (speechSynthesis) {
      speechRevision += 1;
      speechSynthesis.cancel();
    }
    stopReadingBtn.disabled = true;
    chatMessages.replaceChildren();
    chatInput.value = '';
    setVoiceStatus('Puedes dictar tu pregunta o escuchar la última respuesta.');
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
