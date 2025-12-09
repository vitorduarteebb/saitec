# Fluxo Completo do Sistema - Documentação Técnica

## Visão Geral

Este documento descreve o fluxo completo do sistema de coleta e ranking de tendências do TikTok, desde a coleta até a exibição no painel web.

---

## Arquitetura do Fluxo

```
┌─────────────────┐
│   Fontes        │  TikTok CC, PiPiAds, Hashtags
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Scrapers      │  Puppeteer + Anti-bloqueio
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Coleta        │  collectTrendsFromSources()
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Filtros       │  applyFilters()
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Ranking       │  rankTopTrends()
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Top 20        │  Resultado final
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐  ┌──────────┐
│  JSON   │  │   CSV    │  Endpoints
│  API    │  │  Export  │
└────────┘  └──────────┘
    │
    ▼
┌─────────────────┐
│   Painel Web    │  Front-end simples
└─────────────────┘
```

---

## Etapas Detalhadas

### 1. COLETA (collectTrendsFromSources)

**Arquivo:** `src/trendsService.js`

**Função:** `collectTrendsFromSources()`

**Responsabilidade:** Buscar dados brutos de todas as fontes configuradas

**Processo:**
1. Verifica quais fontes estão habilitadas (`sources` array)
2. Para cada fonte:
   - TikTok Creative Center → `getTrendsFromTikTokCreativeCenter()`
   - PiPiAds → `getTrendsFromPiPiAdsService()`
   - Hashtags → `getTrendsFromHashtags()`
3. Retorna array combinado de todas as tendências coletadas

**Exemplo:**
```javascript
const trends = await collectTrendsFromSources({
  niche: 'beleza',
  country: 'BR',
  sources: ['tiktok_cc', 'pipiads'],
  hashtags: ['#beleza']
});
```

---

### 2. SCRAPING (com Anti-bloqueio)

**Arquivo:** `src/scrapers/tiktokScraper.js`

**Melhorias Anti-bloqueio:**
- Rotação de User-Agent aleatório
- Delays aleatórios entre requisições
- Remoção de propriedades `navigator.webdriver`
- Timeouts configuráveis
- Delays maiores entre requisições diferentes

**Configurações (.env):**
```env
DELAY_MIN_MS=1000          # Delay mínimo entre ações
DELAY_MAX_MS=3000          # Delay máximo entre ações
DELAY_BETWEEN_MIN_MS=3000  # Delay mínimo entre requisições diferentes
DELAY_BETWEEN_MAX_MS=6000  # Delay máximo entre requisições diferentes
PUPPETEER_TIMEOUT=30000    # Timeout do Puppeteer
PAGE_TIMEOUT=30000         # Timeout de carregamento de página
```

---

### 3. NORMALIZAÇÃO

**Arquivo:** `src/trendsService.js`

**Função:** `normalizeTrendItem()`

**Responsabilidade:** Converter dados brutos de diferentes fontes para formato único

**Formato Normalizado:**
```javascript
{
  source: 'tiktok_cc',
  niche: 'beleza',
  title: 'Título do vídeo',
  description: 'Descrição',
  videoUrl: 'https://...',
  thumbUrl: 'https://...',
  soundName: 'Nome do som',
  authorHandle: '@usuario',
  views: 1000000,
  likes: 50000,
  comments: 1000,
  shares: 500,
  country: 'BR',
  language: 'pt',
  collectedAt: '2025-01-22T10:00:00.000Z'
}
```

---

### 4. FILTROS

**Arquivo:** `src/trendsService.js`

**Função:** `applyFilters()`

**Filtros Aplicados:**
1. **Mínimo de Views:** Remove tendências abaixo do threshold
2. **Blacklist:** Remove tendências com palavras proibidas
3. **Idioma:** Filtra por idioma específico
4. **Autores Excluídos:** Remove handles específicos

**Configurações (.env):**
```env
MIN_VIEWS=50000
BLACKLIST_WORDS=porn,bet,casino
FILTER_LANGUAGE=pt
```

---

### 5. RANKING

**Arquivo:** `src/trendsService.js`

**Funções:**
- `calculateRankingScore()` - Calcula score individual
- `rankTopTrends()` - Ranqueia e retorna Top N

**Cálculo de Score:**

```
engagementScore = (likes × 3 + comments × 4 + shares × 5) / views
reachScore = log10(views + 1) × 0.1
finalScore = engagementScore + reachScore
```

**Pesos Configuráveis (.env):**
```env
VIEWS_WEIGHT=0.1
LIKES_WEIGHT=3
COMMENTS_WEIGHT=4
SHARES_WEIGHT=5
```

**Processo de Ranking:**
1. Calcula score para cada tendência
2. Extrai hashtag principal do título/descrição
3. Ordena por score descendente
4. Em caso de empate, ordena por views
5. Retorna apenas Top N (padrão: 20)

