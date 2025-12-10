/**
 * Serviço de coleta de tendências do TikTok
 * Suporta múltiplas fontes: TikTok Creative Center, PiPiAds, Scraper de Hashtags
 */

const axios = require('axios');
const logger = require('./utils/logger');
const { scrapeTikTokCreativeCenter, scrapeTikTokHashtags } = require('./scrapers/tiktokScraper');
const { getTrendsFromPiPiAds } = require('./scrapers/pipiadsScraper');
const { scrapeTikTokShopTopProducts } = require('./scrapers/tiktokShopScraper');
const { scrapeKalodataTopProducts } = require('./scrapers/kalodataScraper');
require('dotenv').config();

/**
 * Calcula o score de engajamento baseado em likes, comments e shares
 * @param {Object} item - Item de tendência com métricas
 * @returns {number} Score de engajamento
 */
function calcEngagementScore(item) {
  const views = item.views || 1;
  const likesWeight = parseInt(process.env.LIKES_WEIGHT || 3);
  const commentsWeight = parseInt(process.env.COMMENTS_WEIGHT || 4);
  const sharesWeight = parseInt(process.env.SHARES_WEIGHT || 5);

  const score = (
    (item.likes * likesWeight) +
    (item.comments * commentsWeight) +
    (item.shares * sharesWeight)
  ) / views;

  return Number(score.toFixed(4));
}

/**
 * Normaliza um item de tendência para o formato padrão
 * @param {Object} rawItem - Item bruto da fonte
 * @param {string} source - Nome da fonte ('tiktok_cc', 'pipiads', 'hashtag_scraper')
 * @param {string} niche - Nicho da tendência
 * @param {string} country - País
 * @returns {Object} Item normalizado
 */
function normalizeTrendItem(rawItem, source, niche, country) {
  // Validar URL do vídeo - se não for válida, usar null
  let videoUrl = rawItem.videoUrl || rawItem.video_url || rawItem.url || null;
  
  // Validar URL do vídeo - se não for válida, usar null
  if (videoUrl && (videoUrl.includes('Date.now') || !videoUrl.startsWith('http') || videoUrl === 'https://www.tiktok.com')) {
    videoUrl = null;
  }
  
  // Preservar informação de região se disponível
  const isBrazil = rawItem.isBrazil !== undefined ? rawItem.isBrazil : (country === 'BR');
  const region = rawItem.region || (isBrazil ? 'Brazil' : 'Global');
  const origin_region = rawItem.origin_region || rawItem.normalizedRegion || region || 'GLOBAL';
  
  // PRESERVAR source original se disponível (especialmente importante para vídeos do JSON)
  // O scraper pode passar 'tiktok_creative_center_json' que precisa ser preservado
  // SEMPRE priorizar o source do rawItem se existir
  const finalSource = rawItem.source || source;
  
  // Log para verificar se o source está sendo preservado
  if (rawItem.source) {
    logger.info(`[normalizeTrendItem] ✅ Preservando source original: "${rawItem.source}"`);
  } else {
    logger.debug(`[normalizeTrendItem] Usando source padrão: "${source}"`);
  }
  
  // Usar métricas reais vindas do scraper (já processadas e convertidas)
  // Verificar também o campo metrics se existir (usado pelo painel)
  const metricsObj = rawItem.metrics || {};
  let views = parseInt(rawItem.views || rawItem.view_count || metricsObj.views || 0);
  const likes = parseInt(rawItem.likes || rawItem.like_count || metricsObj.likes || 0);
  const comments = parseInt(rawItem.comments || rawItem.comment_count || metricsObj.comments || 0);
  const shares = parseInt(rawItem.shares || rawItem.share_count || metricsObj.shares || 0);
  
  // Log de debug para verificar métricas extraídas
  logger.info(`[normalizeTrendItem] Métricas extraídas: views=${views}, likes=${likes}, comments=${comments}, shares=${shares}, title="${(rawItem.title || 'sem título').substring(0, 40)}"`);
  
  // Se não tem views mas tem outras métricas, estimar views apenas como último recurso
  // (mas não para vídeos do TikTok Creative Center que devem ter métricas reais)
  if (views === 0 && (likes > 0 || comments > 0 || shares > 0)) {
    // Apenas estimar se NÃO for do TikTok Creative Center (que deve ter métricas reais)
    if (!finalSource || (!finalSource.includes('json') && !finalSource.includes('tiktok_creative_center'))) {
      // Estimativa conservadora: 1 like = 30 views, 1 comment = 500 views, 1 share = 1000 views
      const estimatedViews = Math.max(
        likes * 30,
        comments * 500,
        shares * 1000,
        10000 // Mínimo de 10k views para vídeos com engajamento
      );
      views = estimatedViews;
      logger.debug(`[normalizeTrendItem] Estimando views=${views} baseado em métricas de engajamento`);
    }
    // Se for do TikTok Creative Center e não tem views, deixar como 0 (não inventar)
  }
  
  return {
    source: finalSource,
    niche: niche || null,
    title: rawItem.title || rawItem.description || 'Sem título',
    description: rawItem.description || null,
    videoUrl: videoUrl,
    thumbUrl: rawItem.thumbUrl || rawItem.thumb_url || rawItem.thumbnail || null,
    soundName: rawItem.soundName || rawItem.sound_name || rawItem.sound || null,
    authorHandle: rawItem.authorHandle || rawItem.author_handle || rawItem.handle || null,
    views: views,
    likes: likes,
    comments: comments,
    shares: shares,
    // Garantir que metrics está preenchido para o painel usar
    metrics: {
      views: views,
      likes: likes,
      comments: comments,
      shares: shares
    },
    country: country || null,
    region: region, // Preservar informação de região
    origin_region: origin_region, // Preservar região de origem (usado para filtros futuros)
    isBrazil: isBrazil, // Preservar flag de Brasil
    language: rawItem.language || 'pt',
    collectedAt: new Date().toISOString()
  };
}

