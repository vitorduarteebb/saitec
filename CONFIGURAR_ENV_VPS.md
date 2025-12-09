# 🔧 Configurar .env na VPS - Comandos Prontos

## 📋 Passo a Passo Completo

### 1. Conectar na VPS
```bash
ssh root@72.62.9.29
```

### 2. Editar o arquivo .env
```bash
cd /root/saitec-automation
nano .env
```

### 3. Adicionar/Editar as seguintes linhas no arquivo .env

**Procure por estas seções e adicione/edite:**

#### 🔑 Credenciais do Kalodata
```env
# Credenciais do Kalodata (para login automático)
KALODATA_EMAIL=email_do_cliente@exemplo.com
KALODATA_PASSWORD=senha_do_cliente
KALODATA_HEADLESS=true
```

#### 🔓 Token do Painel (OU deixe vazio para acesso livre)
```env
# Token para acesso ao painel web (/painel)
# DEIXE VAZIO ou com valor padrão para acesso livre em desenvolvimento
PANEL_ACCESS_TOKEN=
```

**OU se quiser proteger com token:**
```env
PANEL_ACCESS_TOKEN=seu_token_painel_aqui_mude_em_producao
```

#### 🌍 Ambiente (IMPORTANTE)
```env
# Ambiente: development | production
# Se estiver em production, o token será obrigatório
# Para desenvolvimento/teste, use: NODE_ENV=development
NODE_ENV=development
```

### 4. Salvar e Sair do Nano
- Pressione `Ctrl + O` (salvar)
- Pressione `Enter` (confirmar)
- Pressione `Ctrl + X` (sair)

### 5. Reiniciar o Servidor
```bash
pm2 restart saitec-automation
```

### 6. Verificar se está funcionando
```bash
pm2 logs saitec-automation --lines 20
```

---

## 📝 Exemplo Completo de .env

```env
# ============================================
# CONFIGURAÇÕES DO SERVIDOR
# ============================================
PORT=3000
NODE_ENV=development

# ============================================
# CONFIGURAÇÕES DO BANCO DE DADOS
# ============================================
DB_HOST=localhost
DB_PORT=3306
DB_USER=saitec_user
DB_PASSWORD=Saitec2025@MySQL!
DB_NAME=saitec_trends

# ============================================
# CREDENCIAIS KALODATA
# ============================================
KALODATA_EMAIL=email_do_cliente@exemplo.com
KALODATA_PASSWORD=senha_do_cliente
KALODATA_HEADLESS=true

# ============================================
# TOKEN DO PAINEL (deixe vazio para acesso livre)
# ============================================
PANEL_ACCESS_TOKEN=

# ============================================
# OUTRAS CONFIGURAÇÕES
# ============================================
HEADLESS=true
MIN_VIEWS=0
MIN_LIKES=50000
DEFAULT_NICHE=null
DEFAULT_COUNTRY=BR
```

---

## ✅ Verificação Final

Após configurar, teste:

1. **Health Check:**
```bash
curl http://localhost:3000/health
```

2. **Acessar Painel (sem token):**
```
http://72.62.9.29:3000/painel
```

3. **Se ainda pedir token**, verifique:
   - `NODE_ENV=development` está configurado?
   - `PANEL_ACCESS_TOKEN` está vazio ou com valor padrão?
   - Reiniciou o PM2 após editar?

---

## 🔒 Se Quiser Proteger o Painel com Token

1. Gere um token seguro:
```bash
openssl rand -hex 32
```

2. Adicione no .env:
```env
PANEL_ACCESS_TOKEN=token_gerado_aqui
```

3. Acesse o painel com:
```
http://72.62.9.29:3000/painel?token=token_gerado_aqui
```

