#!/bin/bash

# Script de Setup - Automação SAITEC
# Facilita a instalação e configuração inicial do sistema

set -e

echo "🚀 Automação SAITEC - Script de Setup"
echo "======================================"
echo ""

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Verificar se está rodando como root (não recomendado)
if [ "$EUID" -eq 0 ]; then 
   echo -e "${YELLOW}⚠️  Não execute este script como root${NC}"
   exit 1
fi

# Verificar Node.js
echo "📦 Verificando Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js não encontrado${NC}"
    echo "Instale Node.js 18+ de https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js versão 18+ requerida (encontrada: $(node -v))${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $(node -v) encontrado${NC}"

# Verificar npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm não encontrado${NC}"
    exit 1
fi

echo -e "${GREEN}✅ npm $(npm -v) encontrado${NC}"

# Verificar MySQL
echo ""
echo "🗄️  Verificando MySQL..."
if ! command -v mysql &> /dev/null; then
    echo -e "${YELLOW}⚠️  MySQL não encontrado no PATH${NC}"
    echo "Certifique-se de que o MySQL está instalado e acessível"
else
    echo -e "${GREEN}✅ MySQL encontrado${NC}"
fi

# Verificar Chrome/Chromium
echo ""
echo "🌐 Verificando Chrome/Chromium..."
if command -v google-chrome &> /dev/null; then
    echo -e "${GREEN}✅ Google Chrome encontrado${NC}"
elif command -v chromium-browser &> /dev/null; then
    echo -e "${GREEN}✅ Chromium encontrado${NC}"
else
    echo -e "${YELLOW}⚠️  Chrome/Chromium não encontrado${NC}"
    echo "O Puppeteer precisa do Chrome. Instale se necessário."
fi

# Instalar dependências npm
echo ""
echo "📥 Instalando dependências npm..."
if [ ! -d "node_modules" ]; then
    npm install
    echo -e "${GREEN}✅ Dependências instaladas${NC}"
else
    echo -e "${YELLOW}⚠️  node_modules já existe. Pulando instalação.${NC}"
    echo "Execute 'npm install' manualmente se necessário."
fi

# Verificar arquivo .env
echo ""
echo "⚙️  Verificando configuração..."
if [ ! -f ".env" ]; then
    if [ -f "config.example.env" ]; then
        echo "📝 Criando arquivo .env a partir de config.example.env..."
        cp config.example.env .env
        echo -e "${GREEN}✅ Arquivo .env criado${NC}"
        echo -e "${YELLOW}⚠️  IMPORTANTE: Edite o arquivo .env com suas credenciais!${NC}"
    else
        echo -e "${RED}❌ Arquivo config.example.env não encontrado${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Arquivo .env encontrado${NC}"
fi

# Criar diretórios necessários
echo ""
echo "📁 Criando diretórios..."
mkdir -p cookies
mkdir -p logs
mkdir -p exports
chmod 700 cookies 2>/dev/null || true
echo -e "${GREEN}✅ Diretórios criados${NC}"

# Verificar banco de dados
echo ""
echo "🗄️  Verificando banco de dados..."
if [ -f "database/schema.sql" ]; then
    echo -e "${GREEN}✅ Scripts SQL encontrados${NC}"
    echo -e "${YELLOW}⚠️  Execute manualmente:${NC}"
    echo "   mysql -u root -p < database/schema.sql"
    echo "   mysql -u root -p saitec_trends < database/create_products_table.sql"
else
    echo -e "${RED}❌ Scripts SQL não encontrados${NC}"
fi

# Resumo
echo ""
echo "======================================"
echo -e "${GREEN}✅ Setup concluído!${NC}"
echo ""
echo "Próximos passos:"
echo "1. Edite o arquivo .env com suas credenciais"
echo "2. Crie o banco de dados MySQL (veja comandos acima)"
echo "3. Execute 'npm start' para iniciar o servidor"
echo "4. Faça login no Kalodata quando o navegador abrir"
echo ""
echo "Para mais informações, consulte:"
echo "- README.md"
echo "- DOCUMENTACAO_COMPLETA.md"
echo "- INSTALACAO_RAPIDA.md"
echo ""

