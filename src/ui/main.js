let isCapturing = false;
let currentSettings = null;
let allHistory = [];

const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const btnToggleCapture = document.getElementById('btn-toggle-capture');
const btnToggleOverlay = document.getElementById('btn-toggle-overlay');
const btnToggleEditMode = document.getElementById('btn-toggle-edit-mode');
const btnToggleGuide = document.getElementById('btn-toggle-guide');
const btnToggleGuideSidebar = document.getElementById('btn-toggle-guide-sidebar');
const btnToggleBg = document.getElementById('btn-toggle-bg');
const btnOpenAreasHeader = document.getElementById('btn-open-areas-header');
const btnToggleDrawer = document.getElementById('btn-toggle-drawer');
const mainLayout = document.querySelector('main');
const liveCard = document.querySelector('.live-translation-card');

const btnAlignLeft = document.getElementById('btn-main-align-left');
const btnAlignCenter = document.getElementById('btn-main-align-center');
const btnAlignRight = document.getElementById('btn-main-align-right');
const perfStatsEl = document.getElementById('perf-stats');

const profileSelect = document.getElementById('profile-select');
const profileNameInput = document.getElementById('profile-name-input');
const btnSaveProfile = document.getElementById('btn-save-profile');
const btnDeleteProfile = document.getElementById('btn-delete-profile');

const livePt = document.getElementById('live-pt');
const liveEn = document.getElementById('live-en');
const activeTimestamp = document.getElementById('active-timestamp');
const historyList = document.getElementById('history-list');
const searchInput = document.getElementById('search-input');
const btnExport = document.getElementById('btn-export');
const btnClear = document.getElementById('btn-clear');
const roiPreviewBox = document.getElementById('roi-preview-box');

const roiInputX = document.getElementById('roi-input-x');
const roiInputY = document.getElementById('roi-input-y');
const roiInputW = document.getElementById('roi-input-w');
const roiInputH = document.getElementById('roi-input-h');
const btnApplyManualRoi = document.getElementById('btn-apply-manual-roi');
const btnCalibrateSidebar = document.getElementById('btn-calibrate-sidebar');

const presetGta4 = document.getElementById('preset-gta4');
const preset1440p = document.getElementById('preset-1440p');
const presetCompact = document.getElementById('preset-compact');

const opacityRange = document.getElementById('opacity-range');
const opacityValLabel = document.getElementById('opacity-val-label');
const btnSetOp0 = document.getElementById('btn-set-op-0');
const btnSetOp50 = document.getElementById('btn-set-op-50');
const btnSetOp85 = document.getElementById('btn-set-op-85');
const chkAutoHide = document.getElementById('chk-auto-hide');

const hotkeyCaptureInput = document.getElementById('hotkey-capture-input');
const hotkeyCalibrateInput = document.getElementById('hotkey-calibrate-input');
const hotkeyEditInput = document.getElementById('hotkey-edit-input');
const hotkeyToggleInput = document.getElementById('hotkey-toggle-input');
const hotkeyGuideInput = document.getElementById('hotkey-guide-input');
const hotkeyBgInput = document.getElementById('hotkey-bg-input');
const btnSaveSettings = document.getElementById('btn-save-settings');

const engineSelect = document.getElementById('engine-select');
const apiKeyGroup = document.getElementById('api-key-group');
const apiKeyInput = document.getElementById('api-key-input');
const intervalSelect = document.getElementById('interval-select');

function updateCaptureStatus(capturing) {
  isCapturing = capturing;
  const capKey = currentSettings?.hotkeyCapture || 'Alt+S';
  if (isCapturing) {
    statusDot.classList.add('active');
    statusText.textContent = 'CAPTURANDO EM TEMPO REAL';
    btnToggleCapture.textContent = `Pausar Captura [${capKey}]`;
    btnToggleCapture.classList.add('active');
  } else {
    statusDot.classList.remove('active');
    statusText.textContent = 'AGUARDANDO';
    btnToggleCapture.textContent = `Iniciar Captura [${capKey}]`;
    btnToggleCapture.classList.remove('active');
  }
}

