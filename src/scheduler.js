/**
 * Módulo de agendamento automático
 * Gerencia coleta diária e geração de CSV usando node-cron
 * Roda junto com o servidor, sem necessidade de cron externo ou n8n
 */

const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { getTopTrends } = require('./trendsService');
const { insertTrends, testConnection } = require('./database');
const logger = require('./utils/logger');
const { runDailyCollection } = require('../scripts/run-daily-collection');

// Criar pasta exports se não existir
const exportsDir = path.join(__dirname, '..', 'exports');
if (!fs.existsSync(exportsDir)) {
  fs.mkdirSync(exportsDir, { recursive: true });
  logger.info(`[Scheduler] Pasta exports criada: ${exportsDir}`);
}

/**
 * Gera CSV a partir das tendências coletadas
 * @param {Array} trends - Lista de tendências
 * @param {string} filename - Nome do arquivo (sem extensão)
 * @returns {string} Caminho completo do arquivo gerado
 */
function generateCSVFile(trends, filename) {
  try {
    // Cabeçalho CSV
    const csvHeader = 'title,main_hashtag,origin,views,likes,comments,shares,score,engagement_score,url,author_handle,collected_at\n';
    
    // Linhas CSV
    const csvRows = trends.map(trend => {
      const videoUrl = trend.videoUrl && trend.videoUrl !== 'https://www.tiktok.com' 
        ? trend.videoUrl 
        : 'N/A';
      
      const row = [
        `"${(trend.title || '').replace(/"/g, '""')}"`,
        `"${(trend.mainHashtag || '').replace(/"/g, '""')}"`,
        `"${trend.source}"`,
        trend.views || 0,
        trend.likes || 0,
        trend.comments || 0,
        trend.shares || 0,
        trend.score || 0,
        trend.engagementScore || 0,
        `"${videoUrl}"`,
        `"${trend.authorHandle || ''}"`,
        `"${trend.collectedAt || new Date().toISOString()}"`
      ];
      return row.join(',');
    });

    const csvContent = csvHeader + csvRows.join('\n');
    const filePath = path.join(exportsDir, `${filename}.csv`);
    
    // Salvar arquivo com BOM UTF-8 para Excel
    fs.writeFileSync(filePath, '\ufeff' + csvContent, 'utf8');
    
    logger.info(`[Scheduler] CSV gerado: ${filePath} (${trends.length} registros)`);
    return filePath;
    
  } catch (error) {
    logger.error('[Scheduler] Erro ao gerar CSV:', error);
    throw error;
  }
}

/**
 * Executa coleta diária completa: coleta + salva no banco + gera CSV
 */
async function runDailyCollectionWithCSV() {
  const startTime = Date.now();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  logger.info('=== [Scheduler] Iniciando Coleta Diária Automática ===');
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
      sources: (process.env.COLLECTION_SOURCES || 'tiktok_cc,pipiads').split(',').map(s => s.trim()),
      hashtags: (process.env.COLLECTION_HASHTAGS || '#beleza,#promo').split(',').filter(h => h).map(h => h.trim()),
      filters: {
        minViews: parseInt(process.env.MIN_VIEWS || '0', 10),
        minLikes: parseInt(process.env.MIN_LIKES || '50000', 10), // Padrão: 50k curtidas
        language: process.env.FILTER_LANGUAGE || 'pt'
      }
    };

    logger.info('[Scheduler] Configurações:', config);

    // ETAPA 1: Coletar tendências
    logger.info('[Scheduler] Iniciando coleta de tendências...');
    const trends = await getTopTrends(config);

    if (trends.length === 0) {
      logger.warn('[Scheduler] Nenhuma tendência coletada. Verifique as configurações e fontes.');
      return {
        success: false,
        message: 'Nenhuma tendência coletada',
        trends: 0,
        saved: 0,
        csvGenerated: false
      };
    }

    logger.info(`[Scheduler] Coletadas ${trends.length} tendências`);

    // ETAPA 2: Salvar no banco
    logger.info('[Scheduler] Salvando tendências no banco de dados...');
    const saveResult = await insertTrends(trends);
    logger.info(`[Scheduler] Tendências salvas: ${saveResult.inserted} (${saveResult.skipped} duplicadas ignoradas)`);

    // ETAPA 3: Gerar CSV automaticamente
    logger.info('[Scheduler] Gerando CSV diário...');
    const csvFilename = `top20_trends_${today}`;
    const csvPath = generateCSVFile(trends, csvFilename);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`=== [Scheduler] Coleta Diária Concluída ===`);
    logger.info(`Tendências coletadas: ${trends.length}`);
    logger.info(`Tendências salvas: ${saveResult.inserted}`);
    logger.info(`CSV gerado: ${csvPath}`);
    logger.info(`Tempo total: ${duration}s`);

    return {
      success: true,
      trends: trends.length,
      saved: saveResult.inserted,
      skipped: saveResult.skipped,
      csvGenerated: true,
      csvPath: csvPath,
      duration: duration
    };

  } catch (error) {
    logger.error('[Scheduler] Erro durante coleta diária:', error);
    return {
      success: false,
      error: error.message,
      trends: 0,
      saved: 0,
      csvGenerated: false
    };
  }
}

