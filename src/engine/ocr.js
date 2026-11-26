const { createWorker } = require('tesseract.js');
const winOcr = require('./win_ocr');

let worker = null;
let lastRecognizedText = '';
let initPromise = null; // Semaforo baseado em Promise (evita busy-wait)
let winOcrAvailable = process.platform === 'win32';

function calculateSimilarity(str1, str2) {
  const s1 = str1.trim().toLowerCase();
  const s2 = str2.trim().toLowerCase();
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const len1 = s1.length;
  const len2 = s2.length;
  const track = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));

  for (let i = 0; i <= len1; i += 1) track[0][i] = i;
  for (let j = 0; j <= len2; j += 1) track[j][0] = j;

  for (let j = 1; j <= len2; j += 1) {
    for (let i = 1; i <= len1; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator
      );
    }
  }

  const distance = track[len2][len1];
  const maxLen = Math.max(len1, len2);
  return 1.0 - distance / maxLen;
}

function cleanOcrText(rawText) {
  if (!rawText) return '';
  return rawText
    .replace(/[\r\n]+/g, ' ')
    .replace(/[|_~`^=\\<>]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Filtra textos que sao claramente ruido visual de fundo (ex: muitos simbolos,
 * letras aleatorias sem palavras reais ou confianca muito baixa).
 */
function isLikelyGarbage(text, confidence) {
  if (!text || text.length < 3) return true;
  if (typeof confidence === 'number' && confidence < 45) return true;

  // Conta letras validas vs caracteres totais (sem espacos)
  const noSpaces = text.replace(/\s+/g, '');
  if (noSpaces.length < 3) return true;

  const letters = (noSpaces.match(/[a-zA-Z]/g) || []).length;
  const letterRatio = letters / noSpaces.length;
  if (letterRatio < 0.6) return true;

  // Exige pelo menos uma palavra com 2+ letras consecutivas
  const hasRealWord = /[a-zA-Z]{2,}/.test(text);
  if (!hasRealWord) return true;

  return false;
}

async function getWorker() {
  if (winOcrAvailable) {
    const ok = await winOcr.startWorker();
    if (ok) return { isWinOcr: true };
    winOcrAvailable = false;
  }

  if (worker) return worker;

  // Se ja existe uma inicializacao em andamento, aguarda a mesma Promise
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      worker = await createWorker('eng');
      // PSM 6 (bloco uniforme de texto) acelera muito o reconhecimento de legendas
      await worker.setParameters({
        tessedit_pageseg_mode: '6'
      });
      console.log('Tesseract OCR inicializado com sucesso.');
    } catch (err) {
      console.error('Falha ao inicializar Tesseract:', err);
      worker = null;
    } finally {
      initPromise = null;
    }
    return worker;
  })();

  return initPromise;
}

async function recognize(imageBuffer) {
  try {
    let rawText = '';
    let confidence = 100;
    let engineUsed = 'winocr';

    if (winOcrAvailable) {
      try {
        rawText = await winOcr.recognize(imageBuffer);
      } catch (_winErr) {
        winOcrAvailable = false;
      }
    }

    if (!winOcrAvailable) {
      engineUsed = 'tesseract';
      const ocrWorker = await getWorker();
      if (!ocrWorker) {
        return { isDuplicate: true, text: '', error: 'Worker OCR nao disponivel' };
      }
      const { data } = await ocrWorker.recognize(imageBuffer);
      rawText = data.text;
      confidence = data.confidence;
    }

    const cleaned = cleanOcrText(rawText);

    // Ignora textos minusculos ou ruidos isolados
    if (isLikelyGarbage(cleaned, confidence)) {
      return { isDuplicate: true, text: cleaned, isNoise: true, confidence, engineUsed };
    }

    const similarity = calculateSimilarity(cleaned, lastRecognizedText);
    if (similarity >= 0.80) {
      return { isDuplicate: true, text: lastRecognizedText, similarity, engineUsed };
    }

    lastRecognizedText = cleaned;
    return { isDuplicate: false, text: cleaned, similarity, engineUsed };
  } catch (err) {
    console.error('Erro na extracao OCR:', err);
    return { isDuplicate: true, text: '', error: err.message };
  }
}

function resetLastRecognizedText() {
  lastRecognizedText = '';
}

async function terminateWorker() {
  winOcr.terminate();
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}

module.exports = {
  getWorker,
  recognize,
  resetLastRecognizedText,
  terminateWorker
};
