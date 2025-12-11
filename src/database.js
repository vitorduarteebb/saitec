/**
 * Módulo de conexão e operações com banco de dados MySQL
 */

const mysql = require('mysql2/promise');
const logger = require('./utils/logger');
require('dotenv').config();

let pool = null;

/**
 * Cria ou retorna o pool de conexões do banco
 * @returns {Promise<mysql.Pool>} Pool de conexões
 */
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'saitec_trends',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }
  return pool;
}

/**
 * Testa a conexão com o banco de dados
 * @returns {Promise<boolean>} true se conectado com sucesso
 */
async function testConnection() {
  try {
    // Verificar se variáveis de ambiente estão configuradas
    if (!process.env.DB_PASSWORD) {
      logger.error('[Database] DB_PASSWORD não configurado no .env');
      logger.error('[Database] Crie um arquivo .env baseado em config.example.env');
      return false;
    }

    const connection = await getPool().getConnection();
    await connection.ping();
    connection.release();
    logger.info('[Database] Conexão estabelecida com sucesso');
    return true;
  } catch (error) {
    const errorMsg = error.message || error.toString();
    logger.error('[Database] Erro ao conectar:', errorMsg);
    
    // Mensagens mais amigáveis para erros comuns
    if (errorMsg.includes('Access denied')) {
      logger.error('[Database] Verifique se DB_USER e DB_PASSWORD estão corretos no arquivo .env');
    } else if (errorMsg.includes('ECONNREFUSED')) {
      logger.error('[Database] MySQL não está rodando ou DB_HOST/DB_PORT estão incorretos');
    } else if (errorMsg.includes('Unknown database')) {
      logger.error('[Database] Banco de dados não existe. Execute: mysql < database/schema.sql');
    }
    
    return false;
  }
}

/**
 * Insere uma tendência no banco de dados
 * @param {Object} trend - Objeto de tendência
 * @returns {Promise<Object>} Resultado da inserção
 */
/**
 * Converte data ISO8601 para formato MySQL DATETIME
 * @param {string|Date} date - Data em formato ISO8601 ou Date object
 * @returns {string} Data no formato MySQL DATETIME (YYYY-MM-DD HH:MM:SS)
 */
function formatDateForMySQL(date) {
  if (!date) {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }
  
  if (date instanceof Date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }
  
  // Se for string ISO8601, converter para Date primeiro
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) {
    // Se não conseguir parsear, usar data atual
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }
  
  return dateObj.toISOString().slice(0, 19).replace('T', ' ');
}

