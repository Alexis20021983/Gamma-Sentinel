document.addEventListener('DOMContentLoaded', () => {

  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatMessages = document.getElementById('chatMessages');
  const clearChatBtn = document.getElementById('clearChatBtn');
  const voiceCommandsBtn = document.getElementById('voiceCommandsBtn');
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
  let isRecognitionStarting = false;
  let commandModeActive = false;
  let dictationActive = false;
  let directDictationActive = false;
  let isReadingReply = false;
  let speechRevision = 0;

  const setVoiceStatus = (message) => {
    voiceStatus.textContent = message;
  };

  const updateCommandButton = () => {
    voiceCommandsBtn.setAttribute('aria-pressed', String(commandModeActive));
    voiceCommandsBtn.textContent = commandModeActive
      ? 'Desactivar comandos por voz'
      : 'Activar comandos por voz';
  };

  const scheduleCommandRecognition = () => {
    window.setTimeout(() => {
      if (commandModeActive && !isReadingReply) {
        startRecognition(true);
      }
    }, 250);
  };

  const startRecognition = (continuous) => {
    if (!recognition || isRecognizing || isRecognitionStarting) return;

    recognition.continuous = continuous;
    isRecognitionStarting = true;
    try {
      recognition.start();
    } catch (error) {
      isRecognitionStarting = false;
      if (error.name !== 'InvalidStateError') {
        console.error('No se pudo iniciar el reconocimiento de voz:', error);
        setVoiceStatus('No se pudo iniciar el micrófono. Comprueba sus permisos.');
      }
    }
  };

  const normalizeVoiceCommand = (text) => text
    .toLocaleLowerCase('es-AR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!.,;:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const appendDictation = (text) => {
    const addition = text.trim();
    if (!addition) return;

    chatInput.value = [chatInput.value.trim(), addition].filter(Boolean).join(' ');
    chatInput.focus();
  };

  const readLatestResponse = () => {
    if (!speechSynthesis) {
      setVoiceStatus('La lectura en voz alta no está disponible en este navegador.');
      return;
    }

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

      isReadingReply = true;
      if (commandModeActive && isRecognizing) recognition.stop();

      const finishReading = (message) => {
        if (revision !== speechRevision) return;
        isReadingReply = false;
        stopReadingBtn.disabled = true;
        setVoiceStatus(message);
        if (commandModeActive && !isRecognizing) scheduleCommandRecognition();
      };

      const utterance = new SpeechSynthesisUtterance(speechText);
      utterance.lang = 'es-AR';
      utterance.addEventListener('start', () => {
        if (revision !== speechRevision) return;
        stopReadingBtn.disabled = false;
        setVoiceStatus('Leyendo la última respuesta.');
      });
      utterance.addEventListener('end', () => finishReading('Terminó la lectura.'));
      utterance.addEventListener('error', () => {
        finishReading('No se pudo leer la respuesta en voz alta.');
      });
      speechSynthesis.speak(utterance);
    } catch (error) {
      console.error('No se pudo leer la respuesta en voz alta:', error);
      isReadingReply = false;
      stopReadingBtn.disabled = true;
      setVoiceStatus('No se pudo iniciar la lectura en voz alta.');
      if (commandModeActive && !isRecognizing) scheduleCommandRecognition();
    }
  };

  const handleCommandTranscript = (transcript) => {
    const normalized = normalizeVoiceCommand(transcript);

    if ([
      'desactivar comandos por voz',
      'desactivar comando por voz',
      'detener comandos por voz',
      'apagar comandos por voz'
    ].includes(normalized)) {
      commandModeActive = false;
      dictationActive = false;
      updateCommandButton();
      voiceInputBtn.setAttribute('aria-pressed', 'false');
      voiceInputBtn.textContent = 'Dictar pregunta';
      if (isRecognizing) recognition.stop();
      setVoiceStatus('Comandos por voz desactivados.');
      return;
    }

    if (['limpiar chat', 'limpiar el chat', 'borrar chat', 'borrar el chat'].includes(normalized)) {
      dictationActive = false;
      clearChat(true);
      return;
    }

    if (!dictationActive) {
      if (normalized === 'leer ultima respuesta') {
        readLatestResponse();
        return;
      }

      if (normalized === 'dictar pregunta' || normalized.startsWith('dictar pregunta ')) {
        const remainder = transcript.replace(/^\s*dictar\s+pregunta\b[\s,.;:!?-]*/i, '');
        chatInput.value = '';
        dictationActive = true;
        voiceInputBtn.setAttribute('aria-pressed', 'true');
        voiceInputBtn.textContent = 'Dictando…';
        appendDictation(remainder);
        setVoiceStatus('Dicta tu pregunta y termina diciendo «enviar».');
        return;
      }

      if (normalized === 'enviar') {
        setVoiceStatus('Primero di «dictar pregunta» y luego «enviar».');
        return;
      }

      setVoiceStatus(
        'Comando no reconocido. Di «dictar pregunta», «leer última respuesta», «limpiar chat» o «desactivar comandos por voz».'
      );
      return;
    }

    if (normalized === 'leer ultima respuesta') {
      readLatestResponse();
      return;
    }

    const sendCommand = transcript.match(/\benviar\s*[.!?,;:]*$/i);
    if (sendCommand) {
      appendDictation(transcript.slice(0, sendCommand.index));
      dictationActive = false;
      voiceInputBtn.setAttribute('aria-pressed', 'false');
      voiceInputBtn.textContent = 'Dictar pregunta';
      if (!chatInput.value.trim()) {
        setVoiceStatus('No se reconoció una pregunta. Di «dictar pregunta» para intentarlo otra vez.');
        return;
      }

      setVoiceStatus('Enviando la pregunta dictada.');
      sendMessage();
      return;
    }

    appendDictation(transcript);
    setVoiceStatus('Te escucho. Cuando termines, di «enviar».');
  };

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'es-AR';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.addEventListener('start', () => {
      isRecognitionStarting = false;
      isRecognizing = true;
      if (commandModeActive) {
        setVoiceStatus(dictationActive
          ? 'Te escucho. Cuando termines, di «enviar».'
          : 'Comandos activos. Di «dictar pregunta», «leer última respuesta», «limpiar chat» o «desactivar comandos por voz».');
        return;
      }

      voiceInputBtn.setAttribute('aria-pressed', 'true');
      voiceInputBtn.textContent = 'Escuchando…';
      setVoiceStatus('Te escucho. Habla ahora.');
    });

    recognition.addEventListener('result', (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result.isFinal) continue;

        const transcript = result[0]?.transcript?.trim();
        if (!transcript) {
          setVoiceStatus('No se reconoció voz. Inténtalo otra vez o escribe tu pregunta.');
          continue;
        }

        if (commandModeActive) {
          handleCommandTranscript(transcript);
        } else if (directDictationActive) {
          chatInput.value = transcript;
          chatInput.focus();
          setVoiceStatus('Pregunta dictada. Revísala y pulsa Enviar.');
        }
      }
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
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        commandModeActive = false;
        dictationActive = false;
        directDictationActive = false;
        updateCommandButton();
        voiceInputBtn.setAttribute('aria-pressed', 'false');
        voiceInputBtn.textContent = 'Dictar pregunta';
      }
    });

    recognition.addEventListener('end', () => {
      isRecognizing = false;
      isRecognitionStarting = false;
      if (directDictationActive) {
        directDictationActive = false;
        voiceInputBtn.setAttribute('aria-pressed', 'false');
        voiceInputBtn.textContent = 'Dictar pregunta';
      }

      if (commandModeActive && !isReadingReply) {
        scheduleCommandRecognition();
      } else if (!commandModeActive) {
        voiceInputBtn.setAttribute('aria-pressed', 'false');
        voiceInputBtn.textContent = 'Dictar pregunta';
      }
    });
  } else {
    voiceCommandsBtn.disabled = true;
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

  voiceCommandsBtn.addEventListener('click', () => {
    if (!recognition) return;

    if (commandModeActive) {
      commandModeActive = false;
      dictationActive = false;
      updateCommandButton();
      voiceInputBtn.setAttribute('aria-pressed', 'false');
      voiceInputBtn.textContent = 'Dictar pregunta';
      if (isRecognizing) recognition.stop();
      setVoiceStatus('Comandos por voz desactivados.');
      return;
    }

    commandModeActive = true;
    updateCommandButton();
    setVoiceStatus('Solicitando acceso al micrófono…');
    startRecognition(true);
  });

  voiceInputBtn.addEventListener('click', () => {
    if (!recognition) return;

    if (commandModeActive) {
      dictationActive = !dictationActive;
      voiceInputBtn.setAttribute('aria-pressed', String(dictationActive));
      voiceInputBtn.textContent = dictationActive ? 'Dictando…' : 'Dictar pregunta';
      if (dictationActive) {
        chatInput.value = '';
        setVoiceStatus('Dicta tu pregunta y termina diciendo «enviar».');
      } else {
        setVoiceStatus('Dictado pausado. Puedes continuar con los comandos por voz.');
      }
      return;
    }

    if (isRecognizing || isRecognitionStarting) {
      if (isRecognizing) recognition.stop();
      return;
    }

    directDictationActive = true;
    startRecognition(false);
  });

  readResponseBtn.addEventListener('click', readLatestResponse);

  stopReadingBtn.addEventListener('click', () => {
    speechRevision += 1;
    speechSynthesis.cancel();
    isReadingReply = false;
    stopReadingBtn.disabled = true;
    setVoiceStatus('Lectura detenida.');
    if (commandModeActive && !isRecognizing) scheduleCommandRecognition();
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

  const clearChat = (voiceTriggered = false) => {
    conversationRevision += 1;
    requests.forEach((controller) => controller.abort());
    requests.clear();
    dictationActive = false;
    directDictationActive = false;
    if (isRecognizing && recognition) recognition.abort();
    if (speechSynthesis) {
      speechRevision += 1;
      speechSynthesis.cancel();
    }
    isReadingReply = false;
    stopReadingBtn.disabled = true;
    voiceInputBtn.setAttribute('aria-pressed', 'false');
    voiceInputBtn.textContent = 'Dictar pregunta';
    chatMessages.replaceChildren();
    chatInput.value = '';
    setVoiceStatus(voiceTriggered
      ? `Chat limpiado. ${commandModeActive
        ? 'Comandos por voz activos.'
        : 'Puedes dictar tu pregunta o escuchar la última respuesta.'}`
      : commandModeActive
        ? 'Comandos por voz activos. Di «dictar pregunta», «leer última respuesta», «limpiar chat» o «desactivar comandos por voz».'
        : 'Puedes dictar tu pregunta o escuchar la última respuesta.');
    addMessage('bot', initialGreeting);
  };

  /* ======================================================
   EVENTOS
  ====================================================== */

  chatForm.addEventListener('submit', (event) => {
    event.preventDefault();
    sendMessage();
  });

  clearChatBtn.addEventListener('click', () => clearChat());

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
