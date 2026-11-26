const { app, BrowserWindow, ipcMain, globalShortcut, screen, dialog, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const screenshot = require('screenshot-desktop');

// Impede que o Chromium reduza a taxa de quadros do worker DXGI quando um jogo estiver em foco
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

const store = require('./src/config/store');
const capture = require('./src/engine/capture');
const ocr = require('./src/engine/ocr');
const translator = require('./src/engine/translator');

let mainWindow = null;
let overlayWindow = null;
let captureWorkerWindow = null;
let calibrateWindows = [];
let calibrateBgMap = new Map();
let captureGuideWindow = null;
let wasGuideVisibleBeforeCalibrate = false;

let isCapturing = false;
let captureIntervalTimer = null;
let isCycleRunning = false; // Trava para evitar sobreposicao de ciclos de captura
let isOverlayEditMode = false;
let isHudEnabled = true; // Controlado pelo usuario via Alt+X / botao Exibir HUD
let overlaySaveTimer = null;
let dxgiInitialized = false;
let currentSettings = null;
let captureReqCounter = 0;
let previewTickCounter = 0;
let translationSeq = 0;
const pendingCaptureRequests = new Map();
let cachedDesktopSources = null;
let cachedSourcesTime = 0;

function initializeSettings() {
  currentSettings = store.loadSettings();
}

function createMainWindow() {
  const displays = screen.getAllDisplays();
  const targetDisplay = displays.length > 1 ? displays[1] : displays[0];

  mainWindow = new BrowserWindow({
    width: 1120,
    height: 780,
    x: targetDisplay.bounds.x + 40,
    y: targetDisplay.bounds.y + 40,
    minWidth: 840,
    minHeight: 520,
    backgroundColor: '#09090b',
    title: 'Aotrad - Companion & Histórico de Diálogos',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'ui', 'main.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.close();
    if (captureWorkerWindow && !captureWorkerWindow.isDestroyed()) captureWorkerWindow.close();
    closeAllCalibrateWindows();
    if (captureGuideWindow && !captureGuideWindow.isDestroyed()) captureGuideWindow.close();
  });
}

function createCaptureWorkerWindow() {
  if (captureWorkerWindow && !captureWorkerWindow.isDestroyed()) return;
  captureWorkerWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width: 4,
    height: 4,
    frame: false,
    transparent: true,
    opacity: 0.0,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  captureWorkerWindow.setIgnoreMouseEvents(true);
  captureWorkerWindow.loadFile(path.join(__dirname, 'src', 'ui', 'capture_worker.html'));
  captureWorkerWindow.on('closed', () => {
    captureWorkerWindow = null;
  });
}

function createOverlayWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const defaultPos = currentSettings.overlayPosition || {
    x: Math.round(primaryDisplay.bounds.x + primaryDisplay.bounds.width * 0.15),
    y: Math.round(primaryDisplay.bounds.y + primaryDisplay.bounds.height * 0.58),
    width: Math.round(primaryDisplay.bounds.width * 0.7),
    height: 150
  };

  overlayWindow = new BrowserWindow({
    x: defaultPos.x,
    y: defaultPos.y,
    width: defaultPos.width,
    height: defaultPos.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWindow.loadFile(path.join(__dirname, 'src', 'ui', 'overlay.html'));

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true);

  // Modo jogo inicial: cliques passam direto para o jogo
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  function scheduleOverlayBoundsSave() {
    if (!overlayWindow || overlayWindow.isDestroyed() || !isOverlayEditMode) return;
    currentSettings.overlayPosition = overlayWindow.getBounds();
    if (overlaySaveTimer) clearTimeout(overlaySaveTimer);
    overlaySaveTimer = setTimeout(() => {
      store.saveSettings(currentSettings);
    }, 300);
  }

  overlayWindow.on('resize', scheduleOverlayBoundsSave);
  overlayWindow.on('move', scheduleOverlayBoundsSave);

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function getGuideBoundsFromRoi(roi) {
  const safeRoi = roi || { x: 360, y: 820, width: 1200, height: 180 };
  const borderPad = 3;
  const headerHeight = 24;
  return {
    x: Math.round(safeRoi.x - borderPad),
    y: Math.round(safeRoi.y - headerHeight - borderPad),
    width: Math.round(safeRoi.width + borderPad * 2),
    height: Math.round(safeRoi.height + headerHeight + borderPad * 2)
  };
}

function createCaptureGuideWindow() {
  if (captureGuideWindow && !captureGuideWindow.isDestroyed()) {
    updateCaptureGuideBounds();
    captureGuideWindow.showInactive();
    captureGuideWindow.setAlwaysOnTop(true, 'screen-saver');
    captureGuideWindow.moveTop();
    return;
  }

  const guideBounds = getGuideBoundsFromRoi(currentSettings.roi);

  captureGuideWindow = new BrowserWindow({
    x: guideBounds.x,
    y: guideBounds.y,
    width: guideBounds.width,
    height: guideBounds.height,
    frame: false,
    transparent: true,
    show: false,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  captureGuideWindow.setAlwaysOnTop(true, 'screen-saver');
  captureGuideWindow.setVisibleOnAllWorkspaces(true);
  captureGuideWindow.setIgnoreMouseEvents(true, { forward: true });

  captureGuideWindow.loadFile(path.join(__dirname, 'src', 'ui', 'guide.html'));

  captureGuideWindow.once('ready-to-show', () => {
    if (captureGuideWindow && !captureGuideWindow.isDestroyed()) {
      updateCaptureGuideBounds();
      captureGuideWindow.showInactive();
      captureGuideWindow.setAlwaysOnTop(true, 'screen-saver');
      captureGuideWindow.moveTop();
    }
  });

  captureGuideWindow.on('closed', () => {
    captureGuideWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('guide-visibility-change', { visible: false });
    }
  });
}

function toggleCaptureGuide() {
  let visible = false;
  if (!captureGuideWindow || captureGuideWindow.isDestroyed()) {
    createCaptureGuideWindow();
    visible = true;
  } else if (captureGuideWindow.isVisible()) {
    captureGuideWindow.hide();
    visible = false;
  } else {
    updateCaptureGuideBounds();
    captureGuideWindow.showInactive();
    captureGuideWindow.setAlwaysOnTop(true, 'screen-saver');
    captureGuideWindow.moveTop();
    visible = true;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('guide-visibility-change', { visible });
  }
  return visible;
}

function updateCaptureGuideBounds() {
  if (captureGuideWindow && !captureGuideWindow.isDestroyed() && currentSettings.roi) {
    captureGuideWindow.setBounds(getGuideBoundsFromRoi(currentSettings.roi));
  }
}

function toggleBackgroundMode() {
  const currentOp = currentSettings.overlayOpacity ?? 0.0;
  // Alterna entre transparente (0.0) e semitransparente escuro (0.85)
  const newOp = currentOp > 0 ? 0.0 : 0.85;
  currentSettings.overlayOpacity = newOp;
  store.saveSettings(currentSettings);

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('settings-updated', currentSettings);
    if (isHudEnabled) {
      if (!overlayWindow.isVisible()) overlayWindow.showInactive();
      overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      overlayWindow.moveTop();
      const bgKey = currentSettings.hotkeyBackground || 'Alt+B';
      overlayWindow.webContents.send('hud-flash', {
        title: newOp > 0 ? 'Fundo do HUD: Escuro (85%)' : 'Fundo do HUD: Transparente (0%)',
        sub: `[${bgKey} para alternar]`
      });
    }
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings-updated', currentSettings);
  }
  return newOp;
}

function closeAllCalibrateWindows() {
  for (const win of calibrateWindows) {
    if (win && !win.isDestroyed()) {
      win.close();
    }
  }
  calibrateWindows = [];
  calibrateBgMap.clear();

  if (wasGuideVisibleBeforeCalibrate && captureGuideWindow && !captureGuideWindow.isDestroyed()) {
    updateCaptureGuideBounds();
    captureGuideWindow.show();
  }
  wasGuideVisibleBeforeCalibrate = false;
}

async function createCalibrateWindow() {
  if (calibrateWindows.length > 0) {
    calibrateWindows.forEach((w) => {
      if (w && !w.isDestroyed()) w.focus();
    });
    return;
  }

  // Oculta temporariamente o retangulo guia para nao aparecer no print nem duplicar
  wasGuideVisibleBeforeCalibrate = Boolean(
    captureGuideWindow && !captureGuideWindow.isDestroyed() && captureGuideWindow.isVisible()
  );
  if (wasGuideVisibleBeforeCalibrate) {
    captureGuideWindow.hide();
  }

  const displays = screen.getAllDisplays();
  calibrateBgMap.clear();

  // Captura o quadro atual de cada monitor antes de abrir a tela de edicao
  // Isso evita tela cinza em videos fullscreen/jogos e permite posicionar sobre a imagem real
  try {
    const ssDisplays = await screenshot.listDisplays();
    await Promise.all(
      displays.map(async (display) => {
        const match = ssDisplays.find(
          (d) => d.left === display.bounds.x && d.top === display.bounds.y
        ) || ssDisplays[0];
        if (match) {
          const buf = await screenshot({ format: 'png', screen: match.id });
          calibrateBgMap.set(`${display.bounds.x},${display.bounds.y}`, `data:image/png;base64,${buf.toString('base64')}`);
        }
      })
    );
  } catch (err) {
    console.warn('Falha ao capturar fundo da calibracao:', err.message);
  }

  displays.forEach((display) => {
    const bgKey = `${display.bounds.x},${display.bounds.y}`;
    const win = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      fullscreen: true,
      show: false,
      alwaysOnTop: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      hasShadow: false,
      backgroundColor: '#09090b',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true);

    win.loadFile(path.join(__dirname, 'src', 'ui', 'calibrate.html'), {
      query: {
        ox: String(display.bounds.x),
        oy: String(display.bounds.y),
        bgKey
      }
    });

    win.on('ready-to-show', () => {
      if (win && !win.isDestroyed()) {
        win.setBounds(display.bounds);
        win.show();
      }
    });

    win.on('closed', () => {
      calibrateWindows = calibrateWindows.filter((w) => w !== win);
    });

    calibrateWindows.push(win);
  });
}

function toggleOverlayVisibility() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
  }

  if (isHudEnabled) {
    isHudEnabled = false;
    if (isOverlayEditMode) {
      isOverlayEditMode = false;
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      overlayWindow.setFocusable(false);
      overlayWindow.webContents.send('overlay-mode-change', { isEditMode: false });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('overlay-mode-change', { isEditMode: false });
      }
    }
    overlayWindow.hide();
  } else {
    isHudEnabled = true;
    overlayWindow.showInactive();
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.moveTop();
    const toggleKey = currentSettings.hotkeyToggle || 'Alt+X';
    overlayWindow.webContents.send('hud-flash', {
      title: 'HUD Ativado',
      sub: `[${toggleKey} para ocultar]`
    });
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('overlay-visibility-change', { visible: isHudEnabled });
  }
  return isHudEnabled;
}

