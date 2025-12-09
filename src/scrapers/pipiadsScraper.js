/**
 * Scraper/integração com PiPiAds
 * Busca ads que estão performando bem
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');

/**
 * Busca tendências do PiPiAds
 * @param {Object} params - Parâmetros de busca
 * @param {string} params.niche - Nicho
 * @param {string} params.country - Código do país
 * @returns {Promise<Array>} Lista de tendências
 */
async function getTrendsFromPiPiAds({ niche = 'genérico', country = 'BR' }) {
  logger.info(`[PiPiAds] Buscando ads performando - Nicho: ${niche}, País: ${country}`);

  try {
    // Tentar usar API do PiPiAds se disponível
    const apiUrl = process.env.PIPIADS_API_URL || 'https://api.pipiads.com/v1/trending';
    const apiKey = process.env.PIPIADS_API_KEY;

    if (apiKey) {
      return await getFromPiPiAdsAPI(apiUrl, apiKey, { niche, country });
    }

    // Se não houver API key, tentar scraping
    logger.warn('[PiPiAds] API key não configurada. Tentando scraping...');
    return await scrapePiPiAds({ niche, country });

  } catch (error) {
    logger.error('[PiPiAds] Erro ao buscar tendências:', error);
    // Não retornar dados de exemplo - retornar array vazio
    logger.warn('[PiPiAds] Retornando array vazio devido a erro.');
    return [];
  }
}

/**
 * Busca via API do PiPiAds
 */
async function getFromPiPiAdsAPI(apiUrl, apiKey, { niche, country }) {
  try {
    const response = await retry(async () => {
      return await axios.get(apiUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        params: {
          niche,
          country,
          limit: 20
        },
        timeout: 15000
      });
    }, { maxRetries: 3 });

    if (response.data && response.data.data) {
      logger.info(`[PiPiAds] Coletadas ${response.data.data.length} tendências via API`);
      return response.data.data.map(item => ({
        title: item.title || item.ad_title,
        description: item.description || item.ad_description,
        videoUrl: item.video_url || item.url,
        thumbUrl: item.thumbnail || item.thumb_url,
        authorHandle: item.advertiser || item.handle,
        views: parseInt(item.views || item.impressions || 0),
        likes: parseInt(item.likes || item.engagement || 0),
        comments: parseInt(item.comments || 0),
        shares: parseInt(item.shares || 0)
      }));
    }

    return [];

  } catch (error) {
    logger.error('[PiPiAds] Erro na API:', error.message);
    throw error;
  }
}

/**
 * Scraping do PiPiAds (fallback)
 */
async function scrapePiPiAds({ niche, country }) {
  // Implementação de scraping seria similar ao TikTok
  // Por enquanto, retorna array vazio
  logger.warn('[PiPiAds] Scraping não implementado. Retornando array vazio.');
  return [];
}

module.exports = {
  getTrendsFromPiPiAds
};

