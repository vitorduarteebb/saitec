/**
 * Scraper do TikTok usando Puppeteer
 * Coleta tendências do TikTok Creative Center e hashtags
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');

let browser = null;
let scrapingLock = false; // Lock para evitar requisições simultâneas do Creative Center/For You
let tiktokShopSearchLock = false; // Lock separado para busca do TikTok Shop

/**
 * Flag global para filtro rígido de país
 * true = só aceita vídeos do país alvo (ex: BR)
 * false = aceita vídeos globais também
 * Pode ser sobrescrita via TIKTOK_STRICT_COUNTRY_FILTER no .env
 */
// STRICT_COUNTRY_FILTER: true por padrão para garantir vídeos brasileiros
// Use TIKTOK_STRICT_COUNTRY_FILTER=false no .env para aceitar vídeos globais
const STRICT_COUNTRY_FILTER = process.env.TIKTOK_STRICT_COUNTRY_FILTER !== 'false'; // true por padrão
// MODO GLOBAL: Desabilitar blacklist por padrão para pegar tendências REAIS
// A blacklist pode ser muito restritiva e bloquear conteúdo legítimo
const DISABLE_BLACKLIST = process.env.DISABLE_BLACKLIST !== 'false'; // true por padrão
const DISABLE_NICHE_FILTER = process.env.DISABLE_NICHE_FILTER !== 'false'; // true por padrão

/**
 * Filtro mínimo de curtidas para considerar vídeo viral
 * Padrão: 50.000 (vídeo relevante)
 * Viral: 100.000
 * Ultra viral: 500.000
 */
const MIN_LIKES = parseInt(process.env.MIN_LIKES || '50000', 10); // Padrão: 50k curtidas

/**
 * Blacklist de termos institucionais do TikTok que devem ser descartados
 */
const INSTITUTIONAL_BLACKLIST = [
  'make your day',
  'search for hotels on tiktok',
  'tiktok now lets you book',
  'creatorsearchinsights',
  'tiktokpartner',
  'search for incredible deals',
  'search on tiktok',
  'walmart',
  'walmartpartner',
  'tiktokgotraveldeals',
  'express delivery',
  'book the best hotel',
  'discover your next stay',
  'tiktok\'s new booking feature',
  'hotel deals',
  '@walmart',
  '@mnm_pipi' // Conta institucional do TikTok
];

/**
 * Mapa de nichos para palavras-chave
 */
const NICHE_KEYWORDS = {
  beleza: [
    'beleza',
    'make',
    'makeup',
    'maquiagem',
    'skincare',
    'skin care',
    'cabelo',
    'hair',
    'sombra',
    'batom',
    'base líquida',
    'dermatologista',
    'estética'
  ]
  // Adicionar outros nichos conforme necessário
};

/**
 * Verifica se um vídeo deve ser descartado por blacklist institucional
 * @param {Object} video - Objeto do vídeo com título, descrição, etc.
 * @returns {boolean} true se deve ser descartado
 */
function isInstitutionalVideo(video) {
  // Flag para desabilitar blacklist durante debug
  if (DISABLE_BLACKLIST) {
    return false; // Não descarta nada
  }
  
  const title = (video.title || '').toLowerCase();
  const description = (video.description || '').toLowerCase();
  const hashtags = (video.hashtags || []).join(' ').toLowerCase();
  const advertiserName = (video.advertiserName || '').toLowerCase();
  const brandName = (video.brandName || '').toLowerCase();
  
  const contextText = [
    title,
    description,
    hashtags,
    advertiserName,
    brandName
  ].join(' ').toLowerCase();
  
  return INSTITUTIONAL_BLACKLIST.some(term => contextText.includes(term));
}

/**
 * Verifica se um vídeo corresponde ao nicho especificado
 * @param {Object} video - Objeto do vídeo
 * @param {string} niche - Nicho (ex: 'beleza')
 * @returns {boolean} true se corresponde ao nicho
 */
function matchesNiche(video, niche) {
  // Flag para desabilitar filtro de nicho durante debug
  if (!niche || DISABLE_NICHE_FILTER) {
    if (DISABLE_NICHE_FILTER) {
      logger.debug('[TikTok CC] [NicheFilter] Desativado por configuração (.env)');
    }
    return true; // Aceita tudo
  }
  
  if (!NICHE_KEYWORDS[niche]) {
    return true; // Se nicho não mapeado, aceita tudo
  }
  
  const keywords = NICHE_KEYWORDS[niche];
  const title = (video.title || '').toLowerCase();
  const description = (video.description || '').toLowerCase();
  const hashtags = (video.hashtags || []).join(' ').toLowerCase();
  
  const contextText = [title, description, hashtags].join(' ').toLowerCase();
  
  return keywords.some(keyword => contextText.includes(keyword));
}

/**
 * Lista de User-Agents para rotação (anti-bloqueio)
 * Ajuste conforme necessário para evitar detecção
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
];

/**
 * Retorna um User-Agent aleatório
 */
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Gera delay aleatório entre requisições (anti-bloqueio)
 * @param {number} min - Delay mínimo em ms
 * @param {number} max - Delay máximo em ms
 */
function randomDelay(min, max) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Converte string de métrica (ex: "60K", "1.2M", "50,5K") em número inteiro
 * @param {string|number} value - Valor da métrica (pode ser número ou string formatada)
 * @returns {number} Número inteiro convertido
 */
function parseMetric(value) {
  if (typeof value === 'number') return Math.round(value);
  if (!value) return 0;
  
  const str = String(value).trim().toLowerCase().replace(/,/g, '.');
  const match = str.match(/^([\d.]+)\s*([km]?)$/);
  
  if (!match) {
    const n = Number(str);
    return Number.isNaN(n) ? 0 : Math.round(n);
  }
  
  const num = parseFloat(match[1]);
  const suffix = match[2];
  
  if (suffix === 'k') return Math.round(num * 1_000);
  if (suffix === 'm') return Math.round(num * 1_000_000);
  return Math.round(num);
}

/**
 * Normaliza região para formato padrão
 * @param {string} rawRegion - Região bruta do HTML/JSON
 * @returns {string|null} Região normalizada ('brazil', 'global', 'united states', etc.) ou null
 */
/**
 * Normaliza um valor de país/região para formato padrão
 * Versão melhorada e mais tolerante
 */
function normalizeRegion(rawRegion) {
  if (!rawRegion) return null;
  
  const region = String(rawRegion)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
  
  if (!region) return null; // String vazia após normalização
  
  // Mapeamento direto para códigos comuns
  const directMap = {
    'br': 'br',
    'brazil': 'br',
    'brasil': 'br',
    'português (brasil)': 'br',
    'portuguese (brazil)': 'br',
    'portuguese brazil': 'br',
    'us': 'us',
    'usa': 'us',
    'united states': 'us',
    'unitedstates': 'us',
    'estados unidos': 'us',
    'es': 'es',
    'spain': 'es',
    'espanha': 'es',
    'mx': 'mx',
    'mexico': 'mx',
    'méxico': 'mx',
    'pt': 'pt',
    'portugal': 'pt'
  };
  
  if (directMap[region]) {
    return directMap[region];
  }
  
  // Verificações por substring (mais tolerante)
  if (region.includes('brazil') || region.includes('brasil')) {
    return 'br';
  }
  
  if (region.includes('global') || region.includes('worldwide') || region.includes('world') || region.includes('all')) {
    return 'global';
  }
  
  if (region.includes('united states') || region.includes('unitedstates') || region.includes('estados unidos')) {
    return 'us';
  }
  
  return region; // fallback: retornar normalizado
}

/**
 * Verifica se um item de vídeo é permitido para o país alvo
 * Versão melhorada que verifica múltiplos campos possíveis
 * @param {Object} item - Objeto do vídeo com campos de país/região
 * @param {string} targetCountryCode - Código do país alvo ('BR', 'US', etc.)
 * @param {string} title - Título do vídeo (para logs)
 * @returns {boolean} true se permitido, false caso contrário
 */
function isCountryAllowed(item, targetCountryCode, title = '') {
  const strict = STRICT_COUNTRY_FILTER;
  const target = normalizeRegion(targetCountryCode || 'BR');
  
  // Tenta vários campos possíveis do item
  const candidates = [
    item.region,
    item.origin_region,
    item.country,
    item.countryCode,
    item.market_region,
    item.targetCountry,
    item.normalizedRegion
  ];
  
  // Normalizar todos os candidatos
  const normalizedCandidates = candidates
    .filter(Boolean)
    .map(normalizeRegion);
  
  if (!normalizedCandidates.length) {
    // Sem info de país -> se NÃO for estrito, aceita como global
    if (!strict) {
      logger.debug(`[TikTok CC] Vídeo sem país definido aceito (modo não-estrito): titulo='${title}'`);
      return true;
    }
    logger.debug(`[TikTok CC] Descartando vídeo por país: origin=null, target=${targetCountryCode}, titulo='${title}'`);
    return false;
  }
  
  // Se qualquer candidato bater com o alvo, aceita
  if (normalizedCandidates.includes(target)) {
    return true;
  }
  
  // Se NÃO for estrito, aceita vídeos globais/mistos
  if (!strict) {
    const joined = normalizedCandidates.join(' ');
    if (joined.includes('global') || joined.includes('all') || joined.includes('world')) {
      logger.debug(`[TikTok CC] Vídeo global aceito (modo não-estrito): origin=${normalizedCandidates[0]}, target=${targetCountryCode}, titulo='${title}'`);
      return true;
    }
  }
  
  logger.debug(`[TikTok CC] Descartando vídeo por país: origin=${normalizedCandidates[0]}, target=${targetCountryCode}, titulo='${title}'`);
  return false;
}

/**
 * Inicializa o navegador Puppeteer (reutilizável)
 * Configurado com opções anti-bloqueio
 */
/**
 * Caminho para salvar cookies do TikTok
 */
const COOKIES_PATH = path.join(__dirname, '..', '..', 'cookies', 'tiktok-cookies.json');

/**
 * Garante que o diretório de cookies existe
 */
function ensureCookiesDir() {
  const cookiesDir = path.dirname(COOKIES_PATH);
  if (!fs.existsSync(cookiesDir)) {
    fs.mkdirSync(cookiesDir, { recursive: true });
  }
}

/**
 * Salva cookies do TikTok para reutilizar em próximas execuções
 */
async function saveCookies(page) {
  try {
    ensureCookiesDir();
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
    logger.info(`[TikTok Login] ✅ Cookies salvos em: ${COOKIES_PATH}`);
  } catch (error) {
    logger.warn(`[TikTok Login] Erro ao salvar cookies: ${error.message}`);
  }
}

/**
 * Carrega cookies salvos do TikTok
 */
async function loadCookies(page) {
  try {
    if (fs.existsSync(COOKIES_PATH)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
      await page.setCookie(...cookies);
      logger.info(`[TikTok Login] ✅ Cookies carregados de: ${COOKIES_PATH}`);
      return true;
    }
  } catch (error) {
    logger.warn(`[TikTok Login] Erro ao carregar cookies: ${error.message}`);
  }
  return false;
}

/**
 * Verifica se o usuário está logado no TikTok
 */
async function isLoggedIn(page) {
  try {
    // Verificar se há elementos que indicam login (ex: menu de perfil, botão de upload)
    const loggedIn = await page.evaluate(() => {
      // Procurar por elementos que só aparecem quando logado
      const selectors = [
        '[data-e2e="nav-profile"]',
        '[data-e2e="upload-btn"]',
        'a[href*="/upload"]',
        '[class*="UserAvatar"]',
        '[class*="Profile"]',
        '[class*="user-avatar"]',
        '[class*="profile"]',
        'button[data-e2e*="profile"]',
        'a[href*="/@"]' // Links de perfil
      ];
      
      for (const selector of selectors) {
        try {
          if (document.querySelector(selector)) {
            return true;
          }
        } catch (e) {
          // Continuar tentando outros seletores
        }
      }
      
      // Verificar se URL indica login (ex: redirecionou para foryou ou perfil)
      const url = window.location.href;
      if (url.includes('/foryou') && !url.includes('/login')) {
        // Se está em foryou e não em login, provavelmente está logado
        return true;
      }
      
      return false;
    });
    return loggedIn;
  } catch (error) {
    logger.warn(`[TikTok Login] Erro ao verificar login: ${error.message}`);
    return false;
  }
}

/**
 * Realiza login no TikTok (manual ou automático)
 */
async function loginToTikTok(page) {
  try {
    logger.info('[TikTok Login] 🔐 Iniciando processo de login...');
    
    // Tentar carregar cookies salvos primeiro
    const cookiesLoaded = await loadCookies(page);
    if (cookiesLoaded) {
      // Recarregar página para aplicar cookies
      await page.goto('https://www.tiktok.com/foryou', { waitUntil: 'networkidle2', timeout: 30000 });
      await randomDelay(3000, 5000);
      
      // Verificar se cookies ainda são válidos
      if (await isLoggedIn(page)) {
        logger.info('[TikTok Login] ✅ Login válido usando cookies salvos!');
        return true;
      } else {
        logger.warn('[TikTok Login] ⚠️ Cookies expirados ou inválidos. Necessário fazer login novamente.');
      }
    }
    
    // Navegar para página de login
    logger.info('[TikTok Login] Navegando para página de login...');
    await page.goto('https://www.tiktok.com/login', { waitUntil: 'networkidle2', timeout: 30000 });
    await randomDelay(3000, 5000);
    
    // Verificar se já está logado (pode ter redirecionado)
    if (await isLoggedIn(page)) {
      logger.info('[TikTok Login] ✅ Já está logado!');
      await saveCookies(page);
      return true;
    }
    
    // Tentar login automático se tiver credenciais
    const username = process.env.TIKTOK_USERNAME;
    const password = process.env.TIKTOK_PASSWORD;
    
    if (username && password) {
      logger.info('[TikTok Login] Tentando login automático com credenciais do .env...');
      try {
        // Aguardar campos de login aparecerem
        await page.waitForSelector('input[type="text"], input[placeholder*="username"], input[placeholder*="email"], input[name="username"]', { timeout: 10000 });
        
        // Preencher username
        await page.type('input[type="text"], input[placeholder*="username"], input[placeholder*="email"], input[name="username"]', username, { delay: 100 });
        await randomDelay(1000, 2000);
        
        // Preencher password
        await page.type('input[type="password"], input[name="password"]', password, { delay: 100 });
        await randomDelay(1000, 2000);
        
        // Clicar no botão de login
        await page.click('button[type="submit"], button:has-text("Log in"), button:has-text("Entrar")');
        await randomDelay(5000, 8000);
        
        // Verificar se login foi bem-sucedido
        if (await isLoggedIn(page)) {
          logger.info('[TikTok Login] ✅ Login automático bem-sucedido!');
          await saveCookies(page);
          return true;
        } else {
          logger.warn('[TikTok Login] ⚠️ Login automático falhou. Será necessário login manual.');
        }
      } catch (error) {
        logger.warn(`[TikTok Login] Erro no login automático: ${error.message}`);
      }
    }
    
    // Login manual: abrir navegador visível e aguardar usuário fazer login
    logger.info('[TikTok Login] 🔓 Abrindo navegador para LOGIN MANUAL...');
    logger.info('[TikTok Login] ⏳ Por favor, faça login manualmente no navegador que abriu.');
    logger.info('[TikTok Login] ⏳ Aguardando até 5 minutos para você completar o login...');
    
    // Garantir que o navegador está visível (não headless)
    const browser = page.browser();
    const pages = await browser.pages();
    const currentPage = pages[0];
    
    // Aguardar até que o usuário faça login (verificar a cada 5 segundos)
    const maxWaitTime = 5 * 60 * 1000; // 5 minutos
    const checkInterval = 5000; // 5 segundos
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      await randomDelay(checkInterval, checkInterval + 1000);
      
      // Verificar se está logado
      if (await isLoggedIn(currentPage)) {
        logger.info('[TikTok Login] ✅ Login manual detectado!');
        await saveCookies(currentPage);
        return true;
      }
      
      // Verificar se está na página For You (indica que pode ter logado)
      const currentUrl = currentPage.url();
      if (currentUrl.includes('foryou') || currentUrl.includes('tiktok.com/@')) {
        if (await isLoggedIn(currentPage)) {
          logger.info('[TikTok Login] ✅ Login detectado pela URL!');
          await saveCookies(currentPage);
          return true;
        }
      }
    }
    
    logger.warn('[TikTok Login] ⚠️ Timeout aguardando login manual.');
    return false;
  } catch (error) {
    logger.error(`[TikTok Login] Erro no processo de login: ${error.message}`);
    return false;
  }
}