/**
 * Busca tendências do TikTok Creative Center
 * PRIORIDADE: Usa API do Apify (mais confiável), com fallback para scraping direto
 * @param {Object} params - Parâmetros de busca
 * @param {string} params.niche - Nicho (ex: 'beleza', 'moda', 'fitness')
 * @param {string} params.country - Código do país (ex: 'BR', 'US')
 * @returns {Promise<Array>} Lista de tendências
 */
async function getTrendsFromTikTokCreativeCenter({ niche = 'genérico', country = 'BR' }) {
  logger.info(`[TikTok CC] Buscando tendências - Nicho: ${niche}, País: ${country}`);
  
  // PRIORIDADE 1: Tentar usar API do Apify (mais confiável)
  const useApify = process.env.USE_APIFY !== 'false'; // Por padrão usa Apify se configurado
  
  if (useApify) {
    try {
      const { scrapeTikTokViaApify } = require('./scrapers/apifyTikTokScraper');
      logger.info(`[TikTok CC] Tentando usar API do Apify primeiro...`);
      
      const apifyTrends = await scrapeTikTokViaApify({ niche, country });
      
      if (apifyTrends && apifyTrends.length > 0) {
        logger.info(`[TikTok CC] ✅ API do Apify retornou ${apifyTrends.length} vídeos!`);
        // Normalizar itens do Apify
        return apifyTrends.map(item => {
          const itemSource = item.source || 'apify_tiktok_trends';
          return normalizeTrendItem(item, itemSource, niche, country);
        });
      } else {
        logger.warn(`[TikTok CC] ⚠️ API do Apify não retornou vídeos, tentando scraping direto como fallback...`);
      }
    } catch (apifyError) {
      logger.warn(`[TikTok CC] ⚠️ Erro ao usar API do Apify: ${apifyError.message}`);
      logger.warn(`[TikTok CC] Tentando scraping direto como fallback...`);
    }
  }
  
  // PRIORIDADE 2: Fallback para scraping direto com Puppeteer
  try {
    logger.info(`[TikTok CC] Usando scraping direto (fallback)...`);
    const rawTrends = await scrapeTikTokCreativeCenter({ niche, country });
    // IMPORTANTE: Preservar o source original do item (pode ser 'tiktok_creative_center_json')
    // Se o item já tem source, usar ele; senão usar 'tiktok_cc' como padrão
    return rawTrends.map(item => {
      // Se o item já tem source definido (ex: 'tiktok_creative_center_json'), preservar
      // Senão, usar 'tiktok_cc' como padrão
      const itemSource = item.source || 'tiktok_cc';
      return normalizeTrendItem(item, itemSource, niche, country);
    });
  } catch (error) {
    logger.error('[TikTok CC] Erro ao buscar tendências:', error);
    // Em caso de erro, retornar array vazio
    return [];
  }
}

