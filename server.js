/**
 * Servidor Express para API de coleta de tendências
 * Microserviço que expõe endpoints para o n8n consumir
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { getTopTrends, getTikTokShopTopProducts, getKalodataTopProducts } = require('./src/trendsService');
const { insertTrends, testConnection, getLatestTrends, getCollectionDates, insertProducts, getProducts } = require('./src/database');
const logger = require('./src/utils/logger');
const { closeBrowser } = require('./src/scrapers/tiktokScraper');
const { runDailyCollection } = require('./scripts/run-daily-collection');
const { startScheduler, stopScheduler } = require('./src/scheduler');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar timeout para requisições longas (scraping pode demorar)
// Timeout padrão do Express é 2 minutos, aumentando para 15 minutos
app.timeout = 15 * 60 * 1000; // 15 minutos

// Configuração de CORS - permitir apenas domínios específicos em produção
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*', // Em produção, definir domínio específico
  credentials: true,
  optionsSuccessStatus: 200
};

// Rate limiting para APIs públicas
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: process.env.RATE_LIMIT_MAX || 100, // máximo de requisições por IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    // Sempre retornar JSON, nunca HTML
    res.status(429).json({
      success: false,
      error: 'Muitas requisições',
      message: 'Muitas requisições deste IP, tente novamente mais tarde.'
    });
  }
});

// Middlewares
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Para servir arquivos estáticos do painel

/**
 * GET /
 * Rota raiz - Redireciona para o painel ou mostra informações da API
 */
app.get('/', (req, res) => {
  // Se aceitar HTML, redirecionar para o painel
  if (req.headers.accept && req.headers.accept.includes('text/html')) {
    return res.redirect('/painel');
  }
  
  // Caso contrário, retornar informações da API em JSON
  res.json({
    name: 'SAITEC - Sistema de Coleta de Tendências TikTok',
    version: require('./package.json').version || '1.0.0',
    status: 'online',
    endpoints: {
      health: '/health',
      top20: '/trends/top20',
      top20csv: '/trends/top20.csv',
      panel: '/painel',
      latest: '/trends/latest',
      internal: '/internal/run-collection'
    },
    documentation: 'Consulte /health para status do sistema'
  });
});

/**
 * GET /health
 * Healthcheck completo do sistema para monitoramento em produção
 * Retorna status do servidor, banco de dados e informações de uptime
 */
app.get('/health', async (req, res) => {
  try {
    const startTime = process.uptime();
    const dbConnected = await testConnection();
    
    const healthData = {
      status: dbConnected ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: Math.floor(startTime),
        formatted: formatUptime(startTime)
      },
      database: {
        status: dbConnected ? 'connected' : 'disconnected',
        host: process.env.DB_HOST || 'not configured'
      },
      environment: process.env.NODE_ENV || 'development',
      version: require('./package.json').version || '1.0.0'
    };

    // Se banco não estiver conectado, retornar 503
    const statusCode = dbConnected ? 200 : 503;
    res.status(statusCode).json(healthData);

  } catch (error) {
    logger.error('[Health] Erro no healthcheck:', error);
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Healthcheck failed',
      message: error.message
    });
  }
});

/**
 * Formata uptime em formato legível
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

// Armazenar progresso de coleta ativa (em memória - simples)
let activeCollectionProgress = null;
let isCollectionInProgress = false;
let activeCollectionPromise = null; // Promise da coleta em andamento

/**
 * GET /trends/collect/progress
 * Server-Sent Events para progresso da coleta
 */
app.get('/trends/collect/progress', (req, res) => {
  // Configurar headers para SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Enviar progresso inicial se houver
  if (activeCollectionProgress) {
    res.write(`data: ${JSON.stringify(activeCollectionProgress)}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify({ status: 'idle', progress: 0, message: 'Aguardando início da coleta...' })}\n\n`);
  }

  // Manter conexão aberta e enviar atualizações
  const interval = setInterval(() => {
    if (activeCollectionProgress) {
      res.write(`data: ${JSON.stringify(activeCollectionProgress)}\n\n`);
    }
  }, 500); // Atualizar a cada 500ms

  // Limpar quando cliente desconectar
  req.on('close', () => {
    clearInterval(interval);
  });
});

/**
 * POST /trends/collect
 * Inicia uma nova coleta com progresso
 */
