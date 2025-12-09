# 🔍 Diagnóstico de Coleta de Produtos

## ✅ O que foi melhorado

1. **Feedback visual melhorado**: A barra de progresso agora atualiza a cada 2 segundos
2. **Logs detalhados no console**: Abra o console do navegador (F12) para ver logs em tempo real
3. **Mensagens de status**: Você verá mensagens como "Conectando...", "Processando...", etc.
4. **Timeout de 5 minutos**: A requisição não trava indefinidamente

## 🔍 Como diagnosticar problemas

### 1. Verificar logs do navegador (CLIENTE)

1. Abra o painel: `http://72.62.9.29:3000/painel`
2. Pressione **F12** (ou clique com botão direito → Inspecionar)
3. Vá na aba **Console**
4. Clique em **🔄 Atualizar**
5. Observe os logs que aparecem:
   - `[Panel] Iniciando coleta de produtos...`
   - `[Panel] Fazendo requisição para: /shop/top-products?...`
   - `[Panel] Resposta recebida em Xs. Status: 200`
   - `[Panel] Resultado recebido: { success: true, count: X }`

### 2. Verificar logs do servidor (VPS)

```bash
ssh root@72.62.9.29
cd /root/saitec-automation
pm2 logs saitec-automation --lines 50
```

Procure por:
- `[API] Buscando produtos mais vendidos`
- `[Kalodata] Iniciando scraping`
- `[Kalodata] Produtos coletados: X`
- Erros relacionados a Cloudflare, cookies, ou Puppeteer

### 3. Verificar se o servidor está respondendo

```bash
curl http://localhost:3000/health
curl http://localhost:3000/shop/top-products?source=kalodata&limit=5
```

## 🐛 Problemas comuns e soluções

### Problema: "Carregando produtos..." mas nada acontece

**Possíveis causas:**
1. Servidor não está rodando
2. Cloudflare está bloqueando
3. Cookies inválidos/expirados
4. Timeout muito longo

**Solução:**
1. Verifique se o servidor está rodando: `pm2 status`
2. Verifique os logs: `pm2 logs saitec-automation --lines 100`
3. Tente coletar novamente após alguns segundos
4. Se persistir, verifique os cookies no modal de login

### Problema: "Erro: Failed to fetch"

**Causa:** Servidor não está acessível ou não está rodando

**Solução:**
```bash
pm2 restart saitec-automation
pm2 logs saitec-automation
```

### Problema: "Erro: Timeout"

**Causa:** A coleta está demorando mais de 5 minutos

**Solução:**
1. Verifique os logs do servidor para ver onde está travando
2. Pode ser Cloudflare bloqueando - aguarde alguns minutos e tente novamente
3. Verifique se os cookies estão válidos

### Problema: "0 produtos coletados"

**Causa:** 
- Cookies inválidos/expirados
- Cloudflare bloqueando
- Kalodata mudou a estrutura da página

**Solução:**
1. Reconfigure os cookies no modal de login
2. Verifique os logs do servidor para ver mensagens específicas
3. Tente coletar novamente após alguns minutos

## 📊 Verificar status atual

```bash
# Ver status do PM2
pm2 status

# Ver logs em tempo real
pm2 logs saitec-automation --lines 100

# Verificar se o servidor responde
curl http://localhost:3000/health

# Testar endpoint de produtos
curl "http://localhost:3000/shop/top-products?source=kalodata&limit=5" | jq
```

## 🔄 Atualizar código na VPS

```bash
ssh root@72.62.9.29
cd /root/saitec-automation
pm2 delete all
git pull origin main
pm2 start server.js --name saitec-automation --update-env
pm2 save
pm2 logs saitec-automation --lines 50
```

## 💡 Dicas

1. **Sempre abra o console do navegador (F12)** quando testar a coleta
2. **Verifique os logs do servidor** em paralelo para ver o que está acontecendo
3. **Aguarde pelo menos 30-60 segundos** antes de considerar que travou (a coleta pode demorar)
4. **Se os cookies expirarem**, reconfigurar no modal de login