---

### 6. ENDPOINTS DA API

#### GET /trends/top20

**Formato de Resposta:**
```json
{
  "success": true,
  "count": 20,
  "data": [
    {
      "id": 1,
      "title": "Título da tendência",
      "mainHashtag": "#beleza",
      "origin": "tiktok_cc",
      "metrics": {
        "views": 1000000,
        "likes": 50000,
        "comments": 1000,
        "shares": 500
      },
      "score": 0.2450,
      "engagementScore": 0.1950,
      "url": "https://www.tiktok.com/...",
      "thumbnail": "https://...",
      "author": "@usuario",
      "language": "pt",
      "collectedAt": "2025-01-22T10:00:00.000Z"
    }
  ],
  "generatedAt": "2025-01-22T10:00:00.000Z"
}
```

#### GET /trends/top20.csv

**Headers:**
```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="top20_trends_2025-01-22.csv"
```

**Formato CSV:**
```csv
title,main_hashtag,origin,views,likes,comments,shares,score,url
"Título","#beleza","tiktok_cc",1000000,50000,1000,500,0.2450,"https://..."
```

---

### 7. PAINEL WEB

**Arquivo:** `public/panel.html`

**Funcionalidades:**
- Exibe Top 20 em tabela
- Filtros por origem e idioma
- Botão de atualização manual
- Link para download CSV
- Auto-refresh a cada 5 minutos
- Design responsivo

**Acesso:** `GET /painel`

---

### 8. COLETA DIÁRIA (n8n)

**Opção 1 - Script Direto:**
```bash
node scripts/run-daily-collection.js
```

**Opção 2 - HTTP Endpoint:**
```http
POST /internal/run-collection
Headers:
  x-api-token: seu_token_secreto
```

**Lógica Idempotente:**
- Verifica duplicatas por `video_url` + `DATE(collected_at)`
- Ignora registros já existentes no mesmo dia
- Loga quantos foram inseridos e quantos foram ignorados

---

## Exemplos de Uso

### Exemplo 1: Buscar Top 20 via API

```bash
curl "http://localhost:3000/trends/top20?niche=beleza&country=BR"
```

### Exemplo 2: Baixar CSV

```bash
curl "http://localhost:3000/trends/top20.csv" -o top20.csv
```

### Exemplo 3: Executar Coleta via n8n (HTTP)

```bash
curl -X POST http://localhost:3000/internal/run-collection \
  -H "x-api-token: seu_token_secreto" \
  -H "Content-Type: application/json"
```

### Exemplo 4: Executar Coleta via n8n (Script)

No n8n, configure um nó "Execute Command":
- **Command:** `node`
- **Arguments:** `scripts/run-daily-collection.js`
- **Working Directory:** `/caminho/para/projeto`

---

## Segurança

### Rate Limiting
- **Limite:** 100 requisições por 15 minutos por IP
- **Configurável:** `RATE_LIMIT_MAX` no .env
- **Aplicado em:** Todas as rotas públicas

### CORS
- **Desenvolvimento:** `*` (todos os domínios)
- **Produção:** Configurar `CORS_ORIGIN` com domínio específico
- **Configuração:** `CORS_ORIGIN` no .env

### Endpoint Interno
- **Proteção:** Token via header `x-api-token`
- **Configuração:** `INTERNAL_API_TOKEN` no .env
- **Rota:** `POST /internal/run-collection`

### Painel Web
- **Proteção:** Token via header `x-panel-token` ou query `?token=`
- **Configuração:** `PANEL_ACCESS_TOKEN` no .env
- **Rota:** `GET /painel`
- **Acesso:** 
  ```bash
  curl -H "x-panel-token: seu_token" http://localhost:3000/painel
  # ou
  curl "http://localhost:3000/painel?token=seu_token"
  ```

### Tratamento de Erros
- **Desenvolvimento:** Mensagens de erro detalhadas
- **Produção:** Mensagens genéricas (não expõe detalhes internos)
- **Logs:** Todos os erros são logados com detalhes completos

---

## Logs

**Localização:** `logs/combined.log` e `logs/error.log`

**Formato:** JSON estruturado com Winston

**Informações Registradas:**
- Coleta de cada fonte
- Aplicação de filtros
- Cálculo de ranking
- Inserções no banco
- Erros e warnings

---

## Próximos Passos Sugeridos

1. **Cache:** Implementar cache Redis para reduzir chamadas
2. **Webhooks:** Notificar quando novas tendências são coletadas
3. **Analytics:** Dashboard com métricas históricas
4. **Alertas:** Notificações quando score ultrapassa threshold
5. **API Keys:** Sistema de autenticação por API key para usuários