function toggleOverlayEditMode() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
  }

  isHudEnabled = true;
  if (!overlayWindow.isVisible()) {
    overlayWindow.showInactive();
  }

  isOverlayEditMode = !isOverlayEditMode;
  if (isOverlayEditMode) {
    overlayWindow.setFocusable(true);
    overlayWindow.setIgnoreMouseEvents(false);
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.moveTop();
    overlayWindow.focus();
    overlayWindow.webContents.send('overlay-mode-change', { isEditMode: true });
  } else {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.setFocusable(false);
    overlayWindow.webContents.send('overlay-mode-change', { isEditMode: false });
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('overlay-visibility-change', { visible: isHudEnabled });
    mainWindow.webContents.send('overlay-mode-change', { isEditMode: isOverlayEditMode });
  }
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  const failedHotkeys = [];

  function tryRegister(accelerator, label, handler) {
    if (!accelerator) return;
    try {
      const ok = globalShortcut.register(accelerator, handler);
      if (!ok) {
        console.warn(`Atalho '${accelerator}' (${label}) já está em uso por outro aplicativo.`);
        failedHotkeys.push({ accelerator, label });
      }
    } catch (err) {
      console.error(`Erro ao registrar atalho '${accelerator}':`, err);
      failedHotkeys.push({ accelerator, label });
    }
  }

  tryRegister(currentSettings.hotkeyCapture || 'Alt+S', 'Iniciar/Pausar Captura', () => {
    if (isCapturing) stopCapture();
    else startCapture();
  });

  tryRegister(currentSettings.hotkeyCalibrate || 'Alt+A', 'Configurar Áreas', () => {
    if (calibrateWindows.length > 0) closeAllCalibrateWindows();
    else createCalibrateWindow();
  });

  tryRegister(currentSettings.hotkeyEdit || 'Alt+Z', 'Mover HUD', () => {
    toggleOverlayEditMode();
  });

  tryRegister(currentSettings.hotkeyToggle || 'Alt+X', 'Exibir/Ocultar HUD', () => {
    toggleOverlayVisibility();
  });

  tryRegister(currentSettings.hotkeyGuide || 'Alt+C', 'Guia no Jogo', () => {
    toggleCaptureGuide();
  });

  tryRegister(currentSettings.hotkeyBackground || 'Alt+B', 'Fundo Preto', () => {
    toggleBackgroundMode();
  });

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('hotkey-warning', failedHotkeys);
  }
}

