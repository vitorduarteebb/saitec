# 🚀 Deploy na VPS Hostinger - Automação SAITEC

## Informações da VPS

- **IP**: 72.62.9.29
- **Usuário**: root
- **SO**: Ubuntu 25.10
- **Acesso**: `ssh root@72.62.9.29`
- **Recursos**: 2 CPU, 8GB RAM, 100GB disco

---

## 📋 Passo a Passo Completo

### 1. Conectar na VPS

```bash
ssh root@72.62.9.29
```

Você será solicitado a inserir a senha root (fornecida no painel da Hostinger).

### 2. Atualizar Sistema

```bash
apt update && apt upgrade -y
```

### 3. Instalar Dependências do Sistema

```bash
# Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# MySQL
apt install -y mysql-server

# Google Chrome
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
apt install -y ./google-chrome-stable_current_amd64.deb
rm google-chrome-stable_current_amd64.deb

# Dependências do Puppeteer
apt install -y \
  ca-certificates fonts-liberation libappindicator3-1 \
  libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 \
  libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 \
  libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 \
  libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 \
  libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
  libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 \
  libxtst6 lsb-release wget xdg-utils

# Git (para clonar repositório)
apt install -y git
```

### 4. Configurar MySQL

```bash
# Configurar MySQL
mysql_secure_installation

# Criar banco e usuário
mysql -u root -p
```

No MySQL, execute:

```sql
CREATE DATABASE saitec_trends CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'saitec_user'@'localhost' IDENTIFIED BY 'SuaSenhaForteAqui123!';
GRANT ALL PRIVILEGES ON saitec_trends.* TO 'saitec_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 5. Clonar Repositório

```bash
cd /root
git clone https://github.com/vitorduarteebb/saitec.git saitec-automation
cd saitec-automation
```

### 6. Instalar Dependências do Projeto

```bash
npm install --production
```

### 7. Criar Estrutura do Banco de Dados

```bash
mysql -u saitec_user -p saitec_trends < database/schema.sql
mysql -u saitec_user -p saitec_trends < database/create_products_table.sql
```

### 8. Configurar Variáveis de Ambiente

```bash
cp config.example.env .env
nano .env
```

Configure o arquivo `.env`:

```env
# Banco de Dados
DB_HOST=localhost
DB_PORT=3306
DB_USER=saitec_user
DB_PASSWORD=SuaSenhaForteAqui123!
DB_NAME=saitec_trends

# Servidor
PORT=3000
NODE_ENV=production

# Kalodata (Login)
KALODATA_EMAIL=seu_email@exemplo.com
KALODATA_PASSWORD=sua_senha_kalodata

# Puppeteer (VPS - modo headless)
KALODATA_HEADLESS=true
HEADLESS=true
PUPPETEER_TIMEOUT=300000
PUPPETEER_PROTOCOL_TIMEOUT=600000

# Coleta
COLLECTION_LIMIT=20
DEFAULT_COUNTRY=BR
```

**IMPORTANTE**: Salve as credenciais em local seguro!

### 9. Criar Diretórios Necessários

```bash
mkdir -p cookies logs exports
chmod 700 cookies
```

### 10. Primeiro Login no Kalodata (CRÍTICO!)

Para fazer login na primeira vez, você precisa de interface gráfica. Opções:

#### Opção A: SSH com X11 Forwarding (do seu computador)

No seu computador local (Windows/Mac/Linux):

```bash
ssh -X root@72.62.9.29
```

Na VPS:

```bash
cd /root/saitec-automation
export KALODATA_HEADLESS=false
export DISPLAY=:10.0
npm start
```

Quando o navegador abrir, faça login no Kalodata. Os cookies serão salvos.

#### Opção B: VNC (Recomendado para VPS)

```bash
# Instalar VNC Server
apt install -y tigervnc-standalone-server tigervnc-common

# Configurar VNC (defina uma senha quando solicitado)
vncserver

# Conectar via cliente VNC do seu computador ao IP:1
# Depois executar:
export DISPLAY=:1
cd /root/saitec-automation
export KALODATA_HEADLESS=false
npm start
```

#### Opção C: Usar Credenciais Automáticas

Se você configurou `KALODATA_EMAIL` e `KALODATA_PASSWORD` no `.env`, o sistema tentará login automático. Se falhar, use uma das opções acima.

### 11. Testar Instalação

```bash
# Testar conexão com banco
npm run test

# Testar coleta (modo visível primeiro)
export KALODATA_HEADLESS=false
npm start
```

Acesse: `http://72.62.9.29:3000/health`

### 12. Configurar PM2 para Produção

