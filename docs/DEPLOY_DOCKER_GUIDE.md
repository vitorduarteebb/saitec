# Guia de Deploy com Docker - Produção

Este guia explica como fazer deploy do sistema de tendências TikTok usando Docker e Docker Compose.

---

## Pré-requisitos

- Servidor com Docker e Docker Compose instalados
- Acesso SSH ao servidor
- Porta 3000 disponível (ou ajustar no docker-compose)

---

## Passo 1: Instalar Docker e Docker Compose

### Ubuntu/Debian

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependências
sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release

# Adicionar repositório Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalar Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Verificar instalação
docker --version
docker compose version

# Adicionar usuário ao grupo docker (para não precisar sudo)
sudo usermod -aG docker $USER
# Fazer logout e login novamente para aplicar
```

---

## Passo 2: Preparar Arquivos

### 2.1. Copiar Código para Servidor

```bash
# Criar diretório
mkdir -p ~/tiktok-trends
cd ~/tiktok-trends

# Copiar código (via git, scp, etc.)
# git clone <seu-repo> .
# ou usar scp/rsync
```

### 2.2. Configurar Docker Compose

```bash
# Copiar arquivo de exemplo
cp docker-compose.example.yml docker-compose.yml

# Editar configurações
nano docker-compose.yml
```

**Ajustar variáveis importantes:**

```yaml
environment:
  # Gerar tokens fortes:
  # openssl rand -hex 32
  - INTERNAL_API_TOKEN=seu_token_forte_aqui
  - PANEL_ACCESS_TOKEN=seu_token_painel_forte_aqui
  
  # Senhas do MySQL
  - MYSQL_ROOT_PASSWORD=senha_root_forte_aqui
  - MYSQL_PASSWORD=senha_forte_aqui
  
  # CORS (ajustar para seu domínio)
  - CORS_ORIGIN=https://seudominio.com
```

---

## Passo 3: Construir e Iniciar

### 3.1. Construir Imagens

```bash
docker compose build
```

### 3.2. Iniciar Serviços

```bash
# Iniciar em background
docker compose up -d

# Ver logs
docker compose logs -f

# Ver status
docker compose ps
```

### 3.3. Verificar Healthcheck

```bash
# Healthcheck da aplicação
curl http://localhost:3000/health

# Verificar logs
docker compose logs app
docker compose logs mysql
```

---

## Passo 4: Comandos Úteis

### 4.1. Gerenciamento de Containers

```bash
# Parar serviços
docker compose stop

# Iniciar serviços
docker compose start

# Reiniciar serviços
docker compose restart

# Parar e remover containers
docker compose down

# Parar, remover containers e volumes (CUIDADO: apaga dados)
docker compose down -v

# Ver logs em tempo real
docker compose logs -f app

# Ver logs apenas de erro
docker compose logs app 2>&1 | grep -i error

# Executar comando dentro do container
docker compose exec app sh
docker compose exec mysql mysql -u trends_user -p saitec_trends
```

### 4.2. Atualizar Aplicação

```bash
# Parar serviços
docker compose down

# Atualizar código (git pull, scp, etc.)
# git pull origin main

# Reconstruir e iniciar
docker compose build --no-cache
docker compose up -d
```

---

## Passo 5: Configurar Nginx (Opcional)

Se quiser usar Nginx como proxy reverso:

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/tiktok-trends
```

**Configuração:**

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
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/tiktok-trends /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Passo 6: Backup e Restore

### 6.1. Backup do Banco de Dados

```bash
# Criar backup
docker compose exec mysql mysqldump -u trends_user -p saitec_trends > backup_$(date +%Y%m%d_%H%M%S).sql

# Ou usando docker exec diretamente
docker exec tiktok-trends-mysql mysqldump -u trends_user -p saitec_trends > backup.sql
```

### 6.2. Restore do Banco de Dados

```bash
# Restaurar backup
docker compose exec -T mysql mysql -u trends_user -p saitec_trends < backup.sql
```

### 6.3. Backup de Volumes

```bash
# Backup do volume MySQL
docker run --rm -v tiktok-trends_mysql_data:/data -v $(pwd):/backup alpine tar czf /backup/mysql_backup.tar.gz /data
```

---

## Passo 7: Monitoramento

### 7.1. Verificar Recursos

```bash
# Uso de recursos dos containers
docker stats

# Informações detalhadas
docker compose ps
docker inspect tiktok-trends-api
```

### 7.2. Logs

```bash
# Logs da aplicação
docker compose logs -f app --tail=100

# Logs do MySQL
docker compose logs -f mysql --tail=100

# Logs de todos os serviços
docker compose logs -f
```

---

## Troubleshooting

### Container não inicia

```bash
# Ver logs detalhados
docker compose logs app

# Verificar configuração
docker compose config

# Testar build
docker compose build --no-cache
```

### Banco de dados não conecta

```bash
# Verificar se MySQL está saudável
docker compose ps mysql

# Testar conexão manualmente
docker compose exec mysql mysql -u trends_user -p saitec_trends

# Ver logs do MySQL
docker compose logs mysql
```

### Porta já em uso

```bash
# Verificar o que está usando a porta
sudo netstat -tulpn | grep 3000

# Ajustar porta no docker-compose.yml
ports:
  - "3001:3000"  # Usar porta 3001 externamente
```

### Problemas de permissão

```bash
# Ajustar permissões do diretório de logs
sudo chown -R $USER:$USER logs/
chmod -R 755 logs/
```

---

## Checklist de Deploy

- [ ] Docker e Docker Compose instalados
- [ ] Código copiado para servidor
- [ ] `docker-compose.yml` configurado com valores de produção
- [ ] Tokens gerados e configurados
- [ ] Senhas do MySQL configuradas
- [ ] Containers construídos (`docker compose build`)
- [ ] Serviços iniciados (`docker compose up -d`)
- [ ] Healthcheck funcionando (`/health`)
- [ ] Banco de dados inicializado
- [ ] Logs verificados
- [ ] Nginx configurado (opcional)
- [ ] Backup configurado (opcional)

---

## Vantagens do Docker

✅ **Isolamento:** Aplicação e dependências isoladas  
✅ **Portabilidade:** Funciona igual em qualquer servidor  
✅ **Facilidade:** Um comando para subir tudo  
✅ **Versionamento:** Fácil rollback e atualização  
✅ **Escalabilidade:** Fácil escalar horizontalmente  

---

## Próximos Passos

1. Configurar backup automático do banco
2. Configurar monitoramento (ex: Portainer)
3. Configurar SSL com Let's Encrypt
4. Configurar log rotation
5. Configurar coleta automática via n8n

---

**Última atualização:** Janeiro 2025