/**
 * Busca tendências do PiPiAds (ads performando bem)
 * Implementação real usando API ou scraping
 * @param {Object} params - Parâmetros de busca
 * @param {string} params.niche - Nicho
 * @param {string} params.country - Código do país
 * @returns {Promise<Array>} Lista de tendências
 */
async function getTrendsFromPiPiAdsService({ niche = 'genérico', country = 'BR' }) {
  logger.info(`[PiPiAds] Buscando ads performando - Nicho: ${niche}, País: ${country}`);
  
  try {
    const rawTrends = await getTrendsFromPiPiAds({ niche, country });
    return rawTrends.map(item => normalizeTrendItem(item, 'pipiads', niche, country));
  } catch (error) {
    logger.error('[PiPiAds] Erro ao buscar tendências:', error);
    return [];
  }
}

/**
 * Busca tendências através de scraper de hashtags específicas
 * Implementação real usando Puppeteer para scraping
 * @param {Object} params - Parâmetros de busca
 * @param {Array<string>} params.hashtags - Lista de hashtags (ex: ['#beleza', '#promo'])
 * @param {string} params.country - Código do país
 * @returns {Promise<Array>} Lista de tendências
 */
async function getTrendsFromHashtags({ hashtags = ['#beleza'], country = 'BR' }) {
  logger.info(`[Hashtag Scraper] Buscando hashtags: ${hashtags.join(', ')}`);
  
  try {
    const rawTrends = await scrapeTikTokHashtags({ hashtags, country });
    return rawTrends.map(item => normalizeTrendItem(item, 'hashtag_scraper', null, country));
  } catch (error) {
    logger.error('[Hashtag Scraper] Erro ao buscar tendências:', error);
    return [];
  }
}

/**
 * Calcula taxa de engajamento (ER)
 * @param {Object} trend - Tendência
 * @returns {number} Taxa de engajamento em porcentagem
 */
function calculateEngagementRate(trend) {
  const views = trend.views || trend.metrics?.views || 0;
  const likes = trend.likes || trend.metrics?.likes || 0;
  const comments = trend.comments || trend.metrics?.comments || 0;
  const shares = trend.shares || trend.metrics?.shares || 0;
  
  if (views === 0) return 0;
  
  const engagement = likes + comments + shares;
  return (engagement / views) * 100;
}

/**
 * Verifica se o vídeo contém palavras-chave
 * @param {Object} trend - Tendência
 * @param {Array} keywords - Lista de palavras-chave
 * @returns {boolean}
 */
function containsKeywords(trend, keywords) {
  if (!keywords || keywords.length === 0) return true;
  
  const text = `${trend.title || ''} ${trend.description || ''} ${trend.mainHashtag || ''}`.toLowerCase();
  
  return keywords.some(keyword => text.includes(keyword.toLowerCase()));
}

/**
 * Verifica se o vídeo contém hashtags obrigatórias
 * @param {Object} trend - Tendência
 * @param {Array} requiredHashtags - Lista de hashtags obrigatórias
 * @returns {boolean}
 */
