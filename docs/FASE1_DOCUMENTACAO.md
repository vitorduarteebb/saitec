# 📊 FASE 1 - Sistema Automático de Coleta de Tendências

## 🎯 Objetivo

Sistema totalmente automático que roda diariamente (ou várias vezes ao dia), busca tendências em múltiplas fontes pré-definidas, filtra, ranqueia, salva Top 20 e disponibiliza em painel + CSV.

**Sem input manual, sem necessidade de colar links manualmente.**

---

## 🏗️ Arquitetura

```
┌─────────────────────┐
│   Servidor Node.js   │
│   (server.js)        │
└──────────┬───────────┘
           │
           ▼
┌─────────────────────┐
│   Scheduler         │  ← Agendamento interno (node-cron)
│   (src/scheduler.js)│  ← NÃO precisa de n8n ou cron externo!
└──────────┬───────────┘
           │
           ├─→ Coleta Automática (TikTok CC, PiPiAds, Hashtags)
           ├─→ Processamento + Score + Filtros
           ├─→ Salva no Banco MySQL
           └─→ Gera CSV Automaticamente (exports/)
```

**✅ Automação Completa Implementada**
- ✅ Agendamento interno (não precisa de n8n ou cron externo)
- ✅ Coleta automática diária
- ✅ Geração automática de CSV
- ✅ Tudo roda junto com o servidor

Veja `docs/AUTOMACAO_COMPLETA.md` para detalhes completos.

---

## 📦 Componentes

### 1. Microserviço Node.js (`server.js`)

Servidor Express que expõe endpoints REST para o n8n consumir.

**Endpoints disponíveis:**

- `GET /health` - Health check do serviço
- `GET /trends/top` - Busca top tendências (não salva no banco)
- `POST /trends/collect-and-save` - Busca e salva automaticamente no banco
- `GET /trends/latest` - Busca últimas tendências salvas no banco

### 2. Serviço de Coleta (`src/trendsService.js`)

Lógica de negócio para:
- Buscar tendências de múltiplas fontes
- Calcular score de engajamento
- Aplicar filtros (blacklist, mínimo de views, idioma)
- Normalizar dados de diferentes fontes

### 3. Módulo de Banco de Dados (`src/database.js`)

Operações CRUD com MySQL:
- Inserção de tendências (individual e em lote)
- Consulta de últimas tendências
- Gerenciamento de pool de conexões

### 4. Banco de Dados MySQL

Tabela `trends` com todos os campos necessários para armazenar tendências coletadas.

---

## 🚀 Instalação e Configuração

### Passo 1: Instalar Dependências

```bash
npm install
```

### Passo 2: Configurar Variáveis de Ambiente

Copie o arquivo `.env.example` para `.env` e configure:

```env
# Servidor
PORT=3000
NODE_ENV=production

# Banco de Dados
DB_HOST=localhost
DB_PORT=3306
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_NAME=saitec_trends

# Coleta
DEFAULT_NICHE=beleza
DEFAULT_COUNTRY=BR
MIN_VIEWS=50000

# Score
LIKES_WEIGHT=3
COMMENTS_WEIGHT=4
SHARES_WEIGHT=5

# Filtros
BLACKLIST_WORDS=porn,bet,casino,jogo,aposta
```

### Passo 3: Criar Banco de Dados

Execute o script SQL:

```bash
mysql -u seu_usuario -p < database/schema.sql
```

Ou execute manualmente o conteúdo de `database/schema.sql` no MySQL.

### Passo 4: Iniciar o Serviço

```bash
# Produção
npm start

# Desenvolvimento (com auto-reload)
npm run dev
```

O serviço estará disponível em `http://localhost:3000`

---

## 🔄 Configuração do n8n Workflow

### Workflow: `WF_TRENDS_DAILY_TOP20`

#### 1. Trigger - Cron

- **Nome:** `Cron - Coleta Diária`
- **Tipo:** Cron
- **Expressão:** `0 10,15,21 * * *` (10h, 15h e 21h todos os dias)
- Ou: `0 10 * * *` (apenas 10h)

#### 2. HTTP Request - Coletar Tendências

- **Nome:** `Coletar Top 20 Tendências`
- **Método:** POST
- **URL:** `http://seu-servidor:3000/trends/collect-and-save`
- **Body (JSON):**
```json
{
  "niche": "beleza",
  "country": "BR",
  "limit": 20,
  "sources": "tiktok_cc,pipiads",
  "minViews": 50000,
  "language": "pt"
}
```

#### 3. Function Node - Refino (Opcional)

- **Nome:** `Aplicar Filtros Adicionais`
- **Código:**
```javascript
const items = $json.data || [];

// Filtros adicionais se necessário
const blacklist = ['palavra1', 'palavra2'];

return items
  .filter(i => {
    const text = (i.title + ' ' + (i.description || '')).toLowerCase();
    return !blacklist.some(b => text.includes(b));
  })
  .map(i => ({ json: i }));
```

