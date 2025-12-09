# Configuração do Kalodata Scraper

## Visão Geral

O scraper do Kalodata coleta automaticamente os **Top 20 produtos mais vendidos** do TikTok Shop através do site [Kalodata](https://www.kalodata.com/product).

## Configuração

### 1. Variáveis de Ambiente

Adicione as seguintes variáveis no arquivo `.env`:

```env
# Credenciais do Kalodata (opcional - para login automático)
KALODATA_EMAIL=seu_email@exemplo.com
KALODATA_PASSWORD=sua_senha

# Configurações do navegador
HEADLESS=false  # false = navegador visível (necessário para login manual)
PUPPETEER_TIMEOUT=300000  # 5 minutos
PUPPETEER_PROTOCOL_TIMEOUT=600000  # 10 minutos
```

### 2. Login

O sistema suporta dois modos de login:

#### Modo Automático (Recomendado)
1. Configure `KALODATA_EMAIL` e `KALODATA_PASSWORD` no `.env`
2. O sistema fará login automaticamente na primeira execução
3. Os cookies serão salvos em `cookies/kalodata-cookies.json`
4. Nas próximas execuções, o sistema usará os cookies salvos

#### Modo Manual
1. Deixe `KALODATA_EMAIL` e `KALODATA_PASSWORD` vazios ou não configure
2. Configure `HEADLESS=false` no `.env`
3. Na primeira execução, o navegador abrirá visível
4. Faça login manualmente no Kalodata
5. Os cookies serão salvos automaticamente
6. Nas próximas execuções, o sistema usará os cookies salvos

## Uso

### Endpoint da API

```
GET /shop/top-products
```

**Parâmetros:**
- `limit` (opcional): Quantidade de produtos (padrão: 20, máximo: 100)
- `country` (opcional): País (padrão: BR)
- `category` (opcional): Categoria do produto
- `source` (opcional): Fonte de dados - `kalodata` (padrão) ou `tiktok_shop`

**Exemplo:**
```bash
# Buscar Top 20 produtos do Kalodata
GET http://localhost:3000/shop/top-products?limit=20

# Buscar Top 20 produtos do TikTok Shop direto
GET http://localhost:3000/shop/top-products?source=tiktok_shop&limit=20
```

### Resposta

```json
{
  "success": true,
  "count": 20,
  "source": "kalodata",
  "data": [
    {
      "id": "1234567890",
      "title": "Produto Exemplo",
      "price": "R$ 99,90",
      "imageUrl": "https://...",
      "productUrl": "https://www.tiktok.com/shop/product/1234567890",
      "sales": "1.2k vendidos",
      "rating": "4.5",
      "rank": 1,
      "source": "kalodata",
      "collectedAt": "2025-12-09T15:00:00.000Z"
    }
  ],
  "generatedAt": "2025-12-09T15:00:00.000Z"
}
```

## Funcionalidades

✅ Login automático com credenciais  
✅ Login manual com navegador visível  
✅ Salvamento de cookies para sessões futuras  
✅ Extração automática de produtos da listagem  
✅ Suporte a múltiplos seletores (tabela, cards, etc.)  
✅ Scroll automático para carregar mais produtos  
✅ Rate limiting aplicado  

## Troubleshooting

### Erro: "Login no Kalodata falhou"
- Verifique se as credenciais estão corretas no `.env`
- Tente fazer login manual com `HEADLESS=false`
- Verifique se o site Kalodata está acessível

### Nenhum produto encontrado
- Verifique se está logado corretamente
- O site pode ter mudado a estrutura HTML
- Verifique os logs para ver quais seletores foram tentados

### Cookies não estão sendo salvos
- Verifique se o diretório `cookies/` existe e tem permissão de escrita
- Verifique os logs para erros ao salvar cookies

## Notas

- O sistema salva cookies automaticamente após login bem-sucedido
- Os cookies são reutilizados em execuções futuras
- Se os cookies expirarem, o sistema tentará fazer login novamente
- Configure `HEADLESS=false` para ver o processo de login na primeira vez