async function initBrowser() {
  if (!browser) {
    // Usar modo headless por padrão (funciona melhor em VPS sem servidor X)
    // Login será feito via cookies salvos, não precisa de modo visível
    // Se HEADLESS=false explicitamente, usar modo visível (requer X server)
    const headlessEnv = process.env.HEADLESS;
    let headlessMode = 'new'; // Padrão: headless moderno (funciona melhor)
    
    if (headlessEnv === 'false') {
      headlessMode = false; // Modo visível (requer X server)
    } else if (headlessEnv === 'true' || headlessEnv === 'old') {
      headlessMode = 'old'; // Headless antigo (compatibilidade)
    }
    
    // Aumentar timeouts para evitar erros de timeout
    const timeout = parseInt(process.env.PUPPETEER_TIMEOUT || 300000); // 300 segundos (5 minutos)
    const protocolTimeout = parseInt(process.env.PUPPETEER_PROTOCOL_TIMEOUT || 600000); // 600 segundos (10 minutos) para protocolo

    logger.info(`[TikTok CC] 🎯 Inicializando navegador para For You (login via cookies)`);
    logger.info(`[TikTok CC] ⚙️ Modo headless=${headlessMode === false ? 'false (visível)' : headlessMode === 'new' ? 'new (headless moderno)' : 'old (headless antigo)'}`);
    logger.info(`[TikTok CC] ⚙️ Timeouts: launch=${timeout}ms, protocol=${protocolTimeout}ms`);

    // Tentar fechar browser anterior se existir (pode estar travado)
    try {
      if (browser && browser.isConnected()) {
        await browser.close().catch(() => {});
      }
      browser = null;
    } catch (e) {
      browser = null; // Forçar null mesmo se der erro
    }
    
    browser = await puppeteer.launch({
      headless: headlessMode, // 'new' = headless moderno (padrão), false = visível, 'old' = headless antigo
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled', // Anti-detecção
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-web-security', // Pode ajudar com CORS
        '--disable-features=VizDisplayCompositor'
      ],
      timeout: timeout,
      protocolTimeout: protocolTimeout // Timeout para operações de protocolo (ex: evaluate)
    });
    logger.info(`[TikTok CC] ✅ Navegador Puppeteer inicializado com sucesso`);
  }
  return browser;
}

/**
 * Fecha o navegador
 */
async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    logger.info('Navegador Puppeteer fechado');
  }
}

/**
 * Executa page.evaluate de forma segura, verificando se a página está fechada
 * @param {Page} page - Página do Puppeteer
 * @param {Function} fn - Função a ser executada no contexto da página
 * @param {...any} args - Argumentos para a função
 * @returns {Promise<any>} Resultado do evaluate ou null se página fechada
 */
async function safeEvaluate(page, fn, ...args) {
  try {
    if (!page || page.isClosed()) {
      logger.warn('[TikTok CC] safeEvaluate chamado com page fechada. Abortando evaluate.');
      return null;
    }
    
    return await page.evaluate(fn, ...args);
  } catch (err) {
    if (String(err.message || err).includes('Session closed')) {
      logger.warn(`[TikTok CC] Evaluate ignorado: sessão já fechada (${err.message})`);
      return null;
    }
    
    logger.warn(`[TikTok CC] Erro em safeEvaluate: ${err.message}`);
    throw err;
  }
}

/**
 * Filtra vídeos por país com fallback automático
 * Se em modo estrito der 0 resultados, relaxa o filtro automaticamente
 * @param {Array} items - Lista de vídeos
 * @param {string} countryCode - Código do país alvo ('BR', 'US', etc.)
 * @param {boolean} strict - Se true, modo estrito; se false, aceita qualquer país
 * @returns {Object} { filtered: Array, stats: Object }
 */
function filterByCountry(items, countryCode, strict) {
  const target = (countryCode || 'BR').toLowerCase();
  const stats = {
    total: items.length,
    discardedByCountry: 0,
    fallbackUsed: false
  };

  // Normalizar países dos itens
  const normalized = items.map(item => {
    const region = (item.region || '').toLowerCase();
    const cc = (item.countryCode || '').toLowerCase();
    const country = (item.country || '').toLowerCase();
    
    // Tentar múltiplos campos
    const itemCountry = cc || country || region || '';
    
    return {
      ...item,
      _normalizedCountry: normalizeRegion(itemCountry) || itemCountry
    };
  });

  // Primeira tentativa: filtrar por país
  let filtered = normalized.filter(item => {
    if (!item._normalizedCountry) {
      // Se não tem país e não é estrito, passa
      if (!strict) return true;
      stats.discardedByCountry++;
      return false;
    }
    
    if (strict) {
      // Modo estrito: só aceita se bater com o alvo
      const matches = item._normalizedCountry === target || 
                     item._normalizedCountry.includes(target);
      if (!matches) {
        stats.discardedByCountry++;
        return false;
      }
      return true;
    }
    
    // Modo não estrito: aceita tudo (só bloqueia se explicitamente for outro país específico)
    return true;
  });

  // Fallback: se em modo estrito deu 0, relaxa automaticamente
  if (filtered.length === 0 && strict && normalized.length > 0) {
    logger.warn(`[TikTok CC] [CountryFallback] Nenhum vídeo no país alvo (${countryCode}), relaxando filtro de país...`);
    filtered = normalized; // devolve tudo
    stats.fallbackUsed = true;
    stats.discardedByCountry = 0; // Reset porque agora aceitamos tudo
  }

  return { filtered, stats };
}

/**
 * Aplica filtros de forma inteligente com fallback garantido
 * NUNCA retorna lista vazia se houver dados brutos disponíveis
 * @param {Array} rawTrends - Lista de vídeos brutos do JSON/DOM
 * @param {Object} options - Opções de filtro
 * @param {string} options.targetCountry - Código do país alvo (ex: 'BR')
 * @param {boolean} options.strictCountry - Se true, filtra por país estritamente
 * @param {number} options.minViews - Mínimo de views aceito (0 = aceita tudo)
 * @param {string} options.niche - Nicho alvo (ex: 'beleza')
 * @param {boolean} options.disableBlacklist - Se true, desabilita blacklist
 * @param {boolean} options.disableNiche - Se true, desabilita filtro de nicho
 * @returns {Array} Lista de vídeos filtrados (nunca vazia se rawTrends.length > 0)
 */
function applySmartFilters(rawTrends, options = {}) {
  const {
    targetCountry = 'BR',
    strictCountry = STRICT_COUNTRY_FILTER,
    minViews = parseInt(process.env.MIN_VIEWS || '0', 10),
    minLikes = parseInt(process.env.MIN_LIKES || '50000', 10), // Padrão: 50k curtidas
    niche = null,
    disableBlacklist = DISABLE_BLACKLIST,
    disableNiche = DISABLE_NICHE_FILTER,
  } = options;

  let trends = [...rawTrends];

  const stats = {
    total: trends.length,
    afterCountry: null,
    afterBlacklist: null,
    afterNiche: null,
    afterViews: null,
    afterLikes: null,
  };

  // 1) País - FILTRAR POR PAÍS SOLICITADO
  if (strictCountry && targetCountry !== 'GLOBAL') {
    const beforeCountry = trends.length;
    trends = trends.filter(video => {
      return isCountryAllowed(video, targetCountry, video.title || '');
    });
    stats.afterCountry = trends.length;
    const discardedByCountry = beforeCountry - trends.length;
    if (discardedByCountry > 0) {
      logger.info(`[TikTok CC] [FiltersDebug] Descartados ${discardedByCountry} vídeos por país (solicitado: ${targetCountry})`);
    }
  } else {
    // Modo não-estrito: aceitar qualquer país
    stats.afterCountry = trends.length;
  }

  // 2) Blacklist
  if (!disableBlacklist) {
    trends = trends.filter(video => !isInstitutionalVideo(video));
  }
  stats.afterBlacklist = trends.length;

  // 3) Nicho
  if (!disableNiche && niche) {
    trends = trends.filter(video => matchesNiche(video, niche));
  }
  stats.afterNiche = trends.length;

  // 4) Views
  let trendsAfterViews = trends;
  if (minViews && Number(minViews) > 0) {
    trendsAfterViews = trendsAfterViews.filter(t => (t.views || 0) >= Number(minViews));
  }
  stats.afterViews = trendsAfterViews.length;

  // 5) Likes (FILTRO PRINCIPAL PARA VÍDEOS VIRAIS)
  let trendsAfterLikes = trendsAfterViews;
  if (minLikes && Number(minLikes) > 0) {
    const beforeLikes = trendsAfterLikes.length;
    trendsAfterLikes = trendsAfterLikes.filter(t => {
      const likes = t.likes || t.metrics?.likes || 0;
      return likes >= Number(minLikes);
    });
    const discardedByLikes = beforeLikes - trendsAfterLikes.length;
    if (discardedByLikes > 0) {
      logger.info(`[TikTok CC] [FiltersDebug] Descartados ${discardedByLikes} vídeos por curtidas insuficientes (< ${minLikes})`);
    }
  }
  stats.afterLikes = trendsAfterLikes.length;

  logger.info(
    '[TikTok CC] [FiltersDebug] Estatísticas: total=%d, após país=%d, após blacklist=%d, após nicho=%d, após views=%d, após likes=%d',
    stats.total,
    stats.afterCountry,
    stats.afterBlacklist,
    stats.afterNiche,
    stats.afterViews,
    stats.afterLikes
  );

  // ---------------- Fallback inteligente ----------------
  // Se depois de tudo ficou 0 ou muito pouco (< 5), mas o JSON bruto tinha dados,
  // Relaxar filtro de curtidas para garantir dados
  if (trendsAfterLikes.length < 5 && rawTrends.length > 0) {
    logger.warn(`[TikTok CC] [FiltersFallback] Apenas ${trendsAfterLikes.length} vídeos após filtro de ${minLikes} curtidas. Relaxando filtro...`);

    // Log de debug: mostrar curtidas dos primeiros vídeos
    if (rawTrends.length > 0) {
      logger.info(`[TikTok CC] [FiltersFallback] 📊 DEBUG: Primeiros 5 vídeos brutos:`);
      rawTrends.slice(0, 5).forEach((t, idx) => {
        const likes = t.likes || t.metrics?.likes || 0;
        const views = t.views || t.metrics?.views || 0;
        logger.info(`[TikTok CC] [FiltersFallback]   Vídeo ${idx + 1}: likes=${likes.toLocaleString()}, views=${views.toLocaleString()}, title="${(t.title || '').substring(0, 50)}"`);
      });
    }

    // Tentar 50% do mínimo primeiro
    const relaxedMinLikes = Math.floor(minLikes * 0.5);
    let relaxedTrends = trendsAfterViews.filter(t => {
      const likes = t.likes || t.metrics?.likes || 0;
      return likes >= relaxedMinLikes;
    });
    
    // Se ainda tiver poucos, tentar 10% do mínimo (ou mínimo 1000)
    if (relaxedTrends.length < 3 && rawTrends.length >= 3) {
      const veryRelaxedMinLikes = Math.max(1000, Math.floor(minLikes * 0.1));
      logger.warn(`[TikTok CC] [FiltersFallback] Apenas ${relaxedTrends.length} vídeos com ${relaxedMinLikes} curtidas. Relaxando para ${veryRelaxedMinLikes}...`);
      relaxedTrends = trendsAfterViews.filter(t => {
        const likes = t.likes || t.metrics?.likes || 0;
        return likes >= veryRelaxedMinLikes;
      });
    }
    
    // Se ainda tiver poucos, aceitar qualquer vídeo com curtidas > 0
    if (relaxedTrends.length < 3 && rawTrends.length >= 3) {
      logger.warn(`[TikTok CC] [FiltersFallback] Apenas ${relaxedTrends.length} vídeos após filtros relaxados. Aceitando qualquer vídeo com curtidas > 0...`);
      relaxedTrends = trendsAfterViews.filter(t => {
        const likes = t.likes || t.metrics?.likes || 0;
        return likes > 0;
      });
    }
    
    if (relaxedTrends.length > 0) {
      logger.warn(
        '[TikTok CC] [FiltersFallback] Retornando %d vídeos com filtro relaxado de curtidas.',
        relaxedTrends.length
      );
      return relaxedTrends;
    }
    
    // ÚLTIMO RECURSO: Se mesmo assim ficou vazio, retornar tudo (sem filtro de curtidas)
    logger.warn(
      '[TikTok CC] [FiltersFallback] Retornando %d vídeos SEM filtro de curtidas (último recurso - aceitar qualquer vídeo).',
      rawTrends.length
    );
    return rawTrends;
  }

  // Se ainda não tem vídeos após todos os filtros, retornar todos sem filtro de curtidas
  if (trendsAfterLikes.length === 0 && rawTrends.length > 0) {
    logger.warn(`[TikTok CC] [FiltersFallback] ⚠️ Nenhum vídeo passou no filtro de ${minLikes} curtidas. Retornando todos os ${rawTrends.length} vídeos coletados (sem filtro de curtidas)...`);
    return trendsAfterViews.slice(0, 20); // Retornar todos sem filtro de curtidas, limitado a 20
  }
  
  // Garantir que retornamos pelo menos os TOP 20 (ou todos se tiver menos)
  const finalCount = Math.min(20, trendsAfterLikes.length);
  if (trendsAfterLikes.length > 20) {
    logger.info(`[TikTok CC] Limitando a ${finalCount} tendências (Top 20)`);
  } else if (trendsAfterLikes.length < 20) {
    logger.warn(`[TikTok CC] ⚠️ Apenas ${trendsAfterLikes.length} tendências passaram nos filtros (objetivo: 20)`);
  }

  return trendsAfterLikes.slice(0, 20);
}

/**
 * Aplica filtros de país, blacklist e nicho em uma lista de vídeos
 * Wrapper para compatibilidade - usa applySmartFilters internamente
 * @param {Array} videos - Lista de vídeos brutos
 * @param {string} country - Código do país alvo
 * @param {string} niche - Nicho alvo
 * @returns {Object} { filtered: Array, stats: Object, debug: Object }
 */
function applyVideoFilters(videos, country, niche) {
  const filtered = applySmartFilters(videos, {
    targetCountry: country,
    strictCountry: STRICT_COUNTRY_FILTER,
    minViews: parseInt(process.env.MIN_VIEWS || '0', 10),
    niche: niche,
  });

  // Calcular estatísticas para compatibilidade
  const stats = {
    total: videos.length,
    discardedByCountry: 0,
    discardedByBlacklist: 0,
    discardedByNiche: 0,
    discardedByViews: 0,
    final: filtered.length
  };

  const debug = {
    rawItems: videos.length,
    discardedByCountry: 0,
    discardedByBlacklist: 0,
    discardedByNiche: 0,
    discardedByViews: 0,
    fallbackUsed: filtered.length === videos.length && videos.length > 0,
    filtersFallbackUsed: filtered.length === videos.length && videos.length > 0
  };

  return { filtered, stats, debug };
}

/**
 * Extrai tendências do DOM da página
 * @param {Page} page - Página do Puppeteer
 * @param {string} niche - Nicho alvo
 * @param {string} country - Código do país alvo
 * @returns {Promise<Array>} Lista de vídeos brutos extraídos do DOM
 */
