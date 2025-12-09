/**
 * Scraper do Kalodata
 * Coleta produtos mais vendidos do TikTok Shop através do Kalodata
 * https://www.kalodata.com/product
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');

let browser = null;
let scrapingLock = false;

// Caminho para salvar cookies do Kalodata
const COOKIES_DIR = path.join(__dirname, '../../cookies');
const COOKIES_PATH = path.join(COOKIES_DIR, 'kalodata-cookies.json');

/**
 * Delay aleatório entre requisições
 */
function randomDelay(min = 1000, max = 3000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Garante que o diretório de cookies existe
 */
function ensureCookiesDir() {
  if (!fs.existsSync(COOKIES_DIR)) {
    fs.mkdirSync(COOKIES_DIR, { recursive: true });
  }
}

/**
 * Salva cookies da sessão do Kalodata
 */
async function saveCookies(page) {
  try {
    ensureCookiesDir();
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
    logger.info(`[Kalodata] Cookies salvos em: ${COOKIES_PATH}`);
  } catch (error) {
    logger.warn(`[Kalodata] Erro ao salvar cookies: ${error.message}`);
  }
}

/**
 * Carrega cookies salvos do Kalodata
 */
async function loadCookies(page) {
  try {
    if (fs.existsSync(COOKIES_PATH)) {
      const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
      await page.setCookie(...cookies);
      logger.info(`[Kalodata] Cookies carregados de: ${COOKIES_PATH}`);
      return true;
    }
  } catch (error) {
    logger.warn(`[Kalodata] Erro ao carregar cookies: ${error.message}`);
  }
  return false;
}

/**
 * Verifica se está logado no Kalodata
 */
async function isLoggedIn(page) {
  try {
    const loggedIn = await page.evaluate(() => {
      // Verificar se há elementos que indicam login (ex: menu de usuário, botão de logout)
      const loggedInSelectors = [
        '[class*="user"]',
        '[class*="User"]',
        '[class*="profile"]',
        '[class*="Profile"]',
        'button[class*="logout"]',
        'a[href*="/logout"]',
        '[data-testid*="user"]',
        '[aria-label*="user"]',
        '[aria-label*="profile"]',
        '[class*="avatar"]',
        '[class*="Avatar"]'
      ];
      
      for (const selector of loggedInSelectors) {
        try {
          if (document.querySelector(selector)) {
            return true;
          }
        } catch (e) {
          continue;
        }
      }
      
      // Verificar se há botão de login visível (seletor CSS válido apenas)
      const loginSelectors = [
        'button[class*="login"]',
        'a[href*="/login"]',
        'button[class*="Login"]',
        'a[href*="/Login"]',
        '[data-testid*="login"]',
        '[aria-label*="login"]'
      ];
      
      let hasLoginButton = false;
      for (const selector of loginSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            // Verificar se algum elemento contém texto "Login" ou "Entrar"
            for (const el of elements) {
              const text = (el.textContent || el.innerText || '').toLowerCase();
              if (text.includes('login') || text.includes('entrar') || text.includes('sign in')) {
                hasLoginButton = true;
                break;
              }
            }
            if (hasLoginButton) break;
          }
        } catch (e) {
          continue;
        }
      }
      
      // Se não há botão de login visível, provavelmente está logado
      return !hasLoginButton;
    });
    
    return loggedIn;
  } catch (error) {
    logger.warn(`[Kalodata] Erro ao verificar login: ${error.message}`);
    return false;
  }
}

/**
 * Faz login no Kalodata
 */
async function loginKalodata(page) {
  try {
    logger.info('[Kalodata] 🔐 Iniciando processo de login...');
    logger.info('[Kalodata] ⚠️ O navegador está aberto. Por favor, faça login manualmente se necessário.');
    
    // Tentar carregar cookies salvos primeiro
    const hasCookies = await loadCookies(page);
    if (hasCookies) {
      logger.info('[Kalodata] 📦 Cookies encontrados. Recarregando página...');
      // Recarregar página após carregar cookies
      await page.reload({ waitUntil: 'networkidle2' });
      await randomDelay(3000, 5000);
      
      // Verificar se está logado após carregar cookies
      if (await isLoggedIn(page)) {
        logger.info('[Kalodata] ✅ Login bem-sucedido usando cookies salvos!');
        return true;
      } else {
        logger.warn('[Kalodata] ⚠️ Cookies carregados mas login não detectado. Solicitando login manual...');
      }
    } else {
      logger.info('[Kalodata] 📦 Nenhum cookie salvo encontrado. Login manual necessário.');
    }
    
    // Verificar se já está logado (pode ter feito login manualmente antes)
    const alreadyLoggedIn = await isLoggedIn(page);
    if (alreadyLoggedIn) {
      logger.info('[Kalodata] ✅ Já está logado! Salvando cookies...');
      await saveCookies(page);
      return true;
    }
    
    logger.info('[Kalodata] ⚠️ Login necessário. Aguardando login manual...');
    
    // Tentar login automático se credenciais estiverem configuradas
    const email = process.env.KALODATA_EMAIL;
    const password = process.env.KALODATA_PASSWORD;
    
    if (email && password) {
      logger.info('[Kalodata] Tentando login automático...');
      try {
        // Aguardar campos de login aparecerem
        await page.waitForSelector('input[type="email"], input[type="text"][placeholder*="email"], input[name="email"], input[id*="email"]', { timeout: 10000 });
        
        // Preencher email
        await page.type('input[type="email"], input[type="text"][placeholder*="email"], input[name="email"], input[id*="email"]', email, { delay: 100 });
        await randomDelay(500, 1000);
        
        // Preencher senha
        await page.type('input[type="password"], input[name="password"], input[id*="password"]', password, { delay: 100 });
        await randomDelay(500, 1000);
        
        // Clicar no botão de login
        await page.click('button[type="submit"], button[class*="login"], button:contains("Login"), button:contains("Entrar")');
        await randomDelay(3000, 5000);
        
        // Verificar se login foi bem-sucedido
        if (await isLoggedIn(page)) {
          logger.info('[Kalodata] ✅ Login automático bem-sucedido!');
          await saveCookies(page);
          return true;
        }
      } catch (error) {
        logger.warn(`[Kalodata] Erro no login automático: ${error.message}`);
      }
    }
    
    // Se login automático falhou ou não há credenciais, aguardar login manual
    logger.warn('[Kalodata] ⚠️ Login automático não disponível ou falhou.');
    logger.info('[Kalodata] ⚠️ Por favor, faça login manualmente no navegador...');
    logger.info('[Kalodata] ⚠️ Configure KALODATA_EMAIL e KALODATA_PASSWORD no .env para login automático');
    
    // Aguardar até 2 minutos para login manual
    const maxWaitTime = 120000; // 2 minutos
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      await randomDelay(3000, 5000);
      if (await isLoggedIn(page)) {
        logger.info('[Kalodata] ✅ Login manual detectado!');
        await saveCookies(page);
        return true;
      }
    }
    
    logger.warn('[Kalodata] ⚠️ Timeout aguardando login manual.');
    return false;
  } catch (error) {
    logger.error(`[Kalodata] Erro no processo de login: ${error.message}`);
    return false;
  }
}

/**
 * Inicializa o navegador Puppeteer
 */
async function initBrowser() {
  if (!browser) {
    // Para Kalodata, SEMPRE usar modo headful (visível) para permitir login manual e renderização React
    // O modo headless não renderiza React corretamente no Kalodata
    // Forçar modo visível a menos que explicitamente configurado como headless para Kalodata
    const headlessMode = process.env.KALODATA_HEADLESS === 'true';
    const timeout = parseInt(process.env.PUPPETEER_TIMEOUT || 300000);
    const protocolTimeout = parseInt(process.env.PUPPETEER_PROTOCOL_TIMEOUT || 600000);

    logger.info(`[Kalodata] Inicializando navegador...`);
    logger.info(`[Kalodata] Modo headless=${headlessMode} (false = visível, necessário para login e React)`);
    logger.info(`[Kalodata] ⚠️ Kalodata requer modo visível para renderizar React corretamente`);
    logger.info(`[Kalodata] Timeouts: launch=${timeout}ms, protocol=${protocolTimeout}ms`);

    // Tentar fechar browser anterior se existir
    try {
      if (browser && browser.isConnected && browser.isConnected()) {
        await browser.close().catch(() => {});
      }
      browser = null;
    } catch (e) {
      browser = null;
    }
    
    browser = await puppeteer.launch({
      headless: headlessMode,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
      timeout: timeout,
      protocolTimeout: protocolTimeout
    });
    logger.info(`[Kalodata] Navegador inicializado`);
  }
  return browser;
}

