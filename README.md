# 🚀 Automação SAITEC - Coleta de Produtos TikTok Shop

Sistema automatizado para coleta, armazenamento e análise dos produtos mais vendidos do TikTok Shop através da plataforma Kalodata.

## 📋 Sobre o Sistema

A **Automação SAITEC** monitora diariamente os rankings de produtos mais vendidos no TikTok Shop, coletando informações detalhadas sobre receita, crescimento, vendas e métricas de performance. Todos os dados são automaticamente salvos em banco de dados MySQL e podem ser exportados em formato CSV para análise.

### Principais Funcionalidades

- ✅ **Coleta Automatizada**: Coleta diária dos produtos mais vendidos
- ✅ **Persistência de Dados**: Armazenamento automático em MySQL
- ✅ **Prevenção de Duplicatas**: Evita produtos duplicados no mesmo dia
- ✅ **Exportação CSV**: Download de dados completos em formato CSV
- ✅ **Interface Web**: Painel moderno para visualização
- ✅ **API REST**: Endpoints para integração com outros sistemas
- ✅ **Login Automático**: Gerenciamento de sessão com cookies

---

## 🚀 Início Rápido

### Pré-requisitos

- Node.js 18+ 
- MySQL 8.0+
- Google Chrome/Chromium
- Conta no Kalodata (versão gratuita funciona)

### Instalação Local

```bash
# 1. Clonar repositório
git clone <repositorio> saitec-automation
cd saitec-automation

# 2. Instalar dependências
npm install

# 3. Configurar banco de dados
mysql -u root -p < database/schema.sql
mysql -u root -p saitec_trends < database/create_products_table.sql

# 4. Configurar variáveis de ambiente
cp config.example.env .env
nano .env  # Configure suas credenciais

# 5. Primeiro login (modo visível)
export KALODATA_HEADLESS=false
npm start

# 6. Quando o navegador abrir, faça login no Kalodata
# Os cookies serão salvos automaticamente
```

### Configuração Básica (.env)

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

# Puppeteer (modo visível para primeiro login)
KALODATA_HEADLESS=false
HEADLESS=false
```

### Iniciar Servidor

```bash
npm start
```

O servidor estará disponível em `http://localhost:3000`

---

## 📡 Endpoints da API

### Health Check
```
GET /health
```
Retorna status do sistema e conexão com banco.

### Coletar Produtos
```
GET /shop/top-products?source=kalodata&limit=20&country=BR
```
Coleta produtos e salva automaticamente no banco.

**Parâmetros**:
- `source`: `kalodata` ou `tiktok_shop` (padrão: `kalodata`)
- `limit`: Número de produtos (padrão: 20, máximo: 100)
- `country`: Código do país (padrão: BR)
- `category`: Categoria do produto (opcional)

### Download CSV da Coleta Atual
```
GET /shop/top-products.csv?source=kalodata&limit=20
```
Gera CSV apenas com produtos coletados nesta requisição.

### Download CSV Completo do Dia
```
GET /shop/products/all.csv?date=2025-12-09&source=kalodata
```
Retorna CSV com **todos** os produtos salvos do dia especificado.

**Parâmetros**:
- `date`: Data no formato YYYY-MM-DD (padrão: hoje)
- `source`: Filtrar por fonte (opcional)
- `country`: Filtrar por país (opcional)

### Painel Web
```
GET /painel
```
Interface web para visualização dos produtos coletados.

---

## 🗄️ Banco de Dados

### Estrutura

O sistema utiliza duas tabelas principais:

- **`trends`**: Tendências de vídeos (legado)
- **`tiktok_shop_products`**: Produtos TikTok Shop coletados

### Consultas Úteis

```sql
-- Produtos coletados hoje
SELECT * FROM tiktok_shop_products 
WHERE DATE(collected_at) = CURDATE()
ORDER BY rank ASC;

-- Estatísticas por dia
SELECT DATE(collected_at) as data, COUNT(*) as total
FROM tiktok_shop_products
GROUP BY DATE(collected_at)
ORDER BY data DESC;
```

---

## 🚀 Deploy em VPS

Para instalação em servidor VPS, consulte os guias:

📖 **[DEPLOY_VPS_HOSTINGER.md](DEPLOY_VPS_HOSTINGER.md)** - Guia completo para VPS Hostinger  
⚡ **[DEPLOY_RAPIDO.md](DEPLOY_RAPIDO.md)** - Comandos rápidos de deploy  
📚 **[DEPLOY_VPS.md](DEPLOY_VPS.md)** - Guia genérico de deploy

### Resumo Rápido

1. Instalar Node.js, MySQL e Chrome
2. Configurar banco de dados
3. Fazer primeiro login (com X11 forwarding ou VNC)
4. Configurar PM2 para gerenciamento
5. Configurar backup automático

---

## 📚 Documentação

- **[DOCUMENTACAO_COMPLETA.md](DOCUMENTACAO_COMPLETA.md)** - Documentação técnica completa
- **[DEPLOY_VPS.md](DEPLOY_VPS.md)** - Guia de deploy em VPS
- **[PRODUTOS_SETUP.md](PRODUTOS_SETUP.md)** - Configuração de persistência
- **[KALODATA_SETUP.md](KALODATA_SETUP.md)** - Configuração do Kalodata

---

## 🔧 Estrutura do Projeto

```
saitec-automation/
├── database/
│   ├── schema.sql                 # Schema principal
│   └── create_products_table.sql  # Tabela de produtos
├── public/
│   └── panel.html                 # Interface web
├── src/
│   ├── database.js                # Operações de banco
│   ├── scheduler.js               # Agendamento
│   ├── trendsService.js           # Serviços
│   └── scrapers/
│       ├── kalodataScraper.js    # Scraper Kalodata
│       └── tiktokShopScraper.js  # Scraper TikTok Shop
├── cookies/                       # Cookies salvos (gitignored)
├── logs/                          # Logs (gitignored)
├── server.js                      # Servidor principal
└── package.json
```

---

## 🔐 Segurança

- Arquivo `.env` nunca deve ser commitado
- Cookies armazenados localmente
- Use senhas fortes
- Configure firewall em produção
- Use HTTPS em produção

---

## 🐛 Troubleshooting

### Erro: "Cannot connect to database"
Verifique se MySQL está rodando e credenciais no `.env` estão corretas.

### Erro: "Nenhum produto encontrado"
Verifique se o login no Kalodata foi realizado. Tente login manual com `KALODATA_HEADLESS=false`.

### Erro: "Chrome not found"
Instale Google Chrome ou Chromium. Veja instruções em `DEPLOY_VPS.md`.

Para mais soluções, consulte a seção de Troubleshooting em `DOCUMENTACAO_COMPLETA.md`.

---

## 📝 Licença

ISC

---

## 📞 Suporte

Para questões técnicas, consulte a documentação completa ou verifique os logs:

```bash
pm2 logs saitec-automation  # Se usando PM2
tail -f logs/combined.log   # Logs do sistema
```

---

**Versão**: 1.0  
**Última Atualização**: Dezembro 2025  
**Desenvolvido por**: SAITEC