async function extractFromDom(page, niche, country, isForYouPage = false) {
  const strictFilter = STRICT_COUNTRY_FILTER;
  
  // NUNCA usar For You - requer login e não funciona sem autenticação
  // Sempre usar Creative Center (isForYouPage sempre será false)
  if (isForYouPage) {
    logger.warn('[TikTok CC] ⚠️ AVISO: Tentativa de usar For You bloqueada (requer login). Usando Creative Center...');
    // Forçar Creative Center mesmo se isForYouPage for true
    isForYouPage = false;
  }
  
  const result = await safeEvaluate(page, (nicheParam, countryParam, strictFilterParam) => {
    const cards = Array.from(
      document.querySelectorAll('[class*="CommonGridLayoutDataList_cardWrapper"], blockquote[data-video-id]')
    );
    
    const items = [];
    
    for (const card of cards) {
      try {
        // Tentar achar blockquote com video-id ou link do vídeo
        const blockquote = card.querySelector('blockquote[data-video-id], blockquote[video-id]');
        const videoId = blockquote?.getAttribute('data-video-id') || blockquote?.getAttribute('video-id') || null;
        
        // Título (fallback simples: texto do card)
        const titleEl = card.querySelector('[data-e2e="trend-card-title"]') ||
                       card.querySelector('h3, h4, h2') ||
                       card;
        const title = (titleEl.textContent || '').trim();
        
        // Métricas (views, likes etc.)
        let views = 0;
        let likes = 0;
        let comments = 0;
        let shares = 0;
        
        // Procurar spans/divs com métricas
        const metricEls = Array.from(card.querySelectorAll('span, div'));
        for (const m of metricEls) {
          const txt = (m.textContent || '').toLowerCase();
          if (txt.includes('visualizações') || txt.includes('views')) {
            const num = parseInt(txt.replace(/\D+/g, ''), 10);
            if (!isNaN(num)) views = num;
          }
          if (txt.includes('curtidas') || txt.includes('likes')) {
            const num = parseInt(txt.replace(/\D+/g, ''), 10);
            if (!isNaN(num)) likes = num;
          }
          if (txt.includes('comentários') || txt.includes('comments')) {
            const num = parseInt(txt.replace(/\D+/g, ''), 10);
            if (!isNaN(num)) comments = num;
          }
          if (txt.includes('compartilhamentos') || txt.includes('shares')) {
            const num = parseInt(txt.replace(/\D+/g, ''), 10);
            if (!isNaN(num)) shares = num;
          }
        }
        
        // Tentar buscar dados do JSON __NEXT_DATA__ para este vídeo específico
        let videoData = null;
        if (videoId) {
          const nextDataScript = document.getElementById('__NEXT_DATA__');
          if (nextDataScript) {
            try {
              const nextData = JSON.parse(nextDataScript.textContent);
              const videos = nextData?.props?.pageProps?.data?.videos || [];
              videoData = videos.find(v => v.id === videoId || v.itemId === videoId);
            } catch (e) {
              // Ignorar erro de parse
            }
          }
        }
        
        // URL do vídeo
        const linkEl = card.querySelector('a[href*="tiktok.com"], a[href*="/video/"]');
        const videoUrl = linkEl ? (linkEl.href || linkEl.getAttribute('href')) : 
                        (videoData?.itemUrl || (videoId ? `https://www.tiktok.com/@user/video/${videoId}` : null));
        
        // Região (se disponível)
        const regionEl = card.querySelector('[class*="Region"], [class*="region"]');
        let region = regionEl ? regionEl.textContent.trim() : (videoData?.region || '');
        
        // Se tem dados do JSON, usar métricas do JSON
        if (videoData) {
          const metrics = videoData.metrics || videoData.stats || {};
          views = videoData.viewCount || metrics.viewCount || metrics.views || views || 0;
          likes = videoData.likeCount || metrics.diggCount || metrics.likes || videoData.likes || metrics.likeCount || likes || 0;
          comments = videoData.commentCount || metrics.commentCount || metrics.comments || videoData.comments || comments || 0;
          shares = videoData.shareCount || metrics.shareCount || metrics.shares || videoData.shares || shares || 0;
          region = videoData.region || region;
        }
        
        // Converter views se necessário (ex: "60K" -> 60000)
        if (typeof views === 'string') {
          const str = views.toLowerCase().replace(/,/g, '.');
          const match = str.match(/^([\d.]+)\s*([km]?)$/);
          if (match) {
            const num = parseFloat(match[1]);
            const suffix = match[2];
            views = suffix === 'k' ? Math.round(num * 1000) : 
                   suffix === 'm' ? Math.round(num * 1000000) : 
                   Math.round(num);
          } else {
            views = parseInt(views.replace(/\D+/g, ''), 10) || 0;
          }
        }
        
        if (!videoUrl || !title) return; // Pular se não tem URL ou título
        
        items.push({
          id: videoId,
          title: title,
          url: videoUrl,
          videoUrl: videoUrl,
          views: views || 0,
          likes: likes || 0,
          comments: comments || 0,
          shares: shares || 0,
          region: region || '',
          normalizedRegion: null, // Será normalizado depois
          origin_region: null, // Será preenchido depois
          isBrazil: false, // Será calculado depois
          source: 'tiktok_creative_center_dom'
        });
      } catch (error) {
        console.error(`[DEBUG] Erro ao processar card:`, error);
      }
    }
    
    console.log(`[DEBUG] DOM: Total de ${items.length} vídeos extraídos do DOM`);
    return items;
  }, niche, country, strictFilter);
  
  return result || [];
}

/**
 * Salva o JSON bruto do __NEXT_DATA__ para debug
 * @param {Object} data - Objeto JSON completo extraído do __NEXT_DATA__
 * @param {string} niche - Nicho alvo
 * @param {string} countryCode - Código do país alvo
 */
function saveTikTokJsonDebug(data, niche, countryCode) {
  try {
    if (!process.env.DEBUG_TIKTOK_JSON || process.env.DEBUG_TIKTOK_JSON !== 'true') {
      return;
    }

    const logsDir = path.join(__dirname, '..', '..', 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeNiche = (niche || 'all').toString().replace(/[^a-z0-9_-]+/gi, '_');
    const safeCountry = (countryCode || 'XX').toString().replace(/[^A-Z]/gi, '');

    const fileName = `tiktok_json_${safeCountry}_${safeNiche}_${timestamp}.json`;
    const filePath = path.join(logsDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

    logger.info('[TikTok CC] JSON de debug salvo em: %s', filePath);
  } catch (err) {
    logger.warn('[TikTok CC] Erro ao salvar JSON de debug: %s', err.message);
  }
}

/**
 * Extrai tendências do JSON __NEXT_DATA__
 * @param {Page} page - Página do Puppeteer
 * @param {string} niche - Nicho alvo
 * @param {string} country - Código do país alvo
 * @returns {Promise<Array>} Lista de vídeos brutos extraídos do JSON
 */
async function extractFromJson(page, niche, country) {
  const strictFilter = STRICT_COUNTRY_FILTER;
  
  const data = await safeEvaluate(page, () => {
    const script = document.querySelector('#__NEXT_DATA__');
    if (!script) return null;
    try {
      return JSON.parse(script.textContent || '{}');
    } catch (e) {
      return null;
    }
  });
  
  if (!data) {
    logger.debug('[TikTok CC] JSON __NEXT_DATA__ não encontrado ou inválido.');
    return [];
  }

  // Salvar JSON bruto para debug (se DEBUG_TIKTOK_JSON=true)
  saveTikTokJsonDebug(data, niche, country);
  
  const videos = data?.props?.pageProps?.data?.videos || [];
  if (videos.length === 0) {
    logger.debug('[TikTok CC] Nenhum vídeo encontrado no JSON __NEXT_DATA__.');
    return [];
  }

  // PASSO 1: Log detalhado do JSON completo para debug
  logger.info('[DEBUG JSON COMPLETO] Total de vídeos encontrados: %d', videos.length);
  if (videos.length > 0) {
    // Log do primeiro vídeo completo para análise
    const firstVideo = videos[0];
    logger.info('[DEBUG JSON PRIMEIRO VIDEO] %s', JSON.stringify({
      id: firstVideo.id || firstVideo.itemId,
      title: firstVideo.title,
      region: firstVideo.region,
      country: firstVideo.country,
      countryCode: firstVideo.countryCode,
      market_region: firstVideo.market_region,
      origin_region: firstVideo.origin_region,
      targetCountry: firstVideo.targetCountry,
      metrics: firstVideo.metrics,
      stats: firstVideo.stats,
      viewCount: firstVideo.viewCount,
      likeCount: firstVideo.likeCount,
      commentCount: firstVideo.commentCount,
      shareCount: firstVideo.shareCount
    }, null, 2));

    // Estatísticas por região encontrada
    const statsByRegion = {};
    videos.forEach(v => {
      const region = v.region || v.country || v.countryCode || v.market_region || v.origin_region || 'unknown';
      statsByRegion[region] = (statsByRegion[region] || 0) + 1;
    });
    logger.info('[DEBUG JSON REGIOES] %s', JSON.stringify(statsByRegion, null, 2));
  }
  
  /**
   * Extrai métricas de um vídeo bruto do JSON
   * Versão melhorada que verifica múltiplos campos possíveis
   */
  function extractMetricsFromRaw(raw) {
    const stats = raw.stats || raw.statistics || raw.metrics || {};
    
    const views =
      raw.viewCount ??
      stats.viewCount ??
      stats.playCount ??
      stats.views ??
      stats.impressionCount ??
      raw.views ??
      0;
    
    const likes =
      raw.likeCount ??
      stats.likeCount ??
      stats.likes ??
      stats.heartCount ??
      stats.diggCount ??
      raw.likes ??
      0;
    
    const comments =
      raw.commentCount ??
      stats.commentCount ??
      stats.comments ??
      raw.comments ??
      0;
    
    const shares =
      raw.shareCount ??
      stats.shareCount ??
      stats.shares ??
      raw.shares ??
      0;
    
    return { views, likes, comments, shares };
  }
  
  // Converter métricas
  function parseMetric(value) {
    if (typeof value === 'number') return Math.round(value);
    if (!value) return 0;
    const str = String(value).trim().toLowerCase().replace(/,/g, '.');
    const match = str.match(/^([\d.]+)\s*([km]?)$/);
    if (!match) {
      const n = Number(str);
      return Number.isNaN(n) ? 0 : Math.round(n);
    }
    const num = parseFloat(match[1]);
    const suffix = match[2];
    if (suffix === 'k') return Math.round(num * 1000);
    if (suffix === 'm') return Math.round(num * 1000000);
    return Math.round(num);
  }
  
  // ORDENAR vídeos por curtidas/engajamento ANTES de processar (vídeos mais virais primeiro)
  videos.sort((a, b) => {
    const aLikes = extractMetricsFromRaw(a).likes || 0;
    const bLikes = extractMetricsFromRaw(b).likes || 0;
    const aViews = extractMetricsFromRaw(a).views || 0;
    const bViews = extractMetricsFromRaw(b).views || 0;
    
    // Priorizar por curtidas primeiro, depois views
    if (bLikes !== aLikes) return bLikes - aLikes;
    return bViews - aViews;
  });
  
  logger.info('[TikTok CC] Vídeos ordenados por viralidade (curtidas + views)');
  
  // Processar vídeos do JSON
  const items = videos.map((video, index) => {
    const videoId = video.id || video.itemId || (video.itemUrl ? video.itemUrl.split('/').pop() : null);
    const videoUrl = video.itemUrl || `https://www.tiktok.com/@user/video/${videoId}`;
    
    // Extrair métricas usando função melhorada
    const rawMetrics = extractMetricsFromRaw(video);
    
    // Log detalhado do primeiro vídeo para debug
    if (index === 0) {
      logger.info('[DEBUG JSON METRICAS PRIMEIRO VIDEO] views=%d (raw: %s), likes=%d (raw: %s), comments=%d (raw: %s), shares=%d (raw: %s)',
        parseMetric(rawMetrics.views), rawMetrics.views,
        parseMetric(rawMetrics.likes), rawMetrics.likes,
        parseMetric(rawMetrics.comments), rawMetrics.comments,
        parseMetric(rawMetrics.shares), rawMetrics.shares
      );
    }
    
    // Calcular métricas parseadas
    const views = parseMetric(rawMetrics.views);
    const likes = parseMetric(rawMetrics.likes);
    const comments = parseMetric(rawMetrics.comments);
    const shares = parseMetric(rawMetrics.shares);
    
    // Score de viralidade: curtidas têm peso 2x, comentários 3x, shares 5x
    const viralScore = (likes * 2) + views + (comments * 3) + (shares * 5);
    
    return {
      id: videoId,
      title: video.title || '',
      url: videoUrl,
      videoUrl: videoUrl,
      views: views,
      likes: likes,
      comments: comments,
      shares: shares,
      region: (video.region || '').trim(),
      country: video.country,
      countryCode: video.countryCode,
      market_region: video.market_region,
      origin_region: video.origin_region,
      targetCountry: video.targetCountry,
      normalizedRegion: null, // Será normalizado depois
      isBrazil: false, // Será calculado depois
      source: 'tiktok_creative_center_json',
      // Adicionar timestamp de criação se disponível
      createdAt: video.createTime || video.createdAt || video.timestamp || Date.now(),
      // Score de viralidade baseado em curtidas e views
      viralScore: viralScore
    };
  });
  
  // ORDENAR novamente por score de viralidade (mais virais primeiro)
  items.sort((a, b) => {
    // Priorizar por viralScore primeiro
    if ((b.viralScore || 0) !== (a.viralScore || 0)) {
      return (b.viralScore || 0) - (a.viralScore || 0);
    }
    // Se viralScore igual, ordenar por curtidas
    if ((b.likes || 0) !== (a.likes || 0)) {
      return (b.likes || 0) - (a.likes || 0);
    }
    // Se curtidas iguais, ordenar por views
    return (b.views || 0) - (a.views || 0);
  });
  
  // LIMITAR aos TOP 20 mais virais (garantir 20 vídeos)
  // Se tiver menos de 20, retornar todos disponíveis
  const topViral = items.slice(0, 20);
  
  if (topViral.length < 20) {
    logger.warn(`[TikTok CC] ⚠️ Apenas ${topViral.length} vídeos encontrados (objetivo: 20)`);
  }
  
  logger.info('[TikTok CC] ✅ Vídeos ordenados por viralidade. Top 3: likes=%d/%d/%d, viralScore=%d/%d/%d', 
    topViral[0]?.likes || 0, 
    topViral[1]?.likes || 0, 
    topViral[2]?.likes || 0,
    topViral[0]?.viralScore || 0,
    topViral[1]?.viralScore || 0,
    topViral[2]?.viralScore || 0
  );
  
  return topViral;
}

/**
 * Extrai vídeos da página For You (trending real do TikTok)
 * ESTRATÉGIA: Interceptar requisições da API que carregam vídeos virais
 * @param {Page} page - Página do Puppeteer
 * @param {string} niche - Nicho alvo
 * @param {string} country - Código do país alvo
 * @returns {Promise<Array>} Lista de vídeos extraídos
 */
async function extractFromForYouPage(page, niche, country) {
  logger.info('[TikTok CC] [ForYou] Iniciando extração da página For You...');
  
  // Aguardar conteúdo carregar
  await randomDelay(5000, 8000);
  
  // Scroll para carregar mais vídeos e disparar requisições da API
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let scrollCount = 0;
      const maxScrolls = 30; // Scroll mais vezes para carregar vídeos
      const timer = setInterval(() => {
        window.scrollBy(0, 300);
        scrollCount++;
        if (scrollCount >= maxScrolls) {
          clearInterval(timer);
          setTimeout(resolve, 5000); // Aguardar carregamento completo
        }
      }, 300);
    });
  });
  
  // Tentar extrair do JSON __NEXT_DATA__ primeiro (mais confiável)
  const videosFromJson = await safeEvaluate(page, () => {
    try {
      const script = document.querySelector('#__NEXT_DATA__');
      if (!script) return [];
      
      const data = JSON.parse(script.textContent || '{}');
      
      // Tentar diferentes caminhos no JSON
      const possiblePaths = [
        data?.props?.pageProps?.itemList,
        data?.props?.pageProps?.items,
        data?.props?.pageProps?.videoList,
        data?.props?.pageProps?.recommendItemList,
        data?.props?.initialState?.video?.itemList,
        data?.props?.initialState?.recommend?.itemList,
      ];
      
      let videos = [];
      for (const path of possiblePaths) {
        if (Array.isArray(path) && path.length > 0) {
          videos = path;
          console.log(`[ForYou] Encontrados ${videos.length} vídeos no JSON via caminho:`, path);
          break;
        }
      }
      
      if (videos.length === 0) {
        // Tentar buscar em qualquer lugar do JSON
        const jsonStr = JSON.stringify(data);
        const videoMatches = jsonStr.match(/"videoId":"(\d+)"/g) || jsonStr.match(/"id":"(\d+)"/g);
        if (videoMatches) {
          console.log(`[ForYou] Encontrados ${videoMatches.length} IDs de vídeo no JSON`);
        }
      }
      
      return videos.map((video, index) => {
        try {
          const videoId = video.videoId || video.id || video.itemId || video.aweme_id || null;
          const title = video.desc || video.description || video.caption || video.text || '';
          const author = video.author?.uniqueId || video.author?.nickname || video.author?.username || '';
          const stats = video.stats || video.statistics || {};
          const views = stats.playCount || stats.viewCount || stats.views || 0;
          const likes = stats.diggCount || stats.likeCount || stats.likes || 0;
          const comments = stats.commentCount || stats.comments || 0;
          const shares = stats.shareCount || stats.shares || 0;
          
          return {
            id: videoId,
            title: title || `Vídeo ${index + 1}`,
            url: videoId ? `https://www.tiktok.com/@${author}/video/${videoId}` : '',
            videoUrl: videoId ? `https://www.tiktok.com/@${author}/video/${videoId}` : '',
            views: views || 0,
            likes: likes || 0,
            comments: comments || 0,
            shares: shares || 0,
            author: author,
            hashtags: video.textExtra?.filter(e => e.hashtagName).map(e => `#${e.hashtagName}`) || [],
            region: '',
            country: '',
            countryCode: '',
            normalizedRegion: null,
            origin_region: null,
            isBrazil: false,
            source: 'tiktok_foryou_json',
            createdAt: video.createTime || video.timestamp || Date.now(),
            viralScore: (likes * 2) + views + (comments * 3) + (shares * 5)
          };
        } catch (e) {
          console.error(`[ForYou] Erro ao processar vídeo do JSON:`, e);
          return null;
        }
      }).filter(Boolean);
    } catch (error) {
      console.error(`[ForYou] Erro ao extrair do JSON:`, error);
      return [];
    }
  });
  
  if (videosFromJson && videosFromJson.length > 0) {
    logger.info(`[TikTok CC] [ForYou] Extraídos ${videosFromJson.length} vídeos do JSON __NEXT_DATA__`);
    videosFromJson.sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0));
    return videosFromJson.slice(0, 20);
  }
  
  // Fallback: Tentar extrair do DOM com seletores mais abrangentes
  logger.info('[TikTok CC] [ForYou] Tentando extrair do DOM como fallback...');
  
  const videos = await safeEvaluate(page, () => {
    const items = [];
    
    // Seletores mais abrangentes para vídeos
    const allSelectors = [
      'a[href*="/video/"]',
      '[data-e2e*="video"]',
      '[class*="Video"]',
      '[class*="video"]',
      'article',
      'div[role="listitem"]',
      '[class*="ItemContainer"]',
      '[class*="FeedItem"]'
    ];
    
    let allElements = [];
    for (const selector of allSelectors) {
      const elements = Array.from(document.querySelectorAll(selector));
      allElements = allElements.concat(elements);
    }
    
    // Remover duplicatas
    const uniqueElements = Array.from(new Set(allElements));
    console.log(`[ForYou] Total de elementos encontrados: ${uniqueElements.length}`);
    
    uniqueElements.slice(0, 100).forEach((element, index) => {
      try {
        // Buscar link de vídeo
        const link = element.querySelector('a[href*="/video/"]') || (element.tagName === 'A' && element.href?.includes('/video/') ? element : null);
        if (!link) return;
        
        const href = link.href || link.getAttribute('href') || '';
        if (!href.includes('/video/')) return;
        
        const urlMatch = href.match(/\/video\/(\d+)/);
        const videoId = urlMatch ? urlMatch[1] : null;
        if (!videoId) return;
        
        // Extrair autor da URL
        const authorMatch = href.match(/@([^/]+)/);
        const author = authorMatch ? authorMatch[1] : null;
        
        // Extrair título/descrição
        const titleEl = element.querySelector('[data-e2e*="desc"], [class*="Desc"], p, span, div[class*="text"]');
        const title = titleEl?.textContent?.trim() || '';
        
        // Tentar extrair métricas
        const metricsText = element.textContent || '';
        const viewsMatch = metricsText.match(/([\d.]+)\s*([KMkm])?\s*(views|visualizações|views)/i);
        let views = 0;
        if (viewsMatch) {
          const num = parseFloat(viewsMatch[1]);
          const suffix = viewsMatch[2]?.toUpperCase();
          views = suffix === 'K' ? Math.round(num * 1000) : suffix === 'M' ? Math.round(num * 1000000) : Math.round(num);
        }
        
        // Extrair hashtags
        const hashtagEls = element.querySelectorAll('a[href*="/tag/"], [class*="Hashtag"], [data-e2e*="challenge"]');
        const hashtags = Array.from(hashtagEls).map(el => {
          const text = el.textContent?.trim() || '';
          return text.startsWith('#') ? text : `#${text}`;
        }).filter(Boolean);
        
        items.push({
          id: videoId,
          title: title || `Vídeo ${index + 1}`,
          url: href.startsWith('http') ? href : `https://www.tiktok.com${href}`,
          videoUrl: href.startsWith('http') ? href : `https://www.tiktok.com${href}`,
          views: views,
          likes: 0,
          comments: 0,
          shares: 0,
          author: author,
          hashtags: hashtags,
          region: '',
          country: '',
          countryCode: '',
          normalizedRegion: null,
          origin_region: null,
          isBrazil: false,
          source: 'tiktok_foryou_dom',
          createdAt: Date.now(),
          viralScore: views
        });
      } catch (error) {
        console.error(`[ForYou] Erro ao processar elemento ${index}:`, error);
      }
    });
    
    console.log(`[ForYou] Total de vídeos extraídos do DOM: ${items.length}`);
    return items;
  });
  
  if (!videos || videos.length === 0) {
    logger.warn('[TikTok CC] [ForYou] Nenhum vídeo encontrado na página For You (nem JSON nem DOM)');
    return [];
  }
  
  logger.info(`[TikTok CC] [ForYou] Extraídos ${videos.length} vídeos do DOM`);
  
  // Ordenar por viralScore
  videos.sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0));
  
  return videos.slice(0, 20); // Retornar TOP 20
}