function containsRequiredHashtags(trend, requiredHashtags) {
  if (!requiredHashtags || requiredHashtags.length === 0) return true;
  
  const hashtags = `${trend.mainHashtag || ''} ${trend.title || ''}`.toLowerCase();
  
  return requiredHashtags.some(tag => {
    const tagLower = tag.toLowerCase().replace(/^#/, '');
    return hashtags.includes(tagLower);
  });
}

/**
 * Verifica se o criador está na lista de exclusão
 * @param {Object} trend - Tendência
 * @param {Array} excludeCreators - Lista de criadores a excluir
 * @returns {boolean}
 */
function isCreatorExcluded(trend, excludeCreators) {
  if (!excludeCreators || excludeCreators.length === 0) return false;
  
  const author = (trend.authorHandle || trend.author || '').toLowerCase().replace(/^@/, '');
  
  return excludeCreators.some(creator => {
    const creatorLower = creator.toLowerCase().replace(/^@/, '');
    return author === creatorLower || author.includes(creatorLower);
  });
}

/**
 * Verifica se o idioma do vídeo corresponde ao filtro
 * @param {Object} trend - Tendência
 * @param {string|Array} languageFilter - Idioma(s) permitido(s)
 * @returns {boolean}
 */
function matchesLanguage(trend, languageFilter) {
  if (!languageFilter) return true;
  
  const videoLanguage = (trend.language || '').toLowerCase();
  const allowedLanguages = Array.isArray(languageFilter) 
    ? languageFilter.map(l => l.toLowerCase())
    : [languageFilter.toLowerCase()];
  
  return allowedLanguages.some(lang => videoLanguage.includes(lang));
}

/**
 * Aplica filtros avançados nas tendências coletadas
 * @param {Array} trends - Lista de tendências
 * @param {Object} filters - Objetos de filtro avançados
 * @returns {Array} Tendências filtradas
 */
function applyAdvancedFilters(trends, filters = {}) {
  let filtered = [...trends];
  const originalCount = filtered.length;
  
  // 1. Filtro de idioma
  if (filters.language) {
    filtered = filtered.filter(trend => matchesLanguage(trend, filters.language));
    logger.info(`[applyAdvancedFilters] Após filtro de idioma (${filters.language}): ${filtered.length} tendências`);
  }
  
  // 2. Filtro de views mínimas
  if (filters.minViews && filters.minViews > 0) {
    filtered = filtered.filter(trend => {
      const views = trend.views || trend.metrics?.views || 0;
      return views >= filters.minViews;
    });
    logger.info(`[applyAdvancedFilters] Após filtro de views (>=${filters.minViews}): ${filtered.length} tendências`);
  }
  
  // 3. Filtro de curtidas mínimas
  if (filters.minLikes && filters.minLikes > 0) {
    filtered = filtered.filter(trend => {
      const likes = trend.likes || trend.metrics?.likes || 0;
      return likes >= filters.minLikes;
    });
    logger.info(`[applyAdvancedFilters] Após filtro de curtidas (>=${filters.minLikes}): ${filtered.length} tendências`);
  }
  
  // 4. Filtro de taxa de engajamento mínima
  if (filters.minER && filters.minER > 0) {
    filtered = filtered.filter(trend => {
      const er = calculateEngagementRate(trend);
      return er >= filters.minER;
    });
    logger.info(`[applyAdvancedFilters] Após filtro de ER (>=${filters.minER}%): ${filtered.length} tendências`);
  }
  
  // 5. Filtro de idade máxima do vídeo (horas)
  if (filters.maxAgeHours && filters.maxAgeHours > 0) {
    const maxAge = filters.maxAgeHours * 60 * 60 * 1000; // Converter para ms
    const now = Date.now();
    
    filtered = filtered.filter(trend => {
      const collectedAt = trend.collectedAt ? new Date(trend.collectedAt).getTime() : now;
      const age = now - collectedAt;
      return age <= maxAge;
    });
    logger.info(`[applyAdvancedFilters] Após filtro de idade (<=${filters.maxAgeHours}h): ${filtered.length} tendências`);
  }
  
  // 6. Filtro de palavras-chave/tema
  if (filters.keywords && filters.keywords.length > 0) {
    filtered = filtered.filter(trend => containsKeywords(trend, filters.keywords));
    logger.info(`[applyAdvancedFilters] Após filtro de keywords: ${filtered.length} tendências`);
  }
  
  // 7. Filtro de hashtags obrigatórias
  if (filters.requiredHashtags && filters.requiredHashtags.length > 0) {
    filtered = filtered.filter(trend => containsRequiredHashtags(trend, filters.requiredHashtags));
    logger.info(`[applyAdvancedFilters] Após filtro de hashtags obrigatórias: ${filtered.length} tendências`);
  }
  
  // 8. Filtro de criadores excluídos
  if (filters.excludeCreators && filters.excludeCreators.length > 0) {
    filtered = filtered.filter(trend => !isCreatorExcluded(trend, filters.excludeCreators));
    logger.info(`[applyAdvancedFilters] Após excluir criadores: ${filtered.length} tendências`);
  }
  
  // 9. Filtro de range de seguidores (se disponível)
  // Nota: Este filtro requer dados de seguidores que podem não estar disponíveis
  // Por enquanto, apenas logamos se o filtro foi aplicado
  
  logger.info(`[applyAdvancedFilters] Total: ${originalCount} → ${filtered.length} tendências após filtros avançados`);
  
  return filtered;
}

/**
 * Aplica filtros simplificados - apenas ordena por métricas
 * @param {Array} trends - Lista de tendências
 * @param {Object} filters - Objetos de filtro (não usado mais, mantido para compatibilidade)
 * @returns {Array} Tendências ordenadas por métricas
 */
function applyFilters(trends, filters = {}) {
  // SIMPLIFICADO: Apenas ordenar por métricas (likes, comentários, visualizações)
  // Não aplicar filtros complexos - apenas ordenar pelos maiores números
  
  logger.info(`[applyFilters] Ordenando ${trends.length} tendências por métricas (likes, comentários, visualizações)...`);
  
  // Ordenar por score de métricas: likes * 2 + views + comments * 3 + shares * 5
  const sorted = trends.sort((a, b) => {
    const scoreA = (a.likes || a.metrics?.likes || 0) * 2 + 
                   (a.views || a.metrics?.views || 0) + 
                   (a.comments || a.metrics?.comments || 0) * 3 + 
                   (a.shares || a.metrics?.shares || 0) * 5;
    const scoreB = (b.likes || b.metrics?.likes || 0) * 2 + 
                   (b.views || b.metrics?.views || 0) + 
                   (b.comments || b.metrics?.comments || 0) * 3 + 
                   (b.shares || b.metrics?.shares || 0) * 5;
    return scoreB - scoreA; // Maior primeiro
  });
  
  // Log dos top 3 para debug
  if (sorted.length > 0) {
    sorted.slice(0, 3).forEach((item, idx) => {
      const likes = item.likes || item.metrics?.likes || 0;
      const views = item.views || item.metrics?.views || 0;
      const comments = item.comments || item.metrics?.comments || 0;
      logger.info(`[applyFilters] Top ${idx + 1}: likes=${likes.toLocaleString()}, views=${views.toLocaleString()}, comments=${comments.toLocaleString()}, title="${item.title?.substring(0, 40)}"`);
    });
  }
  
  // Retornar TOP 20 (ou todos se tiver menos)
  return sorted.slice(0, 20);
}

/**
 * Extrai hashtag principal do título ou descrição
 * @param {Object} item - Item de tendência
 * @returns {string|null} Hashtag principal encontrada
 */
function extractMainHashtag(item) {
  const text = `${item.title || ''} ${item.description || ''}`.toLowerCase();
  const hashtagRegex = /#[\w\u00C0-\u017F]+/g;
  const matches = text.match(hashtagRegex);
  return matches && matches.length > 0 ? matches[0] : null;
}

/**
 * Calcula score completo de ranking considerando múltiplas métricas
 * Separa a responsabilidade de cálculo de score da coleta
 * @param {Object} item - Item de tendência normalizado
 * @returns {Object} Item com score calculado e ranking
 */
function calculateRankingScore(item) {
  const views = item.views || 1;
  const likes = item.likes || 0;
  const comments = item.comments || 0;
  const shares = item.shares || 0;

  // Pesos configuráveis via .env
  const viewsWeight = parseFloat(process.env.VIEWS_WEIGHT || 0.1);
  const likesWeight = parseFloat(process.env.LIKES_WEIGHT || 3);
  const commentsWeight = parseFloat(process.env.COMMENTS_WEIGHT || 4);
  const sharesWeight = parseFloat(process.env.SHARES_WEIGHT || 5);

  // Score de engajamento (interações por visualização)
  const engagementScore = (
    (likes * likesWeight) +
    (comments * commentsWeight) +
    (shares * sharesWeight)
  ) / views;

  // Score de alcance (visualizações ponderadas)
  const reachScore = Math.log10(views + 1) * viewsWeight;

  // Score final combinado
  const finalScore = engagementScore + reachScore;

  return {
    ...item,
    engagementScore: Number(engagementScore.toFixed(4)),
    reachScore: Number(reachScore.toFixed(4)),
    score: Number(finalScore.toFixed(4)),
    mainHashtag: extractMainHashtag(item)
  };
}

/**
 * Ranqueia e retorna apenas as Top N tendências
 * Separa a responsabilidade de ranqueamento da coleta
 * @param {Array} trends - Lista de tendências normalizadas
 * @param {number} limit - Limite de resultados (padrão: 20)
 * @returns {Array} Top N tendências ranqueadas
 */
function rankTopTrends(trends, limit = 20) {
  if (!trends || trends.length === 0) {
    return [];
  }

  // Calcula score para cada tendência
  const scoredTrends = trends.map(item => calculateRankingScore(item));

  // Ordena por score descendente
  const ranked = scoredTrends.sort((a, b) => {
    // Primeiro por score final
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Em caso de empate, ordena por visualizações
    return b.views - a.views;
  });

  // Retorna apenas as Top N
  return ranked.slice(0, limit);
}

/**
 * Coleta tendências de todas as fontes configuradas
 * Separa a responsabilidade de coleta do ranqueamento
 * @param {Object} options - Opções de busca
 * @param {string} options.niche - Nicho (ex: 'beleza', 'moda')
 * @param {string} options.country - Código do país (ex: 'BR')
 * @param {Array<string>} options.sources - Fontes a usar
 * @param {Array<string>} options.hashtags - Hashtags para scraper (opcional)
 * @returns {Promise<Array>} Lista de tendências coletadas (não ranqueadas)
 */
async function collectTrendsFromSources({
  niche = 'genérico',
  country = 'BR',
  sources = ['tiktok_cc', 'pipiads'],
  hashtags = [],
  onProgress = null
} = {}) {
  const allTrends = [];
  const totalSources = sources.length;
  let currentSource = 0;

  // Coleta de todas as fontes configuradas
  if (sources.includes('tiktok_cc')) {
    currentSource++;
    if (onProgress) {
      onProgress((currentSource / totalSources) * 100, `Coletando do TikTok Creative Center... (${currentSource}/${totalSources})`);
    }
    const tiktokTrends = await getTrendsFromTikTokCreativeCenter({ niche, country });
    allTrends.push(...tiktokTrends);
    if (onProgress) {
      onProgress((currentSource / totalSources) * 100, `TikTok CC: ${tiktokTrends.length} vídeos encontrados`);
    }
  }

  if (sources.includes('pipiads')) {
    const usePiPiAds = process.env.USE_PIPIADS === 'true';
    
    if (!usePiPiAds) {
      logger.info('[PiPiAds] Desativado por configuração (USE_PIPIADS != "true")');
      // Não incrementar currentSource para não afetar o progresso
    } else {
      currentSource++;
      if (onProgress) {
        onProgress((currentSource / totalSources) * 100, `Coletando do PiPiAds... (${currentSource}/${totalSources})`);
      }
      try {
        const pipiTrends = await getTrendsFromPiPiAdsService({ niche, country });
        allTrends.push(...pipiTrends);
        if (onProgress) {
          onProgress((currentSource / totalSources) * 100, `PiPiAds: ${pipiTrends.length} vídeos encontrados`);
        }
      } catch (error) {
        logger.warn(`[PiPiAds] Erro ao coletar tendências: ${error.message}`);
        // Continuar sem adicionar vídeos do PiPiAds
      }
    }
  }

  if (sources.includes('hashtag_scraper') && hashtags.length > 0) {
    currentSource++;
    if (onProgress) {
      onProgress((currentSource / totalSources) * 100, `Coletando de hashtags... (${currentSource}/${totalSources})`);
    }
    const hashtagTrends = await getTrendsFromHashtags({ hashtags, country });
    allTrends.push(...hashtagTrends);
    if (onProgress) {
      onProgress((currentSource / totalSources) * 100, `Hashtags: ${hashtagTrends.length} vídeos encontrados`);
    }
  }

  return allTrends;
}

/**
 * Busca e processa as top tendências de todas as fontes configuradas
 * Função principal que orquestra: coleta → filtros → ranking → top N
 * @param {Object} options - Opções de busca
 * @param {string} options.niche - Nicho (ex: 'beleza', 'moda')
 * @param {string} options.country - Código do país (ex: 'BR')
 * @param {number} options.limit - Limite de resultados (padrão: 20)
 * @param {Array<string>} options.sources - Fontes a usar (padrão: todas)
 * @param {Array<string>} options.hashtags - Hashtags para scraper (opcional)
 * @param {Object} options.filters - Filtros adicionais
 * @returns {Promise<Array>} Lista de top tendências processadas e ranqueadas
 */
async function getTopTrends({
  niche = 'genérico',
  country = 'BR',
  limit = 20,
  sources = ['tiktok_cc', 'pipiads'],
  hashtags = [],
  filters = {},
  onProgress = null
} = {}) {
  try {
    const totalSteps = sources.length + 2; // fontes + filtros + ranking
    let currentStep = 0;

    // Função auxiliar para atualizar progresso
    const updateProgress = (message, stepProgress = 0) => {
      if (onProgress) {
        const overallProgress = Math.floor(((currentStep + stepProgress) / totalSteps) * 100);
        onProgress(overallProgress, message, `step_${currentStep}`);
      }
    };

    // ETAPA 1: COLETA - Buscar dados brutos de todas as fontes
    updateProgress('Iniciando coleta de tendências...', 0);
    const allTrends = await collectTrendsFromSources({ 
      niche, 
      country, 
      sources, 
      hashtags,
      onProgress: (sourceProgress, sourceMessage) => {
        const stepProgress = sourceProgress / sources.length;
        updateProgress(sourceMessage, stepProgress);
      }
    });
    currentStep++;
    logger.info(`[getTopTrends] Coletadas ${allTrends.length} tendências brutas`);

    // ETAPA 2: FILTROS - Aplicar filtros configurados
    updateProgress('Aplicando filtros...', 0);
    const filtered = applyFilters(allTrends, filters);
    currentStep++;
    logger.info(`[getTopTrends] ${filtered.length} tendências após filtros`);

    // ETAPA 3: RANKING - Calcular scores e ranquear
    updateProgress('Calculando scores e ranqueando...', 0);
    const ranked = rankTopTrends(filtered, limit);
    currentStep++;
    logger.info(`[getTopTrends] ${ranked.length} tendências no resultado final (Top ${limit})`);

    if (onProgress) {
      onProgress(100, `Concluído! ${ranked.length} tendências encontradas`, 'completed');
    }

    return ranked;
  } catch (error) {
    logger.error('[getTopTrends] Erro ao buscar tendências:', error);
    if (onProgress) {
      onProgress(0, `Erro: ${error.message}`, 'error');
    }
    throw error;
  }
}

/**
 * Busca produtos mais vendidos do TikTok Shop
 * @param {Object} options - Opções de busca
 * @param {string} options.category - Categoria (opcional)
 * @param {string} options.country - País (ex: 'BR', 'US')
 * @param {number} options.limit - Limite de produtos (padrão: 20)
 * @returns {Promise<Array>} Lista de produtos mais vendidos
 */
async function getTikTokShopTopProducts({ category = null, country = 'BR', limit = 20 }) {
  try {
    logger.info(`[TikTok Shop] Buscando produtos mais vendidos - Categoria: ${category || 'Todas'}, País: ${country}, Limite: ${limit}`);
    const products = await scrapeTikTokShopTopProducts({ category, country, limit });
    logger.info(`[TikTok Shop] ✅ Coletados ${products.length} produtos mais vendidos`);
    return products;
  } catch (error) {
    logger.error(`[TikTok Shop] Erro ao buscar produtos: ${error.message}`);
    return [];
  }
}

/**
 * Busca produtos mais vendidos do TikTok Shop através do Kalodata
 * @param {Object} options - Opções de busca
 * @param {string} options.category - Categoria (opcional)
 * @param {string} options.country - País (ex: 'BR', 'US')
 * @param {number} options.limit - Limite de produtos (padrão: 20)
 * @returns {Promise<Array>} Lista de produtos mais vendidos
 */
async function getKalodataTopProducts({ category = null, country = 'BR', limit = 20 }) {
  try {
    logger.info(`[Kalodata] Buscando produtos mais vendidos - Categoria: ${category || 'Todas'}, País: ${country}, Limite: ${limit}`);
    const products = await scrapeKalodataTopProducts({ category, country, limit });
    logger.info(`[Kalodata] ✅ Coletados ${products.length} produtos mais vendidos`);
    return products;
  } catch (error) {
    logger.error(`[Kalodata] Erro ao buscar produtos: ${error.message}`);
    return [];
  }
}

module.exports = {
  getTopTrends,
  getTrendsFromTikTokCreativeCenter,
  getTrendsFromPiPiAds: getTrendsFromPiPiAdsService,
  getTrendsFromHashtags,
  calcEngagementScore,
  applyFilters,
  normalizeTrendItem,
  rankTopTrends,
  calculateRankingScore,
  collectTrendsFromSources,
  getTikTokShopTopProducts,
  getKalodataTopProducts
};