app.post('/trends/collect', apiLimiter, async (req, res) => {
  try {
    const {
      niche = process.env.DEFAULT_NICHE || null, // null = qualquer nicho (não focar só em beleza)
      country = process.env.DEFAULT_COUNTRY || 'BR',
      sources = 'tiktok_cc,pipiads',
      hashtags = '',
      minViews,
      language
    } = req.body;

    const sourcesArray = sources.split(',').map(s => s.trim()).filter(s => s);
    const hashtagsArray = hashtags 
      ? hashtags.split(',').map(h => h.trim()).filter(h => h)
      : [];

    const filters = {};
    if (minViews) filters.minViews = parseInt(minViews);
    if (language) filters.language = language;

    // Inicializar progresso
    activeCollectionProgress = {
      status: 'collecting',
      progress: 0,
      message: 'Iniciando coleta...',
      step: 'iniciando',
      totalSteps: sourcesArray.length + 2, // fontes + filtros + ranking
      currentStep: 0
    };

    logger.info(`[API] Iniciando coleta com progresso - Nicho: ${niche}, País: ${country}`);

    // Função para atualizar progresso
    const updateProgress = (progress, message, step) => {
      activeCollectionProgress = {
        ...activeCollectionProgress,
        progress: Math.min(100, Math.max(0, progress)),
        message: message || activeCollectionProgress.message,
        step: step || activeCollectionProgress.step,
        currentStep: step && step !== activeCollectionProgress.step 
          ? activeCollectionProgress.currentStep + 1 
          : activeCollectionProgress.currentStep
      };
      // Log para debug
      logger.debug(`[Progress] ${progress}% - ${message}`);
    };

    // Coletar tendências com progresso
    const trends = await getTopTrends({
      niche,
      country,
      limit: 20,
      sources: sourcesArray,
      hashtags: hashtagsArray,
      filters,
      onProgress: updateProgress
    });

    // Finalizar progresso
    activeCollectionProgress = {
      status: 'completed',
      progress: 100,
      message: `Coleta concluída! ${trends.length} tendências encontradas`,
      step: 'concluido',
      trendsCount: trends.length
    };

    // Formato enxuto para o front-end
    const formattedTrends = trends.map((trend, index) => ({
      id: index + 1,
      title: trend.title,
      mainHashtag: trend.mainHashtag || null,
      origin: trend.source,
      metrics: {
        views: trend.views,
        likes: trend.likes,
        comments: trend.comments,
        shares: trend.shares || 0
      },
      score: trend.score,
      engagementScore: trend.engagementScore,
      url: trend.videoUrl && trend.videoUrl !== 'https://www.tiktok.com' ? trend.videoUrl : null,
      thumbnail: trend.thumbUrl,
      author: trend.authorHandle,
      language: trend.language,
      collectedAt: trend.collectedAt
    }));

    res.json({
      success: true,
      count: formattedTrends.length,
      data: formattedTrends,
      generatedAt: new Date().toISOString()
    });

    // Limpar progresso após 5 segundos
    setTimeout(() => {
      activeCollectionProgress = null;
    }, 5000);

  } catch (error) {
    logger.error('[API] Erro ao coletar tendências:', error);
    
    // Garantir que sempre retornamos JSON
    if (!res.headersSent) {
      activeCollectionProgress = {
        status: 'error',
        progress: 0,
        message: `Erro: ${error.message}`,
        step: 'erro'
      };

      res.status(500).json({
        success: false,
        error: 'Erro ao coletar tendências',
        message: error.message || 'Erro desconhecido',
        ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
      });
    }
  }
});

/**
 * POST /trends/top20
 * Endpoint para coletar tendências com filtros avançados (POST para suportar filtros complexos)
 */
app.post('/trends/top20', apiLimiter, async (req, res) => {
  try {
    // Verificar se já há uma coleta em andamento
    if (isCollectionInProgress && activeCollectionProgress) {
      logger.info('[API] Coleta já em andamento, retornando status de progresso');
      return res.json({
        success: true,
        inProgress: true,
        progress: activeCollectionProgress.progress || 0,
        message: activeCollectionProgress.message || 'Coleta em andamento...',
        status: activeCollectionProgress.status || 'collecting',
        redirectToProgress: true
      });
    }

    const {
      niche = process.env.DEFAULT_NICHE || null,
      country = process.env.DEFAULT_COUNTRY || 'BR',
      limit = 20,
      filters = {}
    } = req.body;

    if (limit > 100) {
      return res.status(400).json({
        success: false,
        error: 'Limite máximo é 100'
      });
    }

    // Marcar que há coleta em andamento
    isCollectionInProgress = true;
    
    // Inicializar progresso
    activeCollectionProgress = {
      status: 'collecting',
      progress: 0,
      message: 'Iniciando coleta...',
      step: 'iniciando',
      startTime: new Date().toISOString()
    };

    logger.info(`[API] Buscando Top ${limit} tendências - Nicho: ${niche || 'qualquer'}, País: ${country}`);
    logger.info(`[API] Filtros avançados:`, filters);

    // Criar promise da coleta para compartilhar entre múltiplas requisições
    const collectionPromise = getTopTrends({
      niche,
      country,
      limit: parseInt(limit),
      sources: ['tiktok_cc'],
      hashtags: [],
      filters: {
        ...filters,
        minLikes: filters.minLikes || parseInt(process.env.MIN_LIKES || '50000', 10)
      },
      onProgress: (progress, message, step) => {
        // Atualizar progresso compartilhado
        activeCollectionProgress = {
          ...activeCollectionProgress,
          progress: Math.min(100, Math.max(0, progress)),
          message: message || activeCollectionProgress.message,
          step: step || activeCollectionProgress.step
        };
      }
    });

    activeCollectionPromise = collectionPromise;
    const trends = await collectionPromise;

    // Formato enxuto para o front-end
    const formattedTrends = trends.map((trend, index) => ({
      id: index + 1,
      title: trend.title,
      mainHashtag: trend.mainHashtag || null,
      origin: trend.source,
      metrics: {
        views: trend.views,
        likes: trend.likes,
        comments: trend.comments,
        shares: trend.shares || 0
      },
      score: trend.score,
      engagementScore: trend.engagementScore,
      url: trend.videoUrl && trend.videoUrl !== 'https://www.tiktok.com' ? trend.videoUrl : null,
      thumbnail: trend.thumbUrl,
      author: trend.authorHandle,
      language: trend.language,
      collectedAt: trend.collectedAt
    }));

    // Finalizar progresso
    activeCollectionProgress = {
      status: 'completed',
      progress: 100,
      message: `Coleta concluída! ${trends.length} tendências encontradas`,
      step: 'concluido',
      trendsCount: trends.length
    };

    // Salvar tendências no banco de dados automaticamente
    try {
      const trendsToSave = trends.map(trend => ({
        source: trend.source,
        niche: niche || null,
        title: trend.title,
        description: trend.description || null,
        videoUrl: trend.videoUrl,
        thumbUrl: trend.thumbUrl || null,
        soundName: trend.soundName || null,
        authorHandle: trend.authorHandle || null,
        views: trend.views || 0,
        likes: trend.likes || 0,
        comments: trend.comments || 0,
        shares: trend.shares || 0,
        engagementScore: trend.engagementScore || trend.score || 0,
        country: country,
        language: trend.language || null,
        collectedAt: trend.collectedAt || new Date()
      }));
      
      const saveResult = await insertTrends(trendsToSave);
      logger.info(`[API] Tendências salvas no banco: ${saveResult.inserted} inseridas, ${saveResult.skipped} duplicadas`);
    } catch (saveError) {
      logger.error('[API] Erro ao salvar tendências no banco:', saveError);
    }

    // Finalizar progresso antes de liberar lock
    activeCollectionProgress = {
      status: 'completed',
      progress: 100,
      message: `Coleta concluída! ${formattedTrends.length} tendências encontradas`,
      step: 'concluido',
      trendsCount: formattedTrends.length,
      endTime: new Date().toISOString()
    };

    // Liberar lock após 2 segundos (dar tempo para SSE enviar atualização final)
    setTimeout(() => {
      isCollectionInProgress = false;
      activeCollectionPromise = null;
      activeCollectionProgress = null;
      logger.info('[API] Lock de coleta liberado');
    }, 2000);

    res.json({
      success: true,
      count: formattedTrends.length,
      data: formattedTrends,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[API] Erro ao buscar Top 20:', error);
    
    // Liberar lock em caso de erro
    isCollectionInProgress = false;
    activeCollectionPromise = null;
    activeCollectionProgress = {
      status: 'error',
      progress: 0,
      message: `Erro: ${error.message}`,
      step: 'erro'
    };

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar Top 20 tendências',
        message: error.message
      });
    }
  }
});