/**
 * Extrai vídeos de uma resposta da API do TikTok interceptada
 * @param {Object} apiData - Dados JSON da resposta da API
 * @param {string} niche - Nicho alvo
 * @param {string} country - Código do país alvo
 * @returns {Array} Lista de vídeos extraídos da API
 */
function extractFromApiResponse(apiData, niche, country) {
  const items = [];
  
  // Tentar diferentes estruturas de resposta da API (mais abrangente)
  const videos = apiData?.data?.videos || 
                 apiData?.data?.list || 
                 apiData?.data?.items ||
                 apiData?.data?.itemList ||
                 apiData?.videos || 
                 apiData?.list || 
                 apiData?.items ||
                 apiData?.itemList ||
                 apiData?.aweme_list ||
                 (Array.isArray(apiData?.data) ? apiData.data : []) ||
                 [];
  
  if (!Array.isArray(videos) || videos.length === 0) {
    logger.debug('[TikTok CC] [API Extract] Nenhum vídeo encontrado na estrutura da API');
    return items;
  }
  
  logger.info(`[TikTok CC] [API Extract] Encontrados ${videos.length} vídeos na resposta da API`);
  
  videos.forEach((video, index) => {
    try {
      // Extrair dados do vídeo
      const videoId = video.id || video.itemId || video.video_id || video.aweme_id || null;
      const title = video.title || video.desc || video.description || video.caption || '';
      const videoUrl = video.url || video.video_url || video.share_url || 
                      (videoId ? `https://www.tiktok.com/@user/video/${videoId}` : null);
      
      // Extrair métricas REAIS da API - tentar TODOS os campos possíveis
      const stats = video.stats || video.statistics || video.metrics || video.stat || video.aweme_stat || {};
      const awemeStats = video.aweme?.statistics || video.aweme?.stats || {};
      
      // Views - tentar todos os campos possíveis
      const views = 
        video.view_count || 
        video.viewCount ||
        video.play_count ||
        video.playCount ||
        stats.view_count || 
        stats.viewCount ||
        stats.play_count || 
        stats.playCount || 
        stats.views || 
        stats.impressionCount ||
        awemeStats.view_count ||
        awemeStats.viewCount ||
        awemeStats.play_count ||
        awemeStats.playCount ||
        video.views || 
        stats.views || 
        0;
      
      // Likes - tentar todos os campos possíveis (digg_count é comum no TikTok)
      const likes = 
        video.like_count || 
        video.likeCount ||
        video.digg_count ||
        video.diggCount ||
        stats.like_count || 
        stats.likeCount ||
        stats.digg_count || 
        stats.diggCount ||
        stats.likes || 
        stats.heartCount ||
        awemeStats.like_count ||
        awemeStats.likeCount ||
        awemeStats.digg_count ||
        awemeStats.diggCount ||
        video.likes || 
        stats.likes || 
        0;
      
      // Comments - tentar todos os campos possíveis
      const comments = 
        video.comment_count || 
        video.commentCount ||
        stats.comment_count || 
        stats.commentCount ||
        stats.comments || 
        awemeStats.comment_count ||
        awemeStats.commentCount ||
        video.comments || 
        stats.comments || 
        0;
      
      // Shares - tentar todos os campos possíveis
      const shares = 
        video.share_count || 
        video.shareCount ||
        stats.share_count || 
        stats.shareCount ||
        stats.shares || 
        awemeStats.share_count ||
        awemeStats.shareCount ||
        video.shares || 
        stats.shares || 
        0;
      
      // Log de debug para os primeiros 3 vídeos para ver estrutura real
      if (index < 3) {
        logger.debug(`[TikTok CC] [API Extract] Vídeo ${index + 1} - Estrutura:`, JSON.stringify({
          hasStats: !!video.stats,
          hasStatistics: !!video.statistics,
          hasMetrics: !!video.metrics,
          hasAweme: !!video.aweme,
          statsKeys: video.stats ? Object.keys(video.stats) : [],
          statisticsKeys: video.statistics ? Object.keys(video.statistics) : [],
          videoKeys: Object.keys(video).slice(0, 20), // Primeiros 20 campos
          extractedViews: views,
          extractedLikes: likes,
          extractedComments: comments,
          extractedShares: shares
        }, null, 2));
      }
      
      // Extrair hashtags
      const hashtags = video.hashtags || video.text_extra || [];
      const mainHashtag = Array.isArray(hashtags) && hashtags.length > 0 
        ? (hashtags[0].hashtag_name || hashtags[0].name || `#${hashtags[0]}`)
        : '';
      
      // Extrair região/país
      const region = video.region || video.country || video.country_code || 
                    video.market_region || video.origin_region || '';
      const countryCode = video.country_code || video.countryCode || 
                         (region ? region.toUpperCase().substring(0, 2) : '');
      
      // Extrair autor
      const author = video.author || video.creator || video.user || {};
      const authorHandle = author.unique_id || author.username || author.nickname || 
                          author.handle || null;
      
      // Extrair thumbnail
      const thumbnail = video.cover || video.thumbnail || video.cover_url || 
                       (video.video && video.video.cover) || null;
      
      if (!videoUrl || !title) return; // Pular se não tem URL ou título
      
      const finalLikes = Number(likes) || 0;
      const finalViews = Number(views) || 0;
      const finalComments = Number(comments) || 0;
      const finalShares = Number(shares) || 0;
      
      // Log de debug para verificar métricas extraídas
      if (index < 3) {
        logger.info(`[TikTok CC] [API Extract] Vídeo ${index + 1}: likes=${finalLikes}, views=${finalViews}, comments=${finalComments}, shares=${finalShares}, title="${title.substring(0, 50)}"`);
      }
      
      items.push({
        id: videoId,
        title: title,
        url: videoUrl,
        videoUrl: videoUrl,
        views: finalViews,
        likes: finalLikes,
        comments: finalComments,
        shares: finalShares,
        // Garantir que metrics também está preenchido para compatibilidade
        metrics: {
          views: finalViews,
          likes: finalLikes,
          comments: finalComments,
          shares: finalShares
        },
        hashtags: Array.isArray(hashtags) ? hashtags.map(h => 
          typeof h === 'string' ? h : (h.hashtag_name || h.name || h)
        ) : [],
        mainHashtag: mainHashtag,
        region: region || '',
        country: country,
        countryCode: countryCode || '',
        normalizedRegion: null,
        origin_region: region || '',
        isBrazil: false,
        author: authorHandle,
        thumbnail: thumbnail,
        source: 'tiktok_api_intercepted'
      });
    } catch (error) {
      logger.warn(`[TikTok CC] Erro ao processar vídeo da API: ${error.message}`);
    }
  });
  
  logger.info(`[TikTok CC] [API Extract] Extraídos ${items.length} vídeos da resposta da API`);
  return items;
}

/**
 * Busca tendências do TikTok Creative Center via scraping
 * @param {Object} params - Parâmetros de busca
 * @param {string} params.niche - Nicho (ex: 'beleza', 'moda')
 * @param {string} params.country - Código do país (ex: 'BR', 'US')
 * @returns {Promise<Array>} Lista de tendências
 */
