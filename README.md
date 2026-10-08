# Transcrever Fala - Chrome Extension

Extensão Chrome (Manifest V3) para transcrição de fala em tempo real. Funciona em **background** via Offscreen Document — grava enquanto você navega em qualquer site.

## 🚀 Funcionalidades

- **Gravação em background** — continua gravando enquanto você troca de aba/navega
- **Transcrição em tempo real** — vê o texto aparecer enquanto fala
- **Múltiplos idiomas** — pt-BR, en-US, es-ES, fr-FR
- **Cópia rápida** — um clique copia para área de transferência
- **Atalhos de teclado** — Espaço (gravar/parar), Escape (parar), Ctrl+Enter (copiar), Ctrl+Backspace (limpar)
- **Tema escuro/claro** — adapta automaticamente ao Chrome
- **Funciona no Windows, macOS e Linux**

## 📦 Instalação

### Modo Desenvolvedor (para testar)

1. Baixe/clone este repositório
2. Abra `chrome://extensions/`
3. Ative **Modo do desenvolvedor** (canto superior direito)
3. Clique em **Carregar sem compactação** (Load unpacked)
4. Selecione a pasta `transcribe-extension/`

### Chrome Web Store (futuro)

*Em breve na Chrome Web Store*

## 🎯 Como usar

1. Clique no ícone da extensão na barra de ferramentas
2. Escolha o idioma (padrão: Português Brasil)
3. Clique em **"Começar a ouvir"**
3. **Pode trocar de aba, ir para qualquer site** — a gravação continua!
4. Fale normalmente
4. Volte ao popup para ver a transcrição em tempo real
5. Clique em **"Parar"** quando terminar
6. Clique em **"Copiar"** → cole onde quiser (Ctrl+V / Cmd+V)

## ⌨️ Atalhos (popup aberto)

| Tecla | Ação |
|-------|------|
| `Espaço` | Iniciar/Parar gravação |
| `Escape` | Parar gravação |
| `Ctrl/Cmd + Enter` | Copiar transcrição |
| `Ctrl/Cmd + Backspace` | Limpar transcrição |

## 🏗️ Arquitetura

```
├── manifest.json          # Manifest V3
├── background.js          # Service Worker (ponte popup ↔ offscreen)
├── offscreen.html         # Documento offscreen
├── offscreen.js           # SpeechRecognition roda aqui (background)
├── popup.html             # UI do popup
├── popup.js               # UI logic (comunica com background)
├── popup.css              # Estilos
├── mic.html / mic.js      # Aba de onboarding p/ liberar o microfone 1x
```

**Por que Offscreen Document?**
- Popup do Chrome fecha ao clicar fora → para gravação
- Offscreen Document roda em **background persistente**
- Funciona enquanto você navega em qualquer site

## 🔧 Permissões

| Permissão | Uso |
|-----------|-----|
| `offscreen` | Documento offscreen para SpeechRecognition |
| `clipboardWrite` | Copiar transcrição |
| `storage` | Flag de microfone liberado + (futuro) histórico |
| `contentSettings` | Tentar reverter bloqueio de microfone automaticamente |
| `host_permissions: https://api.languagetool.org/*` | Correção de gramática (botão ✨ Corrigir) |

## 🖥️ Compatibilidade

| SO | Chrome | Status |
|----|--------|--------|
| Windows 10/11 | 116+ | ✅ |
| macOS 12+ | 116+ | ✅ |
| Linux | 116+ | ✅ |

**Requisitos:**
- Chrome 116+ (para Offscreen Document)
- Permissão de microfone concedida
- Microfone funcionando no SO

## 🐛 Solução de problemas

| Problema | Solução |
|----------|---------|
| "Permissão de microfone negada" | O popup abre sozinho a aba `mic.html` → clique em **Permitir microfone** → **Permitir** no Chrome |
| "Ainda bloqueado" após Permitir | `chrome://settings/content/microphone` → tire a extensão do **Bloquear** |
| Windows: mic não aparece | Configurações → Privacidade → Microfone → permita o **Google Chrome**; Sistema → Som → confira o dispositivo de entrada |
| Mac: mic não aparece | Ajustes do Sistema → Privacidade e Segurança → Microfone → ative o **Google Chrome** |
| "Erro de conexão / Reconectando" | O popup reconecta sozinho em ~1s; clique de novo. Se persistir: `chrome://extensions/` → 🔄 Recarregar |
| Não transcreve | Verifique se microfone funciona nas configurações do SO |
| Extensão não carrega | `chrome://extensions/` → 🔄 Recarregar |
| Popup fecha ao gravar | Normal — a gravação continua em background |

## 📄 Licença

MIT License - veja [LICENSE](LICENSE)

## 🤝 Contribuindo

1. Fork o projeto
2. Crie branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit (`git commit -m 'feat: nova funcionalidade'`)
4. Push (`git push origin feature/nova-funcionalidade`)
5. Abra Pull Request

## 📋 Roadmap

- [ ] Inserir texto direto no campo focado da página ativa
- [ ] Histórico de transcrições
- [ ] Exportar como .txt / .srt
- [ ] Configuração de atalhos personalizados
- [ ] Publicar na Chrome Web Store