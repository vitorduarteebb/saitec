-- Schema do banco de dados para o sistema de coleta de tendências
-- Execute este script no MySQL para criar a tabela trends

CREATE DATABASE IF NOT EXISTS saitec_trends CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE saitec_trends;

-- Tabela principal de tendências
CREATE TABLE IF NOT EXISTS trends (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source VARCHAR(50) NOT NULL COMMENT 'Fonte da tendência: tiktok_cc, pipiads, hashtag_scraper',
  niche VARCHAR(100) NULL COMMENT 'Nicho da tendência (ex: beleza, moda, fitness)',
  title VARCHAR(255) NOT NULL COMMENT 'Título do vídeo',
  description TEXT NULL COMMENT 'Descrição do vídeo',
  video_url TEXT NOT NULL COMMENT 'URL do vídeo no TikTok',
  thumb_url TEXT NULL COMMENT 'URL da thumbnail',
  sound_name VARCHAR(255) NULL COMMENT 'Nome do som/música usado',
  author_handle VARCHAR(150) NULL COMMENT 'Handle do autor (@usuario)',
  views BIGINT UNSIGNED DEFAULT 0 COMMENT 'Número de visualizações',
  likes BIGINT UNSIGNED DEFAULT 0 COMMENT 'Número de curtidas',
  comments BIGINT UNSIGNED DEFAULT 0 COMMENT 'Número de comentários',
  shares BIGINT UNSIGNED DEFAULT 0 COMMENT 'Número de compartilhamentos',
  engagement_score DECIMAL(10,4) DEFAULT 0 COMMENT 'Score de engajamento calculado',
  country VARCHAR(10) NULL COMMENT 'Código do país (ex: BR, US)',
  language VARCHAR(10) NULL COMMENT 'Idioma do conteúdo (ex: pt, en)',
  collected_at DATETIME NOT NULL COMMENT 'Data/hora da coleta',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Data/hora de criação do registro',
  
  INDEX idx_source (source),
  INDEX idx_niche (niche),
  INDEX idx_collected_at (collected_at),
  INDEX idx_engagement_score (engagement_score),
  INDEX idx_country (country),
  INDEX idx_author_handle (author_handle)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Tabela de tendências coletadas';

-- Tabela de histórico de coletas (opcional - para auditoria)
CREATE TABLE IF NOT EXISTS collection_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  collection_type VARCHAR(50) NOT NULL COMMENT 'Tipo de coleta: scheduled, manual',
  niche VARCHAR(100) NULL,
  country VARCHAR(10) NULL,
  sources TEXT NULL COMMENT 'Fontes utilizadas (JSON)',
  trends_collected INT UNSIGNED DEFAULT 0 COMMENT 'Quantidade coletada',
  trends_saved INT UNSIGNED DEFAULT 0 COMMENT 'Quantidade salva',
  status VARCHAR(20) NOT NULL COMMENT 'success, error, partial',
  error_message TEXT NULL,
  started_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_status (status),
  INDEX idx_started_at (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Log de coletas realizadas';

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

