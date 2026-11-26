const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const userDataPath = app ? app.getPath('userData') : __dirname;
const SETTINGS_FILE = path.join(userDataPath, 'settings.json');
const HISTORY_FILE = path.join(userDataPath, 'history.json');

const DEFAULT_SETTINGS = {
  roi: {
    x: 360,
    y: 820,
    width: 1200,
    height: 180
  },
  hotkeyCapture: 'Alt+S',          // Iniciar / pausar captura e traducao
  hotkeyCalibrate: 'Alt+A',        // Abrir editor de areas na tela
  hotkeyEdit: 'Alt+Z',             // Mover e redimensionar sobreposicao
  hotkeyToggle: 'Alt+X',           // Mostrar / ocultar HUD de legendas
  hotkeyGuide: 'Alt+C',            // Mostrar / ocultar contorno guia da area de captura
  hotkeyBackground: 'Alt+B',       // Alternar fundo preto (transparente vs solido)
  showCaptureGuide: false,
  autoHideIdle: true,              // Oculta a caixa automaticamente quando ninguem estiver falando
  autoHideDelayMs: 4500,           // Tempo em milissegundos ate o fade-out
  overlayOpacity: 0.0,             // 0.0 = 100% transparente (apenas texto com contorno, sem caixa preta)
  fontSize: 'medium',              // 'small', 'medium', 'large'
  textAlign: 'center',             // 'left', 'center', 'right'
  translationEngine: 'google',
  deeplApiKey: '',
  geminiApiKey: '',
  overlayPosition: {
    x: 360,
    y: 620,
    width: 1200,
    height: 150
  },
  scanIntervalMs: 120,
  activeProfile: 'GTA 4 (Padrão 1080p)',
  profiles: [
    {
      name: 'GTA 4 (Padrão 1080p)',
      roi: { x: 360, y: 820, width: 1200, height: 180 },
      overlayPosition: { x: 360, y: 620, width: 1200, height: 150 },
      overlayOpacity: 0.0,
      textAlign: 'center',
      fontSize: 'medium'
    }
  ],
  glossary: {
    'cuzzo': 'primo',
    'homie': 'mano',
    'po-po': 'polícia',
    'wasted': 'se fodeu',
    'busted': 'preso',
    'waste him': 'acabe com ele',
    'take him down': 'derrube ele',
    'pay and spray': "Pay 'n' Spray",
    'liberty city': 'Liberty City'
  }
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const loaded = JSON.parse(data);
      if (loaded.hotkey && !loaded.hotkeyEdit) {
        loaded.hotkeyEdit = loaded.hotkey;
      }
      // Corrige posicao antiga do overlay que sobrepunha exatamente a ROI padrao
      if (
        loaded.overlayPosition &&
        loaded.overlayPosition.x === 360 &&
        loaded.overlayPosition.y === 820 &&
        loaded.overlayPosition.width === 1200 &&
        loaded.overlayPosition.height === 160
      ) {
        loaded.overlayPosition = { ...DEFAULT_SETTINGS.overlayPosition };
      }
      return { ...DEFAULT_SETTINGS, ...loaded };
    }
  } catch (err) {
    console.error('Falha ao carregar configuracoes:', err);
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Falha ao salvar configuracoes:', err);
    return false;
  }
}

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Falha ao carregar historico:', err);
  }
  return [];
}

function appendHistory(entry) {
  try {
    const history = loadHistory();
    history.push(entry);
    const trimmed = history.slice(-500);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
    return trimmed;
  } catch (err) {
    console.error('Falha ao adicionar ao historico:', err);
    return [];
  }
}

function clearHistory() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Falha ao limpar historico:', err);
    return false;
  }
}

module.exports = {
  loadSettings,
  saveSettings,
  loadHistory,
  appendHistory,
  clearHistory,
  DEFAULT_SETTINGS
};