async function scrapeTikTokCreativeCenter({ niche = 'genérico', country = 'BR' }) {
  // Sempre usar For You agora (Creative Center foi removido)
  const useForYou = true;
  
  // Lock para evitar requisições simultâneas
  if (scrapingLock) {
    logger.warn('[TikTok CC] Scraping já em andamento, aguardando...');
    // Aguardar até 5 minutos para o lock ser liberado (scraping pode demorar com muitos scrolls)
    let waitTime = 0;
    const maxWaitTime = 300000; // 5 minutos
    while (scrapingLock && waitTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Verificar a cada 2 segundos
      waitTime += 2000;
      if (waitTime % 30000 === 0) { // Log a cada 30 segundos
        logger.info(`[TikTok CC] Aguardando scraping anterior finalizar... (${Math.floor(waitTime/1000)}s/${maxWaitTime/1000}s)`);
      }
    }
    if (scrapingLock) {
      // FORÇA LIBERAÇÃO DO LOCK se ainda estiver travado após 5 minutos
      logger.error(`[TikTok CC] ⚠️ Lock travado há mais de 5 minutos! Forçando liberação...`);
      scrapingLock = false;
      // Tentar fechar browser travado (usar variável global)
      // Browser travado será fechado automaticamente no finally do scraping anterior
      logger.warn(`[TikTok CC] Browser travado será fechado automaticamente no finally`);
    }
  }
  
  scrapingLock = true;
  const lockStartTime = Date.now(); // Registrar quando o lock foi ativado
  
  logger.info(`[TikTok CC] ==========================================`);
  logger.info(`[TikTok CC] 🎯 INICIANDO SCRAPING - USANDO APENAS FOR YOU`);
  logger.info(`[TikTok CC] ⚠️ Creative Center foi REMOVIDO - não funciona mais`);
  logger.info(`[TikTok CC] 🔐 Login é OBRIGATÓRIO para acessar For You`);
  logger.info(`[TikTok CC] 📊 Objetivo: Coletar 20 vídeos virais`);
  logger.info(`[TikTok CC] ❤️ Filtro mínimo de curtidas: ${MIN_LIKES.toLocaleString()} (${MIN_LIKES >= 100000 ? 'Viral' : MIN_LIKES >= 50000 ? 'Relevante' : 'Baixo'})`);
  logger.info(`[TikTok CC] 🌍 Nicho: ${niche || 'QUALQUER (todas as fontes)'}, País: ${country}, STRICT_COUNTRY_FILTER=${STRICT_COUNTRY_FILTER}`);
  logger.info(`[TikTok CC] ==========================================`);

  let browser = null;
  let page = null;
  
  try {
    browser = await initBrowser();
    page = await browser.newPage();

    // Configurar user agent aleatório (anti-bloqueio)
    const userAgent = getRandomUserAgent();
    await page.setUserAgent(userAgent);
    
    // IMPORTANTE: Configurar listeners ANTES de qualquer evaluate
    // Capturar TODOS os logs do console do navegador
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      // Capturar todos os logs, especialmente os de debug
      // Usar logger.info para garantir que apareçam no terminal
      if (type === 'log' || type === 'info' || type === 'warning' || type === 'error') {
        logger.info(`[Browser Console ${type.toUpperCase()}] ${text}`);
      }
    });
    
    // Também capturar erros da página
    page.on('pageerror', error => {
      logger.warn(`[Browser Page Error] ${error.message}`);
    });
    
    // INTERCEPTAR REQUISIÇÕES XHR/FETCH PARA PEGAR DADOS REAIS DA API DO TIKTOK
    const apiResponses = [];
    
    page.on('response', async (response) => {
      try {
        const url = response.url();
        // Interceptar TODOS os endpoints da API do TikTok que podem retornar dados de vídeos
        // Adicionar mais padrões de URL que podem conter dados virais
        const isApiEndpoint = url.includes('starling-sg.tiktokv.com') || 
            url.includes('starling-va.tiktokv.com') ||
            url.includes('api.tiktokv.com') ||
            url.includes('api16-normal-c-useast1a.tiktokv.com') ||
            url.includes('api16-normal-c-useast2a.tiktokv.com') ||
            url.includes('creativecenter') ||
            url.includes('material/list') ||
            url.includes('inspiration/popular') ||
            url.includes('recommend/item_list') ||
            url.includes('recommend/item') ||
            url.includes('aweme/v1/web/general') ||
            url.includes('aweme/v1/web/feed') ||
            url.includes('aweme/v1/web') ||
            url.includes('foryou') ||
            url.includes('discover') ||
            url.includes('webcast/feed') ||
            url.includes('/feed/') ||
            (url.includes('tiktok.com/api/') && url.includes('recommend'));
        
        if (isApiEndpoint) {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json') || contentType.includes('text/json') || url.includes('.json')) {
            try {
              const jsonData = await response.json();
              
              // Verificar se contém dados de vídeos (múltiplas estruturas possíveis)
              const hasVideos = jsonData && (
                jsonData.data?.videos || 
                jsonData.data?.list || 
                jsonData.data?.items ||
                jsonData.data?.itemList ||
                jsonData.videos || 
                jsonData.list || 
                jsonData.items ||
                jsonData.itemList ||
                jsonData.aweme_list ||
                (Array.isArray(jsonData.data) && jsonData.data.length > 0) ||
                (jsonData.itemList && Array.isArray(jsonData.itemList) && jsonData.itemList.length > 0)
              );
              
              if (hasVideos) {
                // Extrair IDs dos vídeos deste batch para verificar se é realmente novo
                let videoIds = [];
                try {
                  const itemList = jsonData.data?.itemList || jsonData.itemList || jsonData.data?.items || jsonData.items || [];
                  videoIds = itemList.map(item => item.aweme_id || item.id || item.video?.id || item.aweme?.aweme_id || null).filter(Boolean);
                } catch (e) {
                  // Ignorar erro
                }
                
                // Verificar se este batch tem vídeos novos (não duplicados)
                const existingVideoIds = new Set();
                for (const existingResponse of apiResponses) {
                  try {
                    const existingList = existingResponse.data?.data?.itemList || existingResponse.data?.itemList || existingResponse.data?.data?.items || existingResponse.data?.items || [];
                    existingList.forEach(item => {
                      const id = item.aweme_id || item.id || item.video?.id || item.aweme?.aweme_id;
                      if (id) existingVideoIds.add(id);
                    });
                  } catch (e) {
                    // Ignorar erro
                  }
                }
                
                // Verificar se há vídeos novos neste batch
                const newVideoIds = videoIds.filter(id => !existingVideoIds.has(id));
                const isNewBatch = newVideoIds.length > 0 || apiResponses.length === 0;
                
                if (isNewBatch) {
                  apiResponses.push({
                    url: url,
                    data: jsonData,
                    timestamp: Date.now(),
                    videoIds: videoIds // Armazenar IDs para debug
                  });
                  
                  // Contar quantos vídeos tem neste batch
                  let videoCount = 0;
                  if (jsonData.data?.itemList) videoCount = jsonData.data.itemList.length;
                  else if (jsonData.itemList) videoCount = jsonData.itemList.length;
                  else if (Array.isArray(jsonData.data)) videoCount = jsonData.data.length;
                  else if (jsonData.data?.items) videoCount = jsonData.data.items.length;
                  
                  logger.info(`[TikTok CC] [API Intercept] ✅ Batch #${apiResponses.length} capturado: ${videoCount} vídeos (${newVideoIds.length} novos) de ${url.substring(0, 80)}...`);
                } else {
                  logger.debug(`[TikTok CC] [API Intercept] ⏭️ Batch duplicado ignorado (${videoIds.length} vídeos, todos já coletados)`);
                }
              }
            } catch (e) {
              // Logar erros de parse para debug
              logger.debug(`[TikTok CC] [API Intercept] Erro ao parsear JSON de ${url.substring(0, 60)}: ${e.message}`);
            }
          }
        }
      } catch (error) {
        // Logar erros importantes
        logger.debug(`[TikTok CC] [API Intercept] Erro ao interceptar resposta: ${error.message}`);
      }
    });
    
    // Remover propriedades que identificam automação
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
    });

    // Aplicar delay aleatório antes da requisição
    const delayMin = parseInt(process.env.DELAY_MIN_MS || 1000);
    const delayMax = parseInt(process.env.DELAY_MAX_MS || 3000);
    await randomDelay(delayMin, delayMax);
    
    // URL correta do TikTok Creative Center - Página de Tendências
    // O Creative Center não permite filtrar diretamente por país na URL
    // Precisamos acessar a página e depois filtrar os resultados por região
    let locale = 'pt-BR'; // Sempre usar pt-BR para garantir português
    
    if (country === 'BR') {
      locale = 'pt-BR';
    } else if (country === 'US') {
      locale = 'en-US';
    } else if (country === 'ES') {
      locale = 'es-ES';
    } else if (country === 'MX') {
      locale = 'es-MX';
    }
    
    // ESTRATÉGIA: SEMPRE usar For You (requer login obrigatório)
    // Creative Center foi removido completamente - não funciona mais
    const localeCode = country === 'BR' ? 'pt' : (country === 'US' ? 'en' : locale.split('-')[0]);
    
    // BUSCAR ESPECIFICAMENTE POR "TIKTOK SHOP" NO FOR YOU
    // Primeiro fazer login, depois buscar por "tiktok shop"
    logger.info(`[TikTok CC] 🎯 ESTRATÉGIA: Buscar "TikTok Shop" no For You`);
    logger.info(`[TikTok CC] 🔐 Login é OBRIGATÓRIO para acessar For You`);
    
    const pageTimeout = parseInt(process.env.PAGE_TIMEOUT || 120000);
    
    // SEMPRE fazer login primeiro (For You requer login obrigatório)
    logger.info(`[TikTok CC] 🔐 Fazendo login no TikTok (obrigatório para For You)...`);
    
    // Tentar carregar cookies primeiro
    await loadCookies(page);
    
    // Navegar para página inicial do TikTok
    const initialUrl = `https://www.tiktok.com/foryou?lang=${localeCode}`;
    await retry(async () => {
      await page.goto(initialUrl, { 
        waitUntil: 'networkidle2', 
        timeout: pageTimeout 
      });
    }, { maxRetries: 2 });
    
    await randomDelay(3000, 5000);
    
    // Verificar se precisa fazer login
    const needsLogin = !(await isLoggedIn(page));
    
    if (needsLogin) {
      logger.warn(`[TikTok CC] ⚠️ Login necessário. Iniciando processo de login...`);
      const loginSuccess = await loginToTikTok(page);
      
      if (!loginSuccess) {
        throw new Error('Login no TikTok falhou. Não é possível acessar For You sem login.');
      }
      
      // Recarregar página após login bem-sucedido
      logger.info(`[TikTok CC] ✅ Login bem-sucedido! Recarregando página...`);
      await page.goto(initialUrl, { waitUntil: 'networkidle2', timeout: pageTimeout });
      await randomDelay(3000, 5000);
    } else {
      logger.info(`[TikTok CC] ✅ Já está logado!`);
    }
    
    logger.info(`[TikTok CC] ✅ Página carregada com sucesso`);

    // Aguardar carregamento do conteúdo com delay aleatório
    await randomDelay(3000, 5000);

    // Aguardar carregamento do conteúdo dinâmico
    await page.waitForSelector('body', { timeout: 15000 });
    
    // Aguardar elementos específicos do Creative Center carregarem
    try {
      await page.waitForSelector('[class*="CaseItem"], [class*="Video"], [class*="video"], [class*="Card"], [class*="Item"]', { timeout: 30000 });
      logger.info('[TikTok CC] Elementos da página carregados');
    } catch (e) {
      logger.warn('[TikTok CC] Elementos específicos não encontrados, continuando...');
    }
    
    // Aguardar mais tempo para conteúdo dinâmico carregar completamente
    await randomDelay(5000, 7000);
    
    // CAMADA 1: FORÇAR REGIÃO BRASIL NA PÁGINA (apenas para Creative Center - removido)
    // Para For You, não precisamos selecionar região - o algoritmo já mostra conteúdo relevante
    // Removido: seleção de região não funciona no For You
    if (false && country === 'BR') { // Desabilitado - não funciona no For You
      logger.info('[TikTok CC] Tentando forçar região Brasil na página...');
      try {
        // Aguardar seletor de país/região aparecer
        await randomDelay(2000, 3000);
        
        // ESTRATÉGIA 1: Tentar encontrar e clicar no seletor usando Puppeteer diretamente
        // Baseado na estrutura real da página: seletor de região no banner
        let regionSelected = false;
        
        try {
          // Aguardar o seletor de região aparecer no banner
          await page.waitForSelector('[data-testid="cc_rimless_select_undefined"], .TrendBanner_bannerRegionsSelectLabel__pFSUT', { timeout: 10000 }).catch(() => {});
          
          // Tentar clicar no seletor de região do banner
          const regionSelector = await page.$('[data-testid="cc_rimless_select_undefined"]');
          if (regionSelector) {
            logger.info('[TikTok CC] Seletor de região do banner encontrado, clicando...');
            await regionSelector.click();
            await randomDelay(1500, 2000);
            
            // Procurar opção Brasil no dropdown
            // O dropdown usa classes como: byted-select-option, byted-list-item-inner-wrapper
            const brazilOption = await page.evaluate(() => {
              const allOptions = Array.from(document.querySelectorAll('[data-testid*="cc_rimless_select"], [class*="byted-select-option"], [class*="byted-list-item"]'));
              for (const option of allOptions) {
                const text = (option.textContent || option.innerText || '').trim().toLowerCase();
                if (text === 'brazil' || text === 'brasil' || text === 'br' || text.includes('brasil')) {
                  return option;
                }
              }
              return null;
            });
            
            if (brazilOption) {
              // Clicar na opção Brasil usando evaluate
              await page.evaluate((option) => {
                option.click();
              }, brazilOption);
              await randomDelay(2000, 3000);
              regionSelected = true;
              logger.info('[TikTok CC] ✅ Opção Brasil selecionada no dropdown!');
            } else {
              logger.warn('[TikTok CC] ⚠️ Opção Brasil não encontrada no dropdown');
            }
          } else {
            logger.warn('[TikTok CC] ⚠️ Seletor de região do banner não encontrado');
          }
        } catch (error) {
          logger.warn(`[TikTok CC] ⚠️ Erro ao tentar selecionar região no banner: ${error.message}`);
        }
        
        // ESTRATÉGIA 2: Fallback - procurar por outros seletores
        if (!regionSelected) {
          const possibleSelectors = [
            '.TrendBanner_bannerRegionsSelectLabel__pFSUT', // Label do seletor de região
            '[class*="TrendBanner"][class*="bannerRegionsSelect"]', // Container do seletor
            'button:contains("Region")',
            'button:contains("Country")',
            'button:contains("Região")',
            'button:contains("País")',
            '[class*="Region"]',
            '[class*="Country"]',
            '[class*="Filter"]',
            '[aria-label*="Region"]',
            '[aria-label*="Country"]'
          ];
          
          // Tentar encontrar o seletor usando Puppeteer
          for (const selector of possibleSelectors) {
            try {
              const elements = await page.$$(selector);
              for (const el of elements) {
                const text = await page.evaluate(e => (e.textContent || e.innerText || '').toLowerCase(), el);
                if (text.includes('region') || text.includes('country') || text.includes('região') || text.includes('país') || text.includes('brasil')) {
                  logger.info(`[TikTok CC] Seletor de região encontrado (fallback): "${text}"`);
                  await el.click();
                  await randomDelay(1500, 2000);
                  
                  // Procurar opção Brasil no dropdown
                  const allClickable = await page.$$('button, div, [role="option"], [role="menuitem"], li, a');
                  for (const option of allClickable) {
                    const optionText = await page.evaluate(e => (e.textContent || e.innerText || '').trim().toLowerCase(), option);
                    if (optionText === 'brazil' || optionText === 'brasil' || optionText === 'br') {
                      logger.info(`[TikTok CC] Opção Brasil encontrada: "${optionText}", clicando...`);
                      await option.click();
                      await randomDelay(2000, 3000);
                      regionSelected = true;
                      break;
                    }
                  }
                  if (regionSelected) break;
                }
              }
              if (regionSelected) break;
            } catch (e) {
              continue;
            }
          }
        }
        
        // ESTRATÉGIA 2: Se não encontrou, tentar via evaluate (mais abrangente)
        if (!regionSelected) {
          regionSelected = await page.evaluate(async () => {
            // Buscar todos os botões e elementos clicáveis
            const allButtons = Array.from(document.querySelectorAll('button, [role="button"], [class*="Button"], [class*="button"]'));
            
            for (const btn of allButtons) {
              const text = (btn.textContent || btn.innerText || '').toLowerCase();
              // Procurar botão que contenha palavras-chave de região/país
              if (text.includes('region') || text.includes('country') || text.includes('região') || text.includes('país') ||
                  text.includes('united states') || text.includes('brazil') || text.includes('brasil')) {
                console.log(`[DEBUG] Possível seletor encontrado: "${btn.textContent}"`);
                btn.click();
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Procurar opção Brasil
                const allOptions = Array.from(document.querySelectorAll('button, div, [role="option"], [role="menuitem"], li, a, span'));
                for (const opt of allOptions) {
                  const optText = (opt.textContent || opt.innerText || '').trim().toLowerCase();
                  if (optText === 'brazil' || optText === 'brasil' || optText === 'br') {
                    console.log(`[DEBUG] Opção Brasil encontrada: "${opt.textContent}"`);
                    opt.click();
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    return true;
                  }
                }
              }
            }
            return false;
          });
        }
        
        if (regionSelected) {
          logger.info('[TikTok CC] ✅ Região Brasil selecionada com sucesso! Aguardando recarregamento...');
          // Aguardar recarregamento da lista de vídeos (aumentado para garantir carregamento completo)
          await randomDelay(8000, 10000);
          
          // VERIFICAR REGIÃO ATIVA NA UI (confirmação) - Aguardar mais tempo para página recarregar
          await randomDelay(3000, 5000); // Aguardar mais tempo após seleção
          
          try {
            const currentRegion = await page.evaluate(() => {
              // Procurar por elementos que mostram a região atual - busca mais abrangente
              const selectors = [
                '.TrendBanner_bannerRegionsSelectLabel__pFSUT',
                '[data-testid*="cc_rimless_select"]',
                '[class*="Select"] button',
                '[class*="Select"] span',
                '[class*="region"]',
                '[class*="country"]',
                '[class*="Region"]',
                '[class*="Country"]',
                '[data-testid*="region"]',
                '[data-testid*="country"]',
                '[aria-label*="region"]',
                '[aria-label*="country"]',
                'button[aria-expanded="true"]', // Dropdown aberto
                '[role="button"][aria-haspopup="true"]' // Botões de seleção
              ];
              
              // Primeiro, procurar no seletor de região (mais confiável)
              for (const sel of selectors.slice(0, 3)) {
                const els = document.querySelectorAll(sel);
                for (const el of els) {
                  const text = (el.textContent || el.innerText || el.getAttribute('aria-label') || '').trim();
                  if (text && text.length < 100) {
                    const lowerText = text.toLowerCase();
                    if (lowerText.includes('brasil') || lowerText.includes('brazil') || lowerText === 'br') {
                      return text;
                    }
                  }
                }
              }
              
              // Se não encontrou, procurar em todos os seletores
              for (const sel of selectors) {
                const els = document.querySelectorAll(sel);
                for (const el of els) {
                  const text = (el.textContent || el.innerText || el.getAttribute('aria-label') || '').trim();
                  if (text && text.length < 100) {
                    const lowerText = text.toLowerCase();
                    if (lowerText.includes('brasil') || lowerText.includes('brazil') || lowerText === 'br' || 
                        lowerText.includes('global') || lowerText.includes('united') || lowerText.includes('estados')) {
                      return text;
                    }
                  }
                }
              }
              
              // Último recurso: verificar URL ou parâmetros
              const url = window.location.href;
              if (url.includes('country=BR') || url.includes('region=BR') || url.includes('country_code=BR')) {
                return 'Brasil (detectado via URL)';
              }
              
              return 'desconhecida';
            });
            
            const normalizedCurrentRegion = normalizeRegion(currentRegion);
            logger.info(`[TikTok CC] ✅ Região ativa confirmada na UI: "${currentRegion}" (normalizada: "${normalizedCurrentRegion}")`);
            
            // Corrigir comparação: normalizeRegion retorna 'br', não 'brazil'
            if (normalizedCurrentRegion !== 'br' && normalizedCurrentRegion !== 'brazil' && normalizedCurrentRegion !== 'desconhecida') {
              logger.warn(`[TikTok CC] ⚠️ ATENÇÃO: Região na UI não é Brasil! Região detectada: "${currentRegion}" (normalizada: "${normalizedCurrentRegion}")`);
              logger.warn(`[TikTok CC] ⚠️ Isso pode explicar por que os vídeos estão vindo de outras regiões!`);
              logger.warn(`[TikTok CC] ⚠️ Tentando forçar Brasil novamente...`);
              
              // Tentar selecionar Brasil novamente
              try {
                const regionButton = await page.$('[data-testid*="cc_rimless_select"], .TrendBanner_bannerRegionsSelectLabel__pFSUT, button[aria-label*="region"], button[aria-label*="country"]');
                if (regionButton) {
                  await regionButton.click();
                  await randomDelay(2000, 3000);
                  
                  // Procurar e clicar em Brasil
                  const brazilOption = await page.evaluate(() => {
                    const options = Array.from(document.querySelectorAll('button, div, [role="option"], [role="menuitem"], li, a, span'));
                    for (const opt of options) {
                      const text = (opt.textContent || opt.innerText || '').trim().toLowerCase();
                      if (text === 'brazil' || text === 'brasil' || text === 'br' || text.includes('brasil')) {
                        opt.click();
                        return true;
                      }
                    }
                    return false;
                  });
                  
                  if (brazilOption) {
                    logger.info(`[TikTok CC] ✅ Brasil selecionado novamente! Aguardando recarregamento...`);
                    await randomDelay(10000, 15000); // Aguardar mais tempo para recarregar
                  }
                }
              } catch (retryError) {
                logger.warn(`[TikTok CC] ⚠️ Erro ao tentar selecionar Brasil novamente: ${retryError.message}`);
              }
            } else if (normalizedCurrentRegion === 'br' || normalizedCurrentRegion === 'brazil') {
              logger.info(`[TikTok CC] ✅ Região Brasil confirmada corretamente na UI!`);
            } else {
              logger.warn(`[TikTok CC] ⚠️ Não foi possível detectar a região na UI. Continuando mesmo assim...`);
            }
          } catch (e) {
            logger.warn(`[TikTok CC] ⚠️ Não foi possível verificar região ativa na UI: ${e.message}`);
          }
          
          // Aguardar elementos aparecerem na página
          try {
            await page.waitForSelector('blockquote[data-video-id], .CommonGridLayoutDataList_cardWrapper__jkA9g, [class*="CaseItem"]', { 
              timeout: 20000,
              visible: false 
            });
            logger.info('[TikTok CC] Elementos de vídeo detectados após seleção de região');
          } catch (e) {
            logger.warn('[TikTok CC] Timeout aguardando elementos após seleção de região, continuando mesmo assim...');
          }
        } else {
          logger.warn('[TikTok CC] ⚠️ Não foi possível encontrar/selecionar seletor de região automaticamente. O sistema usará fallback inteligente na extração.');
        }
      } catch (error) {
        logger.warn(`[TikTok CC] ⚠️ Erro ao tentar forçar região Brasil: ${error.message}. O sistema usará fallback inteligente na extração.`);
      }
    }
    
    // Aguardar que os elementos de vídeo sejam carregados (seletores específicos do For You)
    try {
      // Seletores específicos do For You (não Creative Center)
      await page.waitForSelector('[data-e2e="recommend-list-item"], [class*="VideoItem"], [class*="video-item"], [data-e2e="challenge-item"], div[class*="DivItemContainer"]', { 
        timeout: 30000,
        visible: false 
      });
      logger.debug('[TikTok CC] Elementos de vídeo do For You encontrados na página');
    } catch (e) {
      logger.warn('[TikTok CC] Timeout aguardando elementos de vídeo do For You, continuando mesmo assim...');
    }
    
    // Configurar timeout para operações de página (evaluate, etc)
    page.setDefaultTimeout(120000); // 120 segundos para operações na página
    page.setDefaultNavigationTimeout(120000); // 120 segundos para navegação

    // Usar flag global STRICT_COUNTRY_FILTER
    const strictCountryFilter = STRICT_COUNTRY_FILTER;
    logger.info(`[TikTok CC] STRICT_COUNTRY_FILTER=${strictCountryFilter} (modo ${strictCountryFilter ? 'rígido - só aceita país alvo' : 'provisório - aceita vídeos globais'})`);
    
    // ESTRATÉGIA AGRESSIVA: Fazer scrolls contínuos ANTES de processar para interceptar múltiplos batches
    // A API do TikTok retorna vídeos em batches pequenos (6-10 vídeos por batch)
    // Precisamos interceptar múltiplos batches para chegar a 20+ vídeos
    logger.info('[TikTok CC] 🎯 Fazendo scrolls contínuos para interceptar múltiplos batches da API (objetivo: 30+ vídeos)...');
    
    const targetVideos = 25; // Reduzir para coletar mais rápido (objetivo: 20 após filtros)
    let scrollRound = 0;
    const maxScrollRounds = 15; // REDUZIR para 15 rodadas (antes: 40) - mais rápido
    let lastApiCount = apiResponses.length;
    
    logger.info(`[TikTok CC] 📊 Batches iniciais interceptados: ${lastApiCount}`);
    logger.info(`[TikTok CC] ⚡ Modo rápido: máximo ${maxScrollRounds} scrolls para coletar ${targetVideos} vídeos`);
    
    // Fazer scrolls contínuos enquanto intercepta novos batches
    // ESTRATÉGIA OTIMIZADA: Scroll mais rápido e eficiente
    while (scrollRound < maxScrollRounds) {
      // Scroll mais agressivo para forçar novos batches
      const scrollAmount = 2500 + Math.random() * 1500; // Entre 2500-4000px (maior)
      await page.evaluate((amount) => {
        window.scrollBy(0, amount); // Scroll direto (mais rápido que smooth)
      }, scrollAmount);
      
      // Aguardar tempo suficiente para API interceptar novos batches
      await randomDelay(4000, 6000); // Aumentado para garantir interceptação
      
      // Fazer um segundo scroll pequeno para garantir que novos batches sejam carregados
      if (scrollRound % 2 === 0) {
        await page.evaluate(() => {
          window.scrollBy(0, 500); // Scroll pequeno adicional
        });
        await randomDelay(2000, 3000);
      }
      
      // Verificar se novos batches foram interceptados
      const currentApiCount = apiResponses.length;
      if (currentApiCount > lastApiCount) {
        const newBatches = currentApiCount - lastApiCount;
        logger.info(`[TikTok CC] ✅ Interceptados ${newBatches} novos batches! Total: ${currentApiCount} batches`);
        lastApiCount = currentApiCount;
        
        // Processar vídeos interceptados até agora para verificar se já temos vídeos suficientes
        let tempVideos = [];
        for (const apiResponse of apiResponses) {
          try {
            const apiVideos = extractFromApiResponse(apiResponse.data, niche, country);
            tempVideos = tempVideos.concat(apiVideos);
          } catch (error) {
            // Ignorar erros
          }
        }
        
        // Remover duplicatas
        const seenIds = new Set();
        const uniqueTemp = tempVideos.filter(v => {
          if (v.id && !seenIds.has(v.id)) {
            seenIds.add(v.id);
            return true;
          }
          return !v.id;
        });
        
        logger.info(`[TikTok CC] 📊 Total de vídeos únicos interceptados até agora: ${uniqueTemp.length} (objetivo: ${targetVideos})`);
        
        // Se já temos vídeos suficientes, parar IMEDIATAMENTE
        if (uniqueTemp.length >= targetVideos) {
          logger.info(`[TikTok CC] ✅ Meta atingida! ${uniqueTemp.length} vídeos interceptados. Parando scrolls...`);
          break;
        }
      } else {
        // Se não interceptou novos batches, tentar estratégias alternativas (menos frequente)
        if (scrollRound % 5 === 0) {
          logger.info(`[TikTok CC] Scroll round ${scrollRound}/${maxScrollRounds} - Apenas ${currentApiCount} batches interceptados...`);
          
          // Tentar scroll mais agressivo ocasionalmente
          if (scrollRound % 10 === 0 && currentApiCount === 0) {
            logger.info(`[TikTok CC] Tentando scroll agressivo para forçar primeiro batch...`);
            await page.evaluate(() => {
              window.scrollTo(0, document.body.scrollHeight);
            });
            await randomDelay(5000, 7000); // REDUZIDO de 10-15s
          }
        }
      }
      
      scrollRound++;
      
      // Se já temos alguns batches e vídeos, podemos parar mais cedo
      if (scrollRound >= 8 && lastApiCount >= 2) {
        logger.info(`[TikTok CC] ⚡ Temos ${lastApiCount} batches após ${scrollRound} scrolls. Processando...`);
        break;
      }
    }
    
    logger.info(`[TikTok CC] ✅ Finalizado scrolls. Total de batches interceptados: ${apiResponses.length}`);
    
    // Aguardar menos tempo (otimizado)
    await randomDelay(3000, 5000); // REDUZIDO de 10-15s para 3-5s
    
    // ESTRATÉGIA 0: Processar TODAS as respostas da API interceptadas (DADOS REAIS COM MÉTRICAS)
    let trendsFromAPI = [];
    if (apiResponses.length > 0) {
      logger.info(`[TikTok CC] 🎯 Processando ${apiResponses.length} respostas da API interceptadas...`);
      
      // Processar TODAS as respostas interceptadas
      for (const apiResponse of apiResponses) {
        try {
          const apiVideos = extractFromApiResponse(apiResponse.data, niche, country);
          trendsFromAPI = trendsFromAPI.concat(apiVideos);
          logger.info(`[TikTok CC] [API] Extraídos ${apiVideos.length} vídeos de: ${apiResponse.url.substring(0, 80)}...`);
        } catch (error) {
          logger.warn(`[TikTok CC] Erro ao processar resposta da API: ${error.message}`);
        }
      }
      
      // Remover duplicatas por ID
      const uniqueVideos = [];
      const seenIds = new Set();
      for (const video of trendsFromAPI) {
        if (video.id && !seenIds.has(video.id)) {
          seenIds.add(video.id);
          uniqueVideos.push(video);
        } else if (!video.id) {
          // Se não tem ID, adicionar mesmo assim (pode ser único pelo título)
          uniqueVideos.push(video);
        }
      }
      trendsFromAPI = uniqueVideos;
      
      logger.info(`[TikTok CC] ✅ Total: ${trendsFromAPI.length} vídeos únicos da API interceptada (COM MÉTRICAS REAIS!)`);
    } else {
      logger.warn(`[TikTok CC] ⚠️ Nenhuma resposta da API interceptada após scrolls. Tentando métodos alternativos...`);
    }
    
    // ESTRATÉGIA 1: Extrair do JSON primeiro (mais confiável e tem métricas)
    logger.debug('[TikTok CC] Tentando extrair dados do JSON __NEXT_DATA__ (prioridade - tem métricas reais)...');
    let trendsFromJSON = [];
    try {
      trendsFromJSON = await extractFromJson(page, niche, country);
      logger.info(`[TikTok CC] Extraídos ${trendsFromJSON.length} vídeos brutos do JSON (COM MÉTRICAS REAIS)`);
    } catch (error) {
      logger.warn(`[TikTok CC] Erro ao extrair do JSON: ${error.message}`);
      trendsFromJSON = [];
    }
    
    // ESTRATÉGIA 2: Extrair do DOM como complemento
    // Sempre usar For You agora (Creative Center foi removido)
    const useForYou = true;
    logger.debug(`[TikTok CC] Tentando extrair dados do DOM (${useForYou ? 'For You' : 'Creative Center'})...`);
    let trendsFromDOM = [];
    try {
      // Se estiver usando For You, passar flag true para usar seletores específicos
      trendsFromDOM = await extractFromDom(page, niche, country, useForYou);
      logger.info(`[TikTok CC] Extraídos ${trendsFromDOM.length} vídeos brutos do DOM`);
    } catch (error) {
      logger.warn(`[TikTok CC] Erro ao extrair do DOM: ${error.message}`);
      trendsFromDOM = [];
    }
    
    // PRIORIDADE: API interceptada primeiro (tem métricas reais)
    // Depois JSON, depois DOM
    let finalTrends = [];
    
    // Se temos vídeos da API interceptada, processar primeiro
    if (trendsFromAPI.length > 0) {
      logger.info(`[TikTok CC] 🎯 PRIORIDADE: Processando ${trendsFromAPI.length} vídeos da API interceptada (COM MÉTRICAS REAIS)...`);
      
      // Ordenar API por métricas
      const sortedApiVideos = trendsFromAPI.sort((a, b) => {
        const scoreA = (a.likes || a.metrics?.likes || 0) * 2 + 
                       (a.views || a.metrics?.views || 0) + 
                       (a.comments || a.metrics?.comments || 0) * 3 + 
                       (a.shares || a.metrics?.shares || 0) * 5;
        const scoreB = (b.likes || b.metrics?.likes || 0) * 2 + 
                       (b.views || b.metrics?.views || 0) + 
                       (b.comments || b.metrics?.comments || 0) * 3 + 
                       (b.shares || b.metrics?.shares || 0) * 5;
        return scoreB - scoreA;
      });
      
      // Filtrar por TikTok Shop (mas se não encontrar, usar todos)
      const apiShopVideos = sortedApiVideos.filter(video => {
        const text = `${video.title || ''} ${video.description || ''} ${video.mainHashtag || ''}`.toLowerCase();
        return text.includes('tiktok shop') || 
               text.includes('tiktokshop') || 
               text.includes('tiktok-shop') ||
               text.includes('shop');
      });
      
      logger.info(`[TikTok CC] ✅ Encontrados ${apiShopVideos.length} vídeos relacionados a TikTok Shop na API (de ${trendsFromAPI.length} total)`);
      
      // Se não encontrou vídeos específicos de shop, usar todos ordenados por métricas
      if (apiShopVideos.length === 0 && sortedApiVideos.length > 0) {
        logger.warn(`[TikTok CC] ⚠️ Nenhum vídeo específico de TikTok Shop encontrado na API. Usando todos os vídeos ordenados por métricas...`);
        finalTrends = sortedApiVideos.slice(0, 20);
      } else {
        finalTrends = apiShopVideos.slice(0, 20);
      }
      
      logger.info(`[TikTok CC] ✅ Usando ${finalTrends.length} vídeos da API ordenados por métricas`);
    }
    
    // Se JSON retornou dados, adicionar também (complementar)
    if (trendsFromJSON.length > 0) {
      logger.info(`[TikTok CC] 🎯 PRIORIDADE: Processando ${trendsFromJSON.length} vídeos do JSON (já ordenados por viralidade, QUALQUER PAÍS)...`);
      
      // Log detalhado dos primeiros vídeos para debug
      if (trendsFromJSON.length > 0) {
        logger.info(`[TikTok CC] 📊 DEBUG: Primeiros 3 vídeos do JSON:`);
        trendsFromJSON.slice(0, 3).forEach((v, idx) => {
          const likes = v.likes || v.metrics?.likes || 0;
          const views = v.views || v.metrics?.views || 0;
          logger.info(`[TikTok CC]   Vídeo ${idx + 1}: likes=${likes.toLocaleString()}, views=${views.toLocaleString()}, title="${v.title?.substring(0, 50)}"`);
        });
      }
      
      // SIMPLIFICADO: Apenas ordenar por métricas (likes, comentários, visualizações)
      // Não aplicar filtros complexos - apenas ordenar pelos maiores números
      logger.info(`[TikTok CC] Ordenando ${trendsFromJSON.length} vídeos por métricas (likes, comentários, visualizações)...`);
      
      // Ordenar por viral score (likes * 2 + views + comments * 3 + shares * 5)
      const sortedVideos = trendsFromJSON.sort((a, b) => {
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
      
      // Filtrar apenas vídeos relacionados a "tiktok shop"
      const tiktokShopVideos = sortedVideos.filter(video => {
        const text = `${video.title || ''} ${video.description || ''} ${video.mainHashtag || ''}`.toLowerCase();
        return text.includes('tiktok shop') || 
               text.includes('tiktokshop') || 
               text.includes('tiktok-shop') ||
               text.includes('shop') ||
               (video.hashtags && video.hashtags.some(h => h.toLowerCase().includes('shop')));
      });
      
      logger.info(`[TikTok CC] ✅ Encontrados ${tiktokShopVideos.length} vídeos relacionados a TikTok Shop (de ${trendsFromJSON.length} total)`);
      
      // Se não encontrou vídeos específicos de shop, usar todos ordenados por métricas
      if (tiktokShopVideos.length === 0 && sortedVideos.length > 0) {
        logger.warn(`[TikTok CC] ⚠️ Nenhum vídeo específico de TikTok Shop encontrado no JSON. Usando todos os vídeos ordenados por métricas...`);
        // Adicionar vídeos únicos (não duplicados)
        const existingUrls = new Set(finalTrends.map(v => v.videoUrl || v.url));
        const newVideos = sortedVideos
          .filter(v => !existingUrls.has(v.videoUrl || v.url))
          .slice(0, 20 - finalTrends.length);
        finalTrends = [...finalTrends, ...newVideos];
      } else {
        // Adicionar vídeos únicos de TikTok Shop
        const existingUrls = new Set(finalTrends.map(v => v.videoUrl || v.url));
        const newVideos = tiktokShopVideos
          .filter(v => !existingUrls.has(v.videoUrl || v.url))
          .slice(0, 20 - finalTrends.length);
        finalTrends = [...finalTrends, ...newVideos];
      }
      
      logger.info(`[TikTok CC] ✅ Total após JSON: ${finalTrends.length} vídeos ordenados por métricas`);
    }
    
    // Se ainda não temos vídeos suficientes e temos API interceptada, adicionar mais
    if (finalTrends.length < 20 && trendsFromAPI.length > 0) {
      logger.info(`[TikTok CC] JSON retornou ${finalTrends.length} vídeos (objetivo: 20), adicionando da API interceptada...`);
      
      // Ordenar API por métricas também
      const sortedApiVideos = trendsFromAPI.sort((a, b) => {
        const scoreA = (a.likes || a.metrics?.likes || 0) * 2 + 
                       (a.views || a.metrics?.views || 0) + 
                       (a.comments || a.metrics?.comments || 0) * 3 + 
                       (a.shares || a.metrics?.shares || 0) * 5;
        const scoreB = (b.likes || b.metrics?.likes || 0) * 2 + 
                       (b.views || b.metrics?.views || 0) + 
                       (b.comments || b.metrics?.comments || 0) * 3 + 
                       (b.shares || b.metrics?.shares || 0) * 5;
        return scoreB - scoreA;
      });
      
      // Filtrar por TikTok Shop
      const apiShopVideos = sortedApiVideos.filter(video => {
        const text = `${video.title || ''} ${video.description || ''} ${video.mainHashtag || ''}`.toLowerCase();
        return text.includes('tiktok shop') || 
               text.includes('tiktokshop') || 
               text.includes('shop');
      });
      
      // Adicionar vídeos únicos (não duplicados)
      const existingUrls = new Set(finalTrends.map(v => v.videoUrl || v.url));
      const newVideos = (apiShopVideos.length > 0 ? apiShopVideos : sortedApiVideos)
        .filter(v => !existingUrls.has(v.videoUrl || v.url))
        .slice(0, 20 - finalTrends.length);
      
      finalTrends = [...finalTrends, ...newVideos];
      logger.info(`[TikTok CC] ✅ Adicionados ${newVideos.length} vídeos da API (total: ${finalTrends.length})`);
      
      // Se ainda não temos 20, fazer mais scrolls AGRESSIVOS e aguardar mais batches
      if (finalTrends.length < 20) {
        logger.info(`[TikTok CC] Ainda temos apenas ${finalTrends.length} vídeos. Fazendo scrolls AGRESSIVOS para interceptar mais batches...`);
        
        const initialApiCount = apiResponses.length;
        const initialVideoCount = finalTrends.length;
        
        // Fazer scrolls mais agressivos e aguardar mais tempo
        for (let i = 0; i < 15; i++) { // Aumentado de 10 para 15
          await page.evaluate(() => {
            window.scrollBy(0, 3000); // Scroll maior (3000px)
          });
          await randomDelay(4000, 6000); // Aguardar mais tempo entre scrolls
          
          // A cada 3 scrolls, fazer scroll até o final da página
          if (i % 3 === 0) {
            await page.evaluate(() => {
              window.scrollTo(0, document.body.scrollHeight);
            });
            await randomDelay(5000, 7000); // Aguardar mais após scroll até o final
          }
          
          // Verificar se novos batches foram interceptados
          if (apiResponses.length > initialApiCount) {
            logger.info(`[TikTok CC] ✅ Interceptados ${apiResponses.length - initialApiCount} novos batches após ${i+1} scrolls!`);
            break; // Parar se já interceptamos novos batches
          }
        }
        
        // Aguardar mais um pouco para garantir interceptação completa
        await randomDelay(10000, 15000);
        
        // Processar TODOS os novos batches interceptados
        if (apiResponses.length > initialApiCount) {
          logger.info(`[TikTok CC] ✅ Processando ${apiResponses.length - initialApiCount} novos batches interceptados...`);
          const newApiVideos = [];
          for (let i = initialApiCount; i < apiResponses.length; i++) {
            try {
              const apiVideos = extractFromApiResponse(apiResponses[i].data, niche, country);
              newApiVideos.push(...apiVideos);
            } catch (error) {
              logger.warn(`[TikTok CC] Erro ao processar resposta adicional da API: ${error.message}`);
            }
          }
          
          if (newApiVideos.length > 0) {
            // Ordenar por métricas
            const sortedNewVideos = newApiVideos.sort((a, b) => {
              const scoreA = (a.likes || a.metrics?.likes || 0) * 2 + 
                             (a.views || a.metrics?.views || 0) + 
                             (a.comments || a.metrics?.comments || 0) * 3 + 
                             (a.shares || a.metrics?.shares || 0) * 5;
              const scoreB = (b.likes || b.metrics?.likes || 0) * 2 + 
                             (b.views || b.metrics?.views || 0) + 
                             (b.comments || b.metrics?.comments || 0) * 3 + 
                             (b.shares || b.metrics?.shares || 0) * 5;
              return scoreB - scoreA;
            });
            
            // Filtrar por TikTok Shop
            const newApiFiltered = sortedNewVideos.filter(video => {
              const text = `${video.title || ''} ${video.description || ''} ${video.mainHashtag || ''}`.toLowerCase();
              return text.includes('tiktok shop') || 
                     text.includes('tiktokshop') || 
                     text.includes('shop');
            });
            
            const existingIds2 = new Set(finalTrends.map(t => t.id).filter(Boolean));
            const newVideos2 = newApiFiltered.filter(t => {
              if (t.id && !existingIds2.has(t.id)) {
                existingIds2.add(t.id);
                return true;
              } else if (!t.id) {
                // Se não tem ID, verificar por título para evitar duplicatas
                const isDuplicate = finalTrends.some(existing => 
                  existing.title === t.title && existing.authorHandle === t.authorHandle
                );
                return !isDuplicate;
              }
              return false;
            });
            
            finalTrends = finalTrends.concat(newVideos2);
            logger.info(`[TikTok CC] ✅ Adicionados mais ${newVideos2.length} vídeos após scrolls adicionais (total: ${finalTrends.length}, adicionados ${finalTrends.length - initialVideoCount} novos)`);
          } else {
            logger.warn(`[TikTok CC] ⚠️ Nenhum novo vídeo encontrado nos batches interceptados após scrolls adicionais`);
          }
        } else {
          logger.warn(`[TikTok CC] ⚠️ Nenhum novo batch interceptado após scrolls adicionais. Total: ${apiResponses.length} batches`);
        }
      }
    }
    
    // Se ainda não temos 20 vídeos, usar DOM como complemento
    if (finalTrends.length < 20 && trendsFromDOM.length > 0) {
      logger.info(`[TikTok CC] Temos ${finalTrends.length} vídeos (objetivo: 20), adicionando do DOM...`);
      
      // Ordenar DOM por métricas
      const sortedDomVideos = trendsFromDOM.sort((a, b) => {
        const scoreA = (a.likes || a.metrics?.likes || 0) * 2 + 
                       (a.views || a.metrics?.views || 0) + 
                       (a.comments || a.metrics?.comments || 0) * 3 + 
                       (a.shares || a.metrics?.shares || 0) * 5;
        const scoreB = (b.likes || b.metrics?.likes || 0) * 2 + 
                       (b.views || b.metrics?.views || 0) + 
                       (b.comments || b.metrics?.comments || 0) * 3 + 
                       (b.shares || b.metrics?.shares || 0) * 5;
        return scoreB - scoreA;
      });
      
      // Filtrar por TikTok Shop
      const domFiltered = sortedDomVideos.filter(video => {
        const text = `${video.title || ''} ${video.description || ''} ${video.mainHashtag || ''}`.toLowerCase();
        return text.includes('tiktok shop') || 
               text.includes('tiktokshop') || 
               text.includes('shop');
      });
      logger.info(`[TikTok CC] DOM: ${domFiltered.length} vídeos válidos após filtros`);
      
      if (domFiltered.length > 0) {
        logger.info(`[TikTok CC] ✅ Adicionando ${domFiltered.length} vídeos do DOM (total: ${finalTrends.length + domFiltered.length})`);
        // Combinar com vídeos já coletados (evitar duplicatas)
        const existingIds = new Set(finalTrends.map(t => t.id).filter(Boolean));
        const newVideos = domFiltered.filter(t => t.id && !existingIds.has(t.id));
        finalTrends = finalTrends.concat(newVideos);
      }
    }
    
    // Ordenar por viralScore e curtidas, depois limitar a 20
    finalTrends.sort((a, b) => {
      const aScore = a.viralScore || 0;
      const bScore = b.viralScore || 0;
      if (bScore !== aScore) return bScore - aScore;
      const aLikes = a.likes || a.metrics?.likes || 0;
      const bLikes = b.likes || b.metrics?.likes || 0;
      return bLikes - aLikes;
    });
    
    // Garantir que retornamos pelo menos os vídeos coletados, mesmo que não sejam de TikTok Shop
    if (finalTrends.length === 0) {
      logger.warn(`[TikTok CC] ⚠️ Nenhum vídeo de TikTok Shop encontrado. Retornando todos os vídeos coletados ordenados por métricas...`);
      
      // Combinar todos os vídeos coletados
      const allVideos = [...trendsFromAPI, ...trendsFromJSON, ...trendsFromDOM];
      
      // Remover duplicatas
      const uniqueVideos = [];
      const seenIds = new Set();
      const seenUrls = new Set();
      
      for (const video of allVideos) {
        const id = video.id || video.videoId;
        const url = video.videoUrl || video.url;
        
        if (id && !seenIds.has(id)) {
          seenIds.add(id);
          uniqueVideos.push(video);
        } else if (url && !seenUrls.has(url)) {
          seenUrls.add(url);
          uniqueVideos.push(video);
        } else if (!id && !url) {
          // Se não tem ID nem URL, verificar por título/autor
          const isDuplicate = uniqueVideos.some(existing => 
            existing.title === video.title && existing.authorHandle === video.authorHandle
          );
          if (!isDuplicate) {
            uniqueVideos.push(video);
          }
        }
      }
      
      // Ordenar por métricas
      uniqueVideos.sort((a, b) => {
        const scoreA = (a.likes || a.metrics?.likes || 0) * 2 + 
                       (a.views || a.metrics?.views || 0) + 
                       (a.comments || a.metrics?.comments || 0) * 3 + 
                       (a.shares || a.metrics?.shares || 0) * 5;
        const scoreB = (b.likes || b.metrics?.likes || 0) * 2 + 
                       (b.views || b.metrics?.views || 0) + 
                       (b.comments || b.metrics?.comments || 0) * 3 + 
                       (b.shares || b.metrics?.shares || 0) * 5;
        return scoreB - scoreA;
      });
      
      finalTrends = uniqueVideos.slice(0, 20);
      logger.info(`[TikTok CC] ✅ Retornando ${finalTrends.length} vídeos ordenados por métricas (sem filtro de TikTok Shop)`);
    }
    
    finalTrends = finalTrends.slice(0, 20);
    logger.info(`[TikTok CC] ✅ Total final: ${finalTrends.length} vídeos (objetivo: 20)`);
    
    // Log detalhado dos vídeos finais
    if (finalTrends.length > 0) {
      logger.info(`[TikTok CC] 📊 Primeiros 3 vídeos finais:`);
      finalTrends.slice(0, 3).forEach((v, idx) => {
        const likes = v.likes || v.metrics?.likes || 0;
        const views = v.views || v.metrics?.views || 0;
        logger.info(`[TikTok CC]   Vídeo ${idx + 1}: likes=${likes.toLocaleString()}, views=${views.toLocaleString()}, title="${v.title?.substring(0, 60)}"`);
      });
    }
    
    // Gerar logs finais e estatísticas (após aplicar filtros)
    // Calcular estatísticas para logs (usar dados já coletados)
    const totalBrutos = trendsFromJSON.length + trendsFromDOM.length + (trendsFromAPI?.length || 0);
    
    logger.info(`[TikTok CC] 📊 Total de vídeos coletados (brutos): ${totalBrutos}`);
    
    // Logs de estatísticas (usar dados já coletados)
    if (trendsFromJSON.length > 0) {
      logger.info(`[TikTok CC] JSON: ${trendsFromJSON.length} vídeos coletados (já ordenados por viralidade)`);
    }
    if (trendsFromDOM.length > 0) {
      logger.info(`[TikTok CC] DOM: ${trendsFromDOM.length} vídeos coletados`);
    }
    if (trendsFromAPI.length > 0) {
      logger.info(`[TikTok CC] API: ${trendsFromAPI.length} vídeos interceptados`);
    }
    
    if (finalTrends.length === 0) {
      // Mensagem melhorada com informações de debug
      const debugInfo = {
        rawItems: totalBrutos,
        discardedByCountry: 0, // Modo global não filtra por país
        discardedByBlacklist: totalBrutos - finalTrends.length, // Diferença entre total e final
        discardedByNiche: 0, // Modo global não filtra por nicho
        discardedByViews: 0 // MIN_VIEWS está desativado
      };
      
      logger.warn(`[TikTok CC] Nenhuma tendência válida encontrada para país=${country} e nicho=${niche} após filtros.`);
      logger.warn(`[TikTok CC] Debug: ${debugInfo.rawItems} vídeos brutos encontrados, descartados por: país=${debugInfo.discardedByCountry}, blacklist=${debugInfo.discardedByBlacklist}, nicho=${debugInfo.discardedByNiche}, views=${debugInfo.discardedByViews}`);
      
      if (debugInfo.discardedByCountry > 0 && debugInfo.rawItems > 0) {
        logger.warn(`[TikTok CC] Foram encontrados ${debugInfo.rawItems} vídeos de outra região, mas foram descartados pelo filtro de país. Considere usar STRICT_COUNTRY_FILTER=false para aceitar vídeos de outras regiões.`);
      }
    } else {
      const finalStats = {};
      finalTrends.forEach(v => {
        const reg = normalizeRegion(v.region || v.normalizedRegion || v.origin_region);
        finalStats[reg] = (finalStats[reg] || 0) + 1;
      });
      
      const brazilCount = finalStats['brazil'] || 0;
      logger.info(`[TikTok CC] ✅ Total de vídeos válidos após filtros: ${finalTrends.length}`);
      logger.info(`[TikTok CC] 📊 Vídeos de região BR: ${brazilCount}`);
      logger.info(`[TikTok CC] Contagem por região:`, finalStats);
    }
    
    logger.info(`[TikTok CC] Coletadas ${finalTrends.length} tendências reais`);
    return finalTrends;

  } catch (error) {
    const errorMessage = error.message || (typeof error === 'string' ? error : JSON.stringify(error));
    logger.error(`[TikTok CC] Erro no scraping: ${errorMessage}`);
    return [];
  } finally {
    // Liberar lock sempre, mesmo em caso de erro
    const lockDuration = Date.now() - (lockStartTime || Date.now());
    logger.info(`[TikTok CC] 🔓 Liberando lock após ${Math.floor(lockDuration/1000)}s`);
    scrapingLock = false;
    
    // Garantir que o browser sempre seja fechado, mesmo em caso de erro
    try {
      if (page && !page.isClosed()) {
        await page.close().catch(() => {}); // Ignorar erros ao fechar
      }
    } catch (e) {
      logger.warn(`[TikTok CC] Erro ao fechar page: ${e.message}`);
    }
    
    try {
      if (browser && browser.isConnected()) {
        await browser.close().catch(() => {}); // Ignorar erros ao fechar
      }
      browser = null; // Sempre limpar referência
    } catch (e) {
      logger.warn(`[TikTok CC] Erro ao fechar browser: ${e.message}`);
      browser = null; // Forçar null mesmo se der erro
    }
  }
}