function updateHotkeyLabels(settings) {
  const capKey = settings?.hotkeyCapture || 'Alt+S';
  const calKey = settings?.hotkeyCalibrate || 'Alt+A';
  const editKey = settings?.hotkeyEdit || 'Alt+Z';
  const toggleKey = settings?.hotkeyToggle || 'Alt+X';
  const guideKey = settings?.hotkeyGuide || 'Alt+C';
  const bgKey = settings?.hotkeyBackground || 'Alt+B';

  btnToggleCapture.textContent = isCapturing ? `Pausar Captura [${capKey}]` : `Iniciar Captura [${capKey}]`;
  if (btnOpenAreasHeader) {
    btnOpenAreasHeader.textContent = `Configurar Áreas na Tela [${calKey}]`;
  }
  if (btnToggleEditMode) {
    const isEdit = btnToggleEditMode.classList.contains('active');
    btnToggleEditMode.textContent = isEdit ? `Fixar HUD [${editKey}]` : `Mover HUD [${editKey}]`;
  }
  if (btnToggleOverlay) {
    const isVisible = !btnToggleOverlay.dataset.hidden;
    btnToggleOverlay.textContent = isVisible ? `Ocultar HUD [${toggleKey}]` : `Exibir HUD [${toggleKey}]`;
  }
  if (btnToggleGuideSidebar) {
    btnToggleGuideSidebar.textContent = `Guia no Jogo [${guideKey}]`;
  }
  if (btnToggleBg) {
    btnToggleBg.textContent = `Alternar [${bgKey}]`;
  }
}

function updateRoiInputs(roi) {
  if (!roi) return;
  roiInputX.value = roi.x;
  roiInputY.value = roi.y;
  roiInputW.value = roi.width;
  roiInputH.value = roi.height;
}

function updateOpacityUI(opValue) {
  const op = parseFloat(opValue) || 0.0;
  const percentage = Math.round(op * 100);
  opacityRange.value = percentage;

  if (percentage === 0) {
    opacityValLabel.textContent = '0% (Sem Caixa Preta)';
    opacityValLabel.style.color = '#86efac';
  } else if (percentage <= 50) {
    opacityValLabel.textContent = `${percentage}% (Translúcido)`;
    opacityValLabel.style.color = '#fef08a';
  } else {
    opacityValLabel.textContent = `${percentage}% (Fundo Escuro)`;
    opacityValLabel.style.color = '#f4f4f5';
  }
}

function updateEngineUI(engine, deeplKey, geminiKey) {
  if (engineSelect) engineSelect.value = engine || 'google';
  if (engine === 'deepl' || engine === 'gemini') {
    apiKeyGroup.style.display = '';
    apiKeyInput.value = engine === 'deepl' ? (deeplKey || '') : (geminiKey || '');
  } else {
    apiKeyGroup.style.display = 'none';
  }
}

function updateIntervalUI(interval) {
  if (intervalSelect) intervalSelect.value = String(interval || 250);
}

function updateAlignUI(align) {
  const mode = align || 'center';
  if (liveCard) {
    liveCard.classList.remove('align-left', 'align-center', 'align-right');
    liveCard.classList.add(`align-${mode}`);
  }
  [btnAlignLeft, btnAlignCenter, btnAlignRight].forEach((b) => {
    if (b) b.classList.remove('primary', 'active');
  });
  const activeBtn = mode === 'left' ? btnAlignLeft : mode === 'right' ? btnAlignRight : btnAlignCenter;
  if (activeBtn) activeBtn.classList.add('primary', 'active');
}

function renderProfilesUI(profiles = [], activeProfile = '') {
  if (!profileSelect) return;
  profileSelect.innerHTML = '';

  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '-- Selecione um perfil --';
  profileSelect.appendChild(defaultOpt);

  profiles.forEach((prof) => {
    const opt = document.createElement('option');
    opt.value = prof.name;
    opt.textContent = prof.name;
    if (prof.name === activeProfile) {
      opt.selected = true;
    }
    profileSelect.appendChild(opt);
  });
}

