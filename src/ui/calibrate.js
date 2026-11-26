const captureBoxEl = document.getElementById('capture-box');
const captureBadgeEl = document.getElementById('capture-badge');
const hudBoxEl = document.getElementById('hud-box');
const hudBadgeEl = document.getElementById('hud-badge');
const overlapWarningEl = document.getElementById('overlap-warning');

const btnBringCapture = document.getElementById('btn-bring-capture');
const btnBringHud = document.getElementById('btn-bring-hud');
const btnCalOp0 = document.getElementById('btn-cal-op-0');
const btnCalOp50 = document.getElementById('btn-cal-op-50');
const btnCalOp85 = document.getElementById('btn-cal-op-85');
const btnConfirm = document.getElementById('btn-confirm');
const btnCancel = document.getElementById('btn-cancel');

const urlParams = new URLSearchParams(window.location.search);
const offsetX = parseInt(urlParams.get('ox') || '0', 10);
const offsetY = parseInt(urlParams.get('oy') || '0', 10);
const bgKey = urlParams.get('bgKey') || '';
const bgSnapshotEl = document.getElementById('bg-snapshot');

let globalRoi = null;
let globalHud = null;
let currentOpacity = 0.0;

let interactionMode = null; // 'draw-capture' | 'move' | 'resize'
let activeTarget = null;    // 'capture' | 'hud'
let resizeDir = '';
let startX = 0;
let startY = 0;
let startBox = { left: 0, top: 0, width: 0, height: 0 };

function isRectInThisDisplay(rect) {
  if (!rect) return false;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return (
    cx >= offsetX &&
    cx < offsetX + window.innerWidth &&
    cy >= offsetY &&
    cy < offsetY + window.innerHeight
  );
}

