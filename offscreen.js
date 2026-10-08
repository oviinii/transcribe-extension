// offscreen.js - SpeechRecognition roda aqui em background (não fecha)

let port = null;
let reconnectTimer = null;

function connectPort() {
  try {
    if (port) { try { port.disconnect(); } catch (e) {} }
    port = chrome.runtime.connect({ name: 'offscreen-speech' });
    port.onMessage.addListener(handleCommand);
    port.onDisconnect.addListener(() => {
      // SW suspendeu: NÃO para o reconhecimento, só reconecta e ressincroniza
      port = null;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectPort, 500);
    });
    // Ressincroniza o popup após reconectar (SW reiniciou e perdeu estado)
    setTimeout(() => {
      if (!port) return;
      if (isListening) {
        broadcast('STARTED', { lang: currentLang });
        broadcast('TRANSCRIPT', { final: finalTranscript, interim: '' });
      }
    }, 300);
  } catch (e) {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectPort, 1000);
  }
}

let recognition = null;
let isListening = false;
let finalTranscript = '';
let currentLang = 'pt-BR';
let micStream = null;

function log(...args) {
  console.log('[OFFSCREEN]', ...args);
  try { port && port.postMessage({ type: 'LOG', args: args.map(a => String(a)) }); } catch (e) {}
}

function broadcast(type, data = {}) {
  try { port && port.postMessage({ type, ...data }); } catch (e) {}
}

function cleanupRecognition() {
  if (recognition) {
    recognition.onend = null;
    recognition.onerror = null;
    recognition.onresult = null;
    recognition.onstart = null;
    try { recognition.abort(); } catch (e) {}
    recognition = null;
  }
}

function initRecognition() {
  cleanupRecognition();

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    log('SpeechRecognition não disponível');
    broadcast('ERROR', { message: 'SpeechRecognition não suportado neste Chrome.' });
    return false;
  }

  recognition = new SR();
  recognition.lang = currentLang;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = handleResult;
  recognition.onerror = handleError;
  recognition.onend = handleEnd;

  log('Recognition inicializado, lang:', currentLang);
  return true;
}

function handleResult(event) {
  let interim = '';
  let newFinal = '';

  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i];
    const transcript = result[0].transcript;
    if (result.isFinal) {
      newFinal += transcript + ' ';
    } else {
      interim += transcript;
    }
  }

  if (newFinal) finalTranscript += newFinal;
  broadcast('TRANSCRIPT', { final: finalTranscript, interim });
}

function handleError(event) {
  log('SpeechRecognition error:', event.error);
  if (event.error === 'aborted') return; // stop() proposital, onend vai tratar
  let message = '';
  switch (event.error) {
    case 'not-allowed':
    case 'permission-denied':
      message = 'Permissão de microfone negada. Clique no ícone de cadeado e libere o microfone.';
      break;
    case 'no-speech':
      message = 'Nenhuma fala detectada. Continue falando...';
      broadcast('ERROR', { message });
      return; // não para, deixa o onend reiniciar
    case 'audio-capture':
      message = 'Microfone não encontrado ou em uso.';
      break;
    case 'network':
      message = 'Erro de rede no reconhecimento de voz.';
      break;
    default:
      message = 'Erro: ' + event.error;
  }
  broadcast('ERROR', { message });
  stopListening();
}

function handleEnd() {
  log('onend, isListening:', isListening);
  // Chrome para sozinho após ~1min/silêncio: reinicia se ainda era pra estar ouvindo
  if (isListening && recognition) {
    try {
      recognition.start();
    } catch (e) {
      log('Restart failed:', e && e.message);
      // tenta recriar uma vez
      setTimeout(() => {
        if (!isListening) return;
        if (initRecognition()) {
          try { recognition.start(); } catch (e2) { stopListening(); }
        }
      }, 300);
    }
  }
}

async function ensureMicPermission() {
  try {
    if (micStream) {
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;
    }
    // A permissão já deve ter sido concedida no popup (gesto visível).
    // Aqui só abrimos o stream para manter o mic ativo no background.
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return true;
  } catch (e) {
    log('getUserMedia falhou:', e && e.name, e && e.message);
    // Se o popup liberou mas aqui negou, é bloqueio persistido na origem
    // chrome-extension:// -> precisa reset manual.
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError' || e.name === 'PermissionDeniedError')) {
      broadcast('ERROR', { message: 'Microfone bloqueado para a extensão. Veja o passo a passo abaixo no popup.' , code: 'PERMISSION_DENIED' });
    } else if (e && e.name === 'NotFoundError') {
      broadcast('ERROR', { message: 'Nenhum microfone encontrado.' });
    } else {
      broadcast('ERROR', { message: 'Não foi possível abrir o microfone: ' + (e && e.message || e) });
    }
    return false;
  }
}

async function startListening(lang = 'pt-BR') {
  if (isListening) return;
  currentLang = lang || currentLang;
  isListening = true;
  finalTranscript = '';

  const micOk = await ensureMicPermission();
  if (!micOk || !isListening) {
    if (!isListening) return;
    isListening = false;
    stopMicStream();
    return;
  }

  if (!initRecognition()) {
    isListening = false;
    stopMicStream();
    return;
  }

  try {
    recognition.start();
    log('Iniciado, lang:', currentLang);
    broadcast('STARTED', { lang: currentLang });
  } catch (e) {
    log('Falha ao iniciar:', e && e.message);
    isListening = false;
    stopMicStream();
    broadcast('ERROR', { message: 'Erro ao iniciar: ' + (e && e.message) });
  }
}

function stopMicStream() {
  if (micStream) {
    try { micStream.getTracks().forEach(t => t.stop()); } catch (e) {}
    micStream = null;
  }
}

function stopListening() {
  if (!isListening && !recognition) return;
  isListening = false;
  try { recognition && recognition.stop(); } catch (e) {}
  stopMicStream();
  log('Parado');
  broadcast('STOPPED');
}

function clearTranscript() {
  finalTranscript = '';
  broadcast('CLEARED');
}

// Escuta comandos do service worker via porta
function handleCommand(msg) {
  log('Recebido:', msg.type);
  switch (msg.type) {
    case 'START': startListening(msg.lang); break;
    case 'STOP': stopListening(); break;
    case 'CLEAR': clearTranscript(); break;
    case 'SET_CORRECTED': {
      finalTranscript = msg.text || '';
      if (finalTranscript && !finalTranscript.endsWith(' ')) finalTranscript += ' ';
      broadcast('TRANSCRIPT', { final: finalTranscript, interim: '' });
      break;
    }
    case 'SET_LANG':
      currentLang = msg.lang || currentLang;
      if (isListening) {
        const lang = currentLang;
        stopListening();
        setTimeout(() => startListening(lang), 300);
      }
      break;
  }
}

connectPort();

log('Offscreen pronto');