/**
 * GET /trends/top20
 * Endpoint otimizado para retornar Top 20 tendências ranqueadas
 * Formato enxuto pronto para consumo do front-end
 */
app.get('/trends/top20', apiLimiter, async (req, res) => {
  try {
    // Verificar se já há uma coleta REALMENTE em andamento
    // Se a coleta está marcada como "completed" ou "error", permitir nova coleta
    if (isCollectionInProgress && activeCollectionProgress) {
      const status = activeCollectionProgress.status;
      const startTime = activeCollectionProgress.startTime ? new Date(activeCollectionProgress.startTime) : null;
      const now = new Date();
      
      // Se a coleta foi completada ou teve erro, liberar lock
      if (status === 'completed' || status === 'error') {
        logger.info('[API] Coleta anterior finalizada, liberando lock e iniciando nova coleta');
        isCollectionInProgress = false;
        activeCollectionPromise = null;
        activeCollectionProgress = null;
      }
      // Se a coleta está em andamento há mais de 15 minutos, considerar travada e liberar
      else if (startTime && (now - startTime) > 15 * 60 * 1000) {
        logger.warn('[API] Coleta travada há mais de 15 minutos, liberando lock');
        isCollectionInProgress = false;
        activeCollectionPromise = null;
        activeCollectionProgress = null;
      }
      // Se realmente está em andamento, retornar status
      else {
        logger.info('[API] Coleta já em andamento, retornando status de progresso');
        return res.json({
          success: true,
          inProgress: true,
          progress: activeCollectionProgress.progress || 0,
          message: activeCollectionProgress.message || 'Coleta em andamento...',
          status: activeCollectionProgress.status || 'collecting',
          redirectToProgress: true
        });
      }
    }

    // Validar parâmetros básicos
    const limit = parseInt(req.query.limit) || 20;
    if (limit > 100) {
      return res.status(400).json({
        success: false,
        error: 'Limite máximo é 100'
      });
    }
    const {
      niche = process.env.DEFAULT_NICHE || null, // null = qualquer nicho (não focar só em beleza)
      country = process.env.DEFAULT_COUNTRY || 'BR',
      sources = 'tiktok_cc,pipiads',
      hashtags = '',
      minViews,
      language
    } = req.query;

    // Marcar que há coleta em andamento
    isCollectionInProgress = true;
    
    // Inicializar progresso
    activeCollectionProgress = {
      status: 'collecting',
      progress: 0,
      message: 'Iniciando coleta...',
      step: 'iniciando',
      startTime: new Date().toISOString()
    };

    const sourcesArray = sources.split(',').map(s => s.trim()).filter(s => s);
    const hashtagsArray = hashtags 
      ? hashtags.split(',').map(h => h.trim()).filter(h => h)
      : [];

    const filters = {};
    if (minViews) filters.minViews = parseInt(minViews);
    if (language) filters.language = language;
    // Adicionar filtro de curtidas (padrão: 50k)
    filters.minLikes = parseInt(process.env.MIN_LIKES || '50000', 10);

    logger.info(`[API] Buscando Top 20 tendências - Nicho: ${niche || 'qualquer'}, País: ${country}`);
    logger.info(`[API] Filtros: MIN_LIKES=${filters.minLikes}, MIN_VIEWS=${filters.minViews || 0}`);

    // Criar promise da coleta para compartilhar entre múltiplas requisições
    const collectionPromise = getTopTrends({
      niche,
      country,
      limit: 20, // Sempre Top 20
      sources: sourcesArray,
      hashtags: hashtagsArray,
      filters,
      onProgress: (progress, message, step) => {
        // Atualizar progresso compartilhado
        activeCollectionProgress = {
          ...activeCollectionProgress,
          progress: Math.min(100, Math.max(0, progress)),
          message: message || activeCollectionProgress.message,
          step: step || activeCollectionProgress.step
        };
      }
    });

    activeCollectionPromise = collectionPromise;
    const trends = await collectionPromise;

    // Formato enxuto para o front-end
    const formattedTrends = trends.map((trend, index) => ({
      id: index + 1,
      title: trend.title,
      mainHashtag: trend.mainHashtag || null,
      origin: trend.source,
      metrics: {
        views: trend.views,
        likes: trend.likes,
        comments: trend.comments,
        shares: trend.shares || 0
      },
      score: trend.score,
      engagementScore: trend.engagementScore,
      url: trend.videoUrl && trend.videoUrl !== 'https://www.tiktok.com' ? trend.videoUrl : null,
      thumbnail: trend.thumbUrl,
      author: trend.authorHandle,
      language: trend.language,
      collectedAt: trend.collectedAt
    }));

    // Salvar tendências no banco de dados automaticamente
    try {
      const trendsToSave = trends.map(trend => ({
        source: trend.source,
        niche: niche || null,
        title: trend.title,
        description: trend.description || null,
        videoUrl: trend.videoUrl,
        thumbUrl: trend.thumbUrl || null,
        soundName: trend.soundName || null,
        authorHandle: trend.authorHandle || null,
        views: trend.views || 0,
        likes: trend.likes || 0,
        comments: trend.comments || 0,
        shares: trend.shares || 0,
        engagementScore: trend.engagementScore || trend.score || 0,
        country: country,
        language: trend.language || null,
        collectedAt: trend.collectedAt || new Date()
      }));
      
      const saveResult = await insertTrends(trendsToSave);
      logger.info(`[API] Tendências salvas no banco: ${saveResult.inserted} inseridas, ${saveResult.skipped} duplicadas`);
    } catch (saveError) {
      logger.error('[API] Erro ao salvar tendências no banco:', saveError);
      // Não falhar a requisição se o salvamento der erro
    }

    // Finalizar progresso
    activeCollectionProgress = {
      status: 'completed',
      progress: 100,
      message: `Coleta concluída! ${trends.length} tendências encontradas`,
      step: 'concluido',
      trendsCount: trends.length
    };

    // Finalizar progresso antes de liberar lock
    activeCollectionProgress = {
      status: 'completed',
      progress: 100,
      message: `Coleta concluída! ${formattedTrends.length} tendências encontradas`,
      step: 'concluido',
      trendsCount: formattedTrends.length,
      endTime: new Date().toISOString()
    };

    // Liberar lock após 2 segundos (dar tempo para SSE enviar atualização final)
    setTimeout(() => {
      isCollectionInProgress = false;
      activeCollectionPromise = null;
      activeCollectionProgress = null;
      logger.info('[API] Lock de coleta liberado');
    }, 2000);

    res.json({
      success: true,
      count: formattedTrends.length,
      data: formattedTrends,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error('[API] Erro ao buscar Top 20:', error);
    
    // Liberar lock em caso de erro
    isCollectionInProgress = false;
    activeCollectionPromise = null;
    activeCollectionProgress = {
      status: 'error',
      progress: 0,
      message: `Erro: ${error.message}`,
      step: 'erro'
    };
    
    // Não expor detalhes do erro em produção
    const errorMessage = process.env.NODE_ENV === 'production' 
      ? 'Erro ao buscar Top 20 tendências' 
      : error.message;
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar Top 20 tendências',
        message: errorMessage
      });
    }
  }
});