async function getDesktopSourceForRoi(roi) {
  const now = Date.now();
  if (!cachedDesktopSources || now - cachedSourcesTime > 5000) {
    cachedDesktopSources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 }
    });
    cachedSourcesTime = now;
  }

  const centerPoint = {
    x: Math.round(roi.x + roi.width / 2),
    y: Math.round(roi.y + roi.height / 2)
  };
  const allDisplays = screen.getAllDisplays();
  const targetDisplay = screen.getDisplayNearestPoint(centerPoint);
  const displayIndex = allDisplays.findIndex((d) => d.id === targetDisplay.id);

  const source =
    cachedDesktopSources.find((s) => s.display_id && String(s.display_id) === String(targetDisplay.id)) ||
    cachedDesktopSources[displayIndex >= 0 ? displayIndex : 0] ||
    cachedDesktopSources[0];

  return { sourceId: source?.id, displayBounds: targetDisplay.bounds };
}

async function fastCaptureRoi(roi, excludeRects, needPreview) {
  if (captureWorkerWindow && !captureWorkerWindow.isDestroyed()) {
    try {
      const { sourceId, displayBounds } = await getDesktopSourceForRoi(roi);
      if (sourceId) {
        const reqId = ++captureReqCounter;
        const timeoutMs = dxgiInitialized ? 450 : 1800;
        const result = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            pendingCaptureRequests.delete(reqId);
            reject(new Error('Timeout na captura DXGI'));
          }, timeoutMs);
          pendingCaptureRequests.set(reqId, { resolve, timer });
          captureWorkerWindow.webContents.send('do-capture', {
            reqId,
            roi,
            excludeRects,
            brightnessThreshold: 175,
            sourceId,
            displayBounds,
            needPreview
          });
        });

        if (result && !result.error) {
          dxgiInitialized = true;
          return {
            method: 'DXGI',
            changed: result.changed,
            ocrBuffer: result.ocrPngBytes ? Buffer.from(result.ocrPngBytes) : null,
            previewDataUrl: result.previewDataUrl,
            dimensions: result.dimensions
          };
        }
      }
    } catch (_err) {
      // Recorre ao fallback screenshot-desktop abaixo
    }
  }
  const fallback = await capture.captureRoi(roi, { excludeRects });
  return { ...fallback, method: 'GDI' };
}

