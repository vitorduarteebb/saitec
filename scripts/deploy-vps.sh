#!/bin/bash

# Script de Deploy Automatizado para VPS Hostinger
# Execute este script na VPS após conectar via SSH

set -e

echo "🚀 Automação SAITEC - Deploy na VPS"
echo "===================================="
echo ""

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Verificar se está rodando como root
if [ "$EUID" -ne 0 ]; then 
   echo -e "${RED}❌ Este script precisa ser executado como root${NC}"
   exit 1
fi

echo -e "${GREEN}✅ Executando como root${NC}"
echo ""

# 1. Atualizar Sistema
echo "📦 Atualizando sistema..."
apt update && apt upgrade -y
echo -e "${GREEN}✅ Sistema atualizado${NC}"
echo ""

# 2. Instalar Node.js
echo "📦 Instalando Node.js 18..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
    echo -e "${GREEN}✅ Node.js $(node -v) instalado${NC}"
else
    echo -e "${YELLOW}⚠️  Node.js já instalado: $(node -v)${NC}"
fi
echo ""

# 3. Instalar MySQL
echo "📦 Instalando MySQL..."
if ! command -v mysql &> /dev/null; then
    apt install -y mysql-server
    echo -e "${GREEN}✅ MySQL instalado${NC}"
    echo -e "${YELLOW}⚠️  IMPORTANTE: Execute 'mysql_secure_installation' e configure o banco manualmente${NC}"
else
    echo -e "${YELLOW}⚠️  MySQL já instalado${NC}"
fi
echo ""

# 4. Instalar Chrome
echo "📦 Instalando Google Chrome..."
if ! command -v google-chrome &> /dev/null; then
    wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
    apt install -y ./google-chrome-stable_current_amd64.deb
    rm google-chrome-stable_current_amd64.deb
    echo -e "${GREEN}✅ Chrome instalado${NC}"
else
    echo -e "${YELLOW}⚠️  Chrome já instalado${NC}"
fi
echo ""

# 5. Instalar Dependências do Puppeteer
echo "📦 Instalando dependências do Puppeteer..."
apt install -y \
  ca-certificates fonts-liberation libappindicator3-1 \
  libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 \
  libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 \
  libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 \
  libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 \
  libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
  libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 \
  libxtst6 lsb-release wget xdg-utils > /dev/null 2>&1
echo -e "${GREEN}✅ Dependências do Puppeteer instaladas${NC}"
echo ""

# 6. Instalar Git
echo "📦 Instalando Git..."
if ! command -v git &> /dev/null; then
    apt install -y git
    echo -e "${GREEN}✅ Git instalado${NC}"
else
    echo -e "${YELLOW}⚠️  Git já instalado${NC}"
fi
echo ""

# 7. Instalar PM2
echo "📦 Instalando PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    echo -e "${GREEN}✅ PM2 instalado${NC}"
else
    echo -e "${YELLOW}⚠️  PM2 já instalado${NC}"
fi
echo ""

# 8. Clonar Repositório (se não existir)
echo "📦 Verificando repositório..."
if [ ! -d "/root/saitec-automation" ]; then
    echo "Clonando repositório..."
    cd /root
    git clone https://github.com/vitorduarteebb/saitec.git saitec-automation
    echo -e "${GREEN}✅ Repositório clonado${NC}"
else
    echo -e "${YELLOW}⚠️  Diretório já existe. Atualizando...${NC}"
    cd /root/saitec-automation
    git pull
fi
echo ""

# 9. Instalar Dependências do Projeto
echo "📦 Instalando dependências do projeto..."
cd /root/saitec-automation
npm install --production
echo -e "${GREEN}✅ Dependências instaladas${NC}"
echo ""

# 10. Criar Diretórios
echo "📁 Criando diretórios..."
mkdir -p cookies logs exports
chmod 700 cookies
echo -e "${GREEN}✅ Diretórios criados${NC}"
echo ""

# 11. Verificar .env
echo "⚙️  Verificando configuração..."
if [ ! -f ".env" ]; then
    if [ -f "config.example.env" ]; then
        cp config.example.env .env
        echo -e "${YELLOW}⚠️  Arquivo .env criado. CONFIGURE AS CREDENCIAIS!${NC}"
        echo -e "${YELLOW}   Execute: nano /root/saitec-automation/.env${NC}"
    else
        echo -e "${RED}❌ Arquivo config.example.env não encontrado${NC}"
    fi
else
    echo -e "${GREEN}✅ Arquivo .env encontrado${NC}"
fi
echo ""

# Resumo
echo "===================================="
echo -e "${GREEN}✅ Deploy automatizado concluído!${NC}"
echo ""
echo "Próximos passos MANUAIS:"
echo ""
echo "1. Configurar MySQL:"
echo "   mysql_secure_installation"
echo "   mysql -u root -p"
echo "   (Execute os comandos SQL do DEPLOY_VPS_HOSTINGER.md)"
echo ""
echo "2. Criar banco de dados:"
echo "   cd /root/saitec-automation"
echo "   mysql -u saitec_user -p saitec_trends < database/schema.sql"
echo "   mysql -u saitec_user -p saitec_trends < database/create_products_table.sql"
echo ""
echo "3. Configurar .env:"
echo "   nano /root/saitec-automation/.env"
echo ""
echo "4. Fazer primeiro login no Kalodata:"
echo "   cd /root/saitec-automation"
echo "   export KALODATA_HEADLESS=false"
echo "   npm start"
echo "   (Faça login quando o navegador abrir)"
echo ""
echo "5. Iniciar com PM2:"
echo "   cd /root/saitec-automation"
echo "   pm2 start server.js --name saitec-automation"
echo "   pm2 save"
echo "   pm2 startup"
echo ""
echo "Para mais detalhes, consulte: DEPLOY_VPS_HOSTINGER.md"
echo ""