/**
 * GET /trends/top
 * Busca as top tendências e retorna em JSON (mantido para compatibilidade)
 * 
 * Query params:
 * - niche: Nicho (ex: 'beleza', 'moda') - padrão: 'genérico'
 * - country: Código do país (ex: 'BR', 'US') - padrão: 'BR'
 * - limit: Limite de resultados - padrão: 20
 * - sources: Fontes separadas por vírgula (ex: 'tiktok_cc,pipiads') - padrão: todas
 * - hashtags: Hashtags separadas por vírgula (ex: '#beleza,#promo') - opcional
 * - minViews: Mínimo de views para filtrar - padrão: 50000
 * - language: Filtrar por idioma (ex: 'pt') - opcional
 */
app.get('/trends/top', apiLimiter, async (req, res) => {
  try {
    const {
      niche = process.env.DEFAULT_NICHE || null, // null = qualquer nicho (não focar só em beleza)
      country = process.env.DEFAULT_COUNTRY || 'BR',
      limit = 20,
      sources = 'tiktok_cc,pipiads',
      hashtags = '',
      minViews,
      language
    } = req.query;

    // Parse sources
    const sourcesArray = sources.split(',').map(s => s.trim()).filter(s => s);
    
    // Parse hashtags
    const hashtagsArray = hashtags 
      ? hashtags.split(',').map(h => h.trim()).filter(h => h)
      : [];

    // Monta filtros
    const filters = {};
    if (minViews) filters.minViews = parseInt(minViews);
    if (language) filters.language = language;

    logger.info(`[API] Buscando top ${limit} tendências - Nicho: ${niche}, País: ${country}`);

    const trends = await getTopTrends({
      niche,
      country,
      limit: parseInt(limit),
      sources: sourcesArray,
      hashtags: hashtagsArray,
      filters
    });

    res.json({
      success: true,
      count: trends.length,
      data: trends,
      params: {
        niche,
        country,
        limit: parseInt(limit),
        sources: sourcesArray
      }
    });
  } catch (error) {
    logger.error('[API] Erro ao buscar tendências:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar tendências',
      message: error.message
    });
  }
});

/**
 * GET /trends/top20.csv
 * Exporta Top 20 tendências em formato CSV
 */