function renderHistory(items) {
  const filter = (searchInput.value || '').trim().toLowerCase();
  historyList.innerHTML = '';

  const filtered = items.filter((item) => {
    if (!filter) return true;
    return (
      (item.original && item.original.toLowerCase().includes(filter)) ||
      (item.translated && item.translated.toLowerCase().includes(filter))
    );
  });

  if (filtered.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.color = 'var(--text-muted)';
    emptyMsg.style.fontFamily = 'var(--font-mono)';
    emptyMsg.style.fontSize = '12px';
    emptyMsg.style.textAlign = 'center';
    emptyMsg.style.padding = '30px 0';
    emptyMsg.textContent = filter ? 'Nenhum diálogo encontrado para esta busca.' : 'O histórico desta sessão aparecerá aqui.';
    historyList.appendChild(emptyMsg);
    return;
  }

  const sorted = [...filtered].reverse();

  sorted.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'history-item';

    const header = document.createElement('div');
    header.className = 'history-item-header';

    const timeSpan = document.createElement('span');
    timeSpan.textContent = new Date(item.timestamp).toLocaleTimeString();

    const copyBtn = document.createElement('button');
    copyBtn.className = 'history-copy-btn';
    copyBtn.textContent = 'Copiar';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(`${item.original}\n${item.translated}`);
      copyBtn.textContent = 'Copiado!';
      setTimeout(() => { copyBtn.textContent = 'Copiar'; }, 1200);
    });

    header.appendChild(timeSpan);
    header.appendChild(copyBtn);

    const ptEl = document.createElement('div');
    ptEl.className = 'history-pt';
    ptEl.textContent = item.translated;

    const enEl = document.createElement('div');
    enEl.className = 'history-en';
    enEl.textContent = item.original;

    el.appendChild(header);
    el.appendChild(ptEl);
    el.appendChild(enEl);

    historyList.appendChild(el);
  });
}

function handleNewDialogue(dialogue) {
  livePt.textContent = dialogue.translated;
  liveEn.textContent = dialogue.original;
  activeTimestamp.textContent = new Date(dialogue.timestamp).toLocaleTimeString();

  allHistory.push(dialogue);
  renderHistory(allHistory);
}

async function applyManualRoi(roi) {
  currentSettings.roi = {
    x: parseInt(roi.x, 10),
    y: parseInt(roi.y, 10),
    width: parseInt(roi.width, 10),
    height: parseInt(roi.height, 10)
  };
  currentSettings = await window.api.saveSettings({ roi: currentSettings.roi });
  updateRoiInputs(currentSettings.roi);
  await window.api.testCaptureNow();
}

async function applyOpacityChange(val) {
  const op = val / 100;
  updateOpacityUI(op);
  currentSettings.overlayOpacity = op;
  await window.api.saveSettings({ overlayOpacity: op });
}

