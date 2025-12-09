-- Script para criar a tabela de produtos TikTok Shop
-- Execute este script no MySQL para adicionar a tabela de produtos

USE saitec_trends;

-- Tabela de produtos TikTok Shop coletados
CREATE TABLE IF NOT EXISTS tiktok_shop_products (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id VARCHAR(100) NULL COMMENT 'ID do produto no TikTok Shop',
  source VARCHAR(50) NOT NULL COMMENT 'Fonte: kalodata, tiktok_shop',
  title VARCHAR(500) NOT NULL COMMENT 'Nome do produto',
  revenue VARCHAR(50) NULL COMMENT 'Receita total (ex: R$2,41m)',
  growth_rate VARCHAR(20) NULL COMMENT 'Taxa de crescimento (ex: -19.2%)',
  items_sold VARCHAR(50) NULL COMMENT 'Itens vendidos (ex: 4,26 mi)',
  avg_price VARCHAR(50) NULL COMMENT 'Preço médio por unidade (ex: R$56,51)',
  commission_rate VARCHAR(20) NULL COMMENT 'Taxa de comissão (ex: 10%)',
  top_videos VARCHAR(50) NULL COMMENT 'Vídeos com maior receita (ex: 3,84 mil)',
  creators VARCHAR(50) NULL COMMENT 'Número de criadores',
  launch_date VARCHAR(20) NULL COMMENT 'Data de lançamento (ex: 06/09/2025)',
  conversion_rate VARCHAR(20) NULL COMMENT 'Taxa de conversão do criador (ex: 55.50%)',
  product_url TEXT NULL COMMENT 'URL do produto no TikTok Shop',
  image_url TEXT NULL COMMENT 'URL da imagem do produto',
  rank INT UNSIGNED NULL COMMENT 'Posição no ranking',
  category VARCHAR(100) NULL COMMENT 'Categoria do produto',
  country VARCHAR(10) NULL COMMENT 'País (ex: BR)',
  collected_at DATETIME NOT NULL COMMENT 'Data/hora da coleta',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Data/hora de criação do registro',
  
  INDEX idx_source (source),
  INDEX idx_collected_at (collected_at),
  INDEX idx_product_id (product_id),
  INDEX idx_rank (rank),
  INDEX idx_country (country),
  INDEX idx_category (category),
  UNIQUE KEY unique_product_day (product_id, DATE(collected_at))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Produtos TikTok Shop coletados';

