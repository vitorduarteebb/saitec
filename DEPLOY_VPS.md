# 🚀 Guia de Deploy em VPS - Automação SAITEC

## Visão Geral

Este documento descreve o processo completo de instalação e configuração do sistema de coleta de produtos TikTok Shop em uma VPS (Virtual Private Server). O sistema foi desenvolvido para funcionar de forma autônoma, coletando diariamente os produtos mais vendidos do TikTok Shop através do Kalodata.

## 📋 Pré-requisitos

### Requisitos do Servidor

- **Sistema Operacional**: Ubuntu 20.04+ ou Debian 11+
- **RAM**: Mínimo 2GB (recomendado 4GB+)
- **Disco**: Mínimo 20GB de espaço livre
- **CPU**: 2+ cores recomendado
- **Acesso**: SSH com privilégios de root ou sudo

### Software Necessário

- Node.js 18+ 
- MySQL 8.0+
- Google Chrome/Chromium (para Puppeteer)
- Git

## 🔧 Instalação Passo a Passo

### 1. Conectar na VPS

```bash
ssh usuario@seu-servidor-ip
```

### 2. Atualizar Sistema

```bash
sudo apt update && sudo apt upgrade -y
```

### 3. Instalar Node.js 18+

```bash
# Instalar Node.js via NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verificar instalação
node --version
npm --version
```

### 4. Instalar MySQL

```bash
sudo apt install -y mysql-server

# Configurar MySQL (definir senha do root)
sudo mysql_secure_installation

# Criar banco de dados e usuário
sudo mysql -u root -p
```

No MySQL:

```sql
CREATE DATABASE saitec_trends CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'saitec_user'@'localhost' IDENTIFIED BY 'senha_forte_aqui';
GRANT ALL PRIVILEGES ON saitec_trends.* TO 'saitec_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 5. Instalar Dependências do Sistema

```bash
# Dependências para Puppeteer/Chrome
sudo apt install -y \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libgcc1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  lsb-release \
  wget \
  xdg-utils
```

### 6. Instalar Google Chrome

```bash
# Baixar e instalar Chrome
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install -y ./google-chrome-stable_current_amd64.deb
rm google-chrome-stable_current_amd64.deb

# Verificar instalação
google-chrome --version
```

### 7. Clonar/Transferir Projeto

```bash
# Opção 1: Via Git (se o projeto estiver em repositório)
git clone https://seu-repositorio.git saitec-automation
cd saitec-automation

# Opção 2: Via SCP (do seu computador local)
# scp -r /caminho/local/projeto usuario@servidor:/home/usuario/saitec-automation
```

### 8. Instalar Dependências do Projeto

```bash
cd saitec-automation
npm install --production
```

### 9. Configurar Variáveis de Ambiente

```bash
# Copiar arquivo de exemplo
cp config.example.env .env

# Editar arquivo .env
nano .env
```

Configure as seguintes variáveis:

```env
# Banco de Dados
DB_HOST=localhost
DB_PORT=3306
DB_USER=saitec_user
DB_PASSWORD=sua_senha_mysql
DB_NAME=saitec_trends

# Servidor
PORT=3000
NODE_ENV=production

# Kalodata (Login)
KALODATA_EMAIL=seu_email@exemplo.com
KALODATA_PASSWORD=sua_senha_kalodata

# Puppeteer (VPS)
KALODATA_HEADLESS=true
HEADLESS=true
PUPPETEER_TIMEOUT=300000
PUPPETEER_PROTOCOL_TIMEOUT=600000

# Coleta
COLLECTION_LIMIT=20
DEFAULT_COUNTRY=BR
```

**Importante para VPS**: 
- `KALODATA_HEADLESS=true` - Modo headless (sem interface gráfica)
- Para primeiro login, você pode temporariamente usar `KALODATA_HEADLESS=false` e fazer login via SSH com X11 forwarding

### 10. Criar Estrutura do Banco de Dados

```bash
# Executar schema principal
mysql -u saitec_user -p saitec_trends < database/schema.sql

