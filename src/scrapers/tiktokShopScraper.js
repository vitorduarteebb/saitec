/**
 * Scraper do TikTok Shop
 * Coleta produtos mais vendidos do TikTok Shop
 */

const puppeteer = require('puppeteer');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');

let browser = null;
let scrapingLock = false;

/**
 * Delay aleatório entre requisições
 */
function randomDelay(min = 1000, max = 3000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Inicializa o navegador Puppeteer
 */
async function initBrowser() {
  if (!browser) {
    const headlessMode = process.env.HEADLESS === 'true';
    const timeout = parseInt(process.env.PUPPETEER_TIMEOUT || 300000);
    const protocolTimeout = parseInt(process.env.PUPPETEER_PROTOCOL_TIMEOUT || 600000);

    logger.info(`[TikTok Shop] Inicializando navegador...`);
    logger.info(`[TikTok Shop] Modo headless=${headlessMode}, Timeouts: launch=${timeout}ms, protocol=${protocolTimeout}ms`);

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
    logger.info(`[TikTok Shop] Navegador inicializado`);
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
    logger.info('[TikTok Shop] Navegador fechado');
  }
}

/**
 * Extrai produtos de uma resposta de API do TikTok Shop
 * @param {Object} apiData - Dados da API
 * @returns {Array} Lista de produtos
 */
function extractProductsFromApiResponse(apiData) {
  const products = [];
  
  try {
    // Tentar diferentes estruturas de resposta da API
    let productList = null;
    
    if (Array.isArray(apiData)) {
      productList = apiData;
    } else if (apiData.data && Array.isArray(apiData.data)) {
      productList = apiData.data;
    } else if (apiData.items && Array.isArray(apiData.items)) {
      productList = apiData.items;
    } else if (apiData.products && Array.isArray(apiData.products)) {
      productList = apiData.products;
    } else if (apiData.list && Array.isArray(apiData.list)) {
      productList = apiData.list;
    } else if (apiData.result && Array.isArray(apiData.result)) {
      productList = apiData.result;
    } else if (apiData.props && apiData.props.pageProps) {
      // Estrutura Next.js
      const pageProps = apiData.props.pageProps;
      if (pageProps.products && Array.isArray(pageProps.products)) {
        productList = pageProps.products;
      } else if (pageProps.items && Array.isArray(pageProps.items)) {
        productList = pageProps.items;
      }
    }
    
    if (!productList || productList.length === 0) {
      return products;
    }
    
    productList.forEach((item, index) => {
      try {
        const product = {
          id: item.id || item.productId || item.product_id || item.itemId || `tiktok_shop_api_${index + 1}`,
          title: item.name || item.title || item.productName || item.product_name || item.itemName || 'Produto sem título',
          price: item.price || item.priceText || item.price_text || item.amount || null,
          imageUrl: item.image || item.imageUrl || item.image_url || item.thumbnail || item.cover || null,
          productUrl: item.url || item.productUrl || item.product_url || item.link || item.href || null,
          sales: item.sales || item.sold || item.salesCount || null,
          rating: item.rating || item.starRating || item.stars || null,
          rank: item.rank || item.position || index + 1
        };
        
        if (product.title && product.title !== 'Produto sem título') {
          products.push(product);
        }
      } catch (e) {
        logger.warn(`[TikTok Shop] Erro ao processar produto da API: ${e.message}`);
      }
    });
  } catch (e) {
    logger.warn(`[TikTok Shop] Erro ao extrair produtos da API: ${e.message}`);
  }
  
  return products;
}

/**
 * Extrai produtos de __NEXT_DATA__ do TikTok Shop
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
      nextData.query?.products,
      nextData.query?.items
    ];
    
    for (const path of paths) {
      if (Array.isArray(path) && path.length > 0) {
        path.forEach((item, index) => {
          try {
            const product = {
              id: item.id || item.productId || `tiktok_shop_next_${index + 1}`,
              title: item.name || item.title || 'Produto sem título',
              price: item.price || item.priceText || null,
              imageUrl: item.image || item.imageUrl || item.thumbnail || null,
              productUrl: item.url || item.productUrl || item.link || null,
              sales: item.sales || item.sold || null,
              rating: item.rating || null,
              rank: index + 1
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
    logger.warn(`[TikTok Shop] Erro ao extrair produtos de __NEXT_DATA__: ${e.message}`);
  }
  
  return products;
}

/**
 * Extrai produtos da página do TikTok Shop
 * @param {Object} page - Página do Puppeteer
 * @returns {Promise<Array>} Lista de produtos
 */
async function extractProductsFromPage(page) {
  try {
    const products = await page.evaluate(() => {
      const productList = [];
      
      // Seletores possíveis para produtos do TikTok Shop (mais abrangentes)
      const productSelectors = [
        '[data-e2e="product-item"]',
        '[data-e2e="product-card"]',
        '[class*="ProductItem"]',
        '[class*="product-item"]',
        '[class*="ProductCard"]',
        '[class*="product-card"]',
        '[class*="Product"]',
        '[class*="product"]',
        'div[class*="product"]',
        'a[href*="/product/"]',
        'a[href*="/shop/product/"]',
        '[data-testid*="product"]',
        '[role="listitem"]',
        '[class*="item"]',
        '[class*="Item"]'
      ];
      
      // Tentar encontrar produtos usando múltiplos seletores
      let productElements = [];
      for (const selector of productSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            productElements = Array.from(elements);
            console.log(`[TikTok Shop] Encontrados ${elements.length} elementos usando seletor: ${selector}`);
            break;
          }
        } catch (e) {
          // Seletor inválido, continuar
          continue;
        }
      }
      
      // Se não encontrou com seletores específicos, tentar buscar por estrutura comum
      if (productElements.length === 0) {
        // Buscar por links que contenham /product/ ou /shop/
        const links = Array.from(document.querySelectorAll('a[href*="/product/"], a[href*="/shop/"]'));
        if (links.length > 0) {
          productElements = links.map(link => {
            // Buscar container pai que pode conter informações do produto
            let container = link.closest('div[class*="item"]') || 
                           link.closest('div[class*="card"]') ||
                           link.closest('div[class*="product"]') ||
                           link.parentElement;
            return container || link;
          }).filter(Boolean);
          console.log(`[TikTok Shop] Encontrados ${productElements.length} produtos via links`);
        }
      }
      
      // Estratégia adicional: buscar por imagens que podem ser de produtos
      if (productElements.length === 0) {
        const images = Array.from(document.querySelectorAll('img[src*="product"], img[src*="shop"]'));
        if (images.length > 0) {
          productElements = images.map(img => {
            return img.closest('div') || img.closest('a') || img.parentElement;
          }).filter(Boolean);
          console.log(`[TikTok Shop] Encontrados ${productElements.length} produtos via imagens`);
        }
      }
      
      productElements.forEach((element, index) => {
        try {
          // Extrair informações do produto
          const titleElement = element.querySelector('h3, h4, [class*="title"], [class*="name"], [class*="Title"], [class*="Name"]');
          const priceElement = element.querySelector('[class*="price"], [class*="Price"], [class*="amount"], span[class*="currency"]');
          const imageElement = element.querySelector('img');
          const linkElement = element.querySelector('a') || element.closest('a');
          
          const title = titleElement ? (titleElement.textContent || titleElement.innerText || '').trim() : '';
          const price = priceElement ? (priceElement.textContent || priceElement.innerText || '').trim() : '';
          const imageUrl = imageElement ? (imageElement.src || imageElement.getAttribute('data-src') || '') : '';
          const productUrl = linkElement ? (linkElement.href || linkElement.getAttribute('href') || '') : '';
          
          // Extrair ID do produto da URL
          let productId = null;
          if (productUrl) {
            const match = productUrl.match(/\/product\/(\d+)/) || productUrl.match(/\/shop\/.*\/(\d+)/);
            if (match) {
              productId = match[1];
            }
          }
          
          // Extrair vendas/avaliações se disponível
          const salesElement = element.querySelector('[class*="sales"], [class*="sold"], [class*="Sales"], [class*="Sold"]');
          const ratingElement = element.querySelector('[class*="rating"], [class*="star"], [class*="Rating"]');
          
          const sales = salesElement ? (salesElement.textContent || salesElement.innerText || '').trim() : '';
          const rating = ratingElement ? (ratingElement.textContent || ratingElement.innerText || '').trim() : '';
          
          if (title || productId) {
            productList.push({
              id: productId || `product_${index}`,
              title: title || 'Produto sem título',
              price: price || null,
              imageUrl: imageUrl || null,
              productUrl: productUrl || null,
              sales: sales || null,
              rating: rating || null,
              index: index
            });
          }
        } catch (error) {
          console.error(`[TikTok Shop] Erro ao extrair produto ${index}:`, error);
        }
      });
      
      // Se ainda não encontrou produtos, tentar extrair do texto visível
      if (productList.length === 0) {
        console.log('[TikTok Shop] Tentando extrair produtos do texto visível da página...');
        
        const pageText = document.body.innerText || document.body.textContent || '';
        const lines = pageText.split('\n').map(line => line.trim()).filter(line => line.length > 10);
        
        // Procurar linhas que parecem ser produtos
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Verificar se a linha parece ser um produto (contém valores monetários e outros dados)
          if (line.length > 20 && (
            (line.includes('R$') || line.includes('$')) && 
            (line.match(/\d+[.,]\d+/) || line.includes('product') || line.includes('produto'))
          )) {
            // Tentar pegar linhas anteriores que podem conter o nome do produto
            let productName = '';
            for (let j = Math.max(0, i - 3); j < i; j++) {
              const prevLine = lines[j];
              if (prevLine.length > 15 && prevLine.length < 200 && !prevLine.match(/R\$|\$|%|\d+[.,]\d+/)) {
                productName = prevLine;
                break;
              }
            }
            
            if (!productName) {
              const nameMatch = line.match(/^(.+?)(?:\s+R\$|\s+\$|\s+\d+[.,]\d+)/);
              productName = nameMatch ? nameMatch[1].trim() : line.substring(0, 100);
            }
            
            // Extrair valores da linha
            const priceMatch = line.match(/(R\$|\$)[\d.,]+/);
            
            if (productName && productName.length > 5) {
              productList.push({
                id: `tiktok_shop_text_${productList.length + 1}`,
                title: productName,
                price: priceMatch ? priceMatch[0] : null,
                imageUrl: null,
                productUrl: null,
                sales: null,
                rating: null,
                index: productList.length
              });
            }
          }
        }
        
        if (productList.length > 0) {
          console.log(`[TikTok Shop] Encontrados ${productList.length} produtos extraídos do texto`);
        }
      }
      
      return productList;
    });
    
    logger.info(`[TikTok Shop] Extraídos ${products.length} produtos da página`);
    return products;
  } catch (error) {
    logger.error(`[TikTok Shop] Erro ao extrair produtos: ${error.message}`);
    return [];
  }
}