/**
 * Extrai produtos de __NEXT_DATA__ do Kalodata
 * @param {Object} nextData - Dados do __NEXT_DATA__
 * @returns {Array} Lista de produtos
 */
function extractProductsFromNextData(nextData) {
  const products = [];
  
  try {
    // Buscar produtos em diferentes caminhos do __NEXT_DATA__
    const paths = [
      nextData.props?.pageProps?.products,
      nextData.props?.pageProps?.items,
      nextData.props?.pageProps?.data?.products,
      nextData.props?.pageProps?.data?.items,
      nextData.props?.pageProps?.initialState?.products,
      nextData.query?.products,
      nextData.query?.items
    ];
    
    for (const path of paths) {
      if (Array.isArray(path) && path.length > 0) {
        path.forEach((item, index) => {
          try {
            const product = {
              id: item.id || item.productId || `kalodata_next_${index + 1}`,
              title: item.name || item.title || item.productName || 'Produto sem título',
              revenue: item.revenue || item.totalRevenue || null,
              growthRate: item.growthRate || item.growth || null,
              itemsSold: item.itemsSold || item.sold || null,
              avgPrice: item.avgPrice || item.price || null,
              commissionRate: item.commissionRate || null,
              topVideos: item.topVideos || null,
              creators: item.creators || null,
              launchDate: item.launchDate || null,
              conversionRate: item.conversionRate || null,
              imageUrl: item.image || item.imageUrl || null,
              productUrl: item.url || item.productUrl || null,
              rank: item.rank || index + 1
            };
            
            if (product.title && product.title !== 'Produto sem título') {
              products.push(product);
            }
          } catch (e) {
            // Ignorar erros individuais
          }
        });
        
        if (products.length > 0) {
          break; // Se encontrou produtos, parar
        }
      }
    }
  } catch (e) {
    logger.warn(`[Kalodata] Erro ao extrair produtos de __NEXT_DATA__: ${e.message}`);
  }
  
  return products;
}

/**
 * Extrai produtos de uma resposta de API do Kalodata
 * @param {Object} apiData - Dados da API
 * @returns {Array} Lista de produtos
 */
function extractProductsFromApiResponse(apiData, apiUrl = '') {
  const products = [];
  
  try {
    // Log da estrutura para debug (apenas para APIs importantes)
    if (apiUrl.includes('/product/queryList')) {
      logger.debug(`[Kalodata] Estrutura da API /product/queryList:`, {
        keys: Object.keys(apiData),
        hasData: !!apiData.data,
        hasList: !!apiData.list,
        hasItems: !!apiData.items,
        isArray: Array.isArray(apiData)
      });
    }
    
    // Tentar diferentes estruturas de resposta da API
    let productList = null;
    
    if (Array.isArray(apiData)) {
      productList = apiData;
    } else if (apiData.data) {
      // apiData.data pode ser array ou objeto com array dentro
      if (Array.isArray(apiData.data)) {
        productList = apiData.data;
      } else if (apiData.data.list && Array.isArray(apiData.data.list)) {
        productList = apiData.data.list;
      } else if (apiData.data.items && Array.isArray(apiData.data.items)) {
        productList = apiData.data.items;
      } else if (apiData.data.products && Array.isArray(apiData.data.products)) {
        productList = apiData.data.products;
      } else if (apiData.data.data && Array.isArray(apiData.data.data)) {
        productList = apiData.data.data;
      }
    } else if (apiData.list && Array.isArray(apiData.list)) {
      productList = apiData.list;
    } else if (apiData.products && Array.isArray(apiData.products)) {
      productList = apiData.products;
    } else if (apiData.items && Array.isArray(apiData.items)) {
      productList = apiData.items;
    } else if (apiData.result && Array.isArray(apiData.result)) {
      productList = apiData.result;
    } else if (apiData.records && Array.isArray(apiData.records)) {
      productList = apiData.records;
    } else if (apiData.props && apiData.props.pageProps) {
      // Estrutura Next.js
      const pageProps = apiData.props.pageProps;
      if (pageProps.products && Array.isArray(pageProps.products)) {
        productList = pageProps.products;
      } else if (pageProps.items && Array.isArray(pageProps.items)) {
        productList = pageProps.items;
      } else if (pageProps.data && Array.isArray(pageProps.data)) {
        productList = pageProps.data;
      }
    }
    
    if (!productList || productList.length === 0) {
      // Se não encontrou lista, tentar salvar estrutura para debug
      if (apiUrl.includes('/product/queryList')) {
        logger.warn(`[Kalodata] ⚠️ API /product/queryList não retornou lista de produtos. Estrutura:`, JSON.stringify(Object.keys(apiData)).substring(0, 200));
      }
      return products;
    }
    
    logger.info(`[Kalodata] Processando ${productList.length} itens da API...`);
    
    productList.forEach((item, index) => {
      try {
        // Extrair título (tentar múltiplos campos)
        const title = item.name || 
                     item.title || 
                     item.productName || 
                     item.product_name ||
                     item.productNameCn ||
                     item.productNameEn ||
                     item.productTitle ||
                     (item.productInfo && (item.productInfo.name || item.productInfo.title)) ||
                     '';
        
        // Filtrar itens que não são produtos reais (filtros, configurações, etc.)
        if (!title || title.length < 5) {
          return; // Pular itens sem título válido
        }
        
        // Filtrar títulos que são claramente filtros ou configurações
        const filterKeywords = [
          'revenue filters', 'advanced', 'credit/debit card', 'top new products',
          'high potential affiliate', 'sales growth rapidly', 'top video products',
          'filter', 'configuration', 'template', 'payment method', 'membership',
          'feature', 'dialog', 'label', 'contact', 'profile'
        ];
        
        const titleLower = title.toLowerCase();
        if (filterKeywords.some(keyword => titleLower.includes(keyword))) {
          return; // Pular filtros e configurações
        }
        
        // Extrair ID
        const id = item.id || 
                  item.productId || 
                  item.product_id ||
                  item.productIdCn ||
                  (item.productInfo && item.productInfo.id) ||
                  `kalodata_api_${index + 1}`;
        
        // Extrair receita (pode vir em diferentes formatos)
        const revenue = item.revenue || 
                       item.totalRevenue || 
                       item.total_revenue ||
                       item.revenueTotal ||
                       (item.statistics && item.statistics.revenue) ||
                       (item.productInfo && item.productInfo.revenue) ||
                       null;
        
        // Extrair taxa de crescimento
        const growthRate = item.growthRate || 
                          item.growth_rate || 
                          item.growth ||
                          item.revenueGrowth ||
                          (item.statistics && item.statistics.growthRate) ||
                          null;
        
        // Extrair itens vendidos
        const itemsSold = item.itemsSold || 
                         item.items_sold || 
                         item.sold || 
                         item.sales ||
                         item.salesCount ||
                         (item.statistics && item.statistics.itemsSold) ||
                         null;
        
        // Extrair preço médio
        const avgPrice = item.avgPrice || 
                        item.avg_price || 
                        item.price || 
                        item.averagePrice ||
                        item.avgPriceValue ||
                        (item.productInfo && item.productInfo.price) ||
                        null;
        
        // Extrair taxa de comissão
        const commissionRate = item.commissionRate || 
                              item.commission_rate || 
                              item.commission ||
                              item.commissionRateValue ||
                              null;
        
        // Extrair vídeos
        const topVideos = item.topVideos || 
                         item.top_videos || 
                         item.videos ||
                         item.videoCount ||
                         (item.statistics && item.statistics.topVideos) ||
                         null;
        
        // Extrair criadores
        const creators = item.creators || 
                        item.creatorCount || 
                        item.creator_count ||
                        item.creatorNum ||
                        (item.statistics && item.statistics.creators) ||
                        null;
        
        // Extrair data de lançamento
        const launchDate = item.launchDate || 
                          item.launch_date || 
                          item.createdAt || 
                          item.created_at ||
                          item.publishTime ||
                          (item.productInfo && item.productInfo.launchDate) ||
                          null;
        
        // Extrair taxa de conversão
        const conversionRate = item.conversionRate || 
                              item.conversion_rate || 
                              item.conversion ||
                              item.conversionRateValue ||
                              (item.statistics && item.statistics.conversionRate) ||
                              null;
        
        // Extrair imagem
        const imageUrl = item.image || 
                        item.imageUrl || 
                        item.image_url || 
                        item.thumbnail ||
                        item.cover ||
                        item.pic ||
                        (item.productInfo && item.productInfo.image) ||
                        null;
        
        // Extrair URL do produto
        const productUrl = item.url || 
                          item.productUrl || 
                          item.product_url || 
                          item.link ||
                          item.href ||
                          (item.productInfo && item.productInfo.url) ||
                          (id ? `https://www.kalodata.com/product/${id}` : null);
        
        const product = {
          id: id,
          title: title,
          revenue: revenue,
          growthRate: growthRate,
          itemsSold: itemsSold,
          avgPrice: avgPrice,
          commissionRate: commissionRate,
          topVideos: topVideos,
          creators: creators,
          launchDate: launchDate,
          conversionRate: conversionRate,
          imageUrl: imageUrl,
          productUrl: productUrl,
          rank: item.rank || item.position || item.index || index + 1
        };
        
        if (product.title && product.title !== 'Produto sem título' && product.title.length > 3) {
          products.push(product);
        } else {
          logger.debug(`[Kalodata] Produto ${index + 1} descartado: título inválido ou vazio`);
        }
      } catch (e) {
        logger.warn(`[Kalodata] Erro ao processar produto ${index + 1} da API: ${e.message}`);
      }
    });
  } catch (e) {
    logger.warn(`[Kalodata] Erro ao extrair produtos da API: ${e.message}`);
  }
  
  return products;
}