# Executar schema de produtos
mysql -u saitec_user -p saitec_trends < database/create_products_table.sql

# Verificar tabelas criadas
mysql -u saitec_user -p saitec_trends -e "SHOW TABLES;"
```

### 11. Primeiro Login no Kalodata (Importante!)

Na primeira execução, você precisa fazer login manualmente no Kalodata. Existem duas opções:

#### Opção A: Login via SSH com X11 Forwarding (Recomendado)

```bash
# No seu computador local, conectar com X11 forwarding
ssh -X usuario@seu-servidor-ip

# Na VPS, configurar variável temporariamente
export KALODATA_HEADLESS=false
export DISPLAY=:10.0

# Executar coleta (abrirá navegador visível)
npm start
```

Quando o navegador abrir, faça login no Kalodata. Os cookies serão salvos automaticamente.

#### Opção B: Usar VNC ou Interface Remota

```bash
# Instalar VNC Server
sudo apt install -y tigervnc-standalone-server tigervnc-common

# Configurar VNC (siga as instruções)
vncserver

# Conectar via cliente VNC do seu computador
# Depois executar: export DISPLAY=:1
npm start
```

#### Opção C: Login Automático (se credenciais estiverem no .env)

Se você configurou `KALODATA_EMAIL` e `KALODATA_PASSWORD` no `.env`, o sistema tentará fazer login automaticamente. Se falhar, use uma das opções acima.

### 12. Testar Instalação

```bash
# Testar conexão com banco
npm run test

# Testar coleta manual
npm run test-collection

# Iniciar servidor
npm start
```

Verifique se o servidor está rodando:

```bash
curl http://localhost:3000/health
```

### 13. Configurar como Serviço (PM2)

```bash
# Instalar PM2 globalmente
sudo npm install -g pm2

# Iniciar aplicação com PM2
pm2 start server.js --name saitec-automation

# Salvar configuração do PM2
pm2 save

# Configurar PM2 para iniciar no boot
pm2 startup
# Execute o comando que aparecer na tela

# Verificar status
pm2 status
pm2 logs saitec-automation
```

### 14. Configurar Firewall

```bash
# Permitir porta 3000 (se necessário expor externamente)
sudo ufw allow 3000/tcp

# Ou usar apenas localhost (mais seguro)
# Nesse caso, acesse via SSH tunnel: ssh -L 3000:localhost:3000 usuario@servidor
```

### 15. Configurar Nginx (Opcional - para acesso externo)

```bash
# Instalar Nginx
sudo apt install -y nginx

