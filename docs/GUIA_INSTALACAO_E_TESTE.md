# Guia de Instalação e Teste - Sistema de Coleta de Tendências

## Pré-requisitos

- Node.js 16+ instalado
- MySQL 8.0+ instalado e rodando
- Navegador Chrome/Chromium (para Puppeteer)

## Instalação

### 1. Instalar Dependências

```bash
npm install
```

**Nota:** A instalação do Puppeteer pode demorar alguns minutos, pois baixa o Chromium.

### 2. Configurar Variáveis de Ambiente

Copie `config.example.env` para `.env` e configure:

```env
# Servidor
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
HEADLESS=true

# Banco de Dados
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=sua_senha
DB_NAME=saitec_trends

# Coleta
DEFAULT_NICHE=beleza
DEFAULT_COUNTRY=BR
MIN_VIEWS=50000
COLLECTION_LIMIT=20
COLLECTION_SOURCES=tiktok_cc,pipiads
COLLECTION_HASHTAGS=#beleza,#promo

# Score
LIKES_WEIGHT=3
COMMENTS_WEIGHT=4
SHARES_WEIGHT=5

# Filtros
BLACKLIST_WORDS=porn,bet,casino
FILTER_LANGUAGE=pt

# PiPiAds (opcional)
PIPIADS_API_URL=https://api.pipiads.com/v1/trending
PIPIADS_API_KEY=sua_api_key_aqui
```

### 3. Criar Banco de Dados

```bash
mysql -u root -p < database/schema.sql
```

Ou execute manualmente o conteúdo de `database/schema.sql` no MySQL.

## Testes

### Teste 1: Health Check da API

```bash
npm start
```

Em outro terminal:

```bash
curl http://localhost:3000/health
```

**Resposta esperada:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-22T10:00:00.000Z",
  "database": "connected"
}
```

### Teste 2: Teste Completo de Coleta

```bash
npm run test-collection
```

Este script testa:
- Conexão com banco de dados
- Coleta do TikTok Creative Center
- Coleta do PiPiAds
- Coleta de hashtags
- Coleta completa (todas as fontes)
- Salvamento no banco

### Teste 3: Teste da API

```bash
npm run test
```

Ou teste manualmente:

```bash
# Buscar top tendências
curl "http://localhost:3000/trends/top?niche=beleza&country=BR&limit=5"

# Coletar e salvar
curl -X POST http://localhost:3000/trends/collect-and-save \
  -H "Content-Type: application/json" \
  -d '{
    "niche": "beleza",
    "country": "BR",
    "limit": 10,
    "sources": "tiktok_cc"
  }'

# Buscar últimas tendências salvas
curl "http://localhost:3000/trends/latest?limit=10"
```

### Teste 4: Coleta Diária Manual

```bash
npm run collect
```

Este script simula a execução diária automática.

## Configuração do n8n

### Importar Workflow

1. Acesse o n8n
2. Importe o arquivo `docs/N8N_WORKFLOW_EXAMPLE.json`
3. Ajuste a URL do servidor se necessário (padrão: `http://localhost:3000`)
4. Configure o cron para execução automática

### Configurar Cron

No n8n, configure o nó Cron com uma das opções:

- **1x por dia (10h):** `0 10 * * *`
- **3x por dia (10h, 15h, 21h):** `0 10,15,21 * * *`
- **A cada 6 horas:** `0 */6 * * *`

## Troubleshooting

### Erro: "Cannot find module 'puppeteer'"

**Solução:**
```bash
npm install puppeteer
```

### Erro: "Failed to launch the browser process"

**Solução:**
- No Linux, instale dependências: `sudo apt-get install -y gconf-service libasound2`
- Ou configure `HEADLESS=false` no `.env` para debug

### Erro: "Table 'trends' doesn't exist"

**Solução:**
Execute o script SQL: `mysql -u root -p < database/schema.sql`

### Scraping não está funcionando

**Possíveis causas:**
1. TikTok pode estar bloqueando requisições
2. Seletores CSS podem estar desatualizados
3. Pode ser necessário usar proxy/VPN

**Solução:**
- Verifique os logs em `logs/combined.log`
- Ajuste os seletores em `src/scrapers/tiktokScraper.js`
- Configure proxy se necessário

### API retorna dados vazios

**Verificações:**
1. Verifique os logs: `tail -f logs/combined.log`
2. Teste cada fonte individualmente
3. Verifique se as URLs estão corretas
4. Confirme que o navegador está abrindo (se `HEADLESS=false`)

## Logs

Os logs são salvos em:
- `logs/combined.log` - Todos os logs
- `logs/error.log` - Apenas erros

Para ver logs em tempo real:

```bash
tail -f logs/combined.log
```

## Próximos Passos

1. **Ajustar Seletores:** Os seletores CSS podem precisar ser ajustados conforme a estrutura do TikTok muda
2. **Configurar Proxy:** Se o scraping estiver sendo bloqueado, configure proxy/VPN
3. **Otimizar Performance:** Ajustar timeouts e delays conforme necessário
4. **Monitorar:** Configurar alertas para falhas de coleta

## Suporte

Para mais informações, consulte:
- `docs/FASE1_DOCUMENTACAO.md` - Documentação completa
- `docs/QUICK_START.md` - Guia rápido
- Logs em `logs/combined.log`

