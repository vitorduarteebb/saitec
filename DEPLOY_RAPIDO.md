# ⚡ Deploy Rápido na VPS Hostinger

## 🎯 Comandos Rápidos

### 1. Conectar na VPS

```bash
ssh root@72.62.9.29
```

### 2. Executar Script de Deploy Automatizado

```bash
# Baixar e executar script
cd /root
wget https://raw.githubusercontent.com/vitorduarteebb/saitec/main/scripts/deploy-vps.sh
chmod +x deploy-vps.sh
./deploy-vps.sh
```

**OU** seguir manualmente:

### 3. Instalação Manual Rápida

```bash
# Atualizar sistema
apt update && apt upgrade -y

# Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Instalar MySQL
apt install -y mysql-server

# Instalar Chrome
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
apt install -y ./google-chrome-stable_current_amd64.deb
rm google-chrome-stable_current_amd64.deb

# Instalar Git e PM2
apt install -y git
npm install -g pm2

# Clonar repositório
cd /root
git clone https://github.com/vitorduarteebb/saitec.git saitec-automation
cd saitec-automation

# Instalar dependências
npm install --production

# Criar diretórios
mkdir -p cookies logs exports
chmod 700 cookies
```

### 4. Configurar MySQL

```bash
mysql_secure_installation
mysql -u root -p
```

No MySQL:
```sql
CREATE DATABASE saitec_trends CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'saitec_user'@'localhost' IDENTIFIED BY 'SuaSenhaForte123!';
GRANT ALL PRIVILEGES ON saitec_trends.* TO 'saitec_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 5. Criar Tabelas

```bash
cd /root/saitec-automation
mysql -u saitec_user -p saitec_trends < database/schema.sql
mysql -u saitec_user -p saitec_trends < database/create_products_table.sql
```

### 6. Configurar .env

```bash
cp config.example.env .env
nano .env
```

Configure:
- `DB_PASSWORD` (senha do MySQL)
- `KALODATA_EMAIL` e `KALODATA_PASSWORD`
- `KALODATA_HEADLESS=true` (após primeiro login)

### 7. Primeiro Login (IMPORTANTE!)

```bash
export KALODATA_HEADLESS=false
npm start
```

Quando o navegador abrir, faça login no Kalodata. Depois pressione Ctrl+C.

### 8. Iniciar com PM2

```bash
pm2 start server.js --name saitec-automation
pm2 save
pm2 startup
# Execute o comando que aparecer
```

### 9. Verificar

```bash
pm2 status
curl http://localhost:3000/health
```

---

## 📚 Documentação Completa

Para instruções detalhadas, consulte: **DEPLOY_VPS_HOSTINGER.md**

---

## 🔗 Acesso

- **API**: http://72.62.9.29:3000
- **Painel**: http://72.62.9.29:3000/painel
- **Health**: http://72.62.9.29:3000/health

