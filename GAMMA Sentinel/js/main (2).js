document.addEventListener('DOMContentLoaded', () => {
  const year = new Date().getFullYear();
  const footerParagraphs = document.querySelectorAll('.site-footer p');
  if (footerParagraphs.length > 0) {
    footerParagraphs[0].textContent = `GAMMA Sentinel © ${year}`;
  }

  const links = document.querySelectorAll('a[href^="#"]');
  links.forEach((link) => {
    link.addEventListener('click', (event) => {
      const targetId = link.getAttribute('href');
      if (!targetId || targetId === '#') return;

      const target = document.querySelector(targetId);
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatMessages = document.getElementById('chatMessages');
  const suggestionButtons = document.querySelectorAll('.suggestion-chip');

  const getBackendBaseUrl = () => {
    const queryBackendUrl = new URLSearchParams(window.location.search).get('backendUrl');
    if (queryBackendUrl) {
      return queryBackendUrl;
    }

    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:3000';
    }

    if (window.__GAMMA_BACKEND_URL__) {
      return window.__GAMMA_BACKEND_URL__;
    }

    return '';
  };

  const buildApiUrl = (path) => {
    const backendBaseUrl = getBackendBaseUrl();
    if (!backendBaseUrl) {
      return path;
    }

    return `${backendBaseUrl.replace(/\/$/, '')}${path}`;
  };

  const repoConfig = {
    owner: 'Alexis20021983',
    repo: 'Gamma-Sentinel',
    branch: 'main'
  };

  const knowledgeSources = [
    'README.md',
    'agent.mcs.yml',
    'settings.mcs.yml',
    'knowledge/files/Archivo_SharePoint_GAMMA.mcs.yml',
    'knowledge/files/BacklogGammaMantenimiento.jmg.xlsx_Xl0.mcs.yml',
    'knowledge/files/Base_Conocimiento_GAMMA.txt_EFg.mcs.yml',
    'knowledge/files/GAMMA-ManualdeUsuariov1.0.pdf_Etf.mcs.yml',
    'knowledge/files/LoteMovil-ManualdeUsuariov1.2.pdf_6JE.mcs.yml',
    'knowledge/files/Manual_RT_GAMMA_Integrado.docx_IgK.mcs.yml',
    'knowledge/files/NOA-ManualdeUsuariov1.2.pdf_gaK.mcs.yml',
    'knowledge/files/Base_Conocimiento_GAMMA.txt',
    'knowledge/files/Archivo_SharePoint_GAMMA.txt',
    'knowledge/files/BacklogGammaMantenimiento.txt',
    'knowledge/files/GAMMA-ManualdeUsuariov1.0.txt',
    'knowledge/files/LoteMovil-ManualdeUsuariov1.2.txt',
    'knowledge/files/LoteMovil-ManualdeAdministradorv1.2.txt',
    'knowledge/files/Manual_RT_GAMMA_Integrado.txt',
    'knowledge/files/NOA-ManualdeUsuariov1.2.txt'
  ];

  let repoKnowledgeLoading = null;

  const stopWords = new Set([
    'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'este', 'o', 'este', 'ese', 'eso', 'aquello', 'estos', 'estas', 'es', 'son', 'un', 'una', 'unos', 'unas', 'mi', 'mis', 'tu', 'tus', 'yo', 'me', 'te', 'le', 'nos', 'os', 'les', 'qué', 'como', 'donde', 'cuando', 'quien', 'quienes', 'cual', 'cuales', 'un', 'una', 'este', 'esta', 'estos', 'estas', 'del', 'al', 'lo', 'los', 'las', 'sus'
  ]);

  const cleanText = (value) =>
    value
      .replace(/\r/g, '')
      .replace(/\t/g, ' ')
      .replace(/\uFEFF/g, '')
      .trim();

  const normalizeText = (value) =>
    cleanText(value)
      .toLowerCase()
      .replace(/[^a-z0-9áéíóúüñ\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const summarizeText = (value) => {
    const compact = cleanText(value).replace(/\n+/g, ' ');
    return compact.length > 300 ? `${compact.slice(0, 300).trim()}...` : compact;
  };

  const loadRepoKnowledge = async () => {
    if (repoKnowledgeLoading) {
      return repoKnowledgeLoading;
    }

    repoKnowledgeLoading = (async () => {
      const results = await Promise.allSettled(
        knowledgeSources.map(async (path) => {
          let url = `./${path}`;
          if (window.location.protocol === 'file:') {
            url = `https://raw.githubusercontent.com/${repoConfig.owner}/${repoConfig.repo}/${repoConfig.branch}/${path}`;
          }

          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`No se pudo leer ${path}`);
          }
          const text = await response.text();
          const clean = cleanText(text);
          if (!clean) {
            return null;
          }

          const sections = clean
            .split(/\n\s*\n+/)
            .map((section) => section.trim())
            .filter(Boolean);

          return {
            path,
            sections
          };
        })
      );

      const loadedSections = [];
      results.forEach((result) => {
        if (result.status !== 'fulfilled' || !result.value) {
          return;
        }

        result.value.sections.forEach((section) => {
          loadedSections.push({
            path: result.value.path,
            text: section
          });
        });
      });

      return loadedSections;
    })();

    return repoKnowledgeLoading;
  };

  const getRepoReply = async (question) => {
    try {
      const loadedKnowledge = await loadRepoKnowledge();
      if (!loadedKnowledge.length) {
        return 'No pude cargar el conocimiento del repositorio ahora mismo. Reintenta en unos segundos.';
      }

      const normalizedQuestion = normalizeText(question);
      const terms = normalizedQuestion
        .split(' ')
        .filter(Boolean)
        .filter((term) => term.length > 1 && !stopWords.has(term));

      if (terms.length === 0) {
        return 'Te puedo ayudar con temas específicos de GAMMA (Tesorería, Liquidación, Caja, Contabilidad, PDV o el Backlog). Escríbeme tu duda detalladamente.';
      }

      const scored = loadedKnowledge
        .map((entry) => {
          const normalizedText = normalizeText(entry.text);
          const matches = terms.filter((term) => normalizedText.includes(term)).length;

          return {
            entry,
            matches
          };
        })
        .filter((item) => item.matches > 0)
        .sort((a, b) => b.matches - a.matches);

      if (scored.length === 0) {
        return 'No encontré una coincidencia directa en el repositorio. Te puedo ayudar con temas como módulos, diagnóstico, backlog o información del proyecto si me escribís algo más específico.';
      }

      const best = scored[0].entry;
      return `Basado en ${best.path}: ${summarizeText(best.text)}`;
    } catch (error) {
      console.error(error);
      return 'No pude consultar el repositorio en este momento. Si querés, te doy una respuesta general del sitio mientras verifico el acceso.';
    }
  };

  const getBackendReply = async (question, context = '') => {
    const targetUrl = buildApiUrl('/api/chat');
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: question, context })
    });

    if (!response.ok) {
      throw new Error(`Backend respondió con estado ${response.status}`);
    }

    const payload = await response.json();
    return payload?.reply || null;
  };

  const getBotReply = async (question) => {
    try {
      let context = '';
      const loadedKnowledge = await loadRepoKnowledge().catch(() => []);

      if (loadedKnowledge && loadedKnowledge.length > 0) {
        let baseContext = '';
        const generalFiles = loadedKnowledge.filter(e => e.path === 'agent.mcs.yml' || e.path === 'README.md');
        if (generalFiles.length > 0) {
          baseContext = generalFiles.slice(0, 3).map(e => `[Archivo: ${e.path}]\n${e.text}`).join('\n\n');
        }

        const normalizedQuestion = normalizeText(question);
        const terms = normalizedQuestion
          .split(' ')
          .filter(Boolean)
          .filter((term) => term.length > 1 && !stopWords.has(term));

        let matchedContext = '';
        if (terms.length > 0) {
          const scored = loadedKnowledge
            .map((entry) => {
              const normalizedText = normalizeText(entry.text);
              const matches = terms.filter((term) => normalizedText.includes(term)).length;

              return {
                entry,
                matches
              };
            })
            .filter((item) => item.matches > 0)
            .sort((a, b) => b.matches - a.matches);

          if (scored.length > 0) {
            matchedContext = scored
              .slice(0, 4)
              .map((item) => `[Archivo: ${item.entry.path}]\n${item.entry.text}`)
              .join('\n\n');
          }
        }

        if (matchedContext) {
          context = `CONTEXTO GENERAL DEL AGENTE:\n${baseContext}\n\nCONTEXTO ESPECÍFICO DE LA CONSULTA:\n${matchedContext}`;
        } else {
          context = `CONTEXTO GENERAL DEL AGENTE:\n${baseContext}`;
        }
      }

      const backendReply = await getBackendReply(question, context);
      if (backendReply) {
        return backendReply;
      }
    } catch (error) {
      console.warn('Backend de IA no disponible, usando respaldo del repositorio.', error);
    }

    return getRepoReply(question);
  };

  const addMessage = (type, text) => {
    const message = document.createElement('article');
    message.className = `message ${type}`;
    message.innerHTML = `<p>${text}</p>`;
    chatMessages.appendChild(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  };

  const handleChatSubmit = async (event) => {
    event.preventDefault();

    const question = chatInput.value.trim();
    if (!question) return;

    addMessage('user', question);
    chatInput.value = '';

    chatInput.disabled = true;
    const submitButton = chatForm.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Consultando...';
    }

    addMessage('bot', 'Estoy consultando el backend y el repositorio para responderte...');

    const botReply = await getBotReply(question);

    chatMessages.lastElementChild?.remove();
    addMessage('bot', botReply);

    chatInput.disabled = false;
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Enviar';
    }
    chatInput.focus();
  };

  if (chatForm) {
    chatForm.addEventListener('submit', handleChatSubmit);
  }

  suggestionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      chatInput.value = button.dataset.suggestion || '';
      chatInput.focus();
    });
  });
});