async function init() {
  currentSettings = await window.api.getSettings();
  allHistory = await window.api.getHistory();

  updateRoiInputs(currentSettings.roi);
  updateOpacityUI(currentSettings.overlayOpacity ?? 0.0);
  updateAlignUI(currentSettings.textAlign || 'center');
  renderProfilesUI(currentSettings.profiles || [], currentSettings.activeProfile || '');
  updateEngineUI(currentSettings.translationEngine, currentSettings.deeplApiKey, currentSettings.geminiApiKey);
  updateIntervalUI(currentSettings.scanIntervalMs);
  chkAutoHide.checked = currentSettings.autoHideIdle !== false;

  if (currentSettings.hotkeyCapture && hotkeyCaptureInput) hotkeyCaptureInput.value = currentSettings.hotkeyCapture;
  if (currentSettings.hotkeyCalibrate && hotkeyCalibrateInput) hotkeyCalibrateInput.value = currentSettings.hotkeyCalibrate;
  if (currentSettings.hotkeyEdit) hotkeyEditInput.value = currentSettings.hotkeyEdit;
  if (currentSettings.hotkeyToggle) hotkeyToggleInput.value = currentSettings.hotkeyToggle;
  if (currentSettings.hotkeyGuide) hotkeyGuideInput.value = currentSettings.hotkeyGuide;
  if (currentSettings.hotkeyBackground) hotkeyBgInput.value = currentSettings.hotkeyBackground;
  updateHotkeyLabels(currentSettings);

  renderHistory(allHistory);

  // Escuta eventos IPC
  window.api.onNewDialogue((dialogue) => {
    handleNewDialogue(dialogue);
  });

  window.api.onStateChange(({ isCapturing: capturing }) => {
    updateCaptureStatus(capturing);
  });

  window.api.onRoiPreview((dataUrl) => {
    if (!dataUrl) return;
    roiPreviewBox.innerHTML = '';
    const img = document.createElement('img');
    img.src = dataUrl;
    img.className = 'roi-preview-img';
    roiPreviewBox.appendChild(img);
  });

  window.api.onSettingsUpdated((newSettings) => {
    currentSettings = newSettings;
    updateRoiInputs(currentSettings.roi);
    updateOpacityUI(currentSettings.overlayOpacity ?? 0.0);
    updateAlignUI(newSettings.textAlign || 'center');
    renderProfilesUI(newSettings.profiles || [], newSettings.activeProfile || '');
    updateEngineUI(newSettings.translationEngine, newSettings.deeplApiKey, newSettings.geminiApiKey);
    updateIntervalUI(newSettings.scanIntervalMs);
    if (newSettings.hotkeyCapture && hotkeyCaptureInput) hotkeyCaptureInput.value = newSettings.hotkeyCapture;
    if (newSettings.hotkeyCalibrate && hotkeyCalibrateInput) hotkeyCalibrateInput.value = newSettings.hotkeyCalibrate;
    if (newSettings.hotkeyEdit) hotkeyEditInput.value = newSettings.hotkeyEdit;
    if (newSettings.hotkeyToggle) hotkeyToggleInput.value = newSettings.hotkeyToggle;
    if (newSettings.hotkeyGuide) hotkeyGuideInput.value = newSettings.hotkeyGuide;
    if (newSettings.hotkeyBackground) hotkeyBgInput.value = newSettings.hotkeyBackground;
    updateHotkeyLabels(newSettings);
  });

  window.api.onOverlayModeChange(({ isEditMode }) => {
    const editKey = currentSettings?.hotkeyEdit || 'Alt+Z';
    if (isEditMode) {
      btnToggleEditMode.textContent = `Fixar HUD [${editKey}]`;
      btnToggleEditMode.classList.add('active');
    } else {
      btnToggleEditMode.textContent = `Mover HUD [${editKey}]`;
      btnToggleEditMode.classList.remove('active');
    }
  });

  window.api.onOverlayVisibilityChange(({ visible }) => {
    const toggleKey = currentSettings?.hotkeyToggle || 'Alt+X';
    if (visible) {
      delete btnToggleOverlay.dataset.hidden;
      btnToggleOverlay.textContent = `Ocultar HUD [${toggleKey}]`;
    } else {
      btnToggleOverlay.dataset.hidden = '1';
      btnToggleOverlay.textContent = `Exibir HUD [${toggleKey}]`;
    }
  });

  window.api.onGuideVisibilityChange(({ visible }) => {
    if (btnToggleGuideSidebar) {
      btnToggleGuideSidebar.classList.toggle('active', Boolean(visible));
    }
  });

  window.api.onHotkeyWarning((failedList) => {
    if (Array.isArray(failedList) && failedList.length > 0) {
      const names = failedList.map((f) => `${f.accelerator} (${f.label})`).join(', ');
      statusText.textContent = `CONFLITO DE ATALHO: ${names}`;
    }
  });

  if (window.api.onPerfStats && perfStatsEl) {
    window.api.onPerfStats(({ captureMs, ocrMs, method, ocrEngine }) => {
      const ocrStr = ocrMs !== null ? ` | ${ocrEngine || 'OCR'} ${ocrMs}ms` : '';
      perfStatsEl.textContent = `${method} ${captureMs}ms${ocrStr}`;
    });
  }

  // Acoes dos Botoes
  btnToggleCapture.addEventListener('click', async () => {
    if (isCapturing) {
      await window.api.stopCapture();
    } else {
      await window.api.startCapture();
    }
  });

  btnToggleOverlay.addEventListener('click', async () => {
    await window.api.toggleOverlay();
  });

  btnToggleEditMode.addEventListener('click', async () => {
    await window.api.toggleOverlayEdit();
  });

  // Mostrar / Ocultar retangulo guia de captura na tela do jogo
  if (btnToggleGuide) {
    btnToggleGuide.addEventListener('click', async () => {
      await window.api.toggleCaptureGuide();
    });
  }
  if (btnToggleGuideSidebar) {
    btnToggleGuideSidebar.addEventListener('click', async () => {
      await window.api.toggleCaptureGuide();
    });
  }
  if (btnOpenAreasHeader) {
    btnOpenAreasHeader.addEventListener('click', async () => {
      await window.api.openCalibration();
    });
  }
  if (btnToggleDrawer && mainLayout) {
    btnToggleDrawer.addEventListener('click', () => {
      const collapsed = mainLayout.classList.toggle('drawer-collapsed');
      btnToggleDrawer.textContent = collapsed ? 'Abrir Painel' : 'Ocultar Painel';
    });
  }

  // Alinhamento do dialogo
  if (btnAlignLeft) {
    btnAlignLeft.addEventListener('click', async () => {
      updateAlignUI('left');
      await window.api.saveSettings({ textAlign: 'left' });
    });
  }
  if (btnAlignCenter) {
    btnAlignCenter.addEventListener('click', async () => {
      updateAlignUI('center');
      await window.api.saveSettings({ textAlign: 'center' });
    });
  }
  if (btnAlignRight) {
    btnAlignRight.addEventListener('click', async () => {
      updateAlignUI('right');
      await window.api.saveSettings({ textAlign: 'right' });
    });
  }

  // Perfis de Jogos / Predefinicoes de Area
  if (profileSelect) {
    profileSelect.addEventListener('change', async () => {
      const selectedName = profileSelect.value;
      if (!selectedName) return;
      const profiles = currentSettings.profiles || [];
      const found = profiles.find((p) => p.name === selectedName);
      if (!found) return;

      const patch = {
        activeProfile: found.name,
        roi: { ...found.roi }
      };
      if (found.overlayPosition) patch.overlayPosition = { ...found.overlayPosition };
      if (typeof found.overlayOpacity === 'number') patch.overlayOpacity = found.overlayOpacity;
      if (found.textAlign) patch.textAlign = found.textAlign;
      if (found.fontSize) patch.fontSize = found.fontSize;

      currentSettings = await window.api.saveSettings(patch);
      await window.api.testCaptureNow();
    });
  }

  if (btnSaveProfile) {
    btnSaveProfile.addEventListener('click', async () => {
      const typedName = (profileNameInput?.value || '').trim();
      const targetName = typedName || profileSelect?.value || '';
      if (!targetName) {
        profileNameInput?.focus();
        return;
      }

      const profiles = [...(currentSettings.profiles || [])];
      const newProfile = {
        name: targetName,
        roi: { ...currentSettings.roi },
        overlayPosition: { ...currentSettings.overlayPosition },
        overlayOpacity: currentSettings.overlayOpacity ?? 0.0,
        textAlign: currentSettings.textAlign || 'center',
        fontSize: currentSettings.fontSize || 'medium'
      };

      const existingIdx = profiles.findIndex((p) => p.name.toLowerCase() === targetName.toLowerCase());
      if (existingIdx >= 0) {
        profiles[existingIdx] = newProfile;
      } else {
        profiles.push(newProfile);
      }

      if (profileNameInput) profileNameInput.value = '';
      currentSettings = await window.api.saveSettings({
        profiles,
        activeProfile: targetName
      });

      btnSaveProfile.textContent = 'Salvo!';
      setTimeout(() => { btnSaveProfile.textContent = 'Salvar Perfil'; }, 1000);
    });
  }

  if (btnDeleteProfile) {
    btnDeleteProfile.addEventListener('click', async () => {
      const selectedName = profileSelect?.value;
      if (!selectedName) return;
      const profiles = (currentSettings.profiles || []).filter((p) => p.name !== selectedName);
      currentSettings = await window.api.saveSettings({
        profiles,
        activeProfile: ''
      });
    });
  }

  // Alternar fundo preto / transparente
  btnToggleBg.addEventListener('click', async () => {
    const newOp = await window.api.toggleBackgroundMode();
    updateOpacityUI(newOp);
  });

  btnCalibrateSidebar.addEventListener('click', async () => {
    await window.api.openCalibration();
  });

  // Controles de opacidade
  opacityRange.addEventListener('input', async (e) => {
    await applyOpacityChange(parseInt(e.target.value, 10));
  });

  btnSetOp0.addEventListener('click', async () => {
    await applyOpacityChange(0);
  });

  btnSetOp50.addEventListener('click', async () => {
    await applyOpacityChange(50);
  });

  btnSetOp85.addEventListener('click', async () => {
    await applyOpacityChange(85);
  });

  chkAutoHide.addEventListener('change', async (e) => {
    currentSettings.autoHideIdle = e.target.checked;
    await window.api.saveSettings({ autoHideIdle: e.target.checked });
  });

  // Motor de Traducao e Intervalo
  engineSelect.addEventListener('change', async (e) => {
    const engine = e.target.value;
    updateEngineUI(engine, currentSettings.deeplApiKey, currentSettings.geminiApiKey);
    await window.api.saveSettings({ translationEngine: engine });
  });

  apiKeyInput.addEventListener('change', async () => {
    const engine = engineSelect.value;
    const key = apiKeyInput.value.trim();
    if (engine === 'deepl') {
      await window.api.saveSettings({ deeplApiKey: key });
    } else if (engine === 'gemini') {
      await window.api.saveSettings({ geminiApiKey: key });
    }
  });

  intervalSelect.addEventListener('change', async (e) => {
    const interval = parseInt(e.target.value, 10);
    await window.api.saveSettings({ scanIntervalMs: interval });
  });

  // Coordenadas Manuais
  btnApplyManualRoi.addEventListener('click', async () => {
    btnApplyManualRoi.textContent = 'Aplicando...';
    await applyManualRoi({
      x: roiInputX.value,
      y: roiInputY.value,
      width: roiInputW.value,
      height: roiInputH.value
    });
    btnApplyManualRoi.textContent = 'Aplicado!';
    setTimeout(() => { btnApplyManualRoi.textContent = 'Aplicar Coordenadas'; }, 1000);
  });

  presetGta4.addEventListener('click', async () => {
    await applyManualRoi({ x: 360, y: 820, width: 1200, height: 180 });
  });

  preset1440p.addEventListener('click', async () => {
    await applyManualRoi({ x: 480, y: 1100, width: 1600, height: 240 });
  });

  presetCompact.addEventListener('click', async () => {
    await applyManualRoi({ x: 480, y: 860, width: 960, height: 150 });
  });

  // Salvar ajustes gerais e atalhos
  btnSaveSettings.addEventListener('click', async () => {
    const updated = {
      hotkeyCapture: hotkeyCaptureInput?.value.trim() || 'Alt+S',
      hotkeyCalibrate: hotkeyCalibrateInput?.value.trim() || 'Alt+A',
      hotkeyEdit: hotkeyEditInput.value.trim() || 'Alt+Z',
      hotkeyToggle: hotkeyToggleInput.value.trim() || 'Alt+X',
      hotkeyGuide: hotkeyGuideInput.value.trim() || 'Alt+C',
      hotkeyBackground: hotkeyBgInput.value.trim() || 'Alt+B',
      autoHideIdle: chkAutoHide.checked,
      translationEngine: engineSelect.value,
      scanIntervalMs: parseInt(intervalSelect.value, 10) || 250
    };

    // Inclui chave de API se aplicavel
    if (engineSelect.value === 'deepl') {
      updated.deeplApiKey = apiKeyInput.value.trim();
    } else if (engineSelect.value === 'gemini') {
      updated.geminiApiKey = apiKeyInput.value.trim();
    }

    currentSettings = await window.api.saveSettings(updated);
    btnSaveSettings.textContent = 'Configurações Salvas!';
    setTimeout(() => { btnSaveSettings.textContent = 'Salvar Todas as Configurações'; }, 1200);
  });

  searchInput.addEventListener('input', () => {
    renderHistory(allHistory);
  });

  btnClear.addEventListener('click', async () => {
    allHistory = await window.api.clearHistory();
    renderHistory(allHistory);
  });

  btnExport.addEventListener('click', async () => {
    await window.api.exportHistory('txt');
  });
}

window.addEventListener('DOMContentLoaded', init);
