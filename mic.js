// mic.js - página de onboarding: pede mic numa ABA (prompt confiável, não fecha)
// Funciona igual no Windows, macOS e Linux: a permissão é da origem chrome-extension://
(function() {
  const btn = document.getElementById('allowBtn');
  const status = document.getElementById('status');

  function show(msg, cls) {
    status.textContent = msg;
    status.className = cls || '';
  }

  async function request() {
    show('Pedindo microfone…');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      try { s.getTracks().forEach(t => t.stop()); } catch (e) {}
      try { await chrome.storage.local.set({ micGranted: true, micGrantedAt: Date.now() }); } catch (e) {}
      show('Microfone liberado! Pode fechar esta aba e voltar ao popup > Começar a ouvir.', 'ok');
      setTimeout(() => { try { window.close(); } catch (e) {} }, 1500);
    } catch (e) {
      console.warn('mic tab gUM falhou:', e);
      if (e && e.name === 'NotAllowedError') {
        show('Ainda bloqueado. No ícone de câmera/microfone na barra de endereço, mude para Permitir e clique de novo.', 'err');
      } else if (e && e.name === 'NotFoundError') {
        show('Nenhum microfone encontrado. No Windows: Configurações > Sistema > Som > verifique o dispositivo de entrada.', 'err');
      } else {
        show('Erro: ' + (e && e.message || e), 'err');
      }
    }
  }

  btn.addEventListener('click', request);
})();