async function translateAndPublish(text, settingsSnapshot, seq) {
  try {
    const dialogue = await translator.translateText(text, settingsSnapshot);
    if (seq !== translationSeq) return; // Descarta se ja surgiu legenda mais nova

    store.appendHistory(dialogue);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('new-dialogue', dialogue);
    }
    if (overlayWindow && !overlayWindow.isDestroyed() && isHudEnabled) {
      if (!overlayWindow.isVisible()) {
        overlayWindow.showInactive();
      }
      overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      overlayWindow.moveTop();
      overlayWindow.webContents.send('new-dialogue', dialogue);
    }
  } catch (err) {
    console.error('Erro na traducao assincrona:', err);
  }
}

async function performCaptureCycle() {
  if (!isCapturing || isCycleRunning) return;
  isCycleRunning = true;

  try {
    const tCapStart = Date.now();
    // Exclui a propria janela de sobreposicao da captura para evitar loop de retroalimentacao
    const excludeRects = [];
    if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
      excludeRects.push(overlayWindow.getBounds());
    }

    previewTickCounter = (previewTickCounter + 1) % 2;
    const needPreview = previewTickCounter === 0;

    const roiResult = await fastCaptureRoi(currentSettings.roi, excludeRects, needPreview);
    const captureMs = Date.now() - tCapStart;
    if (!roiResult) {
      return;
    }

    if (mainWindow && !mainWindow.isDestroyed() && roiResult.previewDataUrl) {
      mainWindow.webContents.send('roi-preview', roiResult.previewDataUrl);
    }

    if (!roiResult.changed) {
      if (mainWindow && !mainWindow.isDestroyed() && needPreview) {
        mainWindow.webContents.send('perf-stats', {
          captureMs,
          ocrMs: null,
          method: roiResult.method || 'DXGI'
        });
      }
      return;
    }

    const ocrBuffer = roiResult.ocrBuffer || roiResult.croppedBuffer;
    if (!ocrBuffer) return;

    const tOcrStart = Date.now();
    const ocrResult = await ocr.recognize(ocrBuffer);
    const ocrMs = Date.now() - tOcrStart;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('perf-stats', {
        captureMs,
        ocrMs,
        method: roiResult.method || 'DXGI',
        ocrEngine: ocrResult.engineUsed || 'winocr'
      });
    }

    if (ocrResult.isDuplicate || !ocrResult.text) {
      return;
    }

    // Dispara traducao sem travar o proximo ciclo de captura + OCR
    const seq = ++translationSeq;
    const settingsSnapshot = { ...currentSettings };
    translateAndPublish(ocrResult.text, settingsSnapshot, seq);
  } catch (err) {
    console.error('Erro no ciclo de captura e traducao:', err);
  } finally {
    isCycleRunning = false;
  }
}

