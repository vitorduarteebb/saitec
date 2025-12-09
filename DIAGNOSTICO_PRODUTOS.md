# 🔍 Diagnóstico - Produtos Não Carregando

## 📋 Checklist de Verificação

### 1. Verificar se o Servidor Está Rodando
```bash
pm2 status
pm2 logs saitec-automation --lines 50
```

### 2. Testar o Endpoint Diretamente
```bash
curl http://localhost:3000/shop/top-products?source=kalodata&limit=10
```

Ou no navegador:
```
http://72.62.9.29:3000/shop/top-products?source=kalodata&limit=10
```

### 3. Verificar Credenciais no .env
```bash
cd /root/saitec-automation
cat .env | grep KALODATA
```

Deve mostrar:
```
KALODATA_EMAIL=email@exemplo.com
KALODATA_PASSWORD=senha
KALODATA_HEADLESS=true
```

### 4. Verificar Logs do Scraper
```bash
pm2 logs saitec-automation --lines 100 | grep -i kalodata
```

### 5. Verificar se Cookies Existem
```bash
ls -la /root/saitec-automation/cookies/
cat /root/saitec-automation/cookies/kalodata-cookies.json
```

---

## 🐛 Problemas Comuns e Soluções

### Problema 1: "Nenhum produto encontrado"
**Causa:** Credenciais não configuradas ou login não realizado

**Solução:**
1. Editar `.env` e adicionar credenciais:
```bash
nano /root/saitec-automation/.env
```

2. Adicionar:
```env
KALODATA_EMAIL=email_do_cliente@exemplo.com
KALODATA_PASSWORD=senha_do_cliente
KALODATA_HEADLESS=false
```

3. Reiniciar:
```bash
pm2 restart saitec-automation
```

4. Fazer primeiro login manualmente (se `KALODATA_HEADLESS=false`):
   - O navegador abrirá
   - Faça login no Kalodata
   - Os cookies serão salvos automaticamente

5. Depois, voltar para headless:
```env
KALODATA_HEADLESS=true
```

### Problema 2: Erro de Timeout
**Causa:** Scraper demorando muito ou travado

**Solução:**
```bash
# Verificar se há processo travado
pm2 restart saitec-automation

# Verificar logs
pm2 logs saitec-automation --lines 100
```

### Problema 3: Erro de Autenticação
**Causa:** Cookies expirados ou inválidos

**Solução:**
```bash
# Remover cookies antigos
rm /root/saitec-automation/cookies/kalodata-cookies.json

# Reiniciar e fazer login novamente
pm2 restart saitec-automation
```

### Problema 4: Erro de Conexão
**Causa:** Problemas de rede ou Cloudflare bloqueando

**Solução:**
- Verificar conectividade:
```bash
curl -I https://www.kalodata.com
```

- Aumentar timeouts no `.env`:
```env
PUPPETEER_TIMEOUT=60000
PAGE_TIMEOUT=60000
```

---

## 🧪 Teste Manual do Scraper

Criar arquivo de teste:
```bash
cd /root/saitec-automation
cat > test-kalodata.js << 'EOF'
require('dotenv').config();
const { scrapeKalodataTopProducts } = require('./src/scrapers/kalodataScraper');

(async () => {
  try {
    console.log('Iniciando teste do scraper Kalodata...');
    console.log('Credenciais configuradas:', {
      email: process.env.KALODATA_EMAIL ? 'SIM' : 'NÃO',
      password: process.env.KALODATA_PASSWORD ? 'SIM' : 'NÃO'
    });
    
    const products = await scrapeKalodataTopProducts({ limit: 5 });
    console.log(`✅ Coletados ${products.length} produtos`);
    console.log(JSON.stringify(products, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
EOF

node test-kalodata.js
```

---

## 📞 Próximos Passos

1. Execute o teste manual acima
2. Verifique os logs detalhados
3. Se ainda não funcionar, compartilhe:
   - Saída do `pm2 logs`
   - Saída do `test-kalodata.js`
   - Conteúdo do `.env` (sem senhas, apenas confirme se as variáveis existem)