/**
 * Fecha o navegador
 */
async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    logger.info('[Kalodata] Navegador fechado');
  }
}

/**
 * Extrai produtos da página do Kalodata
 * Estrutura esperada: Tabela com colunas:
 * - Nome do produto
 * - Receita
 * - Taxa de crescimento
 * - Itens vendidos
 * - Preço médio
 * - Taxa de comissão
 * - Vídeos com maior receita
 * - Número de criadores
 * - Data de lançamento
 * - Taxa de conversão
 * @param {Object} page - Página do Puppeteer
 * @returns {Promise<Array>} Lista de produtos
 */
async function extractProductsFromPage(page) {
  try {
    // Primeiro, fazer um screenshot ou salvar HTML para debug
    const pageInfo = await page.evaluate(() => {
      const info = {
        url: window.location.href,
        title: document.title,
        tables: document.querySelectorAll('table').length,
        tableRows: [],
        allRows: document.querySelectorAll('tr').length,
        bodyText: document.body.innerText.substring(0, 500)
      };
      
      // Analisar todas as tabelas
      document.querySelectorAll('table').forEach((table, idx) => {
        const rows = table.querySelectorAll('tr');
        const tbodyRows = table.querySelectorAll('tbody tr');
        info.tableRows.push({
          index: idx,
          totalRows: rows.length,
          tbodyRows: tbodyRows.length,
          firstRowCells: rows[0] ? rows[0].querySelectorAll('td, th').length : 0,
          secondRowCells: rows[1] ? rows[1].querySelectorAll('td, th').length : 0
        });
      });
      
      return info;
    });
    
    logger.info(`[Kalodata] Debug - Página: ${pageInfo.url}`);
    logger.info(`[Kalodata] Debug - Tabelas encontradas: ${pageInfo.tables}`);
    logger.info(`[Kalodata] Debug - Total de linhas <tr>: ${pageInfo.allRows}`);
    logger.info(`[Kalodata] Debug - Estrutura das tabelas:`, JSON.stringify(pageInfo.tableRows, null, 2));
    
    const products = await page.evaluate(() => {
      const productList = [];
      
      // Estratégia 1: Buscar todas as tabelas e analisar
      const allTables = document.querySelectorAll('table');
      let productRows = [];
      
      logger.debug(`[Kalodata] Encontradas ${allTables.length} tabelas na página`);
      
      for (const table of allTables) {
        // Tentar encontrar linhas de dados (não cabeçalho)
        const rows = Array.from(table.querySelectorAll('tr'));
        logger.debug(`[Kalodata] Tabela tem ${rows.length} linhas <tr>`);
        
        // Filtrar linhas que parecem ser dados (não cabeçalho)
        const dataRows = rows.filter(row => {
          const cells = row.querySelectorAll('td');
          const thCells = row.querySelectorAll('th');
          // Se tem pelo menos 5 células <td> e não tem <th>, provavelmente é uma linha de dados
          return cells.length >= 5 && thCells.length === 0;
        });
        
        if (dataRows.length > 0) {
          logger.info(`[Kalodata] ✅ Encontrados ${dataRows.length} linhas de dados na tabela`);
          productRows = dataRows;
          break; // Usar a primeira tabela com dados
        }
      }
      
      // Se não encontrou em tabela HTML tradicional, buscar por estrutura React/Virtual DOM
      if (productRows.length === 0) {
        logger.debug('[Kalodata] Tentando encontrar produtos em estrutura React/Virtual DOM...');
        
        // Buscar por elementos que podem ser linhas de produtos (estrutura React comum)
        const reactSelectors = [
          '[class*="TableRow"]',
          '[class*="table-row"]',
          '[class*="ProductRow"]',
          '[class*="product-row"]',
          '[role="row"]',
          'div[class*="row"][class*="product"]',
          'div[class*="item"]'
        ];
        
        for (const selector of reactSelectors) {
          try {
            const elements = document.querySelectorAll(selector);
            if (elements.length >= 5) {
              console.log(`[Kalodata] ✅ Encontrados ${elements.length} elementos usando seletor: ${selector}`);
              productRows = Array.from(elements);
              break;
            }
          } catch (e) {
            continue;
          }
        }
      }
      
      // Estratégia 2: Se não encontrou em tabela, buscar por estrutura de lista/cards
      if (productRows.length === 0) {
        // Buscar por divs que podem conter produtos
        const productContainers = document.querySelectorAll('[class*="product"], [class*="Product"], [class*="item"], [class*="Item"], [data-testid*="product"]');
        if (productContainers.length > 0) {
          console.log(`[Kalodata] Encontrados ${productContainers.length} containers de produto`);
          productRows = Array.from(productContainers);
        }
      }
      
      // Estratégia 3: Buscar todas as linhas <tr> que não são cabeçalho
      if (productRows.length === 0) {
        const allRows = document.querySelectorAll('tr');
        const dataRows = Array.from(allRows).filter(row => {
          const cells = row.querySelectorAll('td');
          const thCells = row.querySelectorAll('th');
          // Se tem células <td> e não tem <th>, provavelmente é uma linha de dados
          return cells.length >= 2 && thCells.length === 0;
        });
        
        if (dataRows.length > 0) {
          console.log(`[Kalodata] Encontrados ${dataRows.length} linhas de dados (sem tabela específica)`);
          productRows = dataRows;
        }
      }
      
      // Estratégia 4: Buscar por divs que podem conter produtos (estrutura de grid/list)
      if (productRows.length === 0) {
        // Buscar divs que podem ser linhas de produtos
        const divRows = document.querySelectorAll('div[class*="row"], div[class*="Row"], div[class*="item"], div[class*="Item"]');
        const potentialRows = Array.from(divRows).filter(div => {
          const text = div.textContent || '';
          // Se tem texto que parece produto (valores monetários, números, etc)
          return text.length > 20 && (
            text.includes('R$') || 
            text.includes('%') || 
            text.match(/\d+[.,]\d+/)
          );
        });
        
        if (potentialRows.length > 0) {
          console.log(`[Kalodata] Encontrados ${potentialRows.length} divs que podem ser produtos`);
          productRows = potentialRows;
        }
      }
      
      // Estratégia 5: Extrair produtos do texto da página (último recurso)
      if (productRows.length === 0) {
        console.log('[Kalodata] Tentando extrair produtos do texto da página...');
        
        // Pegar todo o texto visível da página
        const pageText = document.body.innerText || document.body.textContent || '';
        
        // Procurar padrões que indicam produtos (linhas com valores monetários, porcentagens, etc)
        const lines = pageText.split('\n').map(line => line.trim()).filter(line => line.length > 10);
        
        // Procurar linhas que parecem ser produtos (contêm valores monetários e outros dados)
        const productLines = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Verificar se a linha parece ser um produto
          if (line.length > 20 && (
            (line.includes('R$') && (line.includes('%') || line.includes('mi') || line.includes('mil'))) ||
            (line.match(/R\$\d+[.,]\d+/) && line.match(/\d+[.,]\d+/)) ||
            (line.match(/\d+[.,]\d+\s*mi/) && line.length > 30)
          )) {
            // Tentar pegar linhas anteriores e posteriores que podem conter o nome do produto
            let productName = '';
            let productData = line;
            
            // Procurar nome do produto nas linhas anteriores (até 3 linhas antes)
            for (let j = Math.max(0, i - 3); j < i; j++) {
              const prevLine = lines[j];
              if (prevLine.length > 15 && prevLine.length < 200 && !prevLine.match(/R\$|%|\d+[.,]\d+\s*mi/)) {
                productName = prevLine;
                break;
              }
            }
            
            // Se não encontrou nome, usar a própria linha
            if (!productName) {
              // Extrair nome da linha (parte antes dos valores)
              const nameMatch = line.match(/^(.+?)(?:\s+R\$|\s+\d+[.,]\d+)/);
              productName = nameMatch ? nameMatch[1].trim() : line.substring(0, 100);
            }
            
            // Extrair valores da linha
            const revenueMatch = line.match(/R\$[\d.,]+[km]?/i);
            const growthMatch = line.match(/-?\d+[.,]\d+%/);
            const itemsMatch = line.match(/(\d+[.,]\d+)\s*(mi|mil|k)/i);
            const priceMatch = line.match(/R\$[\d.,]+/g);
            const commissionMatch = line.match(/(\d+)%/g);
            
            if (productName && productName.length > 5) {
              productLines.push({
                name: productName,
                revenue: revenueMatch ? revenueMatch[0] : null,
                growthRate: growthMatch ? growthMatch[0] : null,
                itemsSold: itemsMatch ? itemsMatch[0] : null,
                avgPrice: priceMatch && priceMatch.length > 1 ? priceMatch[1] : (priceMatch ? priceMatch[0] : null),
                commissionRate: commissionMatch && commissionMatch.length > 0 ? commissionMatch[commissionMatch.length - 1] : null,
                rawLine: line
              });
            }
          }
        }
        
        if (productLines.length > 0) {
          console.log(`[Kalodata] Encontrados ${productLines.length} produtos extraídos do texto`);
          // Converter para formato compatível
          productRows = productLines.map((p, idx) => ({
            _isTextExtracted: true,
            _productData: p,
            _index: idx
          }));
        }
      }
      
      console.log(`[Kalodata] Total de linhas para processar: ${productRows.length}`);
      
      productRows.forEach((row, index) => {
        try {
          // Se foi extraído do texto, processar diferente
          if (row._isTextExtracted) {
            const p = row._productData;
            productList.push({
              id: `kalodata_text_${index + 1}`,
              title: p.name,
              revenue: p.revenue,
              growthRate: p.growthRate,
              itemsSold: p.itemsSold,
              avgPrice: p.avgPrice,
              commissionRate: p.commissionRate,
              topVideos: null,
              creators: null,
              launchDate: null,
              conversionRate: null,
              imageUrl: null,
              productUrl: null,
              rank: index + 1,
              _debug: {
                extractedFrom: 'text',
                rawLine: p.rawLine
              }
            });
            return;
          }
          
          const cells = row.querySelectorAll('td');
          
          if (cells.length < 2) {
            return; // Pular se não tem células suficientes
          }
          
          // Log das primeiras 3 linhas para debug
          if (index < 3) {
            console.log(`[Kalodata] Linha ${index + 1} - ${cells.length} células`);
            cells.forEach((cell, idx) => {
              const text = cell.textContent.trim();
              if (text.length > 0) {
                console.log(`[Kalodata]   Célula ${idx}: "${text.substring(0, 80)}"`);
              }
            });
          }
          
          // Extrair informações baseado na estrutura do Kalodata
          // Estrutura real: primeira célula tem rank, segunda célula tem produto (nome, imagem, link)
          // Mas pode variar, então vamos procurar em todas as células
          
          let title = '';
          let rank = index + 1;
          let productUrl = null;
          let imageUrl = null;
          let productId = null;
          
          // Procurar o nome do produto na segunda célula (índice 1) que geralmente contém as informações do produto
          if (cells.length > 1) {
            const productCell = cells[1]; // Segunda célula geralmente tem o produto
            
            // Buscar link do produto (pode estar na primeira ou segunda célula)
            const linkElement = productCell.querySelector('a[href*="shop.tiktok.com"]') || 
                               productCell.querySelector('a[href*="product"]') ||
                               row.querySelector('a[href*="shop.tiktok.com"]') ||
                               row.querySelector('a[href*="product"]');
            
            if (linkElement) {
              productUrl = linkElement.href || linkElement.getAttribute('href') || '';
              // Extrair ID do produto da URL
              const match = productUrl.match(/\/product\/(\d+)/) || 
                          productUrl.match(/\/shop\/.*\/(\d+)/) || 
                          productUrl.match(/(\d{10,})/);
              if (match) {
                productId = match[1];
              }
            }
            
            // Buscar imagem (pode estar na segunda célula)
            const imageElement = productCell.querySelector('[class*="Image"]') ||
                               productCell.querySelector('img') ||
                               productCell.querySelector('[style*="background-image"]') ||
                               row.querySelector('img');
            
            if (imageElement) {
              // Tentar pegar URL da imagem de diferentes formas
              imageUrl = imageElement.src || 
                        imageElement.getAttribute('data-src') || 
                        imageElement.getAttribute('src') ||
                        imageElement.getAttribute('style')?.match(/url\(["']?([^"']+)["']?\)/)?.[1] ||
                        '';
            }
            
            // Extrair título do produto
            // Procurar por div com classe que contenha "line-clamp" ou "font-medium"
            const titleElement = productCell.querySelector('[class*="line-clamp"]') ||
                               productCell.querySelector('[class*="font-medium"]') ||
                               productCell.querySelector('[class*="title"]') ||
                               productCell.querySelector('[class*="name"]') ||
                               productCell.querySelector('div > div');
            
            if (titleElement) {
              title = (titleElement.textContent || titleElement.innerText || '').trim();
            }
            
            // Se não encontrou título específico, usar texto da célula (removendo números de rank)
            if (!title || title.length < 5) {
              const cellText = productCell.textContent.trim();
              // Remover números no início (rank) e preços
              title = cellText.replace(/^\d+\s*/, '').replace(/R\$\d+[.,]\d+.*$/, '').trim();
            }
          }
          
          // Se ainda não tem título, tentar primeira célula (pode ter o rank e nome juntos)
          if (!title || title.length < 5) {
            const firstCell = cells[0];
            const cellText = firstCell.textContent.trim();
            // Remover números no início (rank)
            title = cellText.replace(/^\d+\s*/, '').trim();
          }
          
          // Extrair rank da primeira célula se possível
          if (cells.length > 0) {
            const rankText = cells[0].textContent.trim();
            const rankMatch = rankText.match(/^(\d+)/);
            if (rankMatch) {
              rank = parseInt(rankMatch[1], 10);
            }
          }
          
          
          // Extrair informações das outras colunas
          // Mapear colunas baseado no conteúdo (mais flexível)
          const cellTexts = Array.from(cells).map(cell => {
            // Remover quebras de linha e espaços extras
            return (cell.textContent || cell.innerText || '').trim().replace(/\s+/g, ' ');
          });
          
          // Estrutura real do Kalodata (baseado no HTML fornecido):
          // Coluna 0: Rank (número) + Link TikTok
          // Coluna 1: Informações do produto (nome, imagem, preço, link)
          // Coluna 2: Receita (ex: R$2,41m)
          // Coluna 3: Receita(09/11 ~ 08/12) - gráfico de tendência (canvas/SVG)
          // Coluna 4: Taxa de crescimento da receita (ex: -19.2%)
          // Coluna 5: Itens vendidos (ex: 4,26 mi)
          // Coluna 6: Preço médio por unidade (ex: R$56,51)
          // Coluna 7: Taxa de comissão (ex: 10%)
          // Coluna 8: Vídeos com maior receita (ex: 3,84 mil)
          // Coluna 9: Número de criadores (ex: 3,84 mil)
          // Coluna 10: Data de lançamento (ex: 06/09/2025)
          // Coluna 11: Taxa de conversão do criador (ex: 55.50%)
          
          // Procurar por padrões nas células (mais robusto que mapeamento direto)
          let revenue = null;
          let growthRate = null;
          let itemsSold = null;
          let avgPrice = null;
          let commissionRate = null;
          let topVideos = null;
          let creators = null;
          let launchDate = null;
          let conversionRate = null;
          
          // Procurar por padrões nas células
          for (let i = 0; i < cellTexts.length; i++) {
            const text = cellTexts[i];
            
            // Receita: R$ seguido de número e "m" ou "mi" (ex: R$2,41m)
            if (!revenue && text.match(/R\$\d+[.,]\d+\s*[km]?/i)) {
              revenue = text;
            }
            
            // Taxa de crescimento: número seguido de % (ex: -19.2%)
            if (!growthRate && text.match(/-?\d+[.,]\d+%/)) {
              growthRate = text;
            }
            
            // Itens vendidos: número seguido de "mi" ou "mil" (ex: 4,26 mi)
            if (!itemsSold && text.match(/\d+[.,]\d+\s*(mi|mil|k)/i)) {
              itemsSold = text;
            }
            
            // Preço médio: R$ seguido de número (ex: R$56,51)
            if (!avgPrice && text.match(/R\$\d+[.,]\d+/)) {
              avgPrice = text;
            }
            
            // Taxa de comissão: número seguido de % (geralmente 8%, 10%, 12%)
            if (!commissionRate && text.match(/^\d+%$/)) {
              commissionRate = text;
            }
            
            // Vídeos: número seguido de "mil" (ex: 3,84 mil)
            if (!topVideos && text.match(/\d+[.,]?\d*\s*(mil|k)/i)) {
              topVideos = text;
            }
            
            // Data: formato DD/MM/YYYY (ex: 06/09/2025)
            if (!launchDate && text.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
              launchDate = text;
            }
            
            // Taxa de conversão: número com 2 casas decimais seguido de % (ex: 55.50%)
            if (!conversionRate && text.match(/\d+[.,]\d+%/)) {
              conversionRate = text;
            }
          }
          
          // Se não encontrou por padrões, usar mapeamento direto por posição (fallback)
          // Ajustar índices baseado na estrutura real: coluna 0=rank, coluna 1=produto, coluna 2=receita, etc.
          if (cells.length >= 12) {
            // Estrutura completa com todas as colunas
            revenue = revenue || cellTexts[2] || null; // Coluna 2
            growthRate = growthRate || cellTexts[4] || null; // Coluna 4
            itemsSold = itemsSold || cellTexts[5] || null; // Coluna 5
            avgPrice = avgPrice || cellTexts[6] || null; // Coluna 6
            commissionRate = commissionRate || cellTexts[7] || null; // Coluna 7
            topVideos = topVideos || cellTexts[8] || null; // Coluna 8
            creators = creators || cellTexts[9] || null; // Coluna 9
            launchDate = launchDate || cellTexts[10] || null; // Coluna 10
            conversionRate = conversionRate || cellTexts[11] || null; // Coluna 11
          } else if (cells.length >= 10) {
            // Estrutura com menos colunas (sem gráfico de tendência)
            revenue = revenue || cellTexts[2] || null;
            growthRate = growthRate || cellTexts[3] || null;
            itemsSold = itemsSold || cellTexts[4] || null;
            avgPrice = avgPrice || cellTexts[5] || null;
            commissionRate = commissionRate || cellTexts[6] || null;
            topVideos = topVideos || cellTexts[7] || null;
            creators = creators || cellTexts[8] || null;
            launchDate = launchDate || cellTexts[9] || null;
            conversionRate = conversionRate || cellTexts[9] || null; // Pode estar na mesma coluna
          } else if (cells.length >= 7) {
            // Versão simplificada se tiver menos colunas
            revenue = revenue || cellTexts[2] || null;
            growthRate = growthRate || cellTexts[3] || null;
            itemsSold = itemsSold || cellTexts[4] || null;
            avgPrice = avgPrice || cellTexts[5] || null;
            commissionRate = commissionRate || cellTexts[6] || null;
          }
          
          // Se tem título válido, adicionar à lista
          if (title && title.length > 3 && title !== 'Produto sem título') {
            productList.push({
              id: productId || `kalodata_${rank || index + 1}`,
              title: title,
              revenue: revenue,
              growthRate: growthRate,
              itemsSold: itemsSold,
              avgPrice: avgPrice,
              commissionRate: commissionRate,
              topVideos: topVideos,
              creators: creators,
              launchDate: launchDate,
              conversionRate: conversionRate,
              imageUrl: imageUrl,
              productUrl: productUrl,
              rank: rank || index + 1,
              _debug: {
                totalCells: cells.length,
                cellTexts: cellTexts.slice(0, 12), // Todas as células para debug
                extractedFrom: 'ant-table-dom'
              }
            });
          }
        } catch (error) {
          console.error(`[Kalodata] Erro ao extrair produto ${index}:`, error);
        }
      });
      
      return productList;
    });
    
    logger.info(`[Kalodata] Extraídos ${products.length} produtos da página`);
    
    // Log detalhado do primeiro produto para debug
    if (products.length > 0) {
      logger.info(`[Kalodata] Exemplo de produto extraído:`, {
        title: products[0].title,
        revenue: products[0].revenue,
        itemsSold: products[0].itemsSold,
        avgPrice: products[0].avgPrice,
        debug: products[0]._debug
      });
    } else {
      // Se não encontrou produtos, salvar HTML para análise
      logger.warn(`[Kalodata] Nenhum produto encontrado. Salvando HTML para análise...`);
      try {
        const html = await page.content();
        const fs = require('fs');
        const path = require('path');
        const debugDir = path.join(__dirname, '../../logs');
        if (!fs.existsSync(debugDir)) {
          fs.mkdirSync(debugDir, { recursive: true });
        }
        const debugFile = path.join(debugDir, `kalodata_debug_${Date.now()}.html`);
        fs.writeFileSync(debugFile, html, 'utf-8');
        logger.info(`[Kalodata] HTML salvo em: ${debugFile}`);
      } catch (e) {
        logger.warn(`[Kalodata] Erro ao salvar HTML: ${e.message}`);
      }
    }
    
    return products;
  } catch (error) {
    logger.error(`[Kalodata] Erro ao extrair produtos: ${error.message}`);
    return [];
  }
}