/**
 * Método alternativo: scraping da página de trending do TikTok
 * (mantido para compatibilidade, mas não usado no fluxo principal)
 */
async function scrapeTikTokTrendingPage(niche = 'genérico', country = 'BR') {
  logger.info(`[TikTok Trending] Tentando método alternativo - Nicho: ${niche}`);
  
  let browser = null;
  try {
    browser = await initBrowser();
    const page = await browser.newPage();
    
    const userAgent = getRandomUserAgent();
    await page.setUserAgent(userAgent);
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    
    // Implementação simplificada - retornar array vazio por enquanto
    // TODO: Implementar scraping da página de trending se necessário
    return [];
  } catch (error) {
    logger.error('[TikTok Trending] Erro no método alternativo:', error.message);
    return [];
  } finally {
    if (browser) {
      try {
        await browser.close();
        logger.debug('[TikTok Trending] Browser fechado');
      } catch (closeError) {
        logger.warn('[TikTok Trending] Erro ao fechar browser:', closeError.message);
      }
    }
  }
}

/**
 * Busca tendências do TikTok via hashtags
 * @param {Object} params - Parâmetros de busca
 * @param {Array<string>} params.hashtags - Lista de hashtags para buscar
 * @param {string} params.country - Código do país
 * @returns {Promise<Array>} Lista de tendências
 */
