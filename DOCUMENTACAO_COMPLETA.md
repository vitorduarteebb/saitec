# 📚 Documentação Completa - Automação SAITEC

## Índice

1. [Visão Geral do Sistema](#visão-geral-do-sistema)
2. [Arquitetura](#arquitetura)
3. [Instalação e Configuração](#instalação-e-configuração)
4. [Funcionalidades](#funcionalidades)
5. [APIs e Endpoints](#apis-e-endpoints)
6. [Banco de Dados](#banco-de-dados)
7. [Coleta de Dados](#coleta-de-dados)
8. [Deploy em Produção](#deploy-em-produção)
9. [Manutenção](#manutenção)
10. [Troubleshooting](#troubleshooting)

---

## Visão Geral do Sistema

### O que é

A **Automação SAITEC** é um sistema automatizado de coleta e análise de produtos mais vendidos do TikTok Shop. O sistema monitora diariamente os rankings de produtos através da plataforma Kalodata, coletando informações detalhadas sobre receita, crescimento, vendas e métricas de performance.

### Objetivo

Fornecer dados atualizados e estruturados sobre os produtos mais vendidos no TikTok Shop, permitindo análise de tendências, identificação de oportunidades e tomada de decisões baseada em dados.

### Principais Características

- ✅ Coleta automatizada diária de produtos
- ✅ Persistência em banco de dados MySQL
- ✅ Exportação em CSV para análise
- ✅ Interface web para visualização
- ✅ API REST para integração
- ✅ Prevenção de duplicatas
- ✅ Suporte a múltiplas fontes de dados

---

## Arquitetura

### Componentes Principais

```
┌─────────────────────────────────────────────────────────┐
│                    Cliente Web                          │
│              (Painel HTML / API Calls)                  │
└────────────────────┬──────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Servidor Express (Node.js)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Routes     │  │   Services   │  │  Scheduler   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└────────────────────┬──────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
┌─────────────────┐    ┌─────────────────┐
│   Scrapers       │    │   Database       │
│  - Kalodata      │    │   MySQL          │
│  - TikTok Shop   │    │   - Products     │
└─────────────────┘    │   - Trends       │
                       └─────────────────┘
```

### Fluxo de Dados

1. **Agendamento**: Scheduler inicia coleta automática
2. **Scraping**: Scraper acessa Kalodata e extrai produtos
3. **Processamento**: Dados são normalizados e validados
4. **Persistência**: Produtos são salvos no banco de dados
5. **Exposição**: API expõe dados para consumo
6. **Visualização**: Painel web exibe produtos coletados

---

## Instalação e Configuração

### Requisitos do Sistema

- **Node.js**: 18.0 ou superior
- **MySQL**: 8.0 ou superior
- **Chrome/Chromium**: Para execução do Puppeteer
- **Sistema Operacional**: Linux (Ubuntu/Debian recomendado), Windows, macOS

### Instalação Local

#### 1. Clonar Repositório

```bash
git clone <repositorio> saitec-automation
cd saitec-automation
```

#### 2. Instalar Dependências

```bash
npm install
```

#### 3. Configurar Banco de Dados

```bash
# Criar banco de dados
mysql -u root -p < database/schema.sql

# Criar tabela de produtos
mysql -u root -p saitec_trends < database/create_products_table.sql
```

#### 4. Configurar Variáveis de Ambiente

Copie o arquivo de exemplo e configure:

```bash
cp config.example.env .env
nano .env
```

Variáveis essenciais:

```env
# Banco de Dados
DB_HOST=localhost
DB_PORT=3306
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_NAME=saitec_trends

# Kalodata (Login)
KALODATA_EMAIL=seu_email@exemplo.com
KALODATA_PASSWORD=sua_senha_kalodata

# Puppeteer
KALODATA_HEADLESS=false  # false para primeiro login, true para produção
HEADLESS=false
```

#### 5. Primeiro Login no Kalodata

Na primeira execução, é necessário fazer login manualmente:

```bash
# Configurar para modo visível
export KALODATA_HEADLESS=false

# Iniciar servidor
npm start
```

Quando o navegador abrir, faça login no Kalodata. Os cookies serão salvos automaticamente em `cookies/kalodata-cookies.json`.

#### 6. Iniciar Servidor

```bash
npm start
```

O servidor estará disponível em `http://localhost:3000`

---

## Funcionalidades

### 1. Coleta Automatizada

O sistema coleta automaticamente os produtos mais vendidos do TikTok Shop através do Kalodata. A coleta pode ser:

- **Agendada**: Executada automaticamente em horários configurados
- **Manual**: Disparada via API ou interface web

### 2. Persistência de Dados

Todos os produtos coletados são salvos automaticamente no banco de dados MySQL, organizados por data de coleta. O sistema previne duplicatas no mesmo dia.

### 3. Exportação CSV

Dados podem ser exportados em formato CSV para análise externa:

- **CSV da Coleta Atual**: Produtos coletados na requisição atual
- **CSV Completo do Dia**: Todos os produtos salvos do dia atual
- **CSV Histórico**: Produtos de datas específicas

### 4. Interface Web

Painel web moderno e responsivo para visualização dos produtos coletados, com:

- Filtros por fonte e quantidade
- Visualização em tabela
- Download de CSV
- Atualização em tempo real

### 5. API REST

API completa para integração com outros sistemas:

- Endpoints JSON
- Endpoints CSV
- Health checks
- Rate limiting

---

## APIs e Endpoints

### Health Check

```
GET /health
```

Retorna status do sistema, conexão com banco e informações de uptime.

**Resposta**:
```json
{
  "status": "ok",
  "timestamp": "2025-12-09T17:30:00.000Z",
  "uptime": {
    "seconds": 3600,
    "formatted": "1h 0m 0s"
  },
  "database": {
    "status": "connected",
    "host": "localhost"
  }
}
```

### Coletar Produtos

```
GET /shop/top-products?source=kalodata&limit=20&country=BR
```

Coleta produtos do TikTok Shop e salva automaticamente no banco.

**Parâmetros**:
- `source` (opcional): `kalodata` ou `tiktok_shop` (padrão: `kalodata`)
- `limit` (opcional): Número de produtos (padrão: 20, máximo: 100)
- `country` (opcional): Código do país (padrão: BR)
- `category` (opcional): Categoria do produto

**Resposta**:
```json
{
  "success": true,
  "count": 10,
  "data": [
    {
      "id": "1732390895662892250",
      "title": "Kit Pro3Magnesio + FitS36 + Picolinato de Cromo",
      "revenue": "R$2,41m",
      "growthRate": "-19.2%",
      "itemsSold": "4,26 mi",
      "avgPrice": "R$56,51",
      "commissionRate": "10%",
      "topVideos": "3,84 mil",
      "creators": "3,84 mil",
      "launchDate": "06/09/2025",
      "conversionRate": "55.50%",
      "productUrl": "https://shop.tiktok.com/view/product/...",
      "imageUrl": "https://img.kalocdn.com/...",
      "rank": 1,
      "source": "kalodata"
    }
  ],
  "source": "kalodata",
  "generatedAt": "2025-12-09T17:30:00.000Z"
}
```

### Download CSV da Coleta Atual

```
GET /shop/top-products.csv?source=kalodata&limit=20
```

Gera CSV apenas com os produtos coletados nesta requisição.

### Download CSV Completo do Dia

```
GET /shop/products/all.csv?date=2025-12-09&source=kalodata&country=BR
```

Retorna CSV com **todos** os produtos salvos do dia especificado.

**Parâmetros**:
- `date` (opcional): Data no formato YYYY-MM-DD (padrão: hoje)
- `source` (opcional): Filtrar por fonte
- `country` (opcional): Filtrar por país

**Exemplo**:
```bash
# CSV de hoje
curl http://localhost:3000/shop/products/all.csv -o produtos_hoje.csv

# CSV de data específica
curl "http://localhost:3000/shop/products/all.csv?date=2025-12-08" -o produtos_08-12.csv

# CSV filtrado por fonte
curl "http://localhost:3000/shop/products/all.csv?source=kalodata" -o produtos_kalodata.csv
```

### Painel Web

```
GET /painel
```

Interface web para visualização e gerenciamento dos produtos coletados.

---

## Banco de Dados

### Estrutura

O sistema utiliza MySQL com duas tabelas principais:

#### Tabela `trends`

Armazena tendências de vídeos do TikTok (legado, mantida para compatibilidade).

#### Tabela `tiktok_shop_products`

Armazena produtos do TikTok Shop coletados.

**Campos Principais**:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | BIGINT | ID único (auto-increment) |
| `product_id` | VARCHAR(100) | ID do produto no TikTok Shop |
| `source` | VARCHAR(50) | Fonte: kalodata, tiktok_shop |
| `title` | VARCHAR(500) | Nome do produto |
| `revenue` | VARCHAR(50) | Receita total (ex: R$2,41m) |
| `growth_rate` | VARCHAR(20) | Taxa de crescimento (ex: -19.2%) |
| `items_sold` | VARCHAR(50) | Itens vendidos (ex: 4,26 mi) |
| `avg_price` | VARCHAR(50) | Preço médio (ex: R$56,51) |
| `commission_rate` | VARCHAR(20) | Taxa de comissão (ex: 10%) |
| `top_videos` | VARCHAR(50) | Vídeos top (ex: 3,84 mil) |
| `creators` | VARCHAR(50) | Número de criadores |
| `launch_date` | VARCHAR(20) | Data de lançamento |
| `conversion_rate` | VARCHAR(20) | Taxa de conversão |
| `product_url` | TEXT | URL do produto |
| `image_url` | TEXT | URL da imagem |
| `rank` | INT | Posição no ranking |
| `category` | VARCHAR(100) | Categoria |
| `country` | VARCHAR(10) | País |
| `collected_at` | DATETIME | Data/hora da coleta |
| `created_at` | TIMESTAMP | Data de criação |

**Índices**:
- `idx_source`: Filtragem por fonte
- `idx_collected_at`: Filtragem por data
- `idx_product_id`: Busca por ID do produto
- `idx_rank`: Ordenação por ranking
- `unique_product_day`: Prevenção de duplicatas

### Consultas Úteis

#### Produtos Coletados Hoje

```sql
SELECT * FROM tiktok_shop_products 
WHERE DATE(collected_at) = CURDATE()
ORDER BY rank ASC;
```

#### Estatísticas por Dia

```sql
SELECT 
    DATE(collected_at) as data,
    COUNT(*) as total_produtos,
    COUNT(DISTINCT product_id) as produtos_unicos
FROM tiktok_shop_products
GROUP BY DATE(collected_at)
ORDER BY data DESC;
```

#### Top 10 Produtos por Receita

```sql
SELECT title, revenue, rank, collected_at
FROM tiktok_shop_products
WHERE DATE(collected_at) = CURDATE()
ORDER BY rank ASC
LIMIT 10;
```

---

## Coleta de Dados

### Processo de Coleta

1. **Inicialização**: Scraper inicializa navegador Puppeteer
2. **Login**: Verifica/carrega cookies ou solicita login manual
3. **Navegação**: Acessa página de produtos do Kalodata
4. **Aguardo**: Espera conteúdo carregar (React renderizar)
5. **Extração**: Extrai dados da tabela HTML e/ou APIs interceptadas
6. **Normalização**: Processa e normaliza dados extraídos
7. **Persistência**: Salva no banco de dados
8. **Retorno**: Retorna dados para API

### Fontes de Dados

#### Kalodata (Principal)

- **URL**: https://www.kalodata.com/product
- **Método**: Scraping via Puppeteer
- **Dados**: Top 10 produtos mais vendidos (versão gratuita)
- **Requisitos**: Login obrigatório

#### TikTok Shop Direto (Alternativa)

- **URL**: https://www.tiktok.com/shop
- **Método**: Scraping direto
- **Status**: Em desenvolvimento

### Estratégias de Extração

O scraper utiliza múltiplas estratégias para garantir coleta confiável:

1. **Extração DOM**: Extrai diretamente da tabela HTML renderizada
2. **Interceptação de API**: Captura respostas de APIs do Kalodata
3. **Fallback Textual**: Extrai de texto visível quando seletores falham

### Prevenção de Duplicatas

O sistema previne duplicatas através de:

- **Chave Única**: `UNIQUE KEY unique_product_day (product_id, DATE(collected_at))`
- **Verificação Prévia**: Checagem antes de inserir
- **Logs**: Registro de produtos duplicados ignorados

---

## Deploy em Produção

### Preparação

1. **Servidor VPS**: Ubuntu 20.04+ ou Debian 11+
2. **Recursos**: Mínimo 2GB RAM, 20GB disco
3. **Acesso**: SSH com privilégios sudo

### Passos de Deploy

Consulte o arquivo `DEPLOY_VPS.md` para instruções detalhadas.

### Configuração de Produção

No arquivo `.env` de produção:

```env
NODE_ENV=production
KALODATA_HEADLESS=true
HEADLESS=true
```

### Gerenciamento com PM2

```bash
# Instalar PM2
npm install -g pm2

# Iniciar aplicação
pm2 start server.js --name saitec-automation

# Configurar para iniciar no boot
pm2 startup
pm2 save

# Monitorar
pm2 logs saitec-automation
pm2 monit
```

### Backup Automatizado

Configure backup diário do banco de dados:

```bash
# Criar script de backup
cat > /home/usuario/backup-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/home/usuario/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
mysqldump -u saitec_user -p'senha' saitec_trends > $BACKUP_DIR/saitec_trends_$DATE.sql
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
EOF

chmod +x /home/usuario/backup-db.sh

# Adicionar ao crontab
crontab -e
# Adicionar: 0 2 * * * /home/usuario/backup-db.sh
```

---

## Manutenção

### Atualização de Código

```bash
# Parar aplicação
pm2 stop saitec-automation

# Atualizar código
git pull  # ou fazer upload

# Reinstalar dependências (se necessário)
npm install --production

# Reiniciar
pm2 restart saitec-automation
```

### Limpeza de Logs

```bash
# Limpar logs antigos (mais de 30 dias)
find logs/ -name "*.log" -mtime +30 -delete
```

### Verificação de Saúde

```bash
# Health check
curl http://localhost:3000/health

# Verificar coletas recentes
mysql -u saitec_user -p saitec_trends -e "
SELECT DATE(collected_at) as data, COUNT(*) as total
FROM tiktok_shop_products
GROUP BY DATE(collected_at)
ORDER BY data DESC LIMIT 7;
"
```

### Renovação de Cookies

Se o login expirar:

1. Acesse a VPS via SSH
2. Configure `KALODATA_HEADLESS=false` temporariamente
3. Execute coleta manual para renovar cookies
4. Restaure `KALODATA_HEADLESS=true`

---

## Troubleshooting

### Erro: "Cannot connect to database"

**Causa**: MySQL não está rodando ou credenciais incorretas.

**Solução**:
```bash
# Verificar status do MySQL
sudo systemctl status mysql

# Testar conexão
mysql -u saitec_user -p -e "SELECT 1;"

# Verificar variáveis no .env
cat .env | grep DB_
```

### Erro: "Table 'tiktok_shop_products' doesn't exist"

**Causa**: Tabela não foi criada.

**Solução**:
```bash
mysql -u saitec_user -p saitec_trends < database/create_products_table.sql
```

### Erro: "Chrome/Chromium not found"

**Causa**: Chrome não está instalado ou não está no PATH.

**Solução**:
```bash
# Instalar Chrome
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install -y ./google-chrome-stable_current_amd64.deb

# Verificar instalação
which google-chrome
google-chrome --version
```

### Erro: "Login failed" ou "Nenhum produto encontrado"

**Causa**: Cookies expirados ou login não realizado.

**Solução**:
1. Verificar se cookies existem: `ls -la cookies/kalodata-cookies.json`
2. Tentar login manual com `KALODATA_HEADLESS=false`
3. Verificar credenciais no `.env`
4. Verificar logs: `pm2 logs saitec-automation`

### Erro: "Target.createTarget timed out"

**Causa**: Timeout do Puppeteer muito baixo.

**Solução**: Aumentar timeouts no `.env`:
```env
PUPPETEER_TIMEOUT=600000
PUPPETEER_PROTOCOL_TIMEOUT=1200000
```

### Produtos Duplicados no CSV

**Causa**: Múltiplas coletas no mesmo dia.

**Solução**: Isso é esperado. Use `/shop/products/all.csv` para CSV completo sem duplicatas do banco.

---

## Estrutura de Arquivos

```
saitec-automation/
├── database/
│   ├── schema.sql                 # Schema principal
│   └── create_products_table.sql  # Tabela de produtos
├── docs/
│   └── [documentação adicional]
├── public/
│   └── panel.html                 # Interface web
├── scripts/
│   ├── run-daily-collection.js    # Script de coleta diária
│   └── test-api.js                # Testes da API
├── src/
│   ├── database.js                 # Operações de banco
│   ├── scheduler.js                # Agendamento
│   ├── trendsService.js            # Serviços de tendências
│   ├── scrapers/
│   │   ├── kalodataScraper.js     # Scraper Kalodata
│   │   └── tiktokShopScraper.js   # Scraper TikTok Shop
│   └── utils/
│       └── logger.js               # Sistema de logs
├── cookies/                        # Cookies salvos (gitignored)
├── logs/                           # Logs do sistema (gitignored)
├── .env                            # Variáveis de ambiente (gitignored)
├── .gitignore
├── package.json
├── server.js                       # Servidor principal
├── DEPLOY_VPS.md                   # Guia de deploy
└── DOCUMENTACAO_COMPLETA.md       # Este arquivo
```

---

## Segurança

### Boas Práticas

1. **Arquivo .env**: Nunca commitar no repositório
2. **Cookies**: Armazenados localmente, não compartilhar
3. **Senhas**: Usar senhas fortes e únicas
4. **Firewall**: Restringir acesso à porta 3000 se possível
5. **HTTPS**: Usar SSL/TLS em produção
6. **Backups**: Fazer backup regular do banco de dados

### Permissões de Arquivos

```bash
# Proteger .env
chmod 600 .env

# Proteger cookies
chmod 700 cookies/
```

---

## Suporte e Contato

Para questões técnicas ou problemas:

1. Consulte esta documentação
2. Verifique os logs: `pm2 logs saitec-automation`
3. Execute health check: `curl http://localhost:3000/health`
4. Verifique o banco de dados

---

**Versão do Sistema**: 1.0  
**Última Atualização**: Dezembro 2025  
**Desenvolvido por**: SAITEC