async function insertTrend(trend) {
  const connection = await getPool().getConnection();
  
  try {
    const query = `
      INSERT INTO trends (
        source, niche, title, description, video_url, thumb_url,
        sound_name, author_handle, views, likes, comments, shares,
        engagement_score, country, language, collected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      trend.source,
      trend.niche,
      trend.title,
      trend.description,
      trend.videoUrl,
      trend.thumbUrl,
      trend.soundName,
      trend.authorHandle,
      trend.views || 0,
      trend.likes || 0,
      trend.comments || 0,
      trend.shares || 0,
      trend.engagementScore || trend.score || 0,
      trend.country,
      trend.language || 'pt',
      formatDateForMySQL(trend.collectedAt)
    ];

    const [result] = await connection.execute(query, values);
    
    return {
      success: true,
      insertId: result.insertId,
      trend: { ...trend, id: result.insertId }
    };
  } catch (error) {
    console.error('[Database] Erro ao inserir tendência:', error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Insere múltiplas tendências no banco de dados
 * Implementa lógica idempotente para evitar duplicatas do mesmo dia
 * @param {Array} trends - Array de tendências
 * @returns {Promise<Object>} Resultado da inserção em lote
 */
async function insertTrends(trends) {
  if (!trends || trends.length === 0) {
    return { success: true, inserted: 0, skipped: 0, errors: [] };
  }

  const connection = await getPool().getConnection();
  
  try {
    await connection.beginTransaction();

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    let inserted = 0;
    let skipped = 0;
    const errors = [];

    // Inserir uma por uma para verificar duplicatas
    for (const trend of trends) {
      try {
        // Verificar se já existe registro com mesmo video_url no mesmo dia
        const checkQuery = `
          SELECT id FROM trends 
          WHERE video_url = ? 
          AND DATE(collected_at) = ?
          LIMIT 1
        `;
        
        const [existing] = await connection.execute(checkQuery, [
          trend.videoUrl,
          today
        ]);

        if (existing.length > 0) {
          skipped++;
          continue; // Pular se já existe
        }

        // Inserir novo registro
        const insertQuery = `
          INSERT INTO trends (
            source, niche, title, description, video_url, thumb_url,
            sound_name, author_handle, views, likes, comments, shares,
            engagement_score, country, language, collected_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
          trend.source,
          trend.niche,
          trend.title,
          trend.description,
          trend.videoUrl,
          trend.thumbUrl,
          trend.soundName,
          trend.authorHandle,
          trend.views || 0,
          trend.likes || 0,
          trend.comments || 0,
          trend.shares || 0,
          trend.engagementScore || trend.score || 0,
          trend.country,
          trend.language || 'pt',
          formatDateForMySQL(trend.collectedAt)
        ];

        await connection.execute(insertQuery, values);
        inserted++;

      } catch (error) {
        errors.push({
          trend: trend.title || 'Sem título',
          error: error.message
        });
        logger.warn(`[Database] Erro ao inserir tendência individual:`, error.message);
      }
    }
    
    await connection.commit();

    logger.info(`[Database] Inseridas ${inserted} tendências, ${skipped} duplicadas ignoradas`);

    return {
      success: true,
      inserted,
      skipped,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (error) {
    await connection.rollback();
    logger.error('[Database] Erro ao inserir tendências:', error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Busca as últimas tendências do banco
 * @param {Object} options - Opções de busca
 * @param {number} options.limit - Limite de resultados
 * @param {string} options.niche - Filtrar por nicho (opcional)
 * @param {string} options.source - Filtrar por fonte (opcional)
 * @param {string} options.date - Filtrar por data (YYYY-MM-DD) (opcional)
 * @returns {Promise<Array>} Lista de tendências
 */
async function getLatestTrends({ limit = 20, niche = null, source = null, date = null } = {}) {
  const connection = await getPool().getConnection();
  
  try {
    let query = `
      SELECT * FROM trends
      WHERE 1=1
    `;
    const params = [];

    if (niche) {
      query += ' AND niche = ?';
      params.push(niche);
    }

    if (source) {
      query += ' AND source = ?';
      params.push(source);
    }

    if (date) {
      query += ' AND DATE(collected_at) = ?';
      params.push(date);
    }

    query += ` ORDER BY collected_at DESC, engagement_score DESC LIMIT ${parseInt(limit) || 20}`;

    const [rows] = await connection.execute(query, params);
    return rows;
  } catch (error) {
    console.error('[Database] Erro ao buscar tendências:', error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Busca datas disponíveis com coletas
 * @returns {Promise<Array>} Lista de datas (YYYY-MM-DD)
 */
async function getCollectionDates() {
  const connection = await getPool().getConnection();
  
  try {
    const query = `
      SELECT DISTINCT DATE(collected_at) as date, COUNT(*) as count
      FROM trends
      GROUP BY DATE(collected_at)
      ORDER BY date DESC
      LIMIT 30
    `;
    
    const [rows] = await connection.execute(query);
    return rows.map(row => ({
      date: row.date.toISOString().split('T')[0],
      count: row.count
    }));
  } catch (error) {
    console.error('[Database] Erro ao buscar datas de coleta:', error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Fecha o pool de conexões
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('[Database] Pool de conexões fechado');
  }
}

/**
 * Insere um produto TikTok Shop no banco de dados
 * @param {Object} product - Objeto de produto
 * @returns {Promise<Object>} Resultado da inserção
 */
async function insertProduct(product) {
  const connection = await getPool().getConnection();
  
  try {
    const query = `
      INSERT INTO tiktok_shop_products (
        product_id, source, title, revenue, growth_rate, items_sold,
        avg_price, commission_rate, top_videos, creators, launch_date,
        conversion_rate, product_url, image_url, rank, category, country, collected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      product.productId || product.id || null,
      product.source || 'kalodata',
      product.title || '',
      product.revenue || null,
      product.growthRate || null,
      product.itemsSold || null,
      product.avgPrice || null,
      product.commissionRate || null,
      product.topVideos || null,
      product.creators || null,
      product.launchDate || null,
      product.conversionRate || null,
      product.productUrl || null,
      product.imageUrl || null,
      product.rank || null,
      product.category || null,
      product.country || null,
      product.collectedAt || new Date()
    ];

    const [result] = await connection.execute(query, values);
    
    return {
      success: true,
      insertId: result.insertId,
      product: { ...product, id: result.insertId }
    };
  } catch (error) {
    console.error('[Database] Erro ao inserir produto:', error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Insere múltiplos produtos TikTok Shop no banco de dados
 * Implementa lógica idempotente para evitar duplicatas do mesmo dia
 * @param {Array} products - Array de produtos
 * @returns {Promise<Object>} Resultado da inserção em lote
 */
async function insertProducts(products) {
  if (!products || products.length === 0) {
    return { success: true, inserted: 0, skipped: 0, errors: [] };
  }

  const connection = await getPool().getConnection();
  
  try {
    await connection.beginTransaction();

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    let inserted = 0;
    let skipped = 0;
    const errors = [];

    // Inserir uma por uma para verificar duplicatas
    for (const product of products) {
      try {
        const productId = product.productId || product.id || null;
        
        // Verificar se já existe registro com mesmo product_id no mesmo dia
        if (productId) {
          const checkQuery = `
            SELECT id FROM tiktok_shop_products 
            WHERE product_id = ? 
            AND DATE(collected_at) = ?
            LIMIT 1
          `;
          
          const [existing] = await connection.execute(checkQuery, [
            productId,
            today
          ]);

          if (existing.length > 0) {
            skipped++;
            continue; // Pular se já existe
          }
        }

        // Inserir novo registro
        const insertQuery = `
          INSERT INTO tiktok_shop_products (
            product_id, source, title, revenue, growth_rate, items_sold,
            avg_price, commission_rate, top_videos, creators, launch_date,
            conversion_rate, product_url, image_url, rank, category, country, collected_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
          productId,
          product.source || 'kalodata',
          product.title || '',
          product.revenue || null,
          product.growthRate || null,
          product.itemsSold || null,
          product.avgPrice || null,
          product.commissionRate || null,
          product.topVideos || null,
          product.creators || null,
          product.launchDate || null,
          product.conversionRate || null,
          product.productUrl || null,
          product.imageUrl || null,
          product.rank || null,
          product.category || null,
          product.country || null,
          product.collectedAt || new Date()
        ];

        await connection.execute(insertQuery, values);
        inserted++;

      } catch (error) {
        errors.push({
          product: product.title || 'Sem título',
          error: error.message
        });
        logger.warn(`[Database] Erro ao inserir produto individual:`, error.message);
      }
    }
    
    await connection.commit();

    logger.info(`[Database] Inseridos ${inserted} produtos, ${skipped} duplicados ignorados`);

    return {
      success: true,
      inserted,
      skipped,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (error) {
    await connection.rollback();
    logger.error('[Database] Erro ao inserir produtos:', error);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Busca produtos coletados do banco
 * @param {Object} options - Opções de busca
 * @param {number} options.limit - Limite de resultados
 * @param {string} options.source - Filtrar por fonte (opcional)
 * @param {string} options.country - Filtrar por país (opcional)
 * @param {string} options.date - Filtrar por data (YYYY-MM-DD, padrão: hoje)
 * @returns {Promise<Array>} Lista de produtos
 */
async function getProducts({ limit = 100, source = null, country = null, date = null } = {}) {
  const connection = await getPool().getConnection();
  
  try {
    let query = `
      SELECT * FROM tiktok_shop_products
      WHERE 1=1
    `;
    const params = [];

    if (source) {
      query += ' AND source = ?';
      params.push(source);
    }

    if (country) {
      query += ' AND country = ?';
      params.push(country);
    }

    if (date) {
      query += ' AND DATE(collected_at) = ?';
      params.push(date);
    } else {
      // Por padrão, buscar apenas produtos do dia atual
      const today = new Date().toISOString().split('T')[0];
      query += ' AND DATE(collected_at) = ?';
      params.push(today);
    }

    query += ` ORDER BY rank ASC, collected_at DESC LIMIT ${parseInt(limit) || 20}`;

    const [rows] = await connection.execute(query, params);
    return rows;
  } catch (error) {
    console.error('[Database] Erro ao buscar produtos:', error);
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  getPool,
  testConnection,
  insertTrend,
  insertTrends,
  getLatestTrends,
  getCollectionDates,
  insertProduct,
  insertProducts,
  getProducts,
  closePool
};