/**
 * Scraping de produtos mais vendidos do Kalodata
 * @param {Object} params - Parâmetros de busca
 * @param {string} params.category - Categoria (opcional)
 * @param {string} params.country - País (ex: 'BR', 'US')
 * @param {number} params.limit - Limite de produtos (padrão: 20)
 * @returns {Promise<Array>} Lista de produtos mais vendidos
 */
async function scrapeKalodataTopProducts({ category = null, country = 'BR', limit = 20 }) {
  // Lock para evitar requisições simultâneas
  if (scrapingLock) {
    logger.warn('[Kalodata] Scraping já em andamento, aguardando...');
    let waitTime = 0;
    const maxWaitTime = 300000; // 5 minutos
    while (scrapingLock && waitTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      waitTime += 2000;
      if (waitTime % 30000 === 0) {
        logger.info(`[Kalodata] Aguardando scraping anterior finalizar... (${Math.floor(waitTime/1000)}s/${maxWaitTime/1000}s)`);
      }
    }
    if (scrapingLock) {
      throw new Error(`Timeout aguardando scraping anterior finalizar (aguardou ${Math.floor(waitTime/1000)}s)`);
    }
  }
  
  scrapingLock = true;
  const lockStartTime = Date.now();
  
  logger.info(`[Kalodata] ==========================================`);
  logger.info(`[Kalodata] 🛍️ INICIANDO SCRAPING - PRODUTOS MAIS VENDIDOS`);
  logger.info(`[Kalodata] 📍 País: ${country}, Categoria: ${category || 'Todas'}`);
  logger.info(`[Kalodata] 📊 Objetivo: Coletar ${limit} produtos`);
  logger.info(`[Kalodata] 🌐 URL: https://www.kalodata.com/product`);
  logger.info(`[Kalodata] ==========================================`);

  let page = null;
  
  try {
    browser = await initBrowser();
    page = await browser.newPage();
    
    // Configurar user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Interceptar requisições de API para capturar dados de produtos
    const apiResponses = [];
    page.on('response', async (response) => {
      try {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';
        
        // Interceptar TODAS as APIs do Kalodata que retornam JSON
        if (url.includes('kalodata.com') && (
          url.includes('/api/') || 
          url.includes('/product') ||
          url.includes('product/list') ||
          url.includes('product/rank') ||
          url.includes('rank') ||
          url.includes('list') ||
          contentType.includes('application/json')
        )) {
          try {
            const json = await response.json().catch(() => null);
            if (json) {
              // Log todas as respostas para debug
              logger.info(`[Kalodata] 🔍 API interceptada: ${url.substring(0, 150)}`);
              
              // Verificar se tem dados de produtos
              const hasProducts = json.data || json.list || json.products || json.items || 
                                 json.result || Array.isArray(json) ||
                                 (json.props && json.props.pageProps);
              
              if (hasProducts) {
                apiResponses.push({ url, data: json });
                logger.info(`[Kalodata] ✅ Resposta da API com produtos: ${url.substring(0, 100)}`);
              } else {
                // Log estrutura para debug
                logger.debug(`[Kalodata] Estrutura da API: ${JSON.stringify(Object.keys(json)).substring(0, 200)}`);
              }
            }
          } catch (e) {
            // Não é JSON, ignorar
          }
        }
      } catch (e) {
        // Ignorar erros de interceptação
      }
    });
    
    // URL do Kalodata - página de produtos
    const url = 'https://www.kalodata.com/product';
    
    logger.info(`[Kalodata] Acessando Kalodata: ${url}`);
    
    await retry(async () => {
      await page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: 180000 // 3 minutos para passar pelo Cloudflare
      });
    }, { maxRetries: 2 });
    
    // Aguardar desafio do Cloudflare passar (se houver)
    logger.info(`[Kalodata] Verificando se há desafio do Cloudflare...`);
    try {
      await page.waitForFunction(() => {
        // Verificar se ainda está na página de desafio do Cloudflare
        const isCloudflareChallenge = document.title.includes('Just a moment') ||
                                     document.body.innerText.includes('Verify you are human') ||
                                     document.body.innerText.includes('Checking your browser');
        return !isCloudflareChallenge;
      }, { timeout: 120000 }); // Aguardar até 2 minutos para passar pelo Cloudflare
      logger.info(`[Kalodata] ✅ Desafio do Cloudflare resolvido ou não presente`);
    } catch (e) {
      logger.warn(`[Kalodata] ⚠️ Timeout aguardando Cloudflare. Continuando mesmo assim...`);
      logger.warn(`[Kalodata] ⚠️ Se estiver bloqueado, configure HEADLESS=false no .env para resolver manualmente`);
    }
    
    await randomDelay(5000, 7000);
    
    // SEMPRE solicitar login antes de coletar produtos
    // Mesmo que cookies existam, precisamos garantir que está realmente logado
    logger.info(`[Kalodata] 🔐 Verificando login e solicitando autenticação...`);
    logger.info(`[Kalodata] ⚠️ IMPORTANTE: Faça login manualmente no navegador se necessário`);
    
    const loginSuccess = await loginKalodata(page);
    
    if (!loginSuccess) {
      logger.error(`[Kalodata] ❌ Login não foi concluído!`);
      logger.error(`[Kalodata] ⚠️ Por favor, faça login manualmente no navegador e tente novamente`);
      logger.error(`[Kalodata] ⚠️ Ou configure KALODATA_EMAIL e KALODATA_PASSWORD no .env para login automático`);
      throw new Error('Login no Kalodata não foi concluído. É necessário estar logado para coletar produtos.');
    }
    
    // Recarregar página após login bem-sucedido para garantir que produtos aparecem
    logger.info(`[Kalodata] ✅ Login confirmado! Recarregando página de produtos...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
    await randomDelay(5000, 8000);
    
    // Verificar novamente se está logado após recarregar
    const stillLoggedIn = await isLoggedIn(page);
    if (!stillLoggedIn) {
      logger.warn(`[Kalodata] ⚠️ Login pode ter sido perdido após recarregar. Tentando novamente...`);
      const retryLogin = await loginKalodata(page);
      if (!retryLogin) {
        throw new Error('Login perdido após recarregar página. Por favor, faça login manualmente.');
      }
    }
    
    logger.info(`[Kalodata] ✅ Página carregada com sucesso`);
    
    // Aguardar mais tempo para conteúdo JavaScript carregar (versão gratuita pode ser mais lenta)
    logger.info(`[Kalodata] Aguardando tabela de produtos aparecer...`);
    
    // Aguardar especificamente pela tabela de produtos aparecer
    // A versão gratuita mostra TOP 10 produtos em uma tabela
    logger.info(`[Kalodata] Aguardando conteúdo da página carregar...`);
    
    // Primeiro, aguardar que o body tenha conteúdo
    try {
      await page.waitForFunction(() => {
        const bodyText = document.body.innerText || document.body.textContent || '';
        return bodyText.length > 500; // Pelo menos 500 caracteres de texto
      }, { timeout: 30000 });
      logger.info('[Kalodata] ✅ Conteúdo básico da página carregado');
    } catch (e) {
      logger.warn('[Kalodata] ⚠️ Timeout aguardando conteúdo básico. Continuando...');
    }
    
    // Fazer scroll para garantir que conteúdo lazy-load seja carregado
    logger.info(`[Kalodata] Fazendo scroll para carregar conteúdo...`);
    await page.evaluate(async () => {
      await new Promise(resolve => {
        let totalHeight = 0;
        const distance = 500;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          
          if (totalHeight >= scrollHeight || totalHeight >= 5000) {
            clearInterval(timer);
            resolve();
          }
        }, 200);
      });
    });
    await randomDelay(3000, 5000);
    
    // Aguardar especificamente pela tabela de produtos aparecer
    logger.info(`[Kalodata] Aguardando tabela com TOP 10 produtos aparecer...`);
    try {
      await page.waitForFunction(() => {
        // Verificar se há texto "Informações do produto" ou "Receita" na página (cabeçalhos da tabela)
        const bodyText = document.body.innerText || document.body.textContent || '';
        
        // Verificar se há conteúdo suficiente
        if (bodyText.length < 1000) {
          return false;
        }
        
        const hasTableHeaders = bodyText.includes('Informações do produto') || 
                               bodyText.includes('Receita') ||
                               bodyText.includes('Taxa de crescimento') ||
                               bodyText.includes('Itens vendidos');
        
        if (!hasTableHeaders) {
          // Verificar se há números de produtos visíveis mesmo sem cabeçalhos
          const hasProductData = bodyText.match(/R\$\d+[.,]\d+\s*[km]?/i) && 
                                bodyText.match(/\d+[.,]\d+\s*mi/i);
          if (hasProductData) {
            console.log(`[Kalodata] ✅ Encontrados dados de produtos no texto (sem cabeçalhos)`);
            return true;
          }
          return false;
        }
        
        // Verificar se há uma tabela na página
        const tables = document.querySelectorAll('table');
        if (tables.length > 0) {
          // Verificar se a tabela tem linhas de dados
          for (const table of tables) {
            const rows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
            if (rows.length >= 3) { // Pelo menos 3 linhas (TOP 10)
              // Verificar se as linhas têm células suficientes (indicando dados de produtos)
              const firstRow = rows[0];
              const cells = firstRow.querySelectorAll('td');
              if (cells.length >= 5) {
                console.log(`[Kalodata] ✅ Tabela encontrada com ${rows.length} linhas e ${cells.length} células por linha`);
                return true; // Tabela com dados encontrada
              }
            }
          }
        }
        
        // Se não encontrou tabela HTML tradicional, verificar se há elementos que parecem ser produtos
        // (estrutura React/Virtual DOM)
        const productElements = document.querySelectorAll('[class*="row"], [class*="Row"], [role="row"], div[class*="product"]');
        if (productElements.length >= 3) {
          console.log(`[Kalodata] ✅ Encontrados ${productElements.length} elementos que podem ser produtos`);
          return true;
        }
        
        // Verificar se há números de produtos visíveis (ex: "R$2,41m", "4,26 mi")
        const hasProductData = bodyText.match(/R\$\d+[.,]\d+\s*[km]?/i) && 
                              bodyText.match(/\d+[.,]\d+\s*mi/i);
        
        return hasProductData && bodyText.length > 2000; // Texto suficiente indica que produtos carregaram
      }, { timeout: 60000 }); // 60 segundos para versão gratuita carregar
      logger.info('[Kalodata] ✅ Tabela de produtos detectada!');
    } catch (e) {
      logger.warn('[Kalodata] ⚠️ Timeout aguardando tabela aparecer. Verificando conteúdo atual...');
      
      // Verificar o que está na página agora
      const pageContent = await page.evaluate(() => {
        const bodyText = document.body.innerText || document.body.textContent || '';
        return {
          title: document.title,
          bodyText: bodyText.substring(0, 1000),
          bodyTextLength: bodyText.length,
          tables: document.querySelectorAll('table').length,
          hasCloudflare: bodyText.includes('Verify you are human') || 
                        bodyText.includes('Just a moment'),
          hasProductKeywords: bodyText.includes('Receita') || 
                             bodyText.includes('R$') || 
                             bodyText.includes('mi') ||
                             bodyText.includes('Produto')
        };
      });
      
      logger.info(`[Kalodata] Estado da página:`, {
        title: pageContent.title,
        bodyTextLength: pageContent.bodyTextLength,
        tables: pageContent.tables,
        hasCloudflare: pageContent.hasCloudflare,
        hasProductKeywords: pageContent.hasProductKeywords,
        bodyTextPreview: pageContent.bodyText.substring(0, 200)
      });
      
      if (pageContent.hasCloudflare) {
        logger.error(`[Kalodata] ❌ Página ainda está bloqueada pelo Cloudflare!`);
        logger.error(`[Kalodata] ⚠️ Configure HEADLESS=false no .env e faça login manualmente`);
        throw new Error('Página bloqueada pelo Cloudflare. Configure HEADLESS=false para resolver manualmente.');
      }
      
      if (pageContent.bodyTextLength < 500) {
        logger.error(`[Kalodata] ❌ Página não carregou conteúdo suficiente (apenas ${pageContent.bodyTextLength} caracteres)`);
        logger.error(`[Kalodata] ⚠️ A página pode estar em modo headless e não renderizar React corretamente`);
        logger.error(`[Kalodata] ⚠️ Configure HEADLESS=false no .env para visualizar o navegador`);
      }
    }
    
    // Aguardar um pouco mais para garantir que tudo carregou completamente
    await randomDelay(5000, 8000);
    
    // Aguardar produtos carregarem - tentar múltiplos seletores com mais tempo
    let productsFound = false;
    const selectorsToTry = [
      'table.ant-table tbody tr.ant-table-row',
      'table.ant-table tbody tr[data-row-key]',
      'tbody tr.ant-table-row',
      'tbody tr[data-row-key]',
      'table tbody tr',
      'table tr',
      '[class*="ant-table"] tbody tr',
      '[class*="table"] tbody tr',
      '[class*="Table"] tbody tr',
      '[class*="product"]',
      '[class*="Product"]',
      '[data-testid*="product"]',
      'tr[class*="row"]',
      '[class*="list"] [class*="item"]',
      '[class*="List"] [class*="Item"]',
      'div[class*="row"]',
      '[role="row"]',
      '[role="gridcell"]'
    ];
    
    for (const selector of selectorsToTry) {
      try {
        await page.waitForSelector(selector, { 
          timeout: 10000,
          visible: false 
        });
        const count = await page.evaluate((sel) => {
          try {
            return document.querySelectorAll(sel).length;
          } catch (e) {
            return 0;
          }
        }, selector);
        if (count > 0) {
          logger.info(`[Kalodata] ✅ Encontrados ${count} elementos usando seletor: ${selector}`);
          productsFound = true;
          break;
        }
      } catch (e) {
        // Continuar tentando outros seletores
        continue;
      }
    }
    
    if (!productsFound) {
      logger.warn('[Kalodata] ⚠️ Nenhum seletor específico encontrou produtos. Tentando estratégia alternativa...');
      
      // Tentar aguardar qualquer conteúdo aparecer na página
      try {
        await page.waitForFunction(() => {
          const bodyText = document.body.innerText || '';
          // Verificar se há texto que parece ser de produtos (números, valores monetários, etc)
          return bodyText.length > 1000 && (
            bodyText.includes('R$') || 
            bodyText.includes('%') || 
            bodyText.includes('mi') ||
            bodyText.includes('mil')
          );
        }, { timeout: 20000 });
        logger.info('[Kalodata] ✅ Conteúdo de produtos detectado na página');
        productsFound = true;
      } catch (e) {
        logger.warn('[Kalodata] ⚠️ Timeout aguardando conteúdo de produtos aparecer');
      }
    }
    
    // Fazer scroll para carregar mais produtos se necessário
    logger.info(`[Kalodata] Fazendo scroll para carregar mais produtos...`);
    for (let i = 0; i < 15; i++) {
      await page.evaluate(() => {
        window.scrollBy(0, 800);
      });
      await randomDelay(2000, 3000);
      
      // A cada 5 scrolls, ir até o final da página
      if (i % 5 === 0) {
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await randomDelay(3000, 4000);
      }
      
      // Verificar se apareceu conteúdo novo
      const hasNewContent = await page.evaluate(() => {
        const tables = document.querySelectorAll('table');
        const rows = document.querySelectorAll('tr');
        return tables.length > 0 || rows.length > 0;
      });
      
      if (hasNewContent && i > 5) {
        logger.info(`[Kalodata] Conteúdo detectado após scroll ${i + 1}`);
        break;
      }
    }
    
    // Aguardar um pouco mais para garantir que tudo carregou
    await randomDelay(5000, 7000);
    
    // Aguardar mais tempo para APIs carregarem após login
    // Após login manual, as APIs podem demorar mais para serem chamadas
    logger.info(`[Kalodata] Aguardando APIs carregarem produtos após login...`);
    logger.info(`[Kalodata] ⏳ Aguardando até 20 segundos para garantir que todas as APIs sejam interceptadas...`);
    await randomDelay(15000, 20000);
    
    // Tentar extrair produtos das respostas de API interceptadas primeiro
    let products = [];
    if (apiResponses.length > 0) {
      logger.info(`[Kalodata] ✅ Tentando extrair produtos de ${apiResponses.length} respostas de API interceptadas...`);
      logger.info(`[Kalodata] 📋 APIs interceptadas:`, apiResponses.map(r => r.url.substring(0, 80)).join(', '));
      // Priorizar APIs que contêm produtos principais
      const queryListApi = apiResponses.find(r => r.url.includes('/product/queryList'));
      const productTopsApi = apiResponses.find(r => r.url.includes('/overview/rank/queryProductTops'));
      const otherApis = apiResponses.filter(r => 
        !r.url.includes('/product/queryList') && 
        !r.url.includes('/overview/rank/queryProductTops')
      );
      
      // Processar primeiro a API principal /product/queryList
      if (queryListApi) {
        try {
          logger.info(`[Kalodata] 🎯 Processando API principal: ${queryListApi.url.substring(0, 100)}`);
          const apiProducts = extractProductsFromApiResponse(queryListApi.data, queryListApi.url);
          if (apiProducts.length > 0) {
            logger.info(`[Kalodata] ✅ Extraídos ${apiProducts.length} produtos da API principal /product/queryList`);
            products = products.concat(apiProducts);
          } else {
            logger.warn(`[Kalodata] ⚠️ API /product/queryList não retornou produtos. Salvando estrutura para debug...`);
            // Salvar estrutura para debug
            try {
              const fs = require('fs');
              const path = require('path');
              const debugDir = path.join(__dirname, '../../logs');
              if (!fs.existsSync(debugDir)) {
                fs.mkdirSync(debugDir, { recursive: true });
              }
              const debugFile = path.join(debugDir, `kalodata_querylist_${Date.now()}.json`);
              fs.writeFileSync(debugFile, JSON.stringify(queryListApi.data, null, 2), 'utf-8');
              logger.info(`[Kalodata] Estrutura da API salva em: ${debugFile}`);
            } catch (e) {
              // Ignorar erro ao salvar
            }
          }
        } catch (e) {
          logger.warn(`[Kalodata] Erro ao extrair produtos da API principal: ${e.message}`);
        }
      }
      
      // Processar também a API /overview/rank/queryProductTops (pode conter TOP produtos)
      if (productTopsApi && products.length === 0) {
        try {
          logger.info(`[Kalodata] 🎯 Processando API alternativa: ${productTopsApi.url.substring(0, 100)}`);
          const apiProducts = extractProductsFromApiResponse(productTopsApi.data, productTopsApi.url);
          if (apiProducts.length > 0) {
            logger.info(`[Kalodata] ✅ Extraídos ${apiProducts.length} produtos da API /overview/rank/queryProductTops`);
            products = products.concat(apiProducts);
          }
        } catch (e) {
          logger.warn(`[Kalodata] Erro ao extrair produtos da API alternativa: ${e.message}`);
        }
      }
      
      // NÃO processar outras APIs - apenas APIs específicas de produtos
      // Ignorar filtros, configurações, pagamentos, etc.
      logger.info(`[Kalodata] ⚠️ Ignorando ${otherApis.length} APIs que não são de produtos (filtros, configurações, etc.)`);
    } else {
      logger.warn(`[Kalodata] ⚠️ Nenhuma API foi interceptada. Verificando se há requisições pendentes...`);
      // Aguardar mais um pouco e verificar novamente
      await randomDelay(5000, 8000);
      
      // Salvar informações de debug sobre APIs interceptadas
      if (apiResponses.length === 0) {
        logger.warn(`[Kalodata] ⚠️ Nenhuma API com produtos foi interceptada. Isso pode indicar que:`);
        logger.warn(`[Kalodata]   1. A página não carregou completamente`);
        logger.warn(`[Kalodata]   2. As APIs usam autenticação especial`);
        logger.warn(`[Kalodata]   3. Os produtos são carregados via WebSocket ou outra tecnologia`);
        logger.warn(`[Kalodata]   4. A versão gratuita tem limitações que bloqueiam o acesso`);
      }
    }
    
    // Se ainda não encontrou produtos, salvar respostas de API para análise
    if (products.length === 0 && apiResponses.length > 0) {
      logger.warn(`[Kalodata] ⚠️ APIs interceptadas mas nenhum produto extraído. Salvando respostas para análise...`);
      try {
        const fs = require('fs');
        const path = require('path');
        const debugDir = path.join(__dirname, '../../logs');
        if (!fs.existsSync(debugDir)) {
          fs.mkdirSync(debugDir, { recursive: true });
        }
        const debugFile = path.join(debugDir, `kalodata_api_responses_${Date.now()}.json`);
        fs.writeFileSync(debugFile, JSON.stringify(apiResponses, null, 2), 'utf-8');
        logger.info(`[Kalodata] Respostas de API salvas em: ${debugFile}`);
      } catch (e) {
        logger.warn(`[Kalodata] Erro ao salvar respostas de API: ${e.message}`);
      }
    }
    
    // Tentar extrair de __NEXT_DATA__ também
    if (products.length === 0) {
      try {
        logger.info(`[Kalodata] Tentando extrair produtos de __NEXT_DATA__...`);
        const nextData = await page.evaluate(() => {
          const script = document.querySelector('#__NEXT_DATA__');
          if (script) {
            return JSON.parse(script.textContent);
          }
          return null;
        });
        
        if (nextData) {
          logger.info(`[Kalodata] ✅ Encontrado __NEXT_DATA__, tentando extrair produtos...`);
          const nextDataProducts = extractProductsFromNextData(nextData);
          if (nextDataProducts.length > 0) {
            logger.info(`[Kalodata] ✅ Extraídos ${nextDataProducts.length} produtos de __NEXT_DATA__`);
            products = products.concat(nextDataProducts);
          }
        }
      } catch (e) {
        logger.warn(`[Kalodata] Erro ao extrair __NEXT_DATA__: ${e.message}`);
      }
    }
    
    // SEMPRE tentar extrair da página HTML primeiro (mais confiável)
    // A tabela HTML contém os produtos reais que o usuário vê
    logger.info(`[Kalodata] 🎯 Extraindo produtos diretamente da tabela HTML...`);
    const domProducts = await extractProductsFromPage(page);
    
    if (domProducts.length > 0) {
      logger.info(`[Kalodata] ✅ Extraídos ${domProducts.length} produtos da tabela HTML`);
      // Usar produtos do DOM (mais confiáveis) e adicionar dados da API se disponível
      products = domProducts;
    } else if (products.length === 0) {
      logger.warn(`[Kalodata] ⚠️ Nenhum produto encontrado na tabela HTML nem na API`);
    } else {
      logger.info(`[Kalodata] Usando ${products.length} produtos da API (DOM não retornou produtos)`);
    }
    
    // Se não encontrou produtos, tentar diferentes seletores
    if (products.length === 0) {
      logger.warn('[Kalodata] Nenhum produto encontrado com seletores padrão. Tentando seletores alternativos...');
      
      // Tentar extrair de qualquer estrutura de lista/tabela
      products = await page.evaluate(() => {
        const allProducts = [];
        
        // Buscar todas as linhas de tabela
        const rows = document.querySelectorAll('table tbody tr, tr[class*="row"]');
        rows.forEach((row, index) => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            const title = cells[0]?.textContent?.trim() || cells[1]?.textContent?.trim() || '';
            const price = cells[2]?.textContent?.trim() || cells[3]?.textContent?.trim() || '';
            if (title) {
              allProducts.push({
                id: `kalodata_row_${index}`,
                title: title,
                price: price || null,
                imageUrl: null,
                productUrl: null,
                sales: null,
                rating: null,
                rank: index + 1
              });
            }
          }
        });
        
        return allProducts;
      });
      
      logger.info(`[Kalodata] Encontrados ${products.length} produtos usando seletores alternativos`);
    }
    
    // Limitar ao número solicitado
    if (products.length > limit) {
      products = products.slice(0, limit);
    }
    
    logger.info(`[Kalodata] ✅ Coletados ${products.length} produtos mais vendidos`);
    
    return products.map((product) => ({
      id: product.id,
      title: product.title,
      revenue: product.revenue,
      growthRate: product.growthRate,
      itemsSold: product.itemsSold,
      avgPrice: product.avgPrice,
      commissionRate: product.commissionRate,
      topVideos: product.topVideos,
      creators: product.creators,
      launchDate: product.launchDate,
      conversionRate: product.conversionRate,
      imageUrl: product.imageUrl,
      productUrl: product.productUrl,
      rank: product.rank,
      source: 'kalodata',
      collectedAt: new Date().toISOString()
    }));

  } catch (error) {
    const errorMessage = error.message || (typeof error === 'string' ? error : JSON.stringify(error));
    logger.error(`[Kalodata] Erro no scraping: ${errorMessage}`);
    return [];
  } finally {
    // Liberar lock sempre, mesmo em caso de erro
    const lockDuration = Date.now() - (lockStartTime || Date.now());
    logger.info(`[Kalodata] 🔓 Liberando lock após ${Math.floor(lockDuration/1000)}s`);
    scrapingLock = false;
    
    // Fechar página
    try {
      if (page && !page.isClosed()) {
        await page.close().catch(() => {});
      }
    } catch (e) {
      logger.warn(`[Kalodata] Erro ao fechar page: ${e.message}`);
    }
  }
}

module.exports = {
  scrapeKalodataTopProducts,
  closeBrowser
};

