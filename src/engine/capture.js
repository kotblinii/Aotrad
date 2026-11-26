const screenshot = require('screenshot-desktop');
const { PNG } = require('pngjs');

let lastPixelHash = null;

/**
 * Calcula uma assinatura simples dos pixels da imagem cortada
 * para detectar variacao de quadro (Delta Hash).
 */
function computePixelHash(data, sampleStep = 16) {
  let hash = 0;
  for (let i = 0; i < data.length; i += sampleStep) {
    hash = (hash * 31 + data[i]) | 0;
  }
  return hash;
}

/**
 * Verifica se o ponto (px, py) em coordenadas de tela esta dentro de algum retangulo excluido
 * (ex: a propria janela de sobreposicao, para evitar loop de retroalimentacao).
 */
function isPointExcluded(px, py, excludeRects) {
  if (!excludeRects || excludeRects.length === 0) return false;
  for (let i = 0; i < excludeRects.length; i++) {
    const r = excludeRects[i];
    if (px >= r.x && px < r.x + r.width && py >= r.y && py < r.y + r.height) {
      return true;
    }
  }
  return false;
}

/**
 * Captura a tela, recorta estritamente a regiao ROI selecionada,
 * mascara janelas proprias sobrepostas (como o HUD) e gera uma imagem
 * binarizada (texto preto em fundo branco) para o OCR.
 */
async function captureRoi(roi, options = {}) {
  try {
    const excludeRects = options.excludeRects || [];
    const brightnessThreshold = options.brightnessThreshold || 175;

    // Descobre em qual monitor a ROI esta localizada para suportar multiplos monitores
    let displayOffsetX = 0;
    let displayOffsetY = 0;
    let screenshotOpts = { format: 'png' };

    try {
      const displays = await screenshot.listDisplays();
      if (displays && displays.length > 0) {
        const centerX = roi.x + roi.width / 2;
        const centerY = roi.y + roi.height / 2;
        const target = displays.find(
          (d) => centerX >= d.left && centerX < d.right && centerY >= d.top && centerY < d.bottom
        );
        if (target) {
          screenshotOpts.screen = target.id;
          displayOffsetX = target.left || 0;
          displayOffsetY = target.top || 0;
        }
      }
    } catch (_dispErr) {
      // Fallback silencioso para captura padrao
    }

    const fullScreenshotBuffer = await screenshot(screenshotOpts);
    const fullPng = PNG.sync.read(fullScreenshotBuffer);

    // Converte ROI de coordenadas globais para coordenadas locais do monitor capturado
    const localRoiX = roi.x - displayOffsetX;
    const localRoiY = roi.y - displayOffsetY;

    // Ajusta coordenadas caso ultrapassem as dimensoes da tela
    const safeX = Math.max(0, Math.min(localRoiX, fullPng.width - 1));
    const safeY = Math.max(0, Math.min(localRoiY, fullPng.height - 1));
    const safeWidth = Math.max(10, Math.min(roi.width, fullPng.width - safeX));
    const safeHeight = Math.max(10, Math.min(roi.height, fullPng.height - safeY));

    const croppedPng = new PNG({ width: safeWidth, height: safeHeight });
    const ocrPng = new PNG({ width: safeWidth, height: safeHeight });

    let brightPixelCount = 0;
    const totalPixels = safeWidth * safeHeight;

    // Copia estritamente os pixels da regiao ROI e gera versao binarizada para OCR
    for (let y = 0; y < safeHeight; y++) {
      const localY = safeY + y;
      const screenY = displayOffsetY + localY;
      for (let x = 0; x < safeWidth; x++) {
        const localX = safeX + x;
        const screenX = displayOffsetX + localX;
        const dstIdx = (y * safeWidth + x) << 2;

        // Se o pixel pertence a sobreposicao do proprio Aotrad, mascara para evitar espelhamento
        if (isPointExcluded(screenX, screenY, excludeRects)) {
          croppedPng.data[dstIdx] = 0;
          croppedPng.data[dstIdx + 1] = 0;
          croppedPng.data[dstIdx + 2] = 0;
          croppedPng.data[dstIdx + 3] = 255;

          ocrPng.data[dstIdx] = 255;
          ocrPng.data[dstIdx + 1] = 255;
          ocrPng.data[dstIdx + 2] = 255;
          ocrPng.data[dstIdx + 3] = 255;
          continue;
        }

        const srcIdx = (localY * fullPng.width + localX) << 2;
        const r = fullPng.data[srcIdx];
        const g = fullPng.data[srcIdx + 1];
        const b = fullPng.data[srcIdx + 2];
        const a = fullPng.data[srcIdx + 3];

        croppedPng.data[dstIdx] = r;
        croppedPng.data[dstIdx + 1] = g;
        croppedPng.data[dstIdx + 2] = b;
        croppedPng.data[dstIdx + 3] = a;

        // Binarizacao por luminancia: legendas de jogos sao claras (branco/amarelo)
        // Invertemos para texto PRETO em fundo BRANCO, ideal para o Tesseract
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        if (luminance >= brightnessThreshold) {
          brightPixelCount++;
          ocrPng.data[dstIdx] = 0;
          ocrPng.data[dstIdx + 1] = 0;
          ocrPng.data[dstIdx + 2] = 0;
          ocrPng.data[dstIdx + 3] = 255;
        } else {
          ocrPng.data[dstIdx] = 255;
          ocrPng.data[dstIdx + 1] = 255;
          ocrPng.data[dstIdx + 2] = 255;
          ocrPng.data[dstIdx + 3] = 255;
        }
      }
    }

    // Calcula hash na imagem binarizada para ignorar movimento do cenario atras da legenda
    const currentHash = computePixelHash(ocrPng.data, 8);
    const hasEnoughText = brightPixelCount >= 15 && brightPixelCount <= totalPixels * 0.55;
    const hasChanged = hasEnoughText && (lastPixelHash === null || currentHash !== lastPixelHash);
    if (hasEnoughText) {
      lastPixelHash = currentHash;
    }

    const croppedBuffer = PNG.sync.write(croppedPng);
    const ocrBuffer = PNG.sync.write(ocrPng);
    const previewDataUrl = `data:image/png;base64,${croppedBuffer.toString('base64')}`;

    return {
      changed: hasChanged,
      croppedBuffer,
      ocrBuffer,
      previewDataUrl,
      dimensions: { width: safeWidth, height: safeHeight }
    };
  } catch (err) {
    console.error('Erro na captura da ROI:', err);
    return { changed: false, croppedBuffer: null, ocrBuffer: null, previewDataUrl: null, error: err.message };
  }
}

function resetDeltaHash() {
  lastPixelHash = null;
}

module.exports = {
  captureRoi,
  resetDeltaHash
};