/**
 * Inicia o agendamento automático
 * Configura os cron jobs para coleta diária
 */
function startScheduler() {
  // Verificar se agendamento está habilitado
  const schedulerEnabled = process.env.SCHEDULER_ENABLED !== 'false'; // Por padrão, habilitado
  
  if (!schedulerEnabled) {
    logger.info('[Scheduler] Agendamento automático DESABILITADO (SCHEDULER_ENABLED=false)');
    return null;
  }

  // Obter configuração de horários do .env ou usar padrão
  // Formato: "10,15,21" = 10h, 15h e 21h | "10" = apenas 10h
  const collectionHours = process.env.COLLECTION_HOURS || '10';
  const hoursArray = collectionHours.split(',').map(h => h.trim());
  
  logger.info(`[Scheduler] Iniciando agendamento automático...`);
  logger.info(`[Scheduler] Horários configurados: ${hoursArray.join(', ')}h`);

  const cronJobs = [];

  // Criar um cron job para cada horário configurado
  hoursArray.forEach(hour => {
    const hourInt = parseInt(hour);
    if (isNaN(hourInt) || hourInt < 0 || hourInt > 23) {
      logger.warn(`[Scheduler] Horário inválido ignorado: ${hour}`);
      return;
    }

    // Expressão cron: "0 H * * *" = todo dia às H horas
    const cronExpression = `0 ${hourInt} * * *`;
    
    const job = cron.schedule(cronExpression, async () => {
      logger.info(`[Scheduler] Executando coleta agendada às ${hourInt}h...`);
      try {
        const result = await runDailyCollectionWithCSV();
        if (result.success) {
          logger.info(`[Scheduler] ✅ Coleta agendada concluída com sucesso às ${hourInt}h`);
        } else {
          logger.error(`[Scheduler] ❌ Coleta agendada falhou às ${hourInt}h: ${result.error || result.message}`);
        }
      } catch (error) {
        logger.error(`[Scheduler] Erro na coleta agendada às ${hourInt}h:`, error);
      }
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'America/Sao_Paulo' // Timezone padrão: Brasil
    });

    cronJobs.push({
      hour: hourInt,
      job: job,
      expression: cronExpression
    });

    logger.info(`[Scheduler] ✅ Agendamento configurado: ${cronExpression} (${hourInt}h)`);
  });

  logger.info(`[Scheduler] ${cronJobs.length} agendamento(s) ativo(s)`);
  
  return cronJobs;
}

/**
 * Para todos os agendamentos
 */
function stopScheduler(cronJobs) {
  if (!cronJobs || cronJobs.length === 0) {
    return;
  }
  
  logger.info('[Scheduler] Parando agendamentos...');
  cronJobs.forEach(({ hour, job }) => {
    job.stop();
    logger.info(`[Scheduler] Agendamento das ${hour}h parado`);
  });
}

module.exports = {
  startScheduler,
  stopScheduler,
  runDailyCollectionWithCSV,
  generateCSVFile
};