```bash
# Instalar PM2 globalmente
npm install -g pm2

# Iniciar aplicação
cd /root/saitec-automation
pm2 start server.js --name saitec-automation

# Salvar configuração
pm2 save

# Configurar para iniciar no boot
pm2 startup
# Execute o comando que aparecer na tela (algo como: sudo env PATH=...)

# Verificar status
pm2 status
pm2 logs saitec-automation
```

### 13. Configurar Firewall

```bash
# Instalar UFW (se não estiver instalado)
apt install -y ufw

# Permitir SSH
ufw allow 22/tcp

# Permitir porta 3000 (se quiser acesso externo)
ufw allow 3000/tcp

# Ativar firewall
ufw enable

# Verificar status
ufw status
```

### 14. Configurar Nginx (Opcional - para acesso via domínio)

```bash
# Instalar Nginx
apt install -y nginx

# Criar configuração
nano /etc/nginx/sites-available/saitec-automation
```

Conteúdo do arquivo:

```nginx
server {
    listen 80;
    server_name seu-dominio.com;  # ou 72.62.9.29

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
ln -s /etc/nginx/sites-available/saitec-automation /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

### 15. Configurar Backup Automatizado

```bash
# Criar script de backup
nano /root/backup-db.sh
```

Conteúdo:

```bash
#!/bin/bash
BACKUP_DIR="/root/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
mysqldump -u saitec_user -p'SuaSenhaForteAqui123!' saitec_trends > $BACKUP_DIR/saitec_trends_$DATE.sql
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
```

```bash
chmod +x /root/backup-db.sh

# Adicionar ao crontab (backup diário às 2h)
crontab -e
# Adicionar linha:
0 2 * * * /root/backup-db.sh
```

---

## ✅ Verificação Final

### Testar Endpoints

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
tail -f /root/saitec-automation/logs/combined.log
```

### Verificar Status

```bash
# PM2
pm2 status

# Processos
ps aux | grep node

# Porta 3000
netstat -tlnp | grep 3000
```

---

## 🔄 Comandos Úteis

### Reiniciar Aplicação

```bash
pm2 restart saitec-automation
```

### Parar Aplicação

```bash
pm2 stop saitec-automation
```

### Ver Logs em Tempo Real

```bash
pm2 logs saitec-automation --lines 100
```

### Atualizar Código

```bash
cd /root/saitec-automation
git pull
npm install --production
pm2 restart saitec-automation
```

---

## 🐛 Troubleshooting

### Erro: "Cannot connect to database"

```bash
# Verificar se MySQL está rodando
systemctl status mysql

# Testar conexão
mysql -u saitec_user -p -e "SELECT 1;"

# Verificar .env
cat /root/saitec-automation/.env | grep DB_
```

### Erro: "Chrome not found"

```bash
# Verificar instalação
which google-chrome
google-chrome --version

# Reinstalar se necessário
apt install -y --reinstall google-chrome-stable
```

### Erro: "Login failed" ou "Nenhum produto encontrado"

1. Verificar cookies: `ls -la /root/saitec-automation/cookies/`
2. Tentar login manual novamente com `KALODATA_HEADLESS=false`
3. Verificar credenciais no `.env`

### Porta 3000 não acessível externamente

```bash
# Verificar firewall
ufw status

# Verificar se aplicação está rodando
pm2 status
curl http://localhost:3000/health
```

---

## 📝 Checklist de Deploy

- [ ] Conectado na VPS via SSH
- [ ] Sistema atualizado
- [ ] Node.js 18+ instalado
- [ ] MySQL instalado e configurado
- [ ] Chrome instalado
- [ ] Dependências do Puppeteer instaladas
- [ ] Repositório clonado
- [ ] Dependências npm instaladas
- [ ] Banco de dados criado
- [ ] Tabelas criadas
- [ ] Arquivo .env configurado
- [ ] Primeiro login no Kalodata realizado
- [ ] Cookies salvos
- [ ] PM2 configurado
- [ ] PM2 configurado para iniciar no boot
- [ ] Firewall configurado
- [ ] Backup configurado
- [ ] Testes realizados com sucesso

---

## 🎯 Acesso Após Deploy

- **API**: `http://72.62.9.29:3000`
- **Health Check**: `http://72.62.9.29:3000/health`
- **Painel**: `http://72.62.9.29:3000/painel`
- **Produtos**: `http://72.62.9.29:3000/shop/top-products`
- **CSV Completo**: `http://72.62.9.29:3000/shop/products/all.csv`

---

**Pronto!** Seu sistema está deployado e funcionando na VPS! 🚀

