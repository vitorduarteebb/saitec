# Guia de Deploy com PM2 - Produção

Este guia explica como fazer deploy do sistema de tendências TikTok em um servidor Ubuntu usando PM2 para gerenciamento de processos.

---

## Pré-requisitos

- Servidor Ubuntu 20.04+ (ou similar)
- Acesso SSH ao servidor
- Permissões de root ou sudo

---

## Passo 1: Instalar Node.js

### Opção A: Via NodeSource (Recomendado)

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js 18.x LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verificar instalação
node --version  # Deve mostrar v18.x.x
npm --version   # Deve mostrar 9.x.x ou superior
```

### Opção B: Via Snap

```bash
sudo snap install node --classic
```

---

## Passo 2: Instalar MySQL

```bash
# Instalar MySQL Server
sudo apt install -y mysql-server

# Configurar MySQL (definir senha do root)
sudo mysql_secure_installation

# Criar banco de dados
sudo mysql -u root -p << EOF
CREATE DATABASE saitec_trends CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'trends_user'@'localhost' IDENTIFIED BY 'senha_forte_aqui';
GRANT ALL PRIVILEGES ON saitec_trends.* TO 'trends_user'@'localhost';
FLUSH PRIVILEGES;
EOF
```

---

## Passo 3: Instalar PM2 Globalmente

```bash
sudo npm install -g pm2
```

---

## Passo 4: Preparar Aplicação

### 4.1. Clonar/Copiar Código

```bash
# Criar diretório da aplicação
sudo mkdir -p /opt/tiktok-trends
sudo chown $USER:$USER /opt/tiktok-trends

# Copiar código para o servidor (via git, scp, etc.)
cd /opt/tiktok-trends
# git clone <seu-repo> .
# ou usar scp/rsync para copiar arquivos
```

### 4.2. Instalar Dependências

```bash
cd /opt/tiktok-trends
npm install --production
```

**Nota:** O flag `--production` instala apenas dependências de produção, sem devDependencies.

### 4.3. Configurar Variáveis de Ambiente

```bash
# Copiar arquivo de exemplo
cp config.example.env .env

# Editar com suas configurações
nano .env
```

**Configurações mínimas para produção:**

```env
NODE_ENV=production
PORT=3000

DB_HOST=localhost
DB_USER=trends_user
DB_PASSWORD=senha_forte_aqui
DB_NAME=saitec_trends

# Gerar tokens fortes:
# openssl rand -hex 32
INTERNAL_API_TOKEN=seu_token_forte_aqui
PANEL_ACCESS_TOKEN=seu_token_painel_forte_aqui

HEADLESS=true
CORS_ORIGIN=https://seudominio.com
```

### 4.4. Criar Banco de Dados

```bash
mysql -u trends_user -p saitec_trends < database/schema.sql
```

---

## Passo 5: Iniciar com PM2

### 5.1. Iniciar Aplicação

```bash
cd /opt/tiktok-trends

# Opção 1: Usando script npm
pm2 start npm --name "tiktok-trends-api" -- start:prod

# Opção 2: Diretamente com node
pm2 start server.js --name "tiktok-trends-api" --env production
```

### 5.2. Verificar Status

```bash
pm2 status
pm2 logs tiktok-trends-api
```

### 5.3. Configurar PM2 para Iniciar no Boot

```bash
# Gerar script de startup
pm2 startup

# O comando acima mostrará um comando sudo para executar
# Execute o comando exibido (algo como):
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp /home/$USER

# Salvar configuração atual
pm2 save
```

---

## Passo 6: Comandos Úteis do PM2

```bash
# Ver status
pm2 status

# Ver logs em tempo real
pm2 logs tiktok-trends-api

# Ver logs apenas de erro
pm2 logs tiktok-trends-api --err

# Reiniciar aplicação
pm2 restart tiktok-trends-api

# Parar aplicação
pm2 stop tiktok-trends-api

# Deletar aplicação do PM2
pm2 delete tiktok-trends-api

# Monitorar recursos (CPU, memória)
pm2 monit

# Ver informações detalhadas
pm2 show tiktok-trends-api
```

---

## Passo 7: Configurar Nginx (Opcional mas Recomendado)

### 7.1. Instalar Nginx

```bash
sudo apt install -y nginx
```

### 7.2. Configurar Proxy Reverso

```bash
sudo nano /etc/nginx/sites-available/tiktok-trends
```

**Conteúdo:**

```nginx
server {
    listen 80;
    server_name seu-dominio.com;

    # Redirecionar HTTP para HTTPS (se tiver certificado SSL)
    # return 301 https://$server_name$request_uri;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 7.3. Ativar Configuração

```bash
sudo ln -s /etc/nginx/sites-available/tiktok-trends /etc/nginx/sites-enabled/
sudo nginx -t  # Testar configuração
sudo systemctl restart nginx
```

---

## Passo 8: Configurar SSL com Let's Encrypt (Opcional)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d seu-dominio.com
```

---

## Passo 9: Configurar Firewall

```bash
# Permitir SSH
sudo ufw allow 22/tcp

# Permitir HTTP e HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Ativar firewall
sudo ufw enable
```

---

## Passo 10: Monitoramento e Manutenção

### 10.1. Verificar Logs

```bash
# Logs da aplicação (PM2)
pm2 logs tiktok-trends-api

# Logs do sistema
tail -f /var/log/nginx/error.log
```

### 10.2. Verificar Healthcheck

```bash
curl http://localhost:3000/health
```

### 10.3. Atualizar Aplicação

```bash
cd /opt/tiktok-trends

# Fazer backup (opcional)
cp .env .env.backup

# Atualizar código (git pull, scp, etc.)
# git pull origin main

# Reinstalar dependências se necessário
npm install --production

# Reiniciar aplicação
pm2 restart tiktok-trends-api
```

---

## Troubleshooting

### Aplicação não inicia

```bash
# Ver logs detalhados
pm2 logs tiktok-trends-api --lines 100

# Verificar se porta está em uso
sudo netstat -tulpn | grep 3000

# Verificar variáveis de ambiente
pm2 show tiktok-trends-api | grep env
```

### Banco de dados não conecta

```bash
# Testar conexão MySQL
mysql -u trends_user -p -h localhost saitec_trends

# Verificar se MySQL está rodando
sudo systemctl status mysql
```

### PM2 não inicia no boot

```bash
# Reconfigurar startup
pm2 unstartup
pm2 startup
pm2 save
```

---

## Checklist de Deploy

- [ ] Node.js 18+ instalado
- [ ] MySQL instalado e configurado
- [ ] Banco de dados criado
- [ ] Código copiado para servidor
- [ ] Dependências instaladas (`npm install --production`)
- [ ] Arquivo `.env` configurado com valores de produção
- [ ] Tokens gerados e configurados
- [ ] PM2 instalado globalmente
- [ ] Aplicação iniciada com PM2
- [ ] PM2 configurado para iniciar no boot
- [ ] Healthcheck funcionando (`/health`)
- [ ] Nginx configurado (opcional)
- [ ] SSL configurado (opcional)
- [ ] Firewall configurado

---

## Próximos Passos

1. Configurar backup automático do banco de dados
2. Configurar monitoramento (ex: UptimeRobot, Pingdom)
3. Configurar alertas por email em caso de falha
4. Configurar log rotation para PM2
5. Configurar coleta automática via n8n ou cron

---

**Última atualização:** Janeiro 2025

