# 📦 Sistema de Persistência de Produtos TikTok Shop

## ✅ Funcionalidades Implementadas

1. **Salvamento Automático**: Todos os produtos coletados são automaticamente salvos no banco de dados MySQL
2. **Prevenção de Duplicatas**: Produtos com o mesmo ID não são duplicados no mesmo dia
3. **CSV Completo**: Endpoint para baixar todos os produtos coletados do dia atual

## 🗄️ Configuração do Banco de Dados

### 1. Criar a Tabela de Produtos

Execute o script SQL para criar a tabela:

```bash
mysql -u root -p saitec_trends < database/create_products_table.sql
```

Ou execute diretamente no MySQL:

```sql
USE saitec_trends;
SOURCE database/create_products_table.sql;
```

### 2. Verificar se a Tabela foi Criada

```sql
USE saitec_trends;
SHOW TABLES;
DESCRIBE tiktok_shop_products;
```

## 📊 Endpoints Disponíveis

### 1. Coletar e Salvar Produtos (Automático)
```
GET /shop/top-products?source=kalodata&limit=20
```
- Coleta produtos do Kalodata
- **Salva automaticamente no banco de dados**
- Retorna JSON com os produtos coletados

### 2. Baixar CSV dos Produtos Coletados Agora
```
GET /shop/top-products.csv?source=kalodata&limit=20
```
- Gera CSV apenas dos produtos coletados nesta requisição
- Não inclui produtos salvos anteriormente

### 3. Baixar CSV Completo do Dia (NOVO!)
```
GET /shop/products/all.csv?date=2025-12-09&source=kalodata&country=BR
```
- **Retorna TODOS os produtos salvos do dia especificado**
- Parâmetros opcionais:
  - `date`: Data no formato YYYY-MM-DD (padrão: hoje)
  - `source`: Filtrar por fonte (kalodata, tiktok_shop)
  - `country`: Filtrar por país (BR, US, etc.)

## 🎯 Como Usar

### 1. Coletar Produtos (Salva Automaticamente)
```bash
# Via navegador
http://localhost:3000/shop/top-products?source=kalodata&limit=20

# Via curl
curl "http://localhost:3000/shop/top-products?source=kalodata&limit=20"
```

### 2. Baixar CSV Completo do Dia
```bash
# Via navegador
http://localhost:3000/shop/products/all.csv

# Com filtros
http://localhost:3000/shop/products/all.csv?date=2025-12-09&source=kalodata

# Via curl
curl "http://localhost:3000/shop/products/all.csv" -o produtos_hoje.csv
```

### 3. Via Painel Web
- Acesse: `http://localhost:3000/painel`
- Clique em **"📊 Baixar CSV Completo (Dia)"** para baixar todos os produtos salvos do dia atual

## 📋 Estrutura da Tabela

A tabela `tiktok_shop_products` armazena:

- **ID do Produto**: Identificador único do produto
- **Informações Básicas**: Título, categoria, país, fonte
- **Métricas**: Receita, crescimento, itens vendidos, preço médio
- **Comissões**: Taxa de comissão, taxa de conversão
- **Criadores**: Número de criadores, vídeos top
- **Datas**: Data de lançamento, data de coleta
- **URLs**: Link do produto, imagem do produto
- **Rank**: Posição no ranking

## 🔍 Consultas Úteis

### Ver produtos coletados hoje
```sql
SELECT * FROM tiktok_shop_products 
WHERE DATE(collected_at) = CURDATE()
ORDER BY rank ASC;
```

### Contar produtos por dia
```sql
SELECT DATE(collected_at) as data, COUNT(*) as total
FROM tiktok_shop_products
GROUP BY DATE(collected_at)
ORDER BY data DESC;
```

### Produtos mais vendidos (por receita)
```sql
SELECT title, revenue, rank, collected_at
FROM tiktok_shop_products
WHERE DATE(collected_at) = CURDATE()
ORDER BY rank ASC
LIMIT 10;
```

## ⚠️ Importante

- Os produtos são salvos **automaticamente** toda vez que você acessa `/shop/top-products`
- Produtos duplicados no mesmo dia são **ignorados** (não são inseridos novamente)
- O CSV completo inclui **todos os produtos salvos**, não apenas os da última coleta
- A data de coleta é salva automaticamente para cada produto

## 🚀 Próximos Passos

1. Execute o script SQL para criar a tabela
2. Teste coletando produtos: `GET /shop/top-products`
3. Verifique no banco: `SELECT * FROM tiktok_shop_products`
4. Baixe o CSV completo: `GET /shop/products/all.csv`