function resetAllCaptureHashes() {
  capture.resetDeltaHash();
  if (captureWorkerWindow && !captureWorkerWindow.isDestroyed()) {
    captureWorkerWindow.webContents.send('reset-capture-hash');
  }
}

function startCapture() {
  if (isCapturing) return true;
  isCapturing = true;
  resetAllCaptureHashes();
  ocr.resetLastRecognizedText();

  const interval = currentSettings.scanIntervalMs || 120;
  captureIntervalTimer = setInterval(performCaptureCycle, interval);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state-change', { isCapturing: true });
  }
  return true;
}

function stopCapture() {
  if (!isCapturing) return false;
  isCapturing = false;
  if (captureIntervalTimer) {
    clearInterval(captureIntervalTimer);
    captureIntervalTimer = null;
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state-change', { isCapturing: false });
  }
  return false;
}

function setupIpcHandlers() {
  ipcMain.handle('start-capture', () => {
    return startCapture();
  });

  ipcMain.handle('stop-capture', () => {
    return stopCapture();
  });

  ipcMain.handle('get-settings', () => {
    return currentSettings;
  });

  ipcMain.handle('save-settings', (_event, newSettings) => {
    // Garante que valores de ROI sejam inteiros
    if (newSettings.roi) {
      newSettings.roi = {
        x: Math.round(newSettings.roi.x),
        y: Math.round(newSettings.roi.y),
        width: Math.round(newSettings.roi.width),
        height: Math.round(newSettings.roi.height)
      };
      capture.resetDeltaHash();
    }
    if (newSettings.overlayPosition && typeof newSettings.overlayPosition.x === 'number') {
      newSettings.overlayPosition = {
        x: Math.round(newSettings.overlayPosition.x),
        y: Math.round(newSettings.overlayPosition.y),
        width: Math.round(newSettings.overlayPosition.width),
        height: Math.round(newSettings.overlayPosition.height)
      };
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.setBounds(newSettings.overlayPosition);
      }
    }
    currentSettings = { ...currentSettings, ...newSettings };
    store.saveSettings(currentSettings);
    registerHotkeys();
    updateCaptureGuideBounds();

    if (isCapturing) {
      stopCapture();
      startCapture();
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('settings-updated', currentSettings);
    }
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('settings-updated', currentSettings);
    }
    return currentSettings;
  });

  ipcMain.handle('get-history', () => {
    return store.loadHistory();
  });

  ipcMain.handle('clear-history', () => {
    store.clearHistory();
    return [];
  });

  ipcMain.handle('export-history', async (_event, format) => {
    const history = store.loadHistory();
    const { filePath } = await dialog.showSaveDialog({
      title: 'Exportar Histórico de Diálogos',
      defaultPath: `dialogos_${Date.now()}.${format || 'txt'}`,
      filters: [
        { name: 'Arquivo de Texto', extensions: ['txt'] },
        { name: 'Arquivo SRT (Legenda)', extensions: ['srt'] },
        { name: 'JSON', extensions: ['json'] }
      ]
    });

    if (!filePath) return false;

    let content = '';
    if (format === 'json') {
      content = JSON.stringify(history, null, 2);
    } else if (format === 'srt') {
      content = history.map((item, idx) => {
        const startMs = item.timestamp;
        const endMs = (idx + 1 < history.length) ? history[idx + 1].timestamp : startMs + 5000;
        const fmtTime = (ms) => {
          const d = new Date(ms);
          return d.toISOString().substr(11, 8) + ',' + String(d.getMilliseconds()).padStart(3, '0');
        };
        return `${idx + 1}\n${fmtTime(startMs)} --> ${fmtTime(endMs)}\n${item.translated}\n\n`;
      }).join('');
    } else {
      content = history.map((item) => {
        const date = new Date(item.timestamp).toLocaleTimeString();
        return `[${date}]\nEN:    ${item.original}\nPT-BR: ${item.translated}\n----------------------------------------\n`;
      }).join('\n');
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  });

  ipcMain.handle('open-calibration', async () => {
    await createCalibrateWindow();
    return true;
  });

  ipcMain.handle('get-calibrate-bg', (_event, bgKey) => {
    return calibrateBgMap.get(bgKey) || null;
  });

  ipcMain.handle('confirm-calibration', (_event, payload) => {
    const newRoi = payload.roi || payload;
    if (newRoi && typeof newRoi.x === 'number') {
      currentSettings.roi = {
        x: Math.round(newRoi.x),
        y: Math.round(newRoi.y),
        width: Math.round(newRoi.width),
        height: Math.round(newRoi.height)
      };
    }

    if (payload.overlayPosition && typeof payload.overlayPosition.x === 'number') {
      currentSettings.overlayPosition = {
        x: Math.round(payload.overlayPosition.x),
        y: Math.round(payload.overlayPosition.y),
        width: Math.round(payload.overlayPosition.width),
        height: Math.round(payload.overlayPosition.height)
      };
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.setBounds(currentSettings.overlayPosition);
      }
    }

    if (typeof payload.overlayOpacity === 'number') {
      currentSettings.overlayOpacity = payload.overlayOpacity;
    }
    if (payload.fontSize) {
      currentSettings.fontSize = payload.fontSize;
    }

    store.saveSettings(currentSettings);
    updateCaptureGuideBounds();
    closeAllCalibrateWindows();
    capture.resetDeltaHash();

    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('settings-updated', currentSettings);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('settings-updated', currentSettings);
      mainWindow.focus();
    }
    return true;
  });

  ipcMain.handle('cancel-calibration', () => {
    closeAllCalibrateWindows();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
    }
    return true;
  });

  ipcMain.handle('toggle-overlay', () => {
    return toggleOverlayVisibility();
  });

  ipcMain.handle('toggle-overlay-edit', () => {
    toggleOverlayEditMode();
    return isOverlayEditMode;
  });

  ipcMain.handle('toggle-capture-guide', () => {
    return toggleCaptureGuide();
  });

  ipcMain.handle('toggle-background-mode', () => {
    return toggleBackgroundMode();
  });

  ipcMain.handle('set-overlay-position', (_event, bounds) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setBounds(bounds);
      currentSettings.overlayPosition = bounds;
      store.saveSettings(currentSettings);
    }
    return true;
  });

  ipcMain.handle('set-overlay-edit-mode', (_event, isEditMode) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      isOverlayEditMode = isEditMode;
      overlayWindow.setIgnoreMouseEvents(!isEditMode, { forward: true });
      overlayWindow.webContents.send('overlay-mode-change', { isEditMode });
    }
    return true;
  });

  ipcMain.on('capture-result', (_event, result) => {
    const pending = pendingCaptureRequests.get(result.reqId);
    if (pending) {
      clearTimeout(pending.timer);
      pendingCaptureRequests.delete(result.reqId);
      pending.resolve(result);
    }
  });

  ipcMain.handle('test-capture-now', async () => {
    await performCaptureCycle();
    return true;
  });
}

app.whenReady().then(() => {
  initializeSettings();
  setupIpcHandlers();
  registerHotkeys();

  createMainWindow();
  createOverlayWindow();
  createCaptureWorkerWindow();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.once('did-finish-load', () => {
      registerHotkeys();
    });
  }
  if (captureWorkerWindow && !captureWorkerWindow.isDestroyed()) {
    captureWorkerWindow.webContents.once('did-finish-load', () => {
      // Pre-aquece o stream DXGI para que a primeira captura seja instantanea (~10ms)
      fastCaptureRoi(currentSettings.roi, [], false).catch(() => {});
    });
  }

  ocr.getWorker();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  ocr.terminateWorker();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