#### 4. MySQL Node - Salvar (Já feito pela API)

Se você usar `POST /trends/collect-and-save`, este passo já está incluído. Caso contrário, adicione um nó MySQL para inserir manualmente.

#### 5. Generate CSV

- **Nome:** `Gerar CSV`
- **Tipo:** Generate CSV
- **Campos:**
  - source
  - niche
  - title
  - views
  - likes
  - comments
  - shares
  - engagementScore
  - videoUrl
  - authorHandle
  - collectedAt

#### 6. Salvar CSV

- **Nome:** `Salvar CSV`
- **Tipo:** Write Binary File ou Google Drive
- **Nome do arquivo:** `trends/{{ $now.format('YYYY-MM-DD') }}-top20.csv`

#### 7. Painel/Dashboard (Opcional)

Crie um workflow separado para visualização:
- **Trigger:** Manual ou Webhook
- **Ação:** `GET /trends/latest?limit=20`
- **Saída:** Exibir em tabela HTML ou conectar com Metabase/Superset

---

## 📊 Modelo de Dados

### Tabela `trends`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | BIGINT | ID único (auto-increment) |
| source | VARCHAR(50) | Fonte: 'tiktok_cc', 'pipiads', 'hashtag_scraper' |
| niche | VARCHAR(100) | Nicho (ex: 'beleza', 'moda') |
| title | VARCHAR(255) | Título do vídeo |
| description | TEXT | Descrição do vídeo |
| video_url | TEXT | URL do vídeo |
| thumb_url | TEXT | URL da thumbnail |
| sound_name | VARCHAR(255) | Nome do som |
| author_handle | VARCHAR(150) | Handle do autor |
| views | BIGINT | Visualizações |
| likes | BIGINT | Curtidas |
| comments | BIGINT | Comentários |
| shares | BIGINT | Compartilhamentos |
| engagement_score | DECIMAL(10,4) | Score calculado |
| country | VARCHAR(10) | Código do país |
| language | VARCHAR(10) | Idioma |
| collected_at | DATETIME | Data/hora da coleta |
| created_at | TIMESTAMP | Data/hora de criação |

---

## 🧮 Lógica de Score

O score de engajamento é calculado pela fórmula:

```
score = (likes × 3 + comments × 4 + shares × 5) / views
```

**Pesos configuráveis:**
- Likes: peso 3 (padrão)
- Comments: peso 4 (padrão)
- Shares: peso 5 (padrão)

Quanto maior o score, maior o engajamento relativo às visualizações.

---

## 🔍 Filtros Aplicados

### Filtros Automáticos

1. **Mínimo de Views:** Padrão 50.000 (configurável via `MIN_VIEWS`)
2. **Blacklist de Palavras:** Lista configurável via `BLACKLIST_WORDS`
3. **Filtro por Idioma:** Opcional (ex: apenas 'pt')
4. **Filtro por Autor:** Opcional (excluir handles específicos)

### Como Modificar Filtros

**Via variáveis de ambiente (.env):**
```env
MIN_VIEWS=100000
BLACKLIST_WORDS=palavra1,palavra2,palavra3
```

**Via API (parâmetros na requisição):**
```json
{
  "minViews": 100000,
  "language": "pt",
  "filters": {
    "excludedAuthors": ["@spam", "@bot"]
  }
}
```

---

## 📈 Fontes de Dados

### 1. TikTok Creative Center (`tiktok_cc`)

**Status:** Implementação mockada (precisa adaptar para API real)

**Como implementar:**
- Acessar API oficial do TikTok Creative Center
- Ou usar scraping com Puppeteer/Playwright
- Ou usar serviço de proxy/API terceira

**Localização no código:** `src/trendsService.js` → `getTrendsFromTikTokCreativeCenter()`

### 2. PiPiAds (`pipiads`)

**Status:** Implementação mockada (precisa adaptar para API real)

**Como implementar:**
- Integrar com API do PiPiAds
- Ou usar scraping se disponível

**Localização no código:** `src/trendsService.js` → `getTrendsFromPiPiAds()`

### 3. Scraper de Hashtags (`hashtag_scraper`)

**Status:** Implementação mockada (precisa implementar scraper real)

