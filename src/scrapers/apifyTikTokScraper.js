/**
 * Scraper do TikTok usando API do Apify
 * Mais confiável que scraping direto
 */

const { ApifyClient } = require('apify-client');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');

/**
 * Busca tendências do TikTok usando API do Apify
 * @param {Object} params - Parâmetros de busca
 * @param {string} params.niche - Nicho (ex: 'beleza', 'moda', 'fitness')
 * @param {string} params.country - Código do país (ex: 'BR', 'US')
 * @returns {Promise<Array>} Lista de tendências
 */
async function scrapeTikTokViaApify({ niche = 'genérico', country = 'BR' }) {
  const apifyApiToken = process.env.APIFY_API_TOKEN;
  
  if (!apifyApiToken || apifyApiToken === 'sua_api_token_aqui') {
    logger.warn('[Apify TikTok] ⚠️ APIFY_API_TOKEN não configurado. Pulando API do Apify.');
    return [];
  }

  logger.info(`[Apify TikTok] Iniciando coleta via API - Nicho: ${niche}, País: ${country}`);

  try {
    const client = new ApifyClient({
      token: apifyApiToken,
    });

    // Mapear código de país para formato esperado pela API
    const countryMap = {
      'BR': 'BR',
      'US': 'US',
      'ES': 'ES',
      'MX': 'MX',
      'PT': 'PT'
    };

    const adsCountryCode = countryMap[country] || 'BR';

    // Preparar input para o Actor do Apify
    const runInput = {
      resultsPerPage: 100,
      adsCountryCode: adsCountryCode,
      adsRankType: 'popular', // 'popular' ou 'trending'
      adsSortCreatorsBy: 'follower', // 'follower' ou 'engagement'
      adsSortVideosBy: 'vv', // 'vv' (views) ou 'likes'
    };

    logger.info(`[Apify TikTok] Executando Actor: clockworks/tiktok-trends-scraper`);
    logger.info(`[Apify TikTok] Parâmetros:`, runInput);

    // Executar o Actor e aguardar conclusão
    const run = await retry(async () => {
      return await client.actor('clockworks/tiktok-trends-scraper').call(runInput);
    }, { maxRetries: 2, delay: 2000 });

    logger.info(`[Apify TikTok] ✅ Actor executado com sucesso! Run ID: ${run.id}`);
    logger.info(`[Apify TikTok] Dataset ID: ${run.defaultDatasetId}`);

    // Buscar resultados do dataset
    const dataset = await client.dataset(run.defaultDatasetId).listItems();
    
    logger.info(`[Apify TikTok] ✅ Coletados ${dataset.items.length} vídeos do Apify`);

    // Transformar dados do Apify para formato padrão
    const trends = dataset.items.map((item, index) => {
      // Extrair dados do formato do Apify
      const videoData = item.video || {};
      const authorData = item.author || {};
      const musicData = item.music || {};
      
      // Extrair URL do vídeo
      let videoUrl = null;
      if (item.url) {
        videoUrl = item.url;
      } else if (videoData.url) {
        videoUrl = videoData.url;
      } else if (item.id) {
        videoUrl = `https://www.tiktok.com/@${authorData.uniqueId || 'user'}/video/${item.id}`;
      }

      // Extrair região (pode estar em diferentes campos)
      let region = adsCountryCode === 'BR' ? 'Brazil' : (adsCountryCode || 'Global');
      if (item.country) {
        region = item.country;
      } else if (videoData.country) {
        region = videoData.country;
      }

      // Determinar se é Brasil
      const regionLower = (region || '').toLowerCase();
      const isBrazil = regionLower.includes('brazil') || 
                       regionLower.includes('brasil') || 
                       regionLower === 'br' ||
                       adsCountryCode === 'BR';

      return {
        id: item.id || videoData.id || `apify_${index}`,
        title: item.text || item.description || videoData.description || 'Sem título',
        description: item.description || videoData.description || null,
        videoUrl: videoUrl,
        thumbUrl: videoData.cover || videoData.thumbnail || item.thumbnail || null,
        soundName: musicData.title || musicData.name || null,
        authorHandle: authorData.uniqueId ? `@${authorData.uniqueId}` : (authorData.nickname || null),
        views: parseInt(item.playCount || videoData.playCount || item.stats?.playCount || 0),
        likes: parseInt(item.diggCount || videoData.diggCount || item.stats?.diggCount || 0),
        comments: parseInt(item.commentCount || videoData.commentCount || item.stats?.commentCount || 0),
        shares: parseInt(item.shareCount || videoData.shareCount || item.stats?.shareCount || 0),
        region: region,
        isBrazil: isBrazil,
        source: 'apify_tiktok_trends',
        // Campos adicionais do Apify que podem ser úteis
        createdAt: item.createTime || videoData.createTime || null,
        hashtags: item.hashtags || [],
        mentions: item.mentions || []
      };
    });

    logger.info(`[Apify TikTok] ✅ Transformados ${trends.length} vídeos para formato padrão`);
    
    // Filtrar e priorizar vídeos do país solicitado
    if (country === 'BR') {
      const brazilTrends = trends.filter(t => t.isBrazil);
      const globalTrends = trends.filter(t => {
        const regionLower = (t.region || '').toLowerCase();
        return !t.isBrazil && (regionLower.includes('global') || regionLower.includes('world'));
      });
      
      logger.info(`[Apify TikTok] 📊 Estatísticas: Brasil=${brazilTrends.length}, Global=${globalTrends.length}, Total=${trends.length}`);
      
      // Priorizar Brasil, mas aceitar Global como fallback se necessário
      if (brazilTrends.length >= 10) {
        // Temos vídeos suficientes do Brasil
        logger.info(`[Apify TikTok] ✅ Retornando ${brazilTrends.length} vídeos do Brasil`);
        return brazilTrends.slice(0, 20); // Limitar a 20
      } else if (brazilTrends.length > 0) {
        // Temos alguns vídeos do Brasil, completar com Global
        const missing = 20 - brazilTrends.length;
        const toAdd = globalTrends.slice(0, missing);
        const combined = [...brazilTrends, ...toAdd];
        logger.info(`[Apify TikTok] ✅ Retornando ${brazilTrends.length} vídeos do Brasil + ${toAdd.length} globais (total: ${combined.length})`);
        return combined;
      } else if (globalTrends.length > 0) {
        // Nenhum vídeo do Brasil, usar Global como fallback
        logger.warn(`[Apify TikTok] ⚠️ Nenhum vídeo do Brasil encontrado, usando ${Math.min(globalTrends.length, 20)} vídeos globais como fallback`);
        return globalTrends.slice(0, 20);
      } else {
        // Nenhum vídeo do Brasil ou Global, retornar todos (pode ser de outros países)
        logger.warn(`[Apify TikTok] ⚠️ Nenhum vídeo do Brasil ou Global encontrado, retornando todos os ${trends.length} vídeos`);
        return trends.slice(0, 20);
      }
    }

    // Para outros países, retornar todos os vídeos (já filtrados pela API)
    return trends.slice(0, 20);

  } catch (error) {
    logger.error('[Apify TikTok] Erro ao buscar tendências via API:', error);
    return [];
  }
}

module.exports = {
  scrapeTikTokViaApify
};