function rectsOverlap(a, b) {
  if (!a || !b) return false;
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function updateOverlapWarning() {
  if (rectsOverlap(globalRoi, globalHud)) {
    overlapWarningEl.classList.add('visible');
  } else {
    overlapWarningEl.classList.remove('visible');
  }
}

function renderBox(type, rect) {
  const el = type === 'capture' ? captureBoxEl : hudBoxEl;
  const badge = type === 'capture' ? captureBadgeEl : hudBadgeEl;

  if (!isRectInThisDisplay(rect)) {
    el.style.display = 'none';
    return;
  }

  const localX = rect.x - offsetX;
  const localY = rect.y - offsetY;

  el.style.left = `${localX}px`;
  el.style.top = `${localY}px`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
  el.style.display = 'flex';

  if (type === 'capture') {
    badge.textContent = `1. LER LEGENDA DO JOGO (${rect.width} x ${rect.height})`;
  } else {
    badge.textContent = `2. MOSTRAR TRADUÇÃO AQUI (${rect.width} x ${rect.height})`;
  }
}

function applyHudOpacity(op) {
  currentOpacity = op;
  hudBoxEl.style.backgroundColor = `rgba(9, 9, 11, ${op})`;

  btnCalOp0.classList.remove('active');
  btnCalOp50.classList.remove('active');
  btnCalOp85.classList.remove('active');

  if (op === 0) btnCalOp0.classList.add('active');
  else if (op <= 0.6) btnCalOp50.classList.add('active');
  else btnCalOp85.classList.add('active');
}

async function init() {
  try {
    if (bgKey && bgSnapshotEl) {
      const bgDataUrl = await window.api.getCalibrateBg(bgKey);
      if (bgDataUrl) {
        bgSnapshotEl.src = bgDataUrl;
      }
    }

    const settings = await window.api.getSettings();
    globalRoi = settings?.roi
      ? { ...settings.roi }
      : { x: offsetX + 360, y: offsetY + 820, width: 1200, height: 180 };

    globalHud = settings?.overlayPosition
      ? { ...settings.overlayPosition }
      : { x: offsetX + 360, y: offsetY + 620, width: 1200, height: 150 };

    applyHudOpacity(settings?.overlayOpacity ?? 0.0);
    renderBox('capture', globalRoi);
    renderBox('hud', globalHud);
    updateOverlapWarning();
  } catch (err) {
    console.error('Erro ao inicializar editor de areas:', err);
  }
}

window.addEventListener('mousedown', (e) => {
  if (e.target.closest('#top-toolbar')) return;

  const handle = e.target.closest('.resize-handle');
  if (handle) {
    interactionMode = 'resize';
    activeTarget = handle.dataset.box;
    resizeDir = handle.dataset.dir;
    startX = e.clientX;
    startY = e.clientY;
    const rect = activeTarget === 'capture' ? globalRoi : globalHud;
    startBox = {
      left: rect.x - offsetX,
      top: rect.y - offsetY,
      width: rect.width,
      height: rect.height
    };
    return;
  }

  if (e.target.closest('#hud-box')) {
    interactionMode = 'move';
    activeTarget = 'hud';
    startX = e.clientX;
    startY = e.clientY;
    startBox = {
      left: globalHud.x - offsetX,
      top: globalHud.y - offsetY,
      width: globalHud.width,
      height: globalHud.height
    };
    return;
  }

  if (e.target.closest('#capture-box')) {
    interactionMode = 'move';
    activeTarget = 'capture';
    startX = e.clientX;
    startY = e.clientY;
    startBox = {
      left: globalRoi.x - offsetX,
      top: globalRoi.y - offsetY,
      width: globalRoi.width,
      height: globalRoi.height
    };
    return;
  }

  // Clicou fora de ambas as caixas: desenha nova area de captura (verde)
  interactionMode = 'draw-capture';
  activeTarget = 'capture';
  startX = e.clientX;
  startY = e.clientY;

  captureBoxEl.style.left = `${startX}px`;
  captureBoxEl.style.top = `${startY}px`;
  captureBoxEl.style.width = '0px';
  captureBoxEl.style.height = '0px';
  captureBoxEl.style.display = 'flex';
});

window.addEventListener('mousemove', (e) => {
  if (!interactionMode) return;

  const dx = e.clientX - startX;
  const dy = e.clientY - startY;

  if (interactionMode === 'move') {
    const newLeft = Math.max(0, Math.min(window.innerWidth - startBox.width, startBox.left + dx));
    const newTop = Math.max(0, Math.min(window.innerHeight - startBox.height, startBox.top + dy));
    const updated = {
      x: newLeft + offsetX,
      y: newTop + offsetY,
      width: startBox.width,
      height: startBox.height
    };
    if (activeTarget === 'capture') {
      globalRoi = updated;
      renderBox('capture', globalRoi);
    } else {
      globalHud = updated;
      renderBox('hud', globalHud);
    }
    updateOverlapWarning();
    return;
  }

  if (interactionMode === 'resize') {
    let left = startBox.left;
    let top = startBox.top;
    let width = startBox.width;
    let height = startBox.height;

    if (resizeDir.includes('e')) width = Math.max(80, startBox.width + dx);
    if (resizeDir.includes('s')) height = Math.max(40, startBox.height + dy);
    if (resizeDir.includes('w')) {
      const clampedDx = Math.min(dx, startBox.width - 80);
      left = startBox.left + clampedDx;
      width = startBox.width - clampedDx;
    }
    if (resizeDir.includes('n')) {
      const clampedDy = Math.min(dy, startBox.height - 40);
      top = startBox.top + clampedDy;
      height = startBox.height - clampedDy;
    }

    const updated = { x: left + offsetX, y: top + offsetY, width, height };
    if (activeTarget === 'capture') {
      globalRoi = updated;
      renderBox('capture', globalRoi);
    } else {
      globalHud = updated;
      renderBox('hud', globalHud);
    }
    updateOverlapWarning();
    return;
  }

  if (interactionMode === 'draw-capture') {
    const left = Math.min(startX, e.clientX);
    const top = Math.min(startY, e.clientY);
    const width = Math.abs(dx);
    const height = Math.abs(dy);

    captureBoxEl.style.left = `${left}px`;
    captureBoxEl.style.top = `${top}px`;
    captureBoxEl.style.width = `${width}px`;
    captureBoxEl.style.height = `${height}px`;
    captureBadgeEl.textContent = `1. LER LEGENDA DO JOGO (${width} x ${height})`;
  }
});

window.addEventListener('mouseup', () => {
  if (!interactionMode) return;
  const mode = interactionMode;
  interactionMode = null;

  if (mode === 'draw-capture') {
    const left = parseInt(captureBoxEl.style.left, 10) || 0;
    const top = parseInt(captureBoxEl.style.top, 10) || 0;
    const width = parseInt(captureBoxEl.style.width, 10) || 0;
    const height = parseInt(captureBoxEl.style.height, 10) || 0;

    if (width >= 40 && height >= 20) {
      globalRoi = { x: left + offsetX, y: top + offsetY, width, height };
      renderBox('capture', globalRoi);
      updateOverlapWarning();
    } else {
      renderBox('capture', globalRoi);
    }
  }
});

btnBringCapture.addEventListener('click', (e) => {
  e.stopPropagation();
  const w = Math.min(globalRoi?.width || 1000, window.innerWidth - 40);
  const h = globalRoi?.height || 150;
  globalRoi = {
    x: offsetX + Math.round((window.innerWidth - w) / 2),
    y: offsetY + window.innerHeight - h - 50,
    width: w,
    height: h
  };
  renderBox('capture', globalRoi);
  updateOverlapWarning();
});

btnBringHud.addEventListener('click', (e) => {
  e.stopPropagation();
  const w = Math.min(globalHud?.width || 1000, window.innerWidth - 40);
  const h = globalHud?.height || 140;
  globalHud = {
    x: offsetX + Math.round((window.innerWidth - w) / 2),
    y: offsetY + window.innerHeight - h - 220,
    width: w,
    height: h
  };
  renderBox('hud', globalHud);
  updateOverlapWarning();
});

btnCalOp0.addEventListener('click', (e) => { e.stopPropagation(); applyHudOpacity(0.0); });
btnCalOp50.addEventListener('click', (e) => { e.stopPropagation(); applyHudOpacity(0.5); });
btnCalOp85.addEventListener('click', (e) => { e.stopPropagation(); applyHudOpacity(0.85); });

async function saveAndClose() {
  await window.api.confirmCalibration({
    roi: globalRoi,
    overlayPosition: globalHud,
    overlayOpacity: currentOpacity
  });
}

btnConfirm.addEventListener('click', async (e) => {
  e.stopPropagation();
  await saveAndClose();
});

btnCancel.addEventListener('click', async (e) => {
  e.stopPropagation();
  await window.api.cancelCalibration();
});

window.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape') {
    await window.api.cancelCalibration();
  } else if (e.key === 'Enter') {
    await saveAndClose();
  }
});

window.addEventListener('DOMContentLoaded', init);