# Criar configuração
sudo nano /etc/nginx/sites-available/saitec-automation
```

Conteúdo do arquivo:

```nginx
server {
    listen 80;
    server_name seu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
# Ativar site
sudo ln -s /etc/nginx/sites-available/saitec-automation /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## 🔐 Segurança

### 1. Proteger Arquivo .env

```bash
chmod 600 .env
```

### 2. Proteger Diretório de Cookies

```bash
chmod 700 cookies/
```

### 3. Configurar Rate Limiting

O sistema já possui rate limiting configurado. Ajuste no `.env` se necessário:

```env
RATE_LIMIT_MAX=100
```

### 4. Usar HTTPS (Recomendado)

Configure SSL/TLS com Let's Encrypt:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d seu-dominio.com
```

## 📊 Monitoramento

### Ver Logs

```bash
# Logs do PM2
pm2 logs saitec-automation

# Logs do sistema
tail -f logs/combined.log
tail -f logs/error.log
```

### Verificar Status

```bash
# Status do PM2
pm2 status

# Health check da API
curl http://localhost:3000/health

# Verificar processos
ps aux | grep node
```

### Verificar Coletas

```bash
# Ver produtos coletados hoje
mysql -u saitec_user -p saitec_trends -e "
SELECT COUNT(*) as total, DATE(collected_at) as data 
FROM tiktok_shop_products 
GROUP BY DATE(collected_at) 
ORDER BY data DESC LIMIT 7;
"
```

## 🔄 Manutenção

### Atualizar Código

```bash
# Parar aplicação
pm2 stop saitec-automation

# Atualizar código
git pull  # ou fazer upload dos arquivos

# Reinstalar dependências (se necessário)
npm install --production

# Reiniciar
pm2 restart saitec-automation
```

### Backup do Banco de Dados

```bash
# Criar script de backup
nano /home/usuario/backup-db.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/home/usuario/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
mysqldump -u saitec_user -p'sua_senha' saitec_trends > $BACKUP_DIR/saitec_trends_$DATE.sql
# Manter apenas últimos 7 dias
find $BACKUP_DIR -name "saitec_trends_*.sql" -mtime +7 -delete
```

```bash
chmod +x /home/usuario/backup-db.sh

# Adicionar ao crontab (backup diário às 2h)
crontab -e
# Adicionar linha:
0 2 * * * /home/usuario/backup-db.sh
```

### Limpar Logs Antigos

```bash
# Script para limpar logs com mais de 30 dias
find logs/ -name "*.log" -mtime +30 -delete
```

## 🐛 Troubleshooting

### Problema: Chrome não inicia em modo headless

**Solução**: Verificar se todas as dependências estão instaladas:

```bash
sudo apt install -y --reinstall libgbm1 libnss3
```

### Problema: Erro de conexão com banco

**Solução**: Verificar credenciais e se MySQL está rodando:

```bash
sudo systemctl status mysql
mysql -u saitec_user -p -e "SELECT 1;"
```

### Problema: Login do Kalodata não funciona

**Solução**: 
1. Verificar se cookies foram salvos: `ls -la cookies/`
2. Tentar login manual novamente com `KALODATA_HEADLESS=false`
3. Verificar se email/senha estão corretos no `.env`

### Problema: Produtos não são coletados

**Solução**:
1. Verificar logs: `pm2 logs saitec-automation`
2. Verificar se está logado: `curl http://localhost:3000/shop/top-products`
3. Verificar se tabela existe: `mysql -u saitec_user -p saitec_trends -e "DESCRIBE tiktok_shop_products;"`

### Problema: Porta 3000 já em uso

**Solução**:

```bash
# Verificar processo
lsof -i :3000

# Matar processo
kill -9 PID_DO_PROCESSO

# Ou usar script
npm run kill-port
```

## 📝 Checklist de Deploy

- [ ] Node.js 18+ instalado
- [ ] MySQL instalado e configurado
- [ ] Banco de dados criado
- [ ] Tabelas criadas (trends e tiktok_shop_products)
- [ ] Chrome/Chromium instalado
- [ ] Dependências do sistema instaladas
- [ ] Projeto clonado/transferido
- [ ] Dependências npm instaladas
- [ ] Arquivo .env configurado
- [ ] Primeiro login no Kalodata realizado
- [ ] Cookies salvos em cookies/kalodata-cookies.json
- [ ] Teste de coleta bem-sucedido
- [ ] PM2 configurado e rodando
- [ ] PM2 configurado para iniciar no boot
- [ ] Firewall configurado
- [ ] Backup do banco configurado
- [ ] Monitoramento configurado

## 🎯 Próximos Passos Após Deploy

1. **Testar Coleta Manual**: Acesse `http://seu-servidor:3000/shop/top-products`
2. **Verificar Banco**: Confirme que produtos foram salvos
3. **Baixar CSV**: Teste o endpoint `/shop/products/all.csv`
4. **Configurar Monitoramento**: Configure alertas para falhas
5. **Documentar Acesso**: Anote URLs e credenciais em local seguro

## 📞 Suporte

Em caso de problemas:

1. Verifique os logs: `pm2 logs saitec-automation`
2. Verifique o health check: `curl http://localhost:3000/health`
3. Verifique o banco de dados: `mysql -u saitec_user -p saitec_trends`
4. Consulte a documentação técnica em `docs/`

---

**Versão**: 1.0  
**Última Atualização**: Dezembro 2025