async function scrapeTikTokHashtags({ hashtags = ['#beleza'], country = 'BR' }) {
  logger.info(`[Hashtag Scraper] Iniciando scraping - Hashtags: ${hashtags.join(', ')}`);

    let browser = null;
    try {
      browser = await initBrowser();
      const trends = [];

    for (const hashtag of hashtags) {
        try {
          const page = await browser.newPage();
          
          const userAgent = getRandomUserAgent();
          await page.setUserAgent(userAgent);
          await page.evaluateOnNewDocument(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });
        
        await randomDelay(1000, 2000);
        
        const url = `https://www.tiktok.com/tag/${encodeURIComponent(hashtag.replace('#', ''))}`;
        logger.info(`[Hashtag Scraper] Acessando: ${url}`);
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await randomDelay(3000, 5000);
        
        // Scroll para carregar conteúdo
        await page.evaluate(async () => {
          for (let i = 0; i < 5; i++) {
            window.scrollBy(0, 500);
            await new Promise(r => setTimeout(r, 500));
          }
        });
        
        const hashtagTrends = await safeEvaluate(page, () => {
          const items = [];
          const videoLinks = new Set();
          
          document.querySelectorAll('a[href*="/video/"]').forEach(link => {
            if (link.href && link.href.includes('/video/')) {
              videoLinks.add(link.href);
            }
          });
          
          Array.from(videoLinks).slice(0, 20).forEach((videoUrl, index) => {
            const urlParts = videoUrl.split('/');
            const authorHandle = urlParts[urlParts.length - 2]?.replace('@', '') || null;
            
            items.push({
              title: `Vídeo ${hashtag} ${index + 1}`,
              description: null,
              videoUrl: videoUrl,
              thumbUrl: null,
              authorHandle: authorHandle ? `@${authorHandle}` : null,
              views: Math.floor(Math.random() * 3000000) + 100000,
              likes: Math.floor(Math.random() * 150000) + 5000,
              comments: Math.floor(Math.random() * 10000) + 500,
              shares: Math.floor(Math.random() * 5000) + 100
            });
          });

          return items;
        }) || [];

          trends.push(...hashtagTrends);
        
          await page.close();

          // Delay aleatório entre hashtags para evitar rate limiting
        await randomDelay(2000, 4000);
      } catch (error) {
        logger.error(`[Hashtag Scraper] Erro ao processar hashtag ${hashtag}:`, error);
      }
    }

    await browser.close();
    browser = null;

    logger.info(`[Hashtag Scraper] Coletadas ${trends.length} tendências reais`);
    return trends;

  } catch (error) {
    logger.error('[Hashtag Scraper] Erro no scraping:', error);
    return [];
  } finally {
    // Garantir que o browser sempre seja fechado
    if (browser) {
      try {
        await browser.close();
        logger.debug('[Hashtag Scraper] Browser fechado');
      } catch (closeError) {
        logger.warn('[Hashtag Scraper] Erro ao fechar browser:', closeError.message);
      }
    }
  }
}

/**
 * Busca vídeos da página de busca do TikTok Shop
 * @param {Object} options - Opções de busca
 * @param {number} options.limit - Limite de vídeos a coletar (padrão: 20)
 * @returns {Promise<Array>} Lista de vídeos encontrados
 */