/**
 * Scraping de produtos mais vendidos do TikTok Shop
 * @param {Object} params - Parâmetros de busca
 * @param {string} params.category - Categoria (opcional)
 * @param {string} params.country - País (ex: 'BR', 'US')
 * @param {number} params.limit - Limite de produtos (padrão: 20)
 * @returns {Promise<Array>} Lista de produtos mais vendidos
 */
async function scrapeTikTokShopTopProducts({ category = null, country = 'BR', limit = 20 }) {
  // Lock para evitar requisições simultâneas
  if (scrapingLock) {
    logger.warn('[TikTok Shop] Scraping já em andamento, aguardando...');
    let waitTime = 0;
    const maxWaitTime = 300000; // 5 minutos
    while (scrapingLock && waitTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      waitTime += 2000;
      if (waitTime % 30000 === 0) {
        logger.info(`[TikTok Shop] Aguardando scraping anterior finalizar... (${Math.floor(waitTime/1000)}s/${maxWaitTime/1000}s)`);
      }
    }
    if (scrapingLock) {
      throw new Error(`Timeout aguardando scraping anterior finalizar (aguardou ${Math.floor(waitTime/1000)}s)`);
    }
  }
  
  scrapingLock = true;
  const lockStartTime = Date.now();
  
  logger.info(`[TikTok Shop] ==========================================`);
  logger.info(`[TikTok Shop] 🛍️ INICIANDO SCRAPING - PRODUTOS MAIS VENDIDOS`);
  logger.info(`[TikTok Shop] 📍 País: ${country}, Categoria: ${category || 'Todas'}`);
  logger.info(`[TikTok Shop] 📊 Objetivo: Coletar ${limit} produtos`);
  logger.info(`[TikTok Shop] ==========================================`);

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
        // Interceptar APIs do TikTok Shop que podem retornar produtos
        if ((url.includes('tiktok.com') && (
          url.includes('/api/') || 
          url.includes('/shop/') ||
          url.includes('product') ||
          url.includes('item') ||
          url.includes('catalog') ||
          response.headers()['content-type']?.includes('application/json')
        )) || url.includes('__NEXT_DATA__')) {
          try {
            const json = await response.json().catch(() => null);
            if (json) {
              apiResponses.push({ url, data: json });
              logger.info(`[TikTok Shop] ✅ Interceptada resposta da API: ${url.substring(0, 100)}`);
            }
          } catch (e) {
            // Não é JSON, ignorar
          }
        }
      } catch (e) {
        // Ignorar erros de interceptação
      }
    });
    
    // URL de produtos mais vendidos (best sellers)
    // Tentar diferentes URLs possíveis
    const possibleUrls = [
      'https://www.tiktok.com/shop/bestsellers',
      'https://www.tiktok.com/shop/trending',
      'https://www.tiktok.com/shop',
      `https://www.tiktok.com/shop?region=${country}`,
      `https://www.tiktok.com/shop/bestsellers?region=${country}`
    ];
    
    logger.info(`[TikTok Shop] Acessando TikTok Shop...`);
    
    let products = [];
    
    // Tentar cada URL até encontrar produtos
    for (const tryUrl of possibleUrls) {
      try {
        logger.info(`[TikTok Shop] Tentando URL: ${tryUrl}`);
        
        await retry(async () => {
          await page.goto(tryUrl, { 
            waitUntil: 'networkidle2', 
            timeout: 120000 
          });
        }, { maxRetries: 2 });
        
        await randomDelay(8000, 12000); // Aguardar mais tempo para conteúdo carregar
        
        // Tentar extrair produtos de __NEXT_DATA__ primeiro
        try {
          const nextData = await page.evaluate(() => {
            const script = document.querySelector('#__NEXT_DATA__');
            if (script) {
              return JSON.parse(script.textContent);
            }
            return null;
          });
          
          if (nextData) {
            logger.info(`[TikTok Shop] ✅ Encontrado __NEXT_DATA__, tentando extrair produtos...`);
            const nextDataProducts = extractProductsFromNextData(nextData);
            if (nextDataProducts.length > 0) {
              logger.info(`[TikTok Shop] ✅ Extraídos ${nextDataProducts.length} produtos de __NEXT_DATA__`);
              products = products.concat(nextDataProducts);
            }
          }
        } catch (e) {
          logger.warn(`[TikTok Shop] Erro ao extrair __NEXT_DATA__: ${e.message}`);
        }
        
        // Aguardar produtos carregarem na página
        try {
          await page.waitForFunction(() => {
            const bodyText = document.body.innerText || '';
            return bodyText.length > 1000 && (
              bodyText.includes('R$') || 
              bodyText.includes('$') ||
              bodyText.includes('product') ||
              bodyText.includes('produto')
            );
          }, { timeout: 20000 });
          logger.info(`[TikTok Shop] ✅ Conteúdo detectado na página`);
        } catch (e) {
          logger.warn(`[TikTok Shop] Timeout aguardando conteúdo na URL ${tryUrl}`);
        }
        
        // Fazer scroll para carregar mais produtos
        logger.info(`[TikTok Shop] Fazendo scroll para carregar mais produtos...`);
        for (let i = 0; i < 10; i++) {
          await page.evaluate(() => {
            window.scrollBy(0, 1500);
          });
          await randomDelay(2000, 3000);
          
          // A cada 3 scrolls, ir até o final
          if (i % 3 === 0) {
            await page.evaluate(() => {
              window.scrollTo(0, document.body.scrollHeight);
            });
            await randomDelay(3000, 4000);
          }
        }
        
        // Aguardar um pouco mais para APIs carregarem
        await randomDelay(5000, 7000);
        
        // Tentar extrair produtos das respostas de API interceptadas
        if (apiResponses.length > 0 && products.length === 0) {
          logger.info(`[TikTok Shop] Tentando extrair produtos de ${apiResponses.length} respostas de API...`);
          for (const apiResponse of apiResponses) {
            try {
              const apiProducts = extractProductsFromApiResponse(apiResponse.data);
              if (apiProducts.length > 0) {
                logger.info(`[TikTok Shop] ✅ Extraídos ${apiProducts.length} produtos da API`);
                products = products.concat(apiProducts);
              }
            } catch (e) {
              logger.warn(`[TikTok Shop] Erro ao extrair produtos da API: ${e.message}`);
            }
          }
        }
        
        // Se ainda não encontrou, tentar extrair da página
        if (products.length === 0) {
          products = await extractProductsFromPage(page);
        }
        
        if (products.length > 0) {
          logger.info(`[TikTok Shop] ✅ Encontrados ${products.length} produtos na URL: ${tryUrl}`);
          break; // Parar se encontrou produtos
        }
      } catch (error) {
        logger.warn(`[TikTok Shop] Erro ao acessar ${tryUrl}: ${error.message}`);
        continue;
      }
    }
    
    // Limitar ao número solicitado
    if (products.length > limit) {
      products = products.slice(0, limit);
    }
    
    logger.info(`[TikTok Shop] ✅ Coletados ${products.length} produtos mais vendidos`);
    
    return products.map((product, index) => ({
      id: product.id,
      title: product.title,
      revenue: product.revenue || product.sales || null,
      growthRate: product.growthRate || null,
      itemsSold: product.itemsSold || product.sales || null,
      avgPrice: product.avgPrice || product.price || null,
      commissionRate: product.commissionRate || null,
      topVideos: product.topVideos || null,
      creators: product.creators || null,
      launchDate: product.launchDate || null,
      conversionRate: product.conversionRate || null,
      imageUrl: product.imageUrl,
      productUrl: product.productUrl,
      rank: product.rank || index + 1,
      source: 'tiktok_shop',
      collectedAt: new Date().toISOString()
    }));

  } catch (error) {
    const errorMessage = error.message || (typeof error === 'string' ? error : JSON.stringify(error));
    logger.error(`[TikTok Shop] Erro no scraping: ${errorMessage}`);
    return [];
  } finally {
    // Liberar lock sempre, mesmo em caso de erro
    const lockDuration = Date.now() - (lockStartTime || Date.now());
    logger.info(`[TikTok Shop] 🔓 Liberando lock após ${Math.floor(lockDuration/1000)}s`);
    scrapingLock = false;
    
    // Fechar página
    try {
      if (page && !page.isClosed()) {
        await page.close().catch(() => {});
      }
    } catch (e) {
      logger.warn(`[TikTok Shop] Erro ao fechar page: ${e.message}`);
    }
  }
}

module.exports = {
  scrapeTikTokShopTopProducts,
  closeBrowser
};

