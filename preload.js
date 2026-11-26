const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Eventos recebidos do processo principal
  onNewDialogue: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('new-dialogue', subscription);
    return () => ipcRenderer.removeListener('new-dialogue', subscription);
  },
  onStateChange: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('state-change', subscription);
    return () => ipcRenderer.removeListener('state-change', subscription);
  },
  onOverlayModeChange: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('overlay-mode-change', subscription);
    return () => ipcRenderer.removeListener('overlay-mode-change', subscription);
  },
  onOverlayVisibilityChange: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('overlay-visibility-change', subscription);
    return () => ipcRenderer.removeListener('overlay-visibility-change', subscription);
  },
  onGuideVisibilityChange: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('guide-visibility-change', subscription);
    return () => ipcRenderer.removeListener('guide-visibility-change', subscription);
  },
  onHudFlash: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('hud-flash', subscription);
    return () => ipcRenderer.removeListener('hud-flash', subscription);
  },
  onHotkeyWarning: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('hotkey-warning', subscription);
    return () => ipcRenderer.removeListener('hotkey-warning', subscription);
  },
  onPerfStats: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('perf-stats', subscription);
    return () => ipcRenderer.removeListener('perf-stats', subscription);
  },
  onRoiPreview: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('roi-preview', subscription);
    return () => ipcRenderer.removeListener('roi-preview', subscription);
  },
  onSettingsUpdated: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('settings-updated', subscription);
    return () => ipcRenderer.removeListener('settings-updated', subscription);
  },
  onDoCapture: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('do-capture', subscription);
    return () => ipcRenderer.removeListener('do-capture', subscription);
  },
  onResetCaptureHash: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('reset-capture-hash', subscription);
    return () => ipcRenderer.removeListener('reset-capture-hash', subscription);
  },
  sendCaptureResult: (result) => ipcRenderer.send('capture-result', result),

  // Acoes enviadas ao processo principal
  startCapture: () => ipcRenderer.invoke('start-capture'),
  stopCapture: () => ipcRenderer.invoke('stop-capture'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  exportHistory: (format) => ipcRenderer.invoke('export-history', format),
  openCalibration: () => ipcRenderer.invoke('open-calibration'),
  getCalibrateBg: (bgKey) => ipcRenderer.invoke('get-calibrate-bg', bgKey),
  confirmCalibration: (roi) => ipcRenderer.invoke('confirm-calibration', roi),
  cancelCalibration: () => ipcRenderer.invoke('cancel-calibration'),
  toggleOverlay: () => ipcRenderer.invoke('toggle-overlay'),
  toggleOverlayEdit: () => ipcRenderer.invoke('toggle-overlay-edit'),
  toggleCaptureGuide: () => ipcRenderer.invoke('toggle-capture-guide'),
  toggleBackgroundMode: () => ipcRenderer.invoke('toggle-background-mode'),
  setOverlayPosition: (bounds) => ipcRenderer.invoke('set-overlay-position', bounds),
  setOverlayEditMode: (isEditMode) => ipcRenderer.invoke('set-overlay-edit-mode', isEditMode),
  testCaptureNow: () => ipcRenderer.invoke('test-capture-now')
});