app.get('/trends/top20.csv', apiLimiter, async (req, res) => {
  try {
    const {
      niche = process.env.DEFAULT_NICHE || null, // null = qualquer nicho (não focar só em beleza)
      country = process.env.DEFAULT_COUNTRY || 'BR',
      sources = 'tiktok_cc,pipiads',
      hashtags = '',
      minViews,
      language
    } = req.query;

    const sourcesArray = sources.split(',').map(s => s.trim()).filter(s => s);
    const hashtagsArray = hashtags 
      ? hashtags.split(',').map(h => h.trim()).filter(h => h)
      : [];

    const filters = {};
    if (minViews) filters.minViews = parseInt(minViews);
    if (language) filters.language = language;
    // Adicionar filtro de curtidas (padrão: 50k)
    filters.minLikes = parseInt(process.env.MIN_LIKES || '50000', 10);

    logger.info(`[API] Gerando CSV Top 20 - Nicho: ${niche || 'qualquer'}, País: ${country}`);
    logger.info(`[API] Filtros CSV: MIN_LIKES=${filters.minLikes}, MIN_VIEWS=${filters.minViews || 0}`);

    const trends = await getTopTrends({
      niche,
      country,
      limit: 20,
      sources: sourcesArray,
      hashtags: hashtagsArray,
      filters
    });

    // Gerar CSV
    const csvHeader = 'title,main_hashtag,origin,views,likes,comments,shares,score,url\n';
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
        `"${videoUrl}"`
      ];
      return row.join(',');
    });

    const csv = csvHeader + csvRows.join('\n');

    // Configurar headers para download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="top20_trends_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send('\ufeff' + csv); // BOM para Excel reconhecer UTF-8

  } catch (error) {
    logger.error('[API] Erro ao gerar CSV:', error);
    
    const errorMessage = process.env.NODE_ENV === 'production'
      ? 'Erro ao gerar CSV'
      : error.message;
    
    res.status(500).json({
      success: false,
      error: 'Erro ao gerar CSV',
      message: errorMessage
    });
  }
});

/**
 * Middleware de autenticação simples para o painel
 * Verifica token via header x-panel-token ou query parameter
 */
function requirePanelToken(req, res, next) {
  const panelToken = process.env.PANEL_ACCESS_TOKEN;
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  // Se não houver token configurado, permitir acesso (desenvolvimento)
  if (!panelToken || panelToken === 'seu_token_painel_aqui_mude_em_producao') {
    if (isDevelopment) {
      logger.warn('[Panel] PANEL_ACCESS_TOKEN não configurado - acesso liberado (modo desenvolvimento)');
      return next();
    }
  }

  const providedToken = req.headers['x-panel-token'] || req.query.token;

  if (!providedToken) {
    logger.warn('[Panel] Tentativa de acesso sem token');
    return res.status(401).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Acesso Não Autorizado</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            max-width: 600px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            text-align: center;
          }
          h1 { 
            color: #c62828; 
            margin-bottom: 20px;
            font-size: 32px;
          }
          p { 
            color: #666; 
            margin-bottom: 15px;
            line-height: 1.6;
          }
          code {
            background: #f5f5f5;
            padding: 4px 8px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            color: #d63384;
          }
          .instructions {
            background: #f8f9fa;
            border-left: 4px solid #25F4EE;
            padding: 20px;
            margin: 20px 0;
            text-align: left;
            border-radius: 4px;
          }
          .instructions h3 {
            color: #000;
            margin-bottom: 15px;
            font-size: 18px;
          }
          .instructions ol {
            margin-left: 20px;
            color: #555;
          }
          .instructions li {
            margin-bottom: 10px;
          }
          .btn {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 24px;
            background: #25F4EE;
            color: #000;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            transition: background 0.3s;
          }
          .btn:hover {
            background: #1dd9d4;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🔒 Acesso Não Autorizado</h1>
          <p>Este painel requer autenticação por token.</p>
          
          <div class="instructions">
            <h3>Como acessar:</h3>
            <ol>
              <li><strong>Via URL:</strong> Adicione <code>?token=seu_token</code> na URL</li>
              <li><strong>Via Header:</strong> Use uma extensão do navegador para adicionar o header <code>x-panel-token</code></li>
              <li><strong>Em desenvolvimento:</strong> Configure <code>PANEL_ACCESS_TOKEN</code> no arquivo <code>.env</code> ou deixe vazio para acesso livre</li>
            </ol>
          </div>

          <p><strong>Exemplo de URL:</strong></p>
          <p><code>http://localhost:3000/painel?token=seu_token_aqui</code></p>

          <a href="/" class="btn">← Voltar para Home</a>
        </div>
      </body>
      </html>
    `);
  }

  if (providedToken !== panelToken) {
    logger.warn('[Panel] Tentativa de acesso com token inválido');
    return res.status(403).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Token Inválido</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            max-width: 500px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            text-align: center;
          }
          h1 { color: #c62828; margin-bottom: 20px; }
          p { color: #666; margin-bottom: 20px; }
          .btn {
            display: inline-block;
            padding: 12px 24px;
            background: #25F4EE;
            color: #000;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>❌ Token Inválido</h1>
          <p>O token fornecido não é válido.</p>
          <p>Verifique o token no arquivo <code>.env</code> (variável <code>PANEL_ACCESS_TOKEN</code>)</p>
          <a href="/" class="btn">← Voltar para Home</a>
        </div>
      </body>
      </html>
    `);
  }

  // Token válido, permitir acesso
  next();
}

/**
 * GET /painel
 * Serve o painel web simples (protegido por token)
 * 
 * Acesso:
 * - Header: x-panel-token: <seu_token>
 * - Ou query: ?token=<seu_token>
 */
app.get('/painel', requirePanelToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'panel.html'));
});

/**
 * POST /trends/collect-and-save
 * Busca tendências e salva automaticamente no banco
 * Útil para chamadas diretas do n8n que querem coletar e salvar em uma única requisição
 */
app.post('/trends/collect-and-save', apiLimiter, async (req, res) => {
  try {
    const {
      niche = process.env.DEFAULT_NICHE || null, // null = qualquer nicho (não focar só em beleza)
      country = process.env.DEFAULT_COUNTRY || 'BR',
      limit = 20,
      sources = 'tiktok_cc,pipiads',
      hashtags = '',
      minViews,
      language
    } = req.body;

    const sourcesArray = sources.split(',').map(s => s.trim()).filter(s => s);
    const hashtagsArray = hashtags 
      ? hashtags.split(',').map(h => h.trim()).filter(h => h)
      : [];

    const filters = {};
    if (minViews) filters.minViews = parseInt(minViews);
    if (language) filters.language = language;

    logger.info(`[API] Coletando e salvando tendências - Nicho: ${niche}, País: ${country}`);

    // Busca tendências
    const trends = await getTopTrends({
      niche,
      country,
      limit: parseInt(limit),
      sources: sourcesArray,
      hashtags: hashtagsArray,
      filters
    });

    // Salva no banco
    const saveResult = await insertTrends(trends);

    res.json({
      success: true,
      collected: trends.length,
      saved: saveResult.inserted,
      data: trends,
      params: {
        niche,
        country,
        limit: parseInt(limit),
        sources: sourcesArray
      }
    });
  } catch (error) {
    logger.error('[API] Erro ao coletar e salvar:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao coletar e salvar tendências',
      message: error.message
    });
  }
});

