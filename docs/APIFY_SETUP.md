# Configuração da API do Apify para TikTok Trends

## 📋 Visão Geral

A integração com a API do Apify oferece uma alternativa **mais confiável** ao scraping direto do TikTok Creative Center. A API do Apify é mantida profissionalmente e tem maior taxa de sucesso.

## 🚀 Como Funciona

1. **Prioridade**: O sistema tenta usar a API do Apify primeiro
2. **Fallback**: Se a API falhar ou não estiver configurada, usa scraping direto
3. **Filtragem**: A API já retorna dados filtrados por país (BR, US, etc.)

## ⚙️ Configuração

### Passo 1: Criar Conta no Apify

1. Acesse: https://console.apify.com/
2. Crie uma conta gratuita (tem créditos gratuitos para teste)
3. Vá em **Account** → **Integrations** → **API tokens**
4. Copie seu **API token**

### Passo 2: Configurar no Projeto

1. Abra o arquivo `.env` (ou copie de `config.example.env`)
2. Adicione:

```env
# Token da API do Apify
APIFY_API_TOKEN=seu_token_aqui

# Usar API do Apify por padrão (true/false)
USE_APIFY=true
```

### Passo 3: Instalar Dependência

A dependência já foi instalada automaticamente. Se precisar reinstalar:

```bash
npm install apify-client
```

## 📊 Vantagens da API do Apify

✅ **Mais Confiável**: API profissional mantida pela Apify  
✅ **Filtragem por País**: Retorna dados já filtrados por Brasil/US/etc  
✅ **Menos Bloqueios**: Não precisa lidar com anti-bot do TikTok  
✅ **Dados Mais Completos**: Retorna mais campos (hashtags, mentions, etc)  
✅ **Fallback Automático**: Se falhar, usa scraping direto automaticamente  

## 🔍 Como Testar

1. Configure o `APIFY_API_TOKEN` no `.env`
2. Execute uma coleta:

```bash
npm start
```

3. Acesse o painel: http://localhost:3000/painel
4. Clique em "Atualizar"
5. Verifique os logs - deve aparecer:

```
[Apify TikTok] ✅ API do Apify retornou X vídeos!
```

## 📝 Logs Esperados

### Quando API do Apify está funcionando:

```
[Apify TikTok] Iniciando coleta via API - Nicho: beleza, País: BR
[Apify TikTok] Executando Actor: clockworks/tiktok-trends-scraper
[Apify TikTok] ✅ Actor executado com sucesso! Run ID: xxx
[Apify TikTok] ✅ Coletados X vídeos do Apify
[Apify TikTok] Vídeos do Brasil: X, Vídeos globais: Y
[Apify TikTok] ✅ Transformados X vídeos para formato padrão
[TikTok CC] ✅ API do Apify retornou X vídeos!
```

### Quando API do Apify não está configurada:

```
[Apify TikTok] ⚠️ APIFY_API_TOKEN não configurado. Pulando API do Apify.
[TikTok CC] Usando scraping direto (fallback)...
```

### Quando API do Apify falha:

```
[Apify TikTok] ⚠️ Erro ao usar API do Apify: [erro]
[TikTok CC] Tentando scraping direto como fallback...
```

## 💰 Custos

- **Plano Gratuito**: Inclui créditos gratuitos para testes
- **Pago**: Pago por uso (pay-per-event)
- **Actor usado**: `clockworks/tiktok-trends-scraper`

Consulte preços em: https://apify.com/store

## 🔧 Desabilitar API do Apify

Se quiser usar apenas scraping direto:

```env
USE_APIFY=false
```

Ou simplesmente não configure o `APIFY_API_TOKEN`.

## 📚 Documentação

- **Apify Console**: https://console.apify.com/
- **Actor usado**: https://apify.com/clockworks/tiktok-trends-scraper
- **API Reference**: https://docs.apify.com/api/client/javascript/

## ⚠️ Troubleshooting

### Erro: "APIFY_API_TOKEN não configurado"
- **Solução**: Configure o token no `.env`

### Erro: "Invalid API token"
- **Solução**: Verifique se o token está correto em https://console.apify.com/account/integrations

### Erro: "Insufficient credits"
- **Solução**: Adicione créditos na sua conta Apify ou use scraping direto (`USE_APIFY=false`)

### API retorna 0 vídeos
- **Solução**: Verifique se o país está correto (BR, US, etc) e se há vídeos disponíveis naquele país

