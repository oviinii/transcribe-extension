// popup.js - UI que comunica com background/offscreen via Port

(function() {
  'use strict';

  // DOM
  const toggleBtn = document.getElementById('toggleBtn');
  const stopBtn = document.getElementById('stopBtn');
  const btnText = document.querySelector('.btn-text');
  const btnIcon = toggleBtn.querySelector('.btn-icon');
  const statusEl = document.getElementById('status');
  const statusText = statusEl.querySelector('.status-text') || statusEl;
  const transcriptEl = document.getElementById('transcript');
  const copyBtn = document.getElementById('copyBtn');
  const fixBtn = document.getElementById('fixBtn');
  const clearBtn = document.getElementById('clearBtn');
  const langSelect = document.getElementById('langSelect');
  const charCount = document.getElementById('charCount');
  const micHelp = document.getElementById('micHelp');
  const micHelpTitle = document.getElementById('micHelpTitle');
  const micHelpText = document.getElementById('micHelpText');
  const autoFixBtn = document.getElementById('autoFixBtn');
  const extIdEl = document.getElementById('extId');
  if (extIdEl && chrome.runtime && chrome.runtime.id) extIdEl.textContent = chrome.runtime.id;

  let isListening = false;
  let autoFixing = false;

  function showMicHelp(show, title, text, showBtn) {
    if (!micHelp) return;
    micHelp.hidden = !show;
    if (title && micHelpTitle) micHelpTitle.textContent = title;
    if (text && micHelpText) micHelpText.textContent = text;
    if (autoFixBtn) autoFixBtn.hidden = !showBtn;
  }

  // Tenta resetar/liberar o bloqueio de microfone da própria extensão
  // sem o usuário precisar abrir chrome://settings na mão.
  async function autoFixMicBlocked() {
    try {
      if (!chrome.contentSettings || !chrome.contentSettings.microphone) return false;
      const id = chrome.runtime ? chrome.runtime.id : null;
      const pattern = id ? `chrome-extension://${id}/*` : '<all_urls>';
      // 1) Remove regra de bloqueio (volta para "perguntar")
      await new Promise(res => {
        try {
          chrome.contentSettings.microphone.clear({ scope: 'regular' }, () => res());
        } catch (e) { res(); }
      });
      // 2) Tenta permitir direto a própria origem
      try {
        await chrome.contentSettings.microphone.set({
          primaryPattern: pattern,
          setting: 'allow',
          scope: 'regular'
        });
      } catch (e) {
        // Se set falhar, o clear acima já basta: próximo getUserMedia
        // volta a mostrar o prompt "Permitir".
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  async function requestMicOnce() {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    try { s.getTracks().forEach(t => t.stop()); } catch (e) {}
    return true;
  }

  // Porta com o service worker (background roteia para o offscreen)
  // Reconecta sozinha se o SW suspender (evita "Erro de conexão").
  let port = null;
  let reconnectTimer = null;

  function handlePortMessage(msg) {
    switch (msg.type) {
      case 'STARTED':
        setRecording(true);
        showStatus('Ouvindo… Fale agora', 'listening');
        refreshButtons();
        break;
      case 'STOPPED':
        setRecording(false);
        showStatus('Pronto', 'ready');
        refreshButtons();
        break;
      case 'TRANSCRIPT':
        transcriptEl.value = (msg.final || '') + (msg.interim || '');
        transcriptEl.scrollTop = transcriptEl.scrollHeight;
        refreshButtons();
        updateCount();
        break;
      case 'CLEARED':
        transcriptEl.value = '';
        refreshButtons();
        updateCount();
        showStatus('Limpo', 'ready');
        break;
      case 'ERROR':
        if (msg.code === 'PERMISSION_DENIED' && !autoFixing) {
          // Offscreen negou mas popup tinha liberado: tenta auto-fix e reinicia
          autoFixAndRetry();
        } else {
          showStatus(msg.message || 'Erro', 'error');
          showMicHelp(msg.code === 'PERMISSION_DENIED', 'Microfone bloqueado', msg.message || 'Erro de microfone.', true);
        }
        if (isListening) {
          setRecording(false);
          refreshButtons();
        }
        break;
      case 'LOG':
        console.log('[OFFSCREEN LOG]', ...(msg.args || []));
        break;
    }
  }

  function connectPort() {
    try {
      if (port) { try { port.disconnect(); } catch (e) {} }
      port = chrome.runtime.connect({ name: 'popup-speech' });
      port.onMessage.addListener(handlePortMessage);
      port.onDisconnect.addListener(() => {
        console.log('[POPUP] Desconectado, reconectando…');
        port = null;
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectPort, 500);
      });
    } catch (e) {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectPort, 1000);
    }
  }
  connectPort();

  function refreshButtons() {
    const has = !!transcriptEl.value.trim();
    copyBtn.disabled = !has;
    if (fixBtn) fixBtn.disabled = !has || isListening;
  }

  function send(type, data = {}) {
    const msg = { type, ...data };
    try {
      if (!port) {
        connectPort();
        // dá um tempo para reconectar e tenta de novo
        setTimeout(() => {
          try {
            if (port) port.postMessage(msg);
            else showStatus('Reconectando… tente de novo em 1s.', 'error');
          } catch (e) {
            showStatus('Reconectando… tente de novo em 1s.', 'error');
          }
        }, 600);
        return;
      }
      port.postMessage(msg);
    } catch (e) {
      connectPort();
      showStatus('Reconectando… clique de novo.', 'error');
    }
  }

  function showStatus(message, type = 'default') {
    statusText.textContent = message;
    statusEl.className = 'status';
    if (type) statusEl.classList.add(type);
  }

  function updateCount() {
    if (!charCount) return;
    const n = transcriptEl.value.trim().length;
    charCount.textContent = n + (n === 1 ? ' caractere' : ' caracteres');
  }

  function setRecording(on) {
    isListening = on;
    toggleBtn.classList.toggle('recording', on);
    if (btnText) btnText.textContent = on ? 'Ouvindo… clique para pausar' : 'Começar a ouvir';
    if (btnIcon) btnIcon.textContent = on ? '⏹' : '🎤';
    if (stopBtn) stopBtn.hidden = !on;
    toggleBtn.setAttribute('aria-label', on ? 'Parar gravação' : 'Iniciar gravação');
  }

  function stopListening() {
    if (!isListening) return;
    send('STOP');
  }

  async function autoFixAndRetry() {
    if (autoFixing) return;
    autoFixing = true;
    showMicHelp(true, 'Liberando microfone…', 'Detectei bloqueio. Tentando liberar automaticamente…', false);
    showStatus('Liberando microfone automaticamente…', 'listening');
    await autoFixMicBlocked();
    try {
      await requestMicOnce();
      showMicHelp(false);
      showStatus('Microfone liberado! Iniciando…', 'listening');
      send('START', { lang: langSelect.value });
    } catch (e) {
      // Popup perde o foco quando o prompt abre e o Chrome aborta o pedido.
      // Caminho confiável: abrir ABA da extensão (não fecha) para conceder 1x.
      console.warn('[POPUP] retry falhou, abrindo aba mic:', e && e.name);
      showStatus('Abrindo aba para liberar o microfone…', 'listening');
      showMicHelp(true, 'Quase lá', 'Abri uma aba para liberar. Clique em Permitir lá e volte aqui.', false);
      try {
        await chrome.tabs.create({ url: chrome.runtime.getURL('mic.html') });
      } catch (err) {
        showStatus('Ainda bloqueado. Clique abaixo para liberar.', 'error');
        showMicHelp(true, 'Microfone bloqueado', 'Clique para abrir a aba de liberação.', true);
      }
    } finally {
      autoFixing = false;
    }
  }

  async function openMicTab() {
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL('mic.html') });
    } catch (e) {
      showStatus('Não consegui abrir a aba. Abra manualmente: ' + chrome.runtime.getURL('mic.html'), 'error');
    }
  }

  async function toggleListening() {
    if (isListening) {
      send('STOP');
      return;
    }
    showMicHelp(false);
    // IMPORTANTE (extensão Chrome): o pedido de microfone PRECISA ser feito
    // aqui no popup (página visível + clique do usuário). O offscreen é
    // invisível e o Chrome nega o prompt de lá sem gesto.
    showStatus('Pedindo microfone…', 'listening');
    try {
      await requestMicOnce();
    } catch (e) {
      console.warn('[POPUP] getUserMedia falhou:', e && e.name, e);
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
        // AUTOMÁTICO: tenta limpar o bloqueio e pedir de novo sem manual
        await autoFixAndRetry();
      } else if (e && e.name === 'NotFoundError') {
        showStatus('Nenhum microfone encontrado.', 'error');
      } else {
        showStatus('Não foi possível acessar o microfone: ' + (e && e.message || e), 'error');
      }
      return;
    }
    send('START', { lang: langSelect.value });
  }

  function copyToClipboard() {
    const text = transcriptEl.value.trim();
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      const orig = copyBtn.textContent;
      copyBtn.textContent = 'Copiado!';
      setTimeout(() => { copyBtn.textContent = orig; }, 1500);
      showStatus('Copiado! Cole em qualquer site.', 'ready');
    }).catch(err => {
      console.error('Copy failed:', err);
      transcriptEl.select();
      try { document.execCommand('copy'); } catch (e) {}
    });
  }

  function clearTranscript() {
    send('CLEAR');
  }

  function tidyLocal(text) {
    let t = (text || '').replace(/\s+/g, ' ').trim();
    if (!t) return t;
    t = t.charAt(0).toUpperCase() + t.slice(1);
    t = t.replace(/([.!?…])\s*([a-zà-ÿ])/g, (m, p, l) => p + ' ' + l.toUpperCase());
    if (!/[.!?…]$/.test(t)) t += '.';
    return t;
  }

  async function correctWithLanguageTool(text, lang) {
    const params = new URLSearchParams();
    params.append('text', text);
    params.append('language', lang || 'pt-BR');
    const res = await fetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    if (!res.ok) throw new Error('LanguageTool HTTP ' + res.status);
    const data = await res.json();
    const matches = (data.matches || []).slice().sort((a, b) => b.offset - a.offset);
    let out = text;
    let applied = 0;
    for (const m of matches) {
      const rep = m.replacements && m.replacements[0] && m.replacements[0].value;
      if (typeof rep !== 'string') continue;
      // ignora sugestões muito agressivas de estilo? aplica tudo do LT
      out = out.slice(0, m.offset) + rep + out.slice(m.offset + m.length);
      applied++;
    }
    return { text: out, applied };
  }

  async function fixGrammar() {
    const original = transcriptEl.value.trim();
    if (!original || isListening) return;
    if (fixBtn) fixBtn.disabled = true;
    showStatus('Corrigindo gramática…', 'listening');
    try {
      let fixed = original;
      let applied = 0;
      try {
        const r = await correctWithLanguageTool(original, langSelect.value);
        fixed = r.text;
        applied = r.applied;
      } catch (e) {
        console.warn('[POPUP] LanguageTool falhou, fallback local:', e);
      }
      fixed = tidyLocal(fixed);
      transcriptEl.value = fixed;
      transcriptEl.scrollTop = transcriptEl.scrollHeight;
      updateCount();
      refreshButtons();
      // Sincroniza com o offscreen para não ser sobrescrito no próximo interim
      send('SET_CORRECTED', { text: fixed });
      showStatus(applied ? `Corrigido (${applied} ajustes).` : 'Texto revisado.', 'ready');
    } catch (e) {
      showStatus('Falha ao corrigir: ' + (e && e.message || e), 'error');
    } finally {
      refreshButtons();
    }
  }

  // Event listeners
  toggleBtn.addEventListener('click', toggleListening);
  if (stopBtn) stopBtn.addEventListener('click', stopListening);
  if (autoFixBtn) autoFixBtn.addEventListener('click', openMicTab);
  copyBtn.addEventListener('click', copyToClipboard);
  if (fixBtn) fixBtn.addEventListener('click', fixGrammar);
  clearBtn.addEventListener('click', clearTranscript);

  langSelect.addEventListener('change', () => {
    send('SET_LANG', { lang: langSelect.value });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && e.target !== transcriptEl) { e.preventDefault(); toggleListening(); }
    if (e.code === 'Escape') send('STOP');
    if ((e.ctrlKey || e.metaKey) && e.code === 'Enter') { e.preventDefault(); copyToClipboard(); }
    if ((e.ctrlKey || e.metaKey) && e.code === 'Backspace') { e.preventDefault(); send('CLEAR'); }
  });

  // Initial state
  showStatus('Pronto. Grava em background — pode trocar de aba!', 'ready');
})();