/**
 * POST /internal/run-collection
 * Endpoint interno para executar coleta diária via HTTP (para n8n)
 * Protegido por token de autenticação simples
 */
app.post('/internal/run-collection', async (req, res) => {
  try {
    // Verificar token de autenticação
    const authToken = req.headers['x-api-token'] || req.body.token;
    const expectedToken = process.env.INTERNAL_API_TOKEN;

    if (!expectedToken) {
      logger.warn('[API] INTERNAL_API_TOKEN não configurado no .env');
      return res.status(500).json({
        success: false,
        error: 'Configuração de segurança não encontrada'
      });
    }

    if (authToken !== expectedToken) {
      logger.warn('[API] Tentativa de acesso não autorizada ao endpoint interno');
      return res.status(401).json({
        success: false,
        error: 'Token de autenticação inválido'
      });
    }

    logger.info('[API] Iniciando coleta via endpoint interno');

    // Executar coleta em background para não travar a resposta
    runDailyCollection()
      .then(() => {
        logger.info('[API] Coleta via endpoint interno concluída com sucesso');
      })
      .catch(error => {
        logger.error('[API] Erro na coleta via endpoint interno:', error);
      });

    // Retornar resposta imediata
    res.json({
      success: true,
      message: 'Coleta iniciada em background',
      startedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('[API] Erro ao iniciar coleta interna:', error);
    
    const errorMessage = process.env.NODE_ENV === 'production'
      ? 'Erro ao iniciar coleta'
      : error.message;
    
    res.status(500).json({
      success: false,
      error: 'Erro ao iniciar coleta',
      message: errorMessage
    });
  }
});

/**
 * GET /shop/top-products
 * Retorna produtos mais vendidos do TikTok Shop através do Kalodata
 * 
 * Query params:
 * - category: Categoria do produto (opcional)
 * - country: País (padrão: BR)
 * - limit: Limite de produtos (padrão: 20, máximo: 100)
 * - source: Fonte de dados ('kalodata' ou 'tiktok_shop', padrão: 'kalodata')
 */
app.get('/shop/top-products', apiLimiter, async (req, res) => {
  try {
    const {
      category = null,
      country = process.env.DEFAULT_COUNTRY || 'BR',
      limit = 20,
      source = 'kalodata', // Padrão: Kalodata
      forceVisible = false // Forçar modo visível para login manual
    } = req.query;

    const limitNum = parseInt(limit);
    if (limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: 'Limite máximo é 100'
      });
    }

    // Se forceVisible=true, temporariamente forçar modo visível
    const originalHeadless = process.env.KALODATA_HEADLESS;
    if (forceVisible === 'true' || forceVisible === true) {
      logger.info(`[API] ⚠️ Modo login manual ativado (forceVisible=true). Forçando modo visível...`);
      process.env.KALODATA_HEADLESS = 'false';
      process.env.FORCE_VISIBLE = 'true'; // Flag adicional para o scraper saber que é modo manual
      logger.info(`[API] ⚠️ IMPORTANTE: O navegador será aberto na VPS. Faça login manualmente se necessário.`);
      logger.info(`[API] ⚠️ O sistema aguardará até 5 minutos para login manual.`);
    }

    logger.info(`[API] Buscando produtos mais vendidos - Fonte: ${source}, Categoria: ${category || 'Todas'}, País: ${country}, Limite: ${limitNum}, Modo Visível: ${forceVisible === 'true' || forceVisible === true}`);

    let products = [];
    
    try {
      if (source === 'kalodata') {
        // Usar Kalodata (padrão)
        products = await getKalodataTopProducts({
          category,
          country,
          limit: limitNum
        });
      } else {
        // Usar TikTok Shop direto
        products = await getTikTokShopTopProducts({
          category,
          country,
          limit: limitNum
        });
      }
    } finally {
      // Restaurar configuração original
      if (forceVisible === 'true' || forceVisible === true) {
        process.env.KALODATA_HEADLESS = originalHeadless;
        delete process.env.FORCE_VISIBLE;
        logger.info(`[API] ✅ Modo login manual concluído. Restaurando configuração original.`);
      }
    }

    // Salvar produtos automaticamente no banco de dados
    if (products.length > 0) {
      try {
        const productsToSave = products.map(product => ({
          ...product,
          source: source,
          category: category,
          country: country,
          collectedAt: new Date()
        }));
        
        const saveResult = await insertProducts(productsToSave);
        logger.info(`[API] Produtos salvos: ${saveResult.inserted} inseridos, ${saveResult.skipped} duplicados ignorados`);
      } catch (error) {
        logger.warn(`[API] Erro ao salvar produtos no banco: ${error.message}`);
        logger.error(`[API] Stack: ${error.stack}`);
        // Continuar mesmo se falhar ao salvar
      }
    } else {
      logger.warn(`[API] ⚠️ Nenhum produto coletado. Verifique logs do scraper para mais detalhes.`);
    }

    res.json({
      success: true,
      count: products.length,
      data: products,
      source: source,
      generatedAt: new Date().toISOString(),
      message: products.length === 0 ? 'Nenhum produto encontrado. Verifique se as credenciais do Kalodata estão configuradas no arquivo .env (KALODATA_EMAIL e KALODATA_PASSWORD) e se o primeiro login foi realizado.' : undefined
    });
  } catch (error) {
    logger.error(`[API] Erro ao buscar produtos: ${error.message}`);
    logger.error(`[API] Stack: ${error.stack}`);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar produtos',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : 'Verifique os logs do servidor para mais detalhes',
      hint: 'Verifique se as credenciais do Kalodata estão configuradas no arquivo .env (KALODATA_EMAIL e KALODATA_PASSWORD)'
    });
  }
});

