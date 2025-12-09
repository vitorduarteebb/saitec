/**
 * Script para executar coleta diária
 * Pode ser usado com cron, agendador de tarefas ou n8n
 * 
 * USO COM n8n:
 * ============
 * 
 * Opção 1 - Executar script diretamente:
 *   Comando: node scripts/run-daily-collection.js
 *   Diretório: /caminho/para/projeto
 * 
 * Opção 2 - Chamar via HTTP (recomendado):
 *   Endpoint: POST http://localhost:3000/internal/run-collection
 *   Header: x-api-token: SEU_TOKEN_AQUI
 *   Body (opcional): { "token": "SEU_TOKEN_AQUI" }
 * 
 * CONFIGURAÇÃO:
 * ============
 * Configure no .env:
 *   INTERNAL_API_TOKEN=seu_token_secreto_aqui
 * 
 * O script salva automaticamente no banco evitando duplicatas
 * baseado em video_url + collected_at (mesmo dia)
 */

const { getTopTrends } = require('../src/trendsService');
const { insertTrends, testConnection } = require('../src/database');
const logger = require('../src/utils/logger');
const { closeBrowser } = require('../src/scrapers/tiktokScraper');

async function runDailyCollection() {
  const startTime = Date.now();
  logger.info('=== Iniciando Coleta Diária ===');
  logger.info(`Horário: ${new Date().toISOString()}`);

  try {
    // Verificar conexão com banco
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('Não foi possível conectar ao banco de dados');
    }

    // Configurações de coleta (podem vir de variáveis de ambiente)
    const config = {
      niche: process.env.DEFAULT_NICHE || 'beleza',
      country: process.env.DEFAULT_COUNTRY || 'BR',
      limit: parseInt(process.env.COLLECTION_LIMIT || 20),
      sources: (process.env.COLLECTION_SOURCES || 'tiktok_cc,pipiads').split(','),
      hashtags: (process.env.COLLECTION_HASHTAGS || '#beleza,#promo').split(',').filter(h => h),
      filters: {
        minViews: parseInt(process.env.MIN_VIEWS || '0', 10),
        minLikes: parseInt(process.env.MIN_LIKES || '50000', 10), // Padrão: 50k curtidas
        language: process.env.FILTER_LANGUAGE || 'pt'
      }
    };

    logger.info('Configurações:', config);

    // Coletar tendências
    logger.info('Iniciando coleta de tendências...');
    const trends = await getTopTrends(config);

    if (trends.length === 0) {
      logger.warn('Nenhuma tendência coletada. Verifique as configurações e fontes.');
      return;
    }

    logger.info(`Coletadas ${trends.length} tendências`);

    // Salvar no banco
    logger.info('Salvando tendências no banco de dados...');
    const saveResult = await insertTrends(trends);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`=== Coleta Concluída ===`);
    logger.info(`Tendências coletadas: ${trends.length}`);
    logger.info(`Tendências salvas: ${saveResult.inserted}`);
    logger.info(`Tempo total: ${duration}s`);

  } catch (error) {
    logger.error('Erro durante coleta diária:', error);
    throw error;
  } finally {
    // Fechar navegador se estiver aberto
    await closeBrowser();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  runDailyCollection()
    .then(() => {
      logger.info('Script finalizado com sucesso');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Script finalizado com erro:', error);
      process.exit(1);
    });
}

module.exports = { runDailyCollection };

