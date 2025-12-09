# ⚡ Instalação Rápida - Automação SAITEC

Guia rápido para instalação local ou em VPS.

## 📋 Pré-requisitos

- Node.js 18+
- MySQL 8.0+
- Google Chrome/Chromium
- Conta no Kalodata

## 🖥️ Instalação Local (Windows/Mac/Linux)

### 1. Instalar Dependências do Sistema

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install -y nodejs npm mysql-server
```

**Windows:**
- Baixe Node.js de https://nodejs.org
- Instale MySQL de https://dev.mysql.com/downloads/mysql/

**Mac:**
```bash
brew install node mysql
```

### 2. Instalar Chrome

**Ubuntu/Debian:**
```bash
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install -y ./google-chrome-stable_current_amd64.deb
```

**Windows/Mac:** Baixe de https://www.google.com/chrome/

### 3. Configurar Projeto

```bash
# Clonar ou baixar projeto
cd saitec-automation

# Instalar dependências
npm install

# Configurar banco
mysql -u root -p < database/schema.sql
mysql -u root -p saitec_trends < database/create_products_table.sql

# Configurar variáveis
cp config.example.env .env
nano .env  # ou use seu editor preferido
```

### 4. Configurar .env

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=sua_senha_mysql
DB_NAME=saitec_trends

KALODATA_EMAIL=seu_email@exemplo.com
KALODATA_PASSWORD=sua_senha_kalodata

KALODATA_HEADLESS=false
HEADLESS=false
```

### 5. Primeiro Login

```bash
# Iniciar servidor (modo visível)
npm start
```

Quando o navegador abrir:
1. Faça login no Kalodata
2. Os cookies serão salvos automaticamente
3. Feche o servidor (Ctrl+C)

### 6. Configurar para Produção

Edite `.env`:
```env
KALODATA_HEADLESS=true
HEADLESS=true
```

### 7. Iniciar Servidor

```bash
npm start
```

Acesse: `http://localhost:3000/painel`

---

## 🌐 Instalação em VPS (Ubuntu/Debian)

### 1. Conectar na VPS

```bash
ssh usuario@seu-servidor-ip
```

### 2. Instalar Dependências

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar MySQL
sudo apt install -y mysql-server

# Instalar Chrome
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install -y ./google-chrome-stable_current_amd64.deb

# Instalar dependências do Puppeteer
sudo apt install -y \
  ca-certificates fonts-liberation libappindicator3-1 \
  libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 \
  libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 \
  libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 \
  libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 \
  libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
  libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 \
  libxtst6 lsb-release wget xdg-utils
```

### 3. Configurar MySQL

```bash
sudo mysql_secure_installation
sudo mysql -u root -p
```

No MySQL:
```sql
CREATE DATABASE saitec_trends CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'saitec_user'@'localhost' IDENTIFIED BY 'senha_forte';
GRANT ALL PRIVILEGES ON saitec_trends.* TO 'saitec_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 4. Transferir Projeto

```bash
# Via Git (se disponível)
git clone <repositorio> saitec-automation
cd saitec-automation

# Ou via SCP (do seu computador)
# scp -r projeto/ usuario@servidor:/home/usuario/saitec-automation
```

### 5. Configurar Projeto

```bash
cd saitec-automation
npm install --production

# Criar tabelas
mysql -u saitec_user -p saitec_trends < database/schema.sql
mysql -u saitec_user -p saitec_trends < database/create_products_table.sql

# Configurar .env
cp config.example.env .env
nano .env
```

### 6. Primeiro Login (Importante!)

Para fazer login na primeira vez, você precisa de interface gráfica:

#### Opção A: SSH com X11 Forwarding

No seu computador local:
```bash
ssh -X usuario@servidor-ip
```

Na VPS:
```bash
export KALODATA_HEADLESS=false
export DISPLAY=:10.0
npm start
```

#### Opção B: VNC

```bash
# Instalar VNC
sudo apt install -y tigervnc-standalone-server

# Configurar VNC
vncserver

# Conectar via cliente VNC
# Depois: export DISPLAY=:1
npm start
```

Quando o navegador abrir, faça login no Kalodata.

### 7. Configurar PM2

```bash
# Instalar PM2
sudo npm install -g pm2

# Iniciar aplicação
pm2 start server.js --name saitec-automation

# Salvar configuração
pm2 save

# Configurar para iniciar no boot
pm2 startup
# Execute o comando que aparecer

# Ver logs
pm2 logs saitec-automation
```

### 8. Configurar Firewall (Opcional)

```bash
sudo ufw allow 3000/tcp
```

---

## ✅ Verificação

### Testar Instalação

```bash
# Health check
curl http://localhost:3000/health

# Testar coleta
curl http://localhost:3000/shop/top-products?limit=10

# Verificar banco
mysql -u saitec_user -p saitec_trends -e "SELECT COUNT(*) FROM tiktok_shop_products;"
```

### Verificar Logs

```bash
# PM2
pm2 logs saitec-automation

# Arquivo
tail -f logs/combined.log
```

---

## 🎯 Próximos Passos

1. ✅ Sistema instalado e funcionando
2. ✅ Login no Kalodata realizado
3. ✅ Produtos sendo coletados
4. 📊 Acessar painel: `http://localhost:3000/painel`
5. 📥 Baixar CSV: `http://localhost:3000/shop/products/all.csv`

---

## 📚 Documentação Completa

Para mais detalhes, consulte:

- **[DOCUMENTACAO_COMPLETA.md](DOCUMENTACAO_COMPLETA.md)** - Documentação técnica
- **[DEPLOY_VPS.md](DEPLOY_VPS.md)** - Guia detalhado de VPS
- **[README.md](README.md)** - Visão geral do projeto

---

**Dúvidas?** Consulte a seção de Troubleshooting na documentação completa.