**Como implementar:**
- Usar Puppeteer/Playwright para fazer scraping do TikTok
- Buscar por hashtags específicas (ex: #beleza, #promo)
- Extrair métricas e URLs

**Localização no código:** `src/trendsService.js` → `getTrendsFromHashtags()`

---

## 🧪 Testando o Sistema

### 1. Testar Health Check

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

### 2. Testar Coleta de Tendências

```bash
curl "http://localhost:3000/trends/top?niche=beleza&country=BR&limit=20"
```

### 3. Testar Coleta e Salvamento

```bash
curl -X POST http://localhost:3000/trends/collect-and-save \
  -H "Content-Type: application/json" \
  -d '{
    "niche": "beleza",
    "country": "BR",
    "limit": 20,
    "sources": "tiktok_cc,pipiads"
  }'
```

### 4. Testar Busca de Últimas Tendências

```bash
curl "http://localhost:3000/trends/latest?limit=20"
```

---

## 📝 Exemplo de Resposta da API

### GET /trends/top

```json
{
  "success": true,
  "count": 20,
  "data": [
    {
      "source": "tiktok_cc",
      "niche": "beleza",
      "title": "Tutorial de Maquiagem Natural",
      "description": "Aprenda a fazer uma make natural em 5 minutos",
      "videoUrl": "https://www.tiktok.com/@beautyexpert/video/1234567890",
      "thumbUrl": "https://example.com/thumb1.jpg",
      "soundName": "som original",
      "authorHandle": "@beautyexpert",
      "views": 1200000,
      "likes": 54000,
      "comments": 1200,
      "shares": 800,
      "engagementScore": 0.1950,
      "country": "BR",
      "language": "pt",
      "collectedAt": "2025-01-22T10:00:00.000Z"
    }
  ],
  "params": {
    "niche": "beleza",
    "country": "BR",
    "limit": 20,
    "sources": ["tiktok_cc", "pipiads"]
  }
}
```

---

## 🔧 Manutenção e Ajustes

### Como Alterar Frequência de Coleta

No n8n, edite o nó Cron:
- **1x por dia:** `0 10 * * *` (10h)
- **3x por dia:** `0 10,15,21 * * *` (10h, 15h, 21h)
- **A cada 6 horas:** `0 */6 * * *`

### Como Alterar Nichos

No workflow do n8n, altere o parâmetro `niche` no HTTP Request:
- `beleza`
- `moda`
- `fitness`
- `comida`
- `genérico`

### Como Baixar CSV Manualmente

1. Execute o workflow manualmente no n8n
2. Ou acesse o endpoint `/trends/latest` e converta para CSV
3. Ou consulte diretamente o banco de dados

### Como Rodar Coleta Manual (Fora do Cron)

**Via n8n:**
- Execute o workflow manualmente clicando em "Execute Workflow"

**Via API:**
```bash
curl -X POST http://localhost:3000/trends/collect-and-save \
  -H "Content-Type: application/json" \
  -d '{"niche": "beleza", "country": "BR", "limit": 20}'
```

**Via código:**
```javascript
const { getTopTrends } = require('./src/trendsService');
const { insertTrends } = require('./src/database');

async function coletarManual() {
  const trends = await getTopTrends({ niche: 'beleza', country: 'BR', limit: 20 });
  await insertTrends(trends);
  console.log(`Coletadas e salvas ${trends.length} tendências`);
}
```

---

## 🐛 Troubleshooting

### Erro: "Cannot connect to database"

**Solução:**
1. Verifique se o MySQL está rodando
2. Confira as credenciais no `.env`
3. Teste a conexão: `mysql -u usuario -p -h localhost`

### Erro: "Table 'trends' doesn't exist"

**Solução:**
1. Execute o script `database/schema.sql`
2. Verifique se o nome do banco está correto no `.env`

### API retorna dados mockados

**Solução:**
- Isso é esperado! As funções de coleta estão mockadas.
- Você precisa implementar as integrações reais com TikTok Creative Center, PiPiAds, etc.
- Veja a seção "Fontes de Dados" acima.

### n8n não consegue acessar a API

**Solução:**
1. Verifique se o serviço está rodando: `curl http://localhost:3000/health`
2. Se o n8n estiver em outro servidor, configure o IP correto
3. Verifique firewall/portas

---

## 📋 Checklist de Implementação Real

Para tornar o sistema 100% funcional, você precisa:

- [ ] Implementar integração real com TikTok Creative Center
- [ ] Implementar integração real com PiPiAds
- [ ] Implementar scraper real de hashtags do TikTok
- [ ] Configurar proxy/VPN se necessário para scraping
- [ ] Testar coleta em produção
- [ ] Configurar monitoramento/logs
- [ ] Configurar backup do banco de dados
- [ ] Configurar alertas em caso de falha

---

## 📞 Suporte

Para dúvidas ou problemas:
1. Verifique os logs do servidor: `npm start` (no terminal)
2. Verifique os logs do n8n
3. Consulte a documentação da API acima
4. Teste os endpoints manualmente com `curl`

---

## 🎉 Resultado Esperado

Após configurar tudo, você terá:

✅ Sistema rodando automaticamente 1-3x por dia  
✅ Top 20 tendências coletadas e salvas no banco  
✅ CSV gerado automaticamente por data  
✅ Painel no n8n mostrando as últimas tendências  
✅ Histórico completo no banco de dados  
✅ Filtros e score aplicados automaticamente  

**Tudo funcionando sem intervenção manual!** 🚀

