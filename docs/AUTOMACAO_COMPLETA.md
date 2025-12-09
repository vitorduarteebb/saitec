# 🤖 Automação Completa - Fase 1

## ✅ Status: IMPLEMENTADO

A automação completa da Fase 1 está **100% funcional** e **não depende de n8n ou cron externo**.

---

## 🎯 O que está automatizado

### 1. ✅ Coleta Diária Automática
- **Status:** Funcionando
- **Como funciona:** Agendamento interno usando `node-cron`
- **Configuração:** Via variáveis de ambiente no `.env`

### 2. ✅ Geração Automática de CSV Diário
- **Status:** Funcionando
- **Como funciona:** CSV gerado automaticamente após cada coleta
- **Localização:** Pasta `exports/` na raiz do projeto
- **Formato:** `top20_trends_YYYY-MM-DD.csv`

---

## ⚙️ Como Funciona

### Arquitetura Simplificada

```
┌─────────────────────┐
│   Servidor Node.js  │
│   (server.js)       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Scheduler         │  ← Agendamento interno (node-cron)
│   (src/scheduler.js)│
└──────────┬──────────┘
           │
           ├─→ Coleta de Tendências
           ├─→ Salva no Banco MySQL
           └─→ Gera CSV automaticamente
```

**Não precisa de:**
- ❌ n8n
- ❌ Cron do sistema operacional
- ❌ Task Scheduler do Windows
- ❌ Intervenção manual

**Tudo roda junto com o servidor!**

---

## 🚀 Configuração

### 1. Instalar Dependência

```bash
npm install
```

Isso instalará automaticamente o `node-cron` necessário para agendamento.

### 2. Configurar Variáveis de Ambiente

No arquivo `.env`, configure:

```env
# ============================================
# CONFIGURAÇÕES DE AGENDAMENTO AUTOMÁTICO
# ============================================

# Habilitar agendamento (true/false)
SCHEDULER_ENABLED=true

# Horários de coleta (separados por vírgula)
# Exemplos:
#   "10" = apenas às 10h
#   "10,15,21" = às 10h, 15h e 21h (3x por dia)
COLLECTION_HOURS=10

# Timezone (padrão: America/Sao_Paulo)
TZ=America/Sao_Paulo

# Limite de tendências
COLLECTION_LIMIT=20

# Fontes de coleta
COLLECTION_SOURCES=tiktok_cc,pipiads

# Hashtags (se usar hashtag_scraper)
COLLECTION_HASHTAGS=#beleza,#promo

# Idioma para filtro
FILTER_LANGUAGE=pt
```

### 3. Iniciar Servidor

```bash
npm start
```

**Pronto!** O agendamento será iniciado automaticamente junto com o servidor.

---

## 📅 Exemplos de Configuração

### Coleta 1x por dia (10h)
```env
COLLECTION_HOURS=10
```

### Coleta 3x por dia (10h, 15h, 21h)
```env
COLLECTION_HOURS=10,15,21
```

### Coleta 4x por dia (0h, 6h, 12h, 18h)
```env
COLLECTION_HOURS=0,6,12,18
```

### Desabilitar automação (apenas manual)
```env
SCHEDULER_ENABLED=false
```

---

## 📁 Onde os CSVs são salvos?

Todos os CSVs gerados automaticamente são salvos em:

```
projeto/
└── exports/
    ├── top20_trends_2025-01-22.csv
    ├── top20_trends_2025-01-23.csv
    └── top20_trends_2025-01-24.csv
```

A pasta `exports/` é criada automaticamente na primeira execução.

---

## 📊 Logs e Monitoramento

### Logs de Coleta Automática

Quando a coleta automática roda, você verá logs como:

```
[Scheduler] Executando coleta agendada às 10h...
[Scheduler] Iniciando coleta de tendências...
[Scheduler] Coletadas 20 tendências
[Scheduler] Tendências salvas: 18 (2 duplicadas ignoradas)
[Scheduler] CSV gerado: exports/top20_trends_2025-01-22.csv (20 registros)
[Scheduler] ✅ Coleta agendada concluída com sucesso às 10h
```

### Verificar Status

O servidor mostra na inicialização:

```
[Scheduler] Iniciando agendamento automático...
[Scheduler] Horários configurados: 10h
[Scheduler] ✅ Agendamento configurado: 0 10 * * * (10h)
[Scheduler] 1 agendamento(s) ativo(s)
✅ Agendamento automático ATIVO - Coleta e CSV serão gerados automaticamente
```

---

## 🔧 Funcionalidades

### ✅ Coleta Automática
- Coleta tendências dos sources configurados
- Aplica filtros (mínimo de views, blacklist, idioma)
- Calcula score de engajamento
- Ranqueia e seleciona Top 20

### ✅ Salvamento Automático
- Salva no banco de dados MySQL
- Evita duplicatas (mesmo vídeo no mesmo dia)
- Retorna estatísticas (inseridos, ignorados)

### ✅ Geração Automática de CSV
- Gera CSV após cada coleta
- Formato UTF-8 com BOM (compatível com Excel)
- Nome do arquivo inclui data: `top20_trends_YYYY-MM-DD.csv`
- Salva na pasta `exports/`

---

## 🧪 Testar Manualmente

### Executar Coleta + CSV Agora

Você pode testar a função completa manualmente:

```javascript
// Via código
const { runDailyCollectionWithCSV } = require('./src/scheduler');
await runDailyCollectionWithCSV();
```

Ou via endpoint HTTP (se configurado):

```bash
curl -X POST http://localhost:3000/internal/run-collection \
  -H "x-api-token: seu_token"
```

---

## 🛠️ Troubleshooting

### Agendamento não está rodando

1. **Verificar se está habilitado:**
   ```env
   SCHEDULER_ENABLED=true
   ```

2. **Verificar logs na inicialização:**
   - Deve aparecer: `✅ Agendamento automático ATIVO`

3. **Verificar timezone:**
   ```env
   TZ=America/Sao_Paulo
   ```

### CSV não está sendo gerado

1. **Verificar se pasta exports existe:**
   - A pasta é criada automaticamente
   - Verifique permissões de escrita

2. **Verificar logs:**
   - Procure por: `[Scheduler] CSV gerado:`

3. **Verificar se coleta está funcionando:**
   - Se não coletar tendências, não gera CSV

### Desabilitar temporariamente

Para desabilitar sem alterar código:

```env
SCHEDULER_ENABLED=false
```

Reinicie o servidor e o agendamento será desabilitado.

---

## 📝 Checklist de Entrega Fase 1

- [x] ✅ Top 20 automático (ranqueado)
- [x] ✅ CSV gerado diariamente (automático)
- [x] ✅ Painel funcional (web standalone)
- [x] ✅ Sistema automático de coleta (agendamento interno)
- [x] ✅ Processamento + score/filtros (automático)
- [x] ✅ Geração automática do CSV diário (automático)
- [x] ✅ Tudo rodando end-to-end (sem intervenção manual)

**Status:** ✅ **100% COMPLETO**

---

## 🎉 Pronto para Produção!

A Fase 1 está **completa e funcional**. Basta:

1. Configurar o `.env` com suas credenciais
2. Executar `npm install`
3. Executar `npm start`
4. **Pronto!** Tudo roda automaticamente.

**Não precisa de n8n, não precisa de cron externo, não precisa de intervenção manual!**

---

**Última atualização:** Janeiro 2025

