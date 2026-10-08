// background.js - Service Worker (Module)
// Ponte entre popup(s) e offscreen document via long-lived ports.

const OFFSCREEN_PATH = 'offscreen.html';
let offscreenPort = null;
const popupPorts = new Set();

// Cria documento offscreen se não existir e aguarda a conexão dele
async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
  });

  if (existing.length === 0) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
      justification: 'SpeechRecognition contínuo em background com acesso ao microfone'
    });
  }

  // Aguarda o offscreen conectar a porta (ele conecta sozinho ao carregar)
  if (offscreenPort) return true;

  for (let i = 0; i < 50; i++) {
    if (offscreenPort) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return !!offscreenPort;
}

function broadcastToPopups(msg) {
  for (const p of popupPorts) {
    try {
      p.postMessage(msg);
    } catch (e) {
      // porta pode estar fechada, será limpa no onDisconnect
    }
  }
}

// Roteamento por portas (push do SW para popup/offscreen funciona via Port)
chrome.runtime.onConnect.addListener(port => {
  // Offscreen conecta sozinho ao carregar offscreen.js
  if (port.name === 'offscreen-speech') {
    offscreenPort = port;

    port.onMessage.addListener(msg => {
      // Tudo que vem do offscreen vai para todos os popups abertos
      broadcastToPopups(msg);
    });

    port.onDisconnect.addListener(() => {
      if (offscreenPort === port) offscreenPort = null;
    });
    return;
  }

  // Popup conecta com 'popup-speech'
  if (port.name === 'popup-speech') {
    popupPorts.add(port);

    port.onMessage.addListener(async msg => {
      // Comando do popup -> garante offscreen e encaminha
      const ready = await ensureOffscreen();
      if (!ready || !offscreenPort) {
        port.postMessage({ type: 'ERROR', message: 'Falha ao iniciar background (offscreen). Recarregue a extensão.' });
        return;
      }
      try {
        offscreenPort.postMessage(msg);
      } catch (e) {
        port.postMessage({ type: 'ERROR', message: 'Background desconectado. Tente novamente.' });
      }
    });

    port.onDisconnect.addListener(() => {
      popupPorts.delete(port);
    });
  }
});

// Limpeza ao suspender
chrome.runtime.onSuspend.addListener(() => {
  try { offscreenPort && offscreenPort.disconnect(); } catch (e) {}
  offscreenPort = null;
  popupPorts.clear();
});
