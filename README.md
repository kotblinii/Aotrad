# Aotrad - Tradutor de Legendas em Tempo Real para Jogos

Utilitário desktop desenvolvido em Electron para jogadores que necessitam de tradução simultânea em tempo real para jogos e vídeos sem localização em Português do Brasil (PT-BR) — como *Grand Theft Auto IV*, emuladores e transmissões em inglês.

---

## Recursos Implementados

1. **Captura GPU Ultra-Rápida (DXGI Desktop Duplication) & Privacidade (ROI):**
   * Recorta e processa estritamente a região definida pelo usuário (ROI), sem capturar o restante da tela.
   * Utiliza captura nativa via Chromium `desktopCapturer` (DXGI Desktop Duplication) com recorte direto em `<canvas>` e binarização de luminância para isolar legendas claras.
   * **Delta Hash** na imagem binarizada: ignora movimento de cenário atrás da legenda e só aciona o OCR quando o texto realmente muda.

2. **OCR Nativo de Baixa Latência (`Windows.Media.Ocr` + Tesseract Fallback):**
   * Worker persistente usando a API WinRT nativa do Windows (`Windows.Media.Ocr`) com latência típica de poucos milissegundos.
   * Fallback automático para `tesseract.js` (`PSM 6`) com filtro de ruído visual e deduplicação por distância de Levenshtein (`>= 80%`).

3. **Editor Unificado de Áreas na Tela (`Alt+A`):**
   * Exibe simultaneamente em todos os monitores a **Área de Captura (Verde)** e a **Área da Tradução / HUD (Azul Ciano)**.
   * Permite desenhar, arrastar, redimensionar pelos cantos, trazer qualquer caixa de outro monitor e visualizar a transparência em tempo real.
   * **Perfis por Jogo:** Salve e alterne facilmente entre layouts completos (ex: `GTA 4`, `YouTube`) incluindo ROI, posição do HUD, opacidade, alinhamento e tamanho da fonte.

4. **In-Game Overlay (HUD Sobreposto) & Segundo Monitor:**
   * **HUD Sobreposto:** Janela transparente sem bordas e click-through durante o jogo (para jogos em modo *Janela sem Bordas* / *Borderless*), com auto-ocultação após 4,5s de silêncio, controle de opacidade (`0%`, `50%`, `85%`), alinhamento (`Esquerda`, `Centro`, `Direita`) e fontes (`P`, `M`, `G`).
   * **Janela Companion (2º Monitor):** Exibe a legenda ativa em destaque, histórico cronológico pesquisável (`[EN]` vs `[PT-BR]`), cópia rápida, exportação em `.txt`, `.srt` ou `.json` e barra lateral retrátil (`Ocultar Painel`).

5. **Motor de Tradução e Glossário de Gírias:**
   * Tradução gratuita via Google Translate (sem necessidade de chaves), com suporte opcional a DeepL API e Google Gemini API.
   * Glossário integrado aplicado antes e depois da tradução com gírias comuns do *GTA IV* (*cuzzo* -> *primo*, *po-po* -> *polícia*, *waste him* -> *acabe com ele*, etc.).

---

## Atalhos Globais Padrão

| Atalho | Ação |
|---|---|
| `Alt+S` | Iniciar / Pausar Captura em Tempo Real |
| `Alt+A` | Configurar Áreas na Tela (Captura + Tradução) |
| `Alt+Z` | Mover / Redimensionar HUD no Modo Edição |
| `Alt+X` | Mostrar / Ocultar HUD |
| `Alt+C` | Mostrar / Ocultar Guia da Área de Captura no Jogo |
| `Alt+B` | Alternar Fundo Preto do HUD (`0%` <-> `85%`) |

> Todos os atalhos podem ser personalizados na barra lateral em **+ Atalhos & Velocidade**. Caso o GeForce Experience / NVIDIA App utilize `Alt+Z`, o aplicativo detecta o conflito e exibe um aviso na barra de status.

---

## Como Executar

No terminal (PowerShell) dentro da pasta do projeto:

```powershell
npm.cmd install
npm.cmd start
```

Ou simplesmente dê um clique duplo em `start.bat`.

Para rodar a suíte de testes do motor:

```powershell
node test_engine.js
```

---

## Estrutura de Arquivos

```
Aotrad/
├── main.js                          # Processo principal Electron (janelas, DXGI, atalhos globais, IPC)
├── preload.js                       # Context Bridge seguro para comunicação IPC
├── start.bat                        # Inicializador rápido para Windows
├── test_engine.js                   # Suíte de testes automatizados do motor
└── src/
    ├── engine/
    │   ├── capture.js               # Captura fallback (screenshot-desktop) com recorte ROI e binarização
    │   ├── ocr.js                   # Orquestrador OCR (WinOCR primário + Tesseract fallback + Levenshtein)
    │   ├── win_ocr.js / win_ocr.ps1 # Worker persistente Windows.Media.Ocr (WinRT nativo)
    │   └── translator.js            # Tradução híbrida (Google/DeepL/Gemini), cache e glossário
    ├── config/
    │   └── store.js                 # Persistência de configurações, perfis por jogo e histórico
    └── ui/
        ├── main.html/.css/.js       # Companion Window (2º monitor, histórico, perfis, gaveta retrátil)
        ├── overlay.html/.css/.js    # HUD sobreposto transparente com modo edição e alinhamento
        ├── calibrate.html/.css/.js  # Editor unificado multi-monitor (Verde + Azul)
        ├── guide.html               # Contorno guia da área de captura
        └── capture_worker.html/.js  # Worker DXGI Desktop Duplication em GPU
```
