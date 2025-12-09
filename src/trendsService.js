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
 * Aplica filtros nas tendências coletadas
 * @param {Array} trends - Lista de tendências
 * @param {Object} filters - Objetos de filtro
 * @returns {Array} Tendências filtradas
 */
function applyFilters(trends, filters = {}) {
  let filtered = [...trends];

  // Filtro por mínimo de views
  // Lê do .env, default = 0 (sem filtro)
  const minViewsEnv = process.env.MIN_VIEWS;
  const minViewsNumber = Number(minViewsEnv);
  const minViews = filters.minViews !== undefined 
    ? Number(filters.minViews) 
    : (!minViewsEnv || isNaN(minViewsNumber) ? 0 : minViewsNumber);
  
  // Filtro por mínimo de curtidas (PRINCIPAL PARA VÍDEOS VIRAIS)
  const minLikesEnv = process.env.MIN_LIKES;
  const minLikesNumber = Number(minLikesEnv);
  const minLikes = filters.minLikes !== undefined
    ? Number(filters.minLikes)
    : (!minLikesEnv || isNaN(minLikesNumber) ? 50000 : minLikesNumber); // Padrão: 50k curtidas
  
  // Log de debug para entender o que está sendo filtrado
  logger.info(
    `[applyFilters] Filtrando ${filtered.length} tendências com mínimo de ${minViews} views e ${minLikes} curtidas`
  );
  
  // Aplicar filtro de views
  if (minViews && minViews > 0) {
    const beforeViews = filtered.length;
    filtered = filtered.filter(item => {
      const views = item.views || item.metrics?.views || 0;
      return views >= minViews;
    });
    logger.info(`[applyFilters] Após filtro de views: ${filtered.length} tendências (descartadas: ${beforeViews - filtered.length})`);
  }
  
  // Aplicar filtro de curtidas (FILTRO PRINCIPAL)
  // FALLBACK: Se temos poucos vídeos (< 5), relaxar filtro para garantir dados
  if (minLikes && minLikes > 0) {
    const beforeLikes = filtered.length;
    let afterLikes = filtered.filter(item => {
      const likes = item.likes || item.metrics?.likes || 0;
      return likes >= minLikes;
    });
    
    // FALLBACK INTELIGENTE: Se após filtro ficou muito pouco (< 5 vídeos) e tínhamos mais antes
    // Relaxar filtro progressivamente para garantir dados
    if (afterLikes.length < 5 && beforeLikes > afterLikes.length && beforeLikes >= 3) {
      // Tentar 50% do mínimo primeiro
      const relaxedMinLikes = Math.floor(minLikes * 0.5); // 50% do mínimo
      logger.warn(`[applyFilters] ⚠️ Apenas ${afterLikes.length} vídeos após filtro de ${minLikes} curtidas. Relaxando para ${relaxedMinLikes} curtidas...`);
      afterLikes = filtered.filter(item => {
        const likes = item.likes || item.metrics?.likes || 0;
        return likes >= relaxedMinLikes;
      });
      
      // Se ainda tiver poucos, relaxar para 10% do mínimo (ou mínimo de 1000)
      if (afterLikes.length < 3 && beforeLikes >= 3) {
        const veryRelaxedMinLikes = Math.max(1000, Math.floor(minLikes * 0.1)); // 10% ou mínimo 1000
        logger.warn(`[applyFilters] ⚠️ Apenas ${afterLikes.length} vídeos após filtro relaxado. Relaxando ainda mais para ${veryRelaxedMinLikes} curtidas...`);
        afterLikes = filtered.filter(item => {
          const likes = item.likes || item.metrics?.likes || 0;
          return likes >= veryRelaxedMinLikes;
        });
      }
      
      // ÚLTIMO RECURSO: Se ainda tiver poucos, aceitar qualquer vídeo com curtidas > 0
      if (afterLikes.length < 3 && beforeLikes >= 3) {
        logger.warn(`[applyFilters] ⚠️ Apenas ${afterLikes.length} vídeos após filtros relaxados. Aceitando qualquer vídeo com curtidas > 0 (último recurso)...`);
        afterLikes = filtered.filter(item => {
          const likes = item.likes || item.metrics?.likes || 0;
          return likes > 0;
        });
      }
      
      // SE MESMO ASSIM ESTIVER VAZIO: retornar todos (sem filtro de curtidas)
      if (afterLikes.length === 0 && beforeLikes > 0) {
        logger.warn(`[applyFilters] ⚠️ Nenhum vídeo passou nos filtros de curtidas. Retornando todos os ${beforeLikes} vídeos coletados (sem filtro de curtidas)...`);
        afterLikes = filtered; // Retornar todos sem filtro de curtidas
      }
      
      logger.info(`[applyFilters] Após filtro relaxado de curtidas: ${afterLikes.length} tendências`);
    }
    
    filtered = afterLikes;
    logger.info(`[applyFilters] Após filtro de curtidas: ${filtered.length} tendências (descartadas: ${beforeLikes - filtered.length})`);
    
    // Log detalhado dos primeiros itens para debug
    if (filtered.length > 0) {
      filtered.slice(0, 3).forEach((item, idx) => {
        const likes = item.likes || item.metrics?.likes || 0;
        logger.info(`[applyFilters] Item ${idx + 1}: source="${item.source}", likes=${likes}, title="${item.title?.substring(0, 40)}"`);
      });
    }
  } else {
    logger.warn('[applyFilters] MIN_LIKES desativado (<= 0). Retornando todas as tendências SEM filtro de curtidas.');
    
    // Log detalhado dos primeiros itens para debug
    if (filtered.length > 0) {
      filtered.slice(0, 3).forEach((item, idx) => {
        const likes = item.likes || item.metrics?.likes || 0;
        logger.info(`[applyFilters] Item ${idx + 1}: source="${item.source}", likes=${likes}, title="${item.title?.substring(0, 40)}"`);
      });
    }
  }
  
  // Garantir que retornamos pelo menos os TOP 20 (ou todos se tiver menos)
  const finalCount = Math.min(20, filtered.length);
  if (filtered.length > 20) {
    logger.info(`[applyFilters] Limitando a ${finalCount} tendências (Top 20)`);
  } else if (filtered.length < 20) {
    logger.warn(`[applyFilters] ⚠️ Apenas ${filtered.length} tendências passaram nos filtros (objetivo: 20)`);
  }

  // Filtro por blacklist de palavras
  const blacklistStr = filters.blacklist || process.env.BLACKLIST_WORDS || '';
  if (blacklistStr) {
    const blacklist = blacklistStr.split(',').map(w => w.trim().toLowerCase());
    filtered = filtered.filter(item => {
      const text = `${item.title} ${item.description || ''}`.toLowerCase();
      return !blacklist.some(word => text.includes(word));
    });
  }

  // Filtro por idioma
  if (filters.language) {
    filtered = filtered.filter(item => item.language === filters.language);
  }

  // Filtro por autor (blacklist de handles)
  if (filters.excludedAuthors && filters.excludedAuthors.length > 0) {
    filtered = filtered.filter(item => {
      if (!item.authorHandle) return true;
      return !filters.excludedAuthors.some(author => 
        item.authorHandle.toLowerCase().includes(author.toLowerCase())
      );
    });
  }

  // Retornar TOP 20 (ou todos se tiver menos)
  return filtered.slice(0, 20);
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

