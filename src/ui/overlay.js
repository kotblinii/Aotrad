const container = document.getElementById('overlay-container');
const overlayPt = document.getElementById('overlay-pt');
const overlayEn = document.getElementById('overlay-en');

const btnOp0 = document.getElementById('btn-op-0');
const btnOp50 = document.getElementById('btn-op-50');
const btnOp85 = document.getElementById('btn-op-85');

const btnSizeP = document.getElementById('btn-size-p');
const btnSizeM = document.getElementById('btn-size-m');
const btnSizeG = document.getElementById('btn-size-g');
const btnAlignLeft = document.getElementById('btn-align-left');
const btnAlignCenter = document.getElementById('btn-align-center');
const btnAlignRight = document.getElementById('btn-align-right');
const btnCloseEdit = document.getElementById('btn-close-edit');
const hotkeyIndicator = document.getElementById('hotkey-indicator');

let isEditMode = false;
let autoHideTimer = null;
let currentSettings = null;

function applyOpacity(opacity) {
  const op = parseFloat(opacity) || 0.0;
  container.style.setProperty('--overlay-bg-color', `rgba(9, 9, 11, ${op})`);

  btnOp0.classList.remove('active');
  btnOp50.classList.remove('active');
  btnOp85.classList.remove('active');

  if (op === 0) btnOp0.classList.add('active');
  else if (op > 0 && op <= 0.6) btnOp50.classList.add('active');
  else if (op > 0.6) btnOp85.classList.add('active');
}

function setFontSize(size) {
  container.classList.remove('size-small', 'size-medium', 'size-large');
  btnSizeP.classList.remove('active');
  btnSizeM.classList.remove('active');
  btnSizeG.classList.remove('active');

  if (size === 'small') {
    container.classList.add('size-small');
    btnSizeP.classList.add('active');
  } else if (size === 'large') {
    container.classList.add('size-large');
    btnSizeG.classList.add('active');
  } else {
    container.classList.add('size-medium');
    btnSizeM.classList.add('active');
  }
}

function setTextAlign(align) {
  container.classList.remove('align-left', 'align-center', 'align-right');
  btnAlignLeft.classList.remove('active');
  btnAlignCenter.classList.remove('active');
  btnAlignRight.classList.remove('active');

  if (align === 'left') {
    container.classList.add('align-left');
    btnAlignLeft.classList.add('active');
  } else if (align === 'right') {
    container.classList.add('align-right');
    btnAlignRight.classList.add('active');
  } else {
    container.classList.add('align-center');
    btnAlignCenter.classList.add('active');
  }
}

function showSubtitleTemporarily() {
  container.classList.add('visible');

  if (currentSettings?.autoHideIdle !== false && !isEditMode) {
    if (autoHideTimer) clearTimeout(autoHideTimer);
    const delay = currentSettings?.autoHideDelayMs || 4500;
    autoHideTimer = setTimeout(() => {
      if (!isEditMode) {
        container.classList.remove('visible');
      }
    }, delay);
  }
}

function updateEditMode(editModeActive) {
  isEditMode = editModeActive;
  if (isEditMode) {
    if (autoHideTimer) clearTimeout(autoHideTimer);
    container.classList.add('edit-mode');
    container.classList.add('visible');
    if (!overlayPt.textContent) {
      overlayPt.textContent = 'Posição do Diálogo Traduzido';
      overlayEn.textContent = '[Exemplo de legenda em inglês]';
    }
  } else {
    container.classList.remove('edit-mode');
    // Se nao houver dialogo ativo recente, oculta o HUD
    if (currentSettings?.autoHideIdle !== false) {
      showSubtitleTemporarily();
    }
  }
}

function updateHotkeyText(settings) {
  const editKey = settings.hotkeyEdit || 'Alt+Z';
  const toggleKey = settings.hotkeyToggle || 'Alt+X';
  const bgKey = settings.hotkeyBackground || 'Alt+B';
  hotkeyIndicator.textContent = `[${editKey}: Mover] | [${bgKey}: Fundo] | [${toggleKey}: Ocultar]`;
}

async function init() {
  currentSettings = await window.api.getSettings();
  if (currentSettings) {
    if (currentSettings.fontSize) setFontSize(currentSettings.fontSize);
    setTextAlign(currentSettings.textAlign || 'center');
    applyOpacity(currentSettings.overlayOpacity ?? 0.0);
    updateHotkeyText(currentSettings);
  }

  window.api.onNewDialogue((dialogue) => {
    overlayPt.textContent = dialogue.translated;
    overlayEn.textContent = dialogue.original;
    showSubtitleTemporarily();
  });

  window.api.onHudFlash(({ title, sub }) => {
    // Se nao ha dialogo ativo no momento, mostra feedback visual temporario do atalho
    if (!container.classList.contains('visible') || !overlayPt.textContent) {
      overlayPt.textContent = title || 'HUD Ativo';
      overlayEn.textContent = sub || '';
    }
    showSubtitleTemporarily();
  });

  window.api.onOverlayModeChange(({ isEditMode: mode }) => {
    updateEditMode(mode);
  });

  window.api.onSettingsUpdated((newSettings) => {
    currentSettings = newSettings;
    if (newSettings.fontSize) setFontSize(newSettings.fontSize);
    setTextAlign(newSettings.textAlign || 'center');
    applyOpacity(newSettings.overlayOpacity ?? 0.0);
    updateHotkeyText(newSettings);
  });

  // Botoes de opacidade no cabecalho de edicao
  btnOp0.addEventListener('click', async () => {
    applyOpacity(0.0);
    await window.api.saveSettings({ overlayOpacity: 0.0 });
  });

  btnOp50.addEventListener('click', async () => {
    applyOpacity(0.5);
    await window.api.saveSettings({ overlayOpacity: 0.5 });
  });

  btnOp85.addEventListener('click', async () => {
    applyOpacity(0.85);
    await window.api.saveSettings({ overlayOpacity: 0.85 });
  });

  // Botoes de tamanho de fonte
  btnSizeP.addEventListener('click', async () => {
    setFontSize('small');
    await window.api.saveSettings({ fontSize: 'small' });
  });

  btnSizeM.addEventListener('click', async () => {
    setFontSize('medium');
    await window.api.saveSettings({ fontSize: 'medium' });
  });

  btnSizeG.addEventListener('click', async () => {
    setFontSize('large');
    await window.api.saveSettings({ fontSize: 'large' });
  });

  // Botoes de alinhamento
  btnAlignLeft.addEventListener('click', async () => {
    setTextAlign('left');
    await window.api.saveSettings({ textAlign: 'left' });
  });

  btnAlignCenter.addEventListener('click', async () => {
    setTextAlign('center');
    await window.api.saveSettings({ textAlign: 'center' });
  });

  btnAlignRight.addEventListener('click', async () => {
    setTextAlign('right');
    await window.api.saveSettings({ textAlign: 'right' });
  });

  btnCloseEdit.addEventListener('click', async () => {
    await window.api.setOverlayEditMode(false);
  });
}

window.addEventListener('DOMContentLoaded', init);