/**
 * GET /shop/top-products.csv
 * Retorna produtos mais vendidos em formato CSV
 */
app.get('/shop/top-products.csv', apiLimiter, async (req, res) => {
  try {
    const {
      category = null,
      country = process.env.DEFAULT_COUNTRY || 'BR',
      limit = 20,
      source = 'kalodata'
    } = req.query;

    const limitNum = parseInt(limit);
    if (limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: 'Limite máximo é 100'
      });
    }

    logger.info(`[API] Gerando CSV de produtos - Fonte: ${source}, Limite: ${limitNum}`);

    let products = [];
    
    if (source === 'kalodata') {
      products = await getKalodataTopProducts({
        category,
        country,
        limit: limitNum
      });
    } else {
      products = await getTikTokShopTopProducts({
        category,
        country,
        limit: limitNum
      });
    }

    // Cabeçalho CSV
    const headers = [
      'Rank',
      'Produto',
      'Receita',
      'Taxa de Crescimento',
      'Itens Vendidos',
      'Preço Médio',
      'Taxa de Comissão',
      'Vídeos Top',
      'Criadores',
      'Data Lançamento',
      'Taxa Conversão',
      'URL'
    ];

    // Linhas CSV
    const rows = products.map(product => [
      product.rank || '',
      `"${(product.title || '').replace(/"/g, '""')}"`,
      product.revenue || '',
      product.growthRate || '',
      product.itemsSold || '',
      product.avgPrice || '',
      product.commissionRate || '',
      product.topVideos || '',
      product.creators || '',
      product.launchDate || '',
      product.conversionRate || '',
      product.productUrl || ''
    ]);

    // Montar CSV
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Configurar resposta
    const filename = `produtos_tiktok_shop_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf8'));

    // Enviar CSV com BOM para Excel reconhecer UTF-8
    res.write('\ufeff');
    res.end(csvContent);
  } catch (error) {
    logger.error(`[API] Erro ao gerar CSV de produtos: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Erro ao gerar CSV',
      message: error.message
    });
  }
});

/**
 * GET /shop/products/all.csv
 * Retorna TODOS os produtos coletados do dia atual em formato CSV
 * Útil para baixar histórico completo do dia
 */
app.get('/shop/products/all.csv', apiLimiter, async (req, res) => {
  try {
    const {
      source = null,
      country = null,
      date = null // Formato: YYYY-MM-DD, padrão: hoje
    } = req.query;

    logger.info(`[API] Gerando CSV completo de produtos - Fonte: ${source || 'Todas'}, País: ${country || 'Todos'}, Data: ${date || 'Hoje'}`);

    // Buscar produtos do banco de dados
    const products = await getProducts({
      limit: 1000, // Limite alto para pegar todos
      source: source || null,
      country: country || null,
      date: date || null
    });

    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Nenhum produto encontrado',
        message: 'Não há produtos coletados para os filtros especificados'
      });
    }

    // Cabeçalho CSV
    const headers = [
      'ID',
      'Rank',
      'Produto',
      'Receita',
      'Taxa de Crescimento',
      'Itens Vendidos',
      'Preço Médio',
      'Taxa de Comissão',
      'Vídeos Top',
      'Criadores',
      'Data Lançamento',
      'Taxa Conversão',
      'URL',
      'Imagem',
      'Categoria',
      'País',
      'Fonte',
      'Data Coleta'
    ];

    // Linhas CSV
    const rows = products.map(product => [
      product.product_id || '',
      product.rank || '',
      `"${(product.title || '').replace(/"/g, '""')}"`,
      product.revenue || '',
      product.growth_rate || '',
      product.items_sold || '',
      product.avg_price || '',
      product.commission_rate || '',
      product.top_videos || '',
      product.creators || '',
      product.launch_date || '',
      product.conversion_rate || '',
      product.product_url || '',
      product.image_url || '',
      product.category || '',
      product.country || '',
      product.source || '',
      product.collected_at ? new Date(product.collected_at).toISOString() : ''
    ]);

    // Montar CSV
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Configurar resposta
    const dateStr = date || new Date().toISOString().split('T')[0];
    const filename = `produtos_tiktok_shop_completo_${dateStr}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf8'));

    // Enviar CSV com BOM para Excel reconhecer UTF-8
    res.write('\ufeff');
    res.end(csvContent);

    logger.info(`[API] CSV gerado com ${products.length} produtos`);
  } catch (error) {
    logger.error(`[API] Erro ao gerar CSV de produtos: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Erro ao gerar CSV',
      message: error.message
    });
  }
});

/**
 * GET /trends/latest
 * Busca as últimas tendências salvas no banco de dados
 * 
 * Query params:
 * - limit: Limite de resultados - padrão: 20
 * - niche: Filtrar por nicho - opcional
 * - source: Filtrar por fonte - opcional
 */