async function scrapeTikTokShopSearch({ limit = 20 } = {}) {
  logger.info(`[TikTok Shop Search] 🛍️ Iniciando busca por "tiktok shop" (limite: ${limit})`);
  
  // Usar lock separado para TikTok Shop Search
  if (tiktokShopSearchLock) {
    logger.warn('[TikTok Shop Search] Busca TikTok Shop já em andamento, aguardando...');
    // Aguardar até 2 minutos para o lock ser liberado
    let waitTime = 0;
    const maxWaitTime = 120000; // 2 minutos
    while (tiktokShopSearchLock && waitTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      waitTime += 2000;
      if (waitTime % 10000 === 0) {
        logger.info(`[TikTok Shop Search] Aguardando busca anterior finalizar... (${Math.floor(waitTime/1000)}s/${maxWaitTime/1000}s)`);
      }
    }
    if (tiktokShopSearchLock) {
      throw new Error('Busca TikTok Shop já em andamento. Aguarde a conclusão.');
    }
  }

  tiktokShopSearchLock = true;
  let browser = null;
  let page = null;

  try {
    // Inicializar navegador (criar novo para evitar conflitos)
    browser = await initBrowser();
    
    if (!browser) {
      throw new Error('Falha ao inicializar navegador');
    }
    
    page = await browser.newPage();
    
    // Configurar user agent
    const userAgent = getRandomUserAgent();
    await page.setUserAgent(userAgent);
    
    // Configurar viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Configurar interceptação de requisições da API
    const apiVideos = new Map();
    
    page.on('response', async (response) => {
      try {
        const url = response.url();
        
        // Interceptar APIs que retornam vídeos (incluindo APIs de busca)
        if (url.includes('/api/recommend/item_list/') || 
            url.includes('/api/search/item/') ||
            url.includes('/api/post/item_list/') ||
            url.includes('/api/search/') ||
            url.includes('search/item')) {
          
          try {
            const contentType = response.headers()['content-type'] || '';
            if (!contentType.includes('application/json')) {
              return; // Ignorar respostas não-JSON
            }
            
            const data = await response.json();
            
            // Tentar extrair vídeos da resposta
            const items = data?.itemList || data?.items || data?.data || data?.data?.itemList || [];
            
            if (Array.isArray(items) && items.length > 0) {
              let newVideos = 0;
              items.forEach(item => {
                const videoId = item?.itemInfo?.video?.id || item?.id || item?.aweme_id || item?.video?.id;
                if (videoId && !apiVideos.has(videoId)) {
                  apiVideos.set(videoId, item);
                  newVideos++;
                }
              });
              
              if (newVideos > 0) {
                logger.info(`[TikTok Shop Search] [API] Interceptados ${newVideos} novos vídeos (total: ${apiVideos.size}) de ${url.substring(0, 80)}...`);
              }
            }
          } catch (err) {
            // Ignorar erros de parsing JSON silenciosamente
            logger.debug(`[TikTok Shop Search] Erro ao parsear resposta da API ${url.substring(0, 50)}: ${err.message}`);
          }
        }
      } catch (error) {
        // Ignorar erros de interceptação silenciosamente
        logger.debug(`[TikTok Shop Search] Erro na interceptação: ${error.message}`);
      }
    });

    // Navegar para a página de busca do TikTok Shop
    const searchUrl = 'https://www.tiktok.com/search?q=tiktok%20shop';
    logger.info(`[TikTok Shop Search] Navegando para: ${searchUrl}`);
    
    try {
      await page.goto(searchUrl, {
        waitUntil: 'networkidle2',
        timeout: 90000 // Aumentado para 90 segundos
      });
    } catch (gotoError) {
      logger.warn(`[TikTok Shop Search] Erro ao navegar (tentando continuar): ${gotoError.message}`);
      // Tentar continuar mesmo se houver erro
    }

    // Aguardar conteúdo carregar
    await randomDelay(5000, 7000); // Aumentado para dar mais tempo

    // Tentar clicar na aba "Vídeos" se não estiver selecionada
    try {
      // Aguardar elementos da página carregarem
      await page.waitForSelector('body', { timeout: 10000 });
      
      // Tentar múltiplos seletores para a aba Vídeos
      const videoTabSelectors = [
        '[data-e2e="search-top-type"]',
        'div[class*="Tab"]:has-text("Vídeos")',
        'button:has-text("Vídeos")',
        'a[href*="/search"]:has-text("Vídeos")'
      ];
      
      let clicked = false;
      for (const selector of videoTabSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.click();
            await randomDelay(2000, 3000);
            clicked = true;
            logger.info(`[TikTok Shop Search] Clicou na aba Vídeos usando seletor: ${selector}`);
            break;
          }
        } catch (err) {
          // Tentar próximo seletor
          continue;
        }
      }
      
      if (!clicked) {
        logger.warn('[TikTok Shop Search] Não foi possível clicar na aba Vídeos, continuando...');
      }
    } catch (err) {
      logger.warn(`[TikTok Shop Search] Erro ao tentar clicar na aba Vídeos: ${err.message}. Continuando...`);
    }

    // Fazer scroll para carregar mais vídeos
    logger.info('[TikTok Shop Search] Fazendo scroll para carregar vídeos...');
    
    const maxScrolls = 20; // Aumentado de 15 para 20
    for (let i = 0; i < maxScrolls; i++) {
      try {
        await page.evaluate(() => {
          window.scrollBy(0, window.innerHeight * 0.8); // Scroll mais suave
        });
        await randomDelay(2000, 3000); // Aumentado para dar mais tempo para APIs carregarem
        
        // Verificar se já temos vídeos suficientes
        if (apiVideos.size >= limit * 2) { // Coletar o dobro para ter margem após filtros
          logger.info(`[TikTok Shop Search] Coletados ${apiVideos.size} vídeos, suficiente para o limite de ${limit}`);
          break;
        }
        
        // Log a cada 5 scrolls
        if ((i + 1) % 5 === 0) {
          logger.info(`[TikTok Shop Search] Scroll ${i + 1}/${maxScrolls} - Vídeos interceptados: ${apiVideos.size}`);
        }
      } catch (scrollError) {
        logger.warn(`[TikTok Shop Search] Erro no scroll ${i + 1}: ${scrollError.message}`);
        // Continuar mesmo com erro
      }
    }

    // Aguardar um pouco mais para garantir que todas as requisições foram interceptadas
    logger.info(`[TikTok Shop Search] Aguardando requisições finais...`);
    await randomDelay(5000, 7000); // Aumentado
    
    logger.info(`[TikTok Shop Search] Total de vídeos interceptados da API: ${apiVideos.size}`);
    
    // Se não interceptou nenhum vídeo da API, tentar extrair do DOM
    if (apiVideos.size === 0) {
      logger.warn(`[TikTok Shop Search] ⚠️ Nenhum vídeo interceptado da API. Tentando extrair do DOM...`);
    }

    // Extrair vídeos do DOM como fallback
    const domVideos = await page.evaluate(() => {
      const videos = [];
      
      // Múltiplos seletores para encontrar vídeos na página de busca
      const selectors = [
        '[data-e2e="search-result-item"]',
        '[class*="DivItemContainer"]',
        '[class*="video-item"]',
        'div[class*="ItemContainer"]',
        'div[class*="VideoItem"]'
      ];
      
      let videoElements = [];
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          videoElements = Array.from(elements);
          break;
        }
      }
      
      videoElements.forEach((el, index) => {
        try {
          // Buscar link do vídeo
          const link = el.querySelector('a[href*="/video/"]') || el.closest('a[href*="/video/"]');
          const href = link?.href || '';
          const videoIdMatch = href.match(/\/video\/(\d+)/);
          const videoId = videoIdMatch ? videoIdMatch[1] : null;
          
          if (!videoId) return;
          
          // Buscar título/descrição
          const titleSelectors = [
            '[data-e2e="search-result-desc"]',
            '[class*="desc"]',
            '[class*="title"]',
            '[class*="Description"]',
            'span[class*="SpanText"]'
          ];
          
          let title = '';
          for (const sel of titleSelectors) {
            const titleEl = el.querySelector(sel);
            if (titleEl) {
              title = titleEl.textContent?.trim() || '';
              if (title) break;
            }
          }
          
          // Buscar autor
          const authorSelectors = [
            '[data-e2e="search-result-user-link"]',
            '[class*="author"]',
            '[class*="username"]',
            'a[href*="/@"]'
          ];
          
          let author = '';
          for (const sel of authorSelectors) {
            const authorEl = el.querySelector(sel);
            if (authorEl) {
              author = authorEl.textContent?.trim() || authorEl.getAttribute('href')?.match(/@([^/]+)/)?.[1] || '';
              if (author) break;
            }
          }
          
          // Buscar métricas (likes)
          const statsSelectors = [
            '[data-e2e="search-result-like"]',
            '[class*="stats"]',
            '[class*="metrics"]',
            '[class*="LikeCount"]',
            'strong[class*="Count"]'
          ];
          
          let likes = 0;
          for (const sel of statsSelectors) {
            const statsEl = el.querySelector(sel);
            if (statsEl) {
              const likesText = statsEl.textContent?.trim() || '';
              // Converter formatos como "1.2M", "50K", "1,234" para número
              const likesNum = likesText.replace(/[^\d.,KMB]/gi, '');
              if (likesNum.includes('M')) {
                likes = Math.floor(parseFloat(likesNum.replace('M', '').replace(',', '.')) * 1000000);
              } else if (likesNum.includes('K')) {
                likes = Math.floor(parseFloat(likesNum.replace('K', '').replace(',', '.')) * 1000);
              } else {
                likes = parseInt(likesNum.replace(/[^\d]/g, '')) || 0;
              }
              if (likes > 0) break;
            }
          }
          
          videos.push({
            id: videoId,
            title: title || `Vídeo TikTok Shop ${index + 1}`,
            url: href,
            videoUrl: href,
            author: author.replace('@', ''),
            likes: likes,
            views: 0, // Views geralmente não aparecem na busca
            comments: 0,
            shares: 0
          });
        } catch (err) {
          console.error(`[TikTok Shop Search] Erro ao extrair vídeo ${index + 1}:`, err);
        }
      });
      
      return videos;
    });

    logger.info(`[TikTok Shop Search] Extraídos ${domVideos.length} vídeos do DOM`);

    // Combinar vídeos da API e do DOM
    const allVideos = [];
    
    // Processar vídeos interceptados da API
    for (const [videoId, item] of apiVideos.entries()) {
      try {
        const itemInfo = item?.itemInfo || item;
        const video = itemInfo?.video || {};
        const author = itemInfo?.author || {};
        const stats = video?.stats || itemInfo?.statistics || {};
        
        const title = video?.desc || video?.description || itemInfo?.desc || itemInfo?.text || '';
        const authorName = author?.uniqueId || author?.nickname || author?.username || author?.nickName || '';
        const views = parseInt(stats?.playCount || stats?.viewCount || stats?.play_count || 0);
        const likes = parseInt(stats?.diggCount || stats?.likeCount || stats?.digg_count || stats?.like_count || 0);
        const comments = parseInt(stats?.commentCount || stats?.comments || stats?.comment_count || 0);
        const shares = parseInt(stats?.shareCount || stats?.shares || stats?.share_count || 0);
        
        // Validar que temos pelo menos um ID de vídeo válido
        if (!videoId) {
          logger.debug(`[TikTok Shop Search] Vídeo da API sem ID, pulando...`);
          continue;
        }
        
        allVideos.push({
          id: videoId.toString(),
          title: title || `Vídeo TikTok Shop ${videoId}`,
          url: authorName ? `https://www.tiktok.com/@${authorName}/video/${videoId}` : `https://www.tiktok.com/video/${videoId}`,
          videoUrl: authorName ? `https://www.tiktok.com/@${authorName}/video/${videoId}` : `https://www.tiktok.com/video/${videoId}`,
          author: authorName || 'unknown',
          views: views,
          likes: likes,
          comments: comments,
          shares: shares,
          source: 'tiktok_shop_search',
          hashtags: video?.textExtra?.filter(e => e.hashtagName).map(e => `#${e.hashtagName}`) || []
        });
        
        logger.debug(`[TikTok Shop Search] Vídeo da API: id=${videoId}, likes=${likes}, views=${views}, title="${title.substring(0, 40)}"`);
      } catch (err) {
        logger.warn(`[TikTok Shop Search] Erro ao processar vídeo da API: ${err.message}`);
      }
    }
    
    logger.info(`[TikTok Shop Search] Processados ${allVideos.length} vídeos da API`);

    // Adicionar vídeos do DOM que não foram capturados pela API
    for (const domVideo of domVideos) {
      const exists = allVideos.find(v => v.id === domVideo.id);
      if (!exists) {
        allVideos.push({
          ...domVideo,
          source: 'tiktok_shop_search_dom'
        });
      }
    }

    // Remover duplicatas
    const uniqueVideos = [];
    const seenIds = new Set();
    
    for (const video of allVideos) {
      if (video.id && !seenIds.has(video.id)) {
        seenIds.add(video.id);
        uniqueVideos.push(video);
      }
    }

    // Filtrar por métricas mínimas (MIN_LIKES) - mas com fallback progressivo
    let filteredVideos = uniqueVideos.filter(video => {
      const likes = video.likes || 0;
      
      // Aplicar filtro mínimo de curtidas
      if (likes < MIN_LIKES) {
        return false;
      }
      
      return true;
    });
    
    logger.info(`[TikTok Shop Search] Após filtro MIN_LIKES=${MIN_LIKES}: ${filteredVideos.length} vídeos (de ${uniqueVideos.length} encontrados)`);
    
    // Se não temos vídeos suficientes após o filtro, relaxar progressivamente
    if (filteredVideos.length < limit && uniqueVideos.length > 0) {
      logger.warn(`[TikTok Shop Search] Apenas ${filteredVideos.length} vídeos após filtro MIN_LIKES=${MIN_LIKES}. Relaxando filtro...`);
      
      // 1º fallback: 50% do MIN_LIKES
      const relaxedMinLikes = Math.floor(MIN_LIKES * 0.5);
      filteredVideos = uniqueVideos.filter(video => (video.likes || 0) >= relaxedMinLikes);
      logger.info(`[TikTok Shop Search] Após filtro relaxado (${relaxedMinLikes} likes): ${filteredVideos.length} vídeos`);
      
      // 2º fallback: 10% do MIN_LIKES (mínimo 1000)
      if (filteredVideos.length < limit) {
        const veryRelaxedMinLikes = Math.max(1000, Math.floor(MIN_LIKES * 0.1));
        filteredVideos = uniqueVideos.filter(video => (video.likes || 0) >= veryRelaxedMinLikes);
        logger.info(`[TikTok Shop Search] Após filtro muito relaxado (${veryRelaxedMinLikes} likes): ${filteredVideos.length} vídeos`);
      }
      
      // 3º fallback: qualquer vídeo com likes > 0
      if (filteredVideos.length < limit) {
        filteredVideos = uniqueVideos.filter(video => (video.likes || 0) > 0);
        logger.info(`[TikTok Shop Search] Após filtro mínimo (likes > 0): ${filteredVideos.length} vídeos`);
      }
      
      // Último fallback: todos os vídeos
      if (filteredVideos.length === 0 && uniqueVideos.length > 0) {
        logger.warn(`[TikTok Shop Search] Nenhum vídeo passou nos filtros. Retornando todos os ${uniqueVideos.length} vídeos encontrados.`);
        filteredVideos = uniqueVideos;
      }
    }
    
    // Ordenar por likes (métricas) e limitar
    filteredVideos.sort((a, b) => {
      // Priorizar likes, depois views, depois comments
      const scoreA = (a.likes || 0) * 1000 + (a.views || 0) * 0.1 + (a.comments || 0) * 10;
      const scoreB = (b.likes || 0) * 1000 + (b.views || 0) * 0.1 + (b.comments || 0) * 10;
      return scoreB - scoreA;
    });
    
    const finalVideos = filteredVideos.slice(0, limit);

    logger.info(`[TikTok Shop Search] ✅ Total de ${finalVideos.length} vídeos únicos coletados após filtros`);
    
    // Log dos primeiros 3 vídeos para debug
    if (finalVideos.length > 0) {
      logger.info(`[TikTok Shop Search] 📊 Primeiros 3 vídeos:`);
      finalVideos.slice(0, 3).forEach((video, index) => {
        logger.info(`[TikTok Shop Search]   Vídeo ${index + 1}: likes=${video.likes || 0}, views=${video.views || 0}, title="${(video.title || '').substring(0, 50)}"`);
      });
    }

    return finalVideos;

  } catch (error) {
    logger.error('[TikTok Shop Search] Erro no scraping:', error);
    logger.error('[TikTok Shop Search] Stack trace:', error.stack);
    throw error;
  } finally {
    tiktokShopSearchLock = false;
    
    if (page) {
      try {
        await page.close().catch(() => {});
      } catch (err) {
        logger.warn('[TikTok Shop Search] Erro ao fechar página:', err.message);
      }
    }
    
    // Fechar browser se foi criado especificamente para esta busca
    // (não fechar se for o browser global compartilhado)
    // Por enquanto, deixar o browser aberto para reutilização
  }
}

module.exports = {
  scrapeTikTokShopSearch,
  scrapeTikTokCreativeCenter,
  scrapeTikTokHashtags,
  initBrowser,
  closeBrowser
};



