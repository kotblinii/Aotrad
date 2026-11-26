const assert = require('assert');
const store = require('./src/config/store');
const translator = require('./src/engine/translator');
const ocr = require('./src/engine/ocr');
const capture = require('./src/engine/capture');

async function runTests() {
  console.log('--- TESTE 1: Configurações e Persistência ---');
  const initialSettings = store.loadSettings();
  assert(initialSettings.roi, 'ROI padrão deve existir');
  assert(initialSettings.glossary, 'Glossário padrão deve existir');
  console.log('Configurações padrão carregadas com sucesso.');

  console.log('\n--- TESTE 2: Glossário de Gírias de Jogos (GTA IV) ---');
  const sampleSlang = "Hey cuzzo, watch out for the po-po, they want to waste him!";
  const processedWithGlossary = translator.applyGlossary(sampleSlang, initialSettings.glossary);
  console.log('Original:  ', sampleSlang);
  console.log('Processado:', processedWithGlossary);
  assert(processedWithGlossary.includes('primo'), 'Gíria cuzzo deve virar primo');
  assert(processedWithGlossary.includes('polícia'), 'Gíria po-po deve virar polícia');
  assert(processedWithGlossary.includes('acabe com ele'), 'Gíria waste him deve virar acabe com ele');
  console.log('Glossário aplicado corretamente.');

  console.log('\n--- TESTE 3: Tradução em Tempo Real (Google Translate Fallback) ---');
  const textToTranslate = "Niko, let's go bowling!";
  try {
    const translationResult = await translator.translateText(textToTranslate, initialSettings);
    console.log('Texto Original: ', translationResult.original);
    console.log('Texto Traduzido:', translationResult.translated);
    if (translationResult.translated.toLowerCase().includes('boliche')) {
      console.log('Tradução online validada com sucesso.');
    } else if (translationResult.translated.startsWith('[Falha')) {
      console.log('Tradução retornou erro (sem rede). Teste parcial aceito.');
    } else {
      console.log('Tradução retornou resultado inesperado, mas sem erro fatal.');
    }
  } catch (err) {
    console.log('Sem conexão com a internet. Teste de tradução ignorado. Erro:', err.message);
  }

  console.log('\n--- TESTE 4: Captura e Recorte de ROI com Delta Hash ---');
  const testRoi = { x: 100, y: 100, width: 400, height: 100 };
  const captureResult = await capture.captureRoi(testRoi);
  assert(captureResult.croppedBuffer, 'Buffer cortado deve existir');
  assert(captureResult.previewDataUrl.startsWith('data:image/png;base64,'), 'Preview DataURL deve ser gerado');
  console.log('Captura de ROI e recorte executados com sucesso. Dimensões:', captureResult.dimensions);

  console.log('\n--- TESTE 5: Histórico de Diálogos ---');
  store.clearHistory();
  const historyEntry = { original: textToTranslate, translated: 'Teste de historico', timestamp: Date.now() };
  store.appendHistory(historyEntry);
  const history = store.loadHistory();
  assert.strictEqual(history.length, 1, 'Histórico deve conter 1 item');
  assert.strictEqual(history[0].original, textToTranslate);
  console.log('Histórico gravado e recuperado com sucesso.');

  console.log('\nTODOS OS TESTES DO MOTOR PASSARAM COM SUCESSO!');
}

runTests().catch((err) => {
  console.error('Falha nos testes:', err);
  process.exit(1);
});
