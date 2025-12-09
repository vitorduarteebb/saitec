# 🚀 Guia Rápido de Início

## Instalação em 5 minutos

### 1. Instalar Node.js e MySQL

Certifique-se de ter:
- Node.js 16+ instalado
- MySQL 8.0+ instalado e rodando

### 2. Clonar/Configurar Projeto

```bash
cd SAITEC
npm install
```

### 3. Configurar Banco de Dados

Crie o arquivo `.env` na raiz do projeto:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=sua_senha_aqui
DB_NAME=saitec_trends

DEFAULT_NICHE=beleza
DEFAULT_COUNTRY=BR
MIN_VIEWS=50000
```

### 4. Criar Tabelas

```bash
mysql -u root -p < database/schema.sql
```

Ou execute manualmente o conteúdo de `database/schema.sql` no MySQL.

### 5. Iniciar Servidor

```bash
npm start
```

Você verá:
```
🚀 Servidor de tendências rodando na porta 3000
📊 Health check: http://localhost:3000/health
```

### 6. Testar API

Em outro terminal:

```bash
node scripts/test-api.js
```

Ou teste manualmente:

```bash
curl http://localhost:3000/health
curl "http://localhost:3000/trends/top?niche=beleza&limit=5"
```

## Próximos Passos

1. ✅ Servidor rodando? → Configure o n8n workflow
2. ✅ n8n configurado? → Veja `docs/N8N_WORKFLOW_EXAMPLE.json`
3. ✅ Tudo funcionando? → Implemente integrações reais (TikTok CC, PiPiAds)

## Problemas?

Veja `docs/FASE1_DOCUMENTACAO.md` → Seção "Troubleshooting"

