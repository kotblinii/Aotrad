const video = document.getElementById('screen-video');
const roiCanvas = document.getElementById('roi-canvas');
const roiCtx = roiCanvas.getContext('2d', { willReadFrequently: true });
const ocrCanvas = document.getElementById('ocr-canvas');
const ocrCtx = ocrCanvas.getContext('2d', { willReadFrequently: true });

let activeSourceId = null;
let activeStream = null;
let lastPixelHash = null;

async function ensureStream(sourceId) {
  if (activeSourceId === sourceId && activeStream && video.readyState >= 2) {
    return true;
  }

  if (activeStream) {
    activeStream.getTracks().forEach((t) => t.stop());
    activeStream = null;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        maxFrameRate: 30
      }
    }
  });

  activeStream = stream;
  activeSourceId = sourceId;
  video.srcObject = stream;
  try { await video.play(); } catch (_e) {}

  await new Promise((resolve) => {
    if (video.readyState >= 2 && video.videoWidth > 0) return resolve();
    video.onloadeddata = () => resolve();
    setTimeout(resolve, 1200);
  });

  return video.videoWidth > 0;
}

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

function computePixelHash(data, sampleStep = 8) {
  let hash = 0;
  for (let i = 0; i < data.length; i += sampleStep) {
    hash = (hash * 31 + data[i]) | 0;
  }
  return hash;
}

async function canvasToPngArrayBuffer(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return resolve(null);
      const ab = await blob.arrayBuffer();
      resolve(new Uint8Array(ab));
    }, 'image/png');
  });
}

window.api.onResetCaptureHash(() => {
  lastPixelHash = null;
});

window.api.onDoCapture(async (req) => {
  const { reqId, roi, excludeRects, brightnessThreshold = 175, sourceId, displayBounds, needPreview } = req;

  try {
    const ready = await ensureStream(sourceId);
    if (!ready) {
      window.api.sendCaptureResult({ reqId, error: 'Stream de video nao pronto' });
      return;
    }

    const vidW = video.videoWidth;
    const vidH = video.videoHeight;
    const scaleX = vidW / displayBounds.width;
    const scaleY = vidH / displayBounds.height;

    const localX = Math.max(0, Math.min(roi.x - displayBounds.x, displayBounds.width - 1));
    const localY = Math.max(0, Math.min(roi.y - displayBounds.y, displayBounds.height - 1));
    const safeW = Math.max(10, Math.min(roi.width, displayBounds.width - localX));
    const safeH = Math.max(10, Math.min(roi.height, displayBounds.height - localY));

    const sx = Math.round(localX * scaleX);
    const sy = Math.round(localY * scaleY);
    const sw = Math.max(10, Math.round(safeW * scaleX));
    const sh = Math.max(10, Math.round(safeH * scaleY));

    if (roiCanvas.width !== sw || roiCanvas.height !== sh) {
      roiCanvas.width = sw;
      roiCanvas.height = sh;
      ocrCanvas.width = sw;
      ocrCanvas.height = sh;
    }

    // Recorta APENAS a ROI direto da textura GPU do video (zero copia da tela inteira!)
    roiCtx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    const imgData = roiCtx.getImageData(0, 0, sw, sh);
    const pixels = imgData.data;

    const ocrImgData = ocrCtx.createImageData(sw, sh);
    const ocrPixels = ocrImgData.data;

    let brightPixelCount = 0;
    const totalPixels = sw * sh;
    const hasExclude = excludeRects && excludeRects.length > 0;

    for (let y = 0; y < sh; y++) {
      const screenY = displayBounds.y + localY + y / scaleY;
      for (let x = 0; x < sw; x++) {
        const idx = (y * sw + x) << 2;
        if (hasExclude && isPointExcluded(displayBounds.x + localX + x / scaleX, screenY, excludeRects)) {
          pixels[idx] = 0;
          pixels[idx + 1] = 0;
          pixels[idx + 2] = 0;
          pixels[idx + 3] = 255;

          ocrPixels[idx] = 255;
          ocrPixels[idx + 1] = 255;
          ocrPixels[idx + 2] = 255;
          ocrPixels[idx + 3] = 255;
          continue;
        }

        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

        if (luminance >= brightnessThreshold) {
          brightPixelCount++;
          ocrPixels[idx] = 0;
          ocrPixels[idx + 1] = 0;
          ocrPixels[idx + 2] = 0;
          ocrPixels[idx + 3] = 255;
        } else {
          ocrPixels[idx] = 255;
          ocrPixels[idx + 1] = 255;
          ocrPixels[idx + 2] = 255;
          ocrPixels[idx + 3] = 255;
        }
      }
    }

    const currentHash = computePixelHash(ocrPixels, 8);
    const hasEnoughText = brightPixelCount >= 15 && brightPixelCount <= totalPixels * 0.55;
    const hasChanged = hasEnoughText && (lastPixelHash === null || currentHash !== lastPixelHash);
    if (hasEnoughText) {
      lastPixelHash = currentHash;
    }

    let ocrPngBytes = null;
    if (hasChanged) {
      ocrCtx.putImageData(ocrImgData, 0, 0);
      ocrPngBytes = await canvasToPngArrayBuffer(ocrCanvas);
    }

    // So gera preview quando necessario (texto mudou ou pedido explicitamente)
    let previewDataUrl = null;
    if (hasChanged || needPreview) {
      if (hasExclude) {
        roiCtx.putImageData(imgData, 0, 0);
      }
      previewDataUrl = roiCanvas.toDataURL('image/jpeg', 0.75);
    }

    window.api.sendCaptureResult({
      reqId,
      changed: hasChanged,
      ocrPngBytes,
      previewDataUrl,
      dimensions: { width: safeW, height: safeH }
    });
  } catch (err) {
    window.api.sendCaptureResult({ reqId, error: err.message });
  }
});
