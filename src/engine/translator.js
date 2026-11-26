const translationCache = new Map();

/**
 * Aplica o glossario personalizado antes e depois da traducao
 * para garantir a fidelidade de girias de jogos (como GTA 4).
 */
/**
 * Escapa caracteres especiais de regex para uso seguro em new RegExp()
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyGlossary(text, glossary = {}) {
  let processed = text;
  for (const [key, val] of Object.entries(glossary)) {
    const escaped = escapeRegex(key);
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    processed = processed.replace(regex, val);
  }
  return processed;
}

/**
 * Traducao gratuita e imediata usando endpoint publico do Google Translate.
 */
async function translateWithGoogle(text) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t&q=${encodeURIComponent(text)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Translate HTTP error: ${response.status}`);
  }
  const data = await response.json();
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data[0].map((item) => item[0]).join('');
  }
  throw new Error('Formato inesperado na resposta do Google Translate');
}

/**
 * Traducao via DeepL API (se o usuario fornecer a chave nas configuracoes).
 */
async function translateWithDeepL(text, apiKey) {
  const isFree = apiKey.endsWith(':fx');
  const endpoint = isFree
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: [text],
      source_lang: 'EN',
      target_lang: 'PT-BR'
    })
  });

  if (!response.ok) {
    throw new Error(`DeepL API HTTP error: ${response.status}`);
  }

  const data = await response.json();
  if (data.translations && data.translations.length > 0) {
    return data.translations[0].text;
  }
  throw new Error('Nenhuma traducao retornada pelo DeepL');
}

/**
 * Traducao via Google Gemini API com prompt especializado em girias de jogos.
 */
async function translateWithGemini(text, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const prompt = `Traduza a seguinte legenda de jogo do inglês para o Português do Brasil (PT-BR). Mantenha a entonação natural, gírias de rua informais e tom do diálogo do jogo. Não inclua explicações ou aspas extras, retorne apenas o texto traduzido:\n\n${text}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API HTTP error: ${response.status}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (candidate) {
    return candidate.trim();
  }
  throw new Error('Nenhuma resposta do Gemini');
}

/**
 * Ponto de entrada unificado para traducao com cache e tratamento de contingencia.
 */
async function translateText(text, settings = {}) {
  const trimmed = text.trim();
  if (!trimmed) {
    return { original: '', translated: '', timestamp: Date.now() };
  }

  // Verifica se ja esta em cache
  if (translationCache.has(trimmed.toLowerCase())) {
    return {
      original: trimmed,
      translated: translationCache.get(trimmed.toLowerCase()),
      timestamp: Date.now(),
      fromCache: true
    };
  }

  // Aplica glossario pre-traducao no texto em ingles (substitui girias por equivalentes
  // em portugues ANTES de enviar ao tradutor, para melhor resultado)
  const preProcessed = applyGlossary(trimmed, settings.glossary || {});

  let translated = '';
  const engine = settings.translationEngine || 'google';

  try {
    if (engine === 'deepl' && settings.deeplApiKey) {
      translated = await translateWithDeepL(preProcessed, settings.deeplApiKey);
    } else if (engine === 'gemini' && settings.geminiApiKey) {
      translated = await translateWithGemini(preProcessed, settings.geminiApiKey);
    } else {
      translated = await translateWithGoogle(preProcessed);
    }
  } catch (err) {
    console.warn(`Erro no motor '${engine}', recorrendo ao fallback padrao:`, err.message);
    try {
      translated = await translateWithGoogle(preProcessed);
    } catch (fallbackErr) {
      translated = `[Falha na traducao: ${fallbackErr.message}]`;
    }
  }

  // Aplica glossario pos-traducao tambem (captura termos que o tradutor possa ter ignorado)
  translated = applyGlossary(translated, settings.glossary || {});

  // Salva no cache da sessao
  translationCache.set(trimmed.toLowerCase(), translated);

  return {
    original: trimmed,
    translated,
    timestamp: Date.now(),
    fromCache: false
  };
}

module.exports = {
  translateText,
  applyGlossary
};
