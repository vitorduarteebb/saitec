/**
 * Script de teste completo de coleta de tendências
 * Execute: node scripts/test-collection.js
 */

const { getTopTrends } = require('../src/trendsService');
const { insertTrends, testConnection } = require('../src/database');
const logger = require('../src/utils/logger');

async function testCollection() {
  logger.info('=== Iniciando Teste de Coleta ===');

  try {
    // Testar conexão com banco
    logger.info('1. Testando conexão com banco de dados...');
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.warn('Banco de dados não conectado. Continuando com testes de coleta apenas...');
    } else {
      logger.info('✓ Banco de dados conectado');
    }

    // Testar coleta do TikTok Creative Center
    logger.info('\n2. Testando coleta do TikTok Creative Center...');
    const tiktokTrends = await getTopTrends({
      niche: 'beleza',
      country: 'BR',
      limit: 5,
      sources: ['tiktok_cc']
    });
    logger.info(`✓ Coletadas ${tiktokTrends.length} tendências do TikTok CC`);

    // Testar coleta do PiPiAds
    logger.info('\n3. Testando coleta do PiPiAds...');
    const pipiTrends = await getTopTrends({
      niche: 'beleza',
      country: 'BR',
      limit: 5,
      sources: ['pipiads']
    });
    logger.info(`✓ Coletadas ${pipiTrends.length} tendências do PiPiAds`);

    // Testar coleta de hashtags
    logger.info('\n4. Testando coleta de hashtags...');
    const hashtagTrends = await getTopTrends({
      niche: 'beleza',
      country: 'BR',
      limit: 5,
      sources: ['hashtag_scraper'],
      hashtags: ['#beleza', '#makeup']
    });
    logger.info(`✓ Coletadas ${hashtagTrends.length} tendências de hashtags`);

    // Testar coleta completa (todas as fontes)
    logger.info('\n5. Testando coleta completa (todas as fontes)...');
    const allTrends = await getTopTrends({
      niche: 'beleza',
      country: 'BR',
      limit: 20,
      sources: ['tiktok_cc', 'pipiads', 'hashtag_scraper'],
      hashtags: ['#beleza']
    });
    logger.info(`✓ Coletadas ${allTrends.length} tendências no total`);

    // Mostrar exemplo de tendência
    if (allTrends.length > 0) {
      logger.info('\n6. Exemplo de tendência coletada:');
      const example = allTrends[0];
      logger.info(JSON.stringify({
        title: example.title,
        source: example.source,
        views: example.views,
        likes: example.likes,
        engagementScore: example.engagementScore,
        videoUrl: example.videoUrl
      }, null, 2));
    }

    // Salvar no banco se conectado
    if (dbConnected && allTrends.length > 0) {
      logger.info('\n7. Salvando tendências no banco de dados...');
      const saveResult = await insertTrends(allTrends);
      logger.info(`✓ Salvas ${saveResult.inserted} tendências no banco`);
    }

    logger.info('\n=== Teste Concluído com Sucesso ===');

  } catch (error) {
    logger.error('Erro durante teste:', error);
    process.exit(1);
  }
}

testCollection().then(() => {
  process.exit(0);
}).catch(error => {
  logger.error('Erro fatal:', error);
  process.exit(1);
});