app.get('/trends/latest', apiLimiter, async (req, res) => {
  try {
    const {
      limit = 20,
      niche = null,
      source = null,
      date = null
    } = req.query;

    const trends = await getLatestTrends({
      limit: parseInt(limit),
      niche: niche || null,
      source: source || null,
      date: date || null
    });

    // Formatar para o frontend
    const formattedTrends = trends.map((trend, index) => {
      // Garantir que valores numéricos sejam números, não strings
      const views = parseInt(trend.views || 0, 10);
      const likes = parseInt(trend.likes || 0, 10);
      const comments = parseInt(trend.comments || 0, 10);
      const shares = parseInt(trend.shares || 0, 10);
      const engagementScore = parseFloat(trend.engagement_score || 0);
      
      return {
        id: trend.id,
        title: trend.title,
        mainHashtag: null, // Pode extrair do título se necessário
        origin: trend.source,
        metrics: {
          views: views,
          likes: likes,
          comments: comments,
          shares: shares
        },
        score: engagementScore,
        engagementScore: engagementScore,
        url: trend.video_url,
        thumbnail: trend.thumb_url,
        author: trend.author_handle,
        language: trend.language,
        country: trend.country,
        collectedAt: trend.collected_at
      };
    });

    res.json({
      success: true,
      count: formattedTrends.length,
      data: formattedTrends
    });
  } catch (error) {
    logger.error('[API] Erro ao buscar últimas tendências:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar últimas tendências',
      message: error.message
    });
  }
});

/**
 * GET /trends/collected/dates
 * Retorna lista de datas disponíveis com coletas
 */
app.get('/trends/collected/dates', apiLimiter, async (req, res) => {
  try {
    const dates = await getCollectionDates();
    res.json({
      success: true,
      count: dates.length,
      data: dates
    });
  } catch (error) {
    logger.error('[API] Erro ao buscar datas de coleta:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar datas de coleta',
      message: error.message
    });
  }
});

// Variável global para armazenar os cron jobs
let schedulerJobs = null;

/**
 * POST /api/kalodata/cookies
 * Salva cookies do Kalodata manualmente (via painel)
 */
app.post('/api/kalodata/cookies', apiLimiter, async (req, res) => {
  try {
    const { cookies } = req.body;

    if (!cookies || !Array.isArray(cookies)) {
      return res.status(400).json({
        success: false,
        error: 'Cookies devem ser um array JSON válido'
      });
    }

    // Validar formato dos cookies
    for (const cookie of cookies) {
      if (!cookie.name || !cookie.value) {
        return res.status(400).json({
          success: false,
          error: 'Cada cookie deve ter "name" e "value"'
        });
      }
    }

    logger.info(`[API] Salvando ${cookies.length} cookies do Kalodata manualmente`);

    // Salvar cookies no arquivo
    const fs = require('fs');
    const path = require('path');
    const cookiesDir = path.join(__dirname, 'cookies');
    const cookiesPath = path.join(cookiesDir, 'kalodata-cookies.json');

    // Garantir que o diretório existe
    if (!fs.existsSync(cookiesDir)) {
      fs.mkdirSync(cookiesDir, { recursive: true });
    }

    // Salvar cookies
    fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2), 'utf-8');
    logger.info(`[API] ✅ Cookies salvos em: ${cookiesPath}`);

    res.json({
      success: true,
      message: `${cookies.length} cookies salvos com sucesso`,
      savedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`[API] Erro ao salvar cookies: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Inicia o servidor
// Middleware de tratamento de erros global (deve ser o último middleware)
app.use((err, req, res, next) => {
  logger.error('[Express] Erro não tratado:', err);
  
  // Sempre retornar JSON, nunca HTML
  res.status(err.status || 500).json({
    success: false,
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'production' 
      ? 'Ocorreu um erro ao processar a requisição' 
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Middleware para rotas não encontradas (404)
app.use((req, res) => {
  // Sempre retornar JSON, nunca HTML
  res.status(404).json({
    success: false,
    error: 'Rota não encontrada',
    message: `A rota ${req.method} ${req.path} não existe`,
    availableEndpoints: {
      health: '/health',
      top20: '/trends/top20',
      top20csv: '/trends/top20.csv',
      panel: '/painel',
      latest: '/trends/latest',
      collect: '/trends/collect',
      collectProgress: '/trends/collect/progress',
      saveCookies: '/api/kalodata/cookies'
    }
  });
});

const server = app.listen(PORT, () => {
  logger.info(`Servidor de tendências rodando na porta ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`Top 20 (JSON): http://localhost:${PORT}/trends/top20`);
  logger.info(`Top 20 (CSV): http://localhost:${PORT}/trends/top20.csv`);
  logger.info(`Painel Web: http://localhost:${PORT}/painel`);
  logger.info(`Coleta Interna (n8n): http://localhost:${PORT}/internal/run-collection`);
  logger.info(`Latest trends: http://localhost:${PORT}/trends/latest`);
  logger.info(`Salvar Cookies: POST http://localhost:${PORT}/api/kalodata/cookies`);
  
  // Iniciar agendamento automático
  schedulerJobs = startScheduler();
  if (schedulerJobs) {
    logger.info(`✅ Agendamento automático ATIVO - Coleta e CSV serão gerados automaticamente`);
  }
});

// Configurar timeout do servidor para requisições longas (scraping pode demorar até 10 minutos)
server.timeout = 15 * 60 * 1000; // 15 minutos
server.keepAliveTimeout = 15 * 60 * 1000; // 15 minutos
server.headersTimeout = 16 * 60 * 1000; // 16 minutos (deve ser maior que keepAliveTimeout)

// Tratamento de erro ao iniciar servidor
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Porta ${PORT} já está em uso!`);
    logger.error(`Soluções:`);
    logger.error(`1. Pare o processo que está usando a porta: netstat -ano | findstr :${PORT}`);
    logger.error(`2. Ou altere a porta no arquivo .env: PORT=3001`);
    process.exit(1);
  } else {
    logger.error('Erro ao iniciar servidor:', error);
    process.exit(1);
  }
});

// Graceful shutdown
async function gracefulShutdown() {
  logger.info('Encerrando servidor...');
  
  // Parar agendamentos
  if (schedulerJobs) {
    stopScheduler(schedulerJobs);
  }
  
  // Fechar conexões
  const { closePool } = require('./src/database');
  await closePool();
  await closeBrowser();
  
  logger.info('Servidor encerrado com sucesso');
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

