# Resolver Problema de Conectividade com GitHub na VPS

## Problema
```
fatal: unable to access 'https://github.com/vitorduarteebb/saitec.git/': Failed to connect to github.com port 443
```

## Soluções

### 1. Verificar Conectividade de Rede

```bash
# Testar conexão com GitHub
ping github.com

# Testar conexão HTTPS
curl -I https://github.com

# Verificar DNS
nslookup github.com
```

### 2. Tentar Novamente (Pode ser temporário)

```bash
cd /root/saitec-automation
git pull origin main
```

### 3. Usar SSH em vez de HTTPS (Recomendado)

```bash
# Verificar URL atual
cd /root/saitec-automation
git remote -v

# Se estiver usando HTTPS, mudar para SSH
git remote set-url origin git@github.com:vitorduarteebb/saitec.git

# Tentar pull novamente
git pull origin main
```

**Nota:** Para usar SSH, você precisa ter uma chave SSH configurada no GitHub.

### 4. Transferir Arquivos Manualmente via SCP (Alternativa)

Se o problema persistir, você pode transferir os arquivos diretamente do seu computador para a VPS:

**No seu computador Windows (PowerShell):**

```powershell
# Navegar até a pasta do projeto
cd "C:\Users\oem\OneDrive\Área de Trabalho\SAITEC"

# Transferir apenas o arquivo panel.html atualizado
scp public/panel.html root@72.62.9.29:/root/saitec-automation/public/panel.html

# Ou transferir toda a pasta public (se houver outras mudanças)
scp -r public root@72.62.9.29:/root/saitec-automation/
```

**Depois na VPS:**

```bash
# Reiniciar PM2 para aplicar mudanças
pm2 restart saitec-automation --update-env
```

### 5. Verificar Firewall/Proxy

```bash
# Verificar se há proxy configurado
echo $http_proxy
echo $https_proxy

# Se houver proxy, configurar Git para usá-lo
git config --global http.proxy http://proxy:port
git config --global https.proxy https://proxy:port

# Ou desabilitar proxy se não necessário
unset http_proxy
unset https_proxy
```

### 6. Usar Mirror/Espelho do GitHub (Último recurso)

Se o GitHub estiver bloqueado, você pode tentar usar um espelho:

```bash
# Configurar Git para usar um mirror
git config --global url."https://github.com.cnpmjs.org/".insteadOf "https://github.com/"
```

## Solução Rápida Recomendada

**Opção A: Transferir arquivo via SCP (Mais rápido)**

No seu computador:
```powershell
scp public/panel.html root@72.62.9.29:/root/saitec-automation/public/panel.html
```

Na VPS:
```bash
pm2 restart saitec-automation --update-env
```

**Opção B: Tentar novamente após alguns minutos**

O problema pode ser temporário. Aguarde alguns minutos e tente:

```bash
cd /root/saitec-automation
git pull origin main
pm2 restart saitec-automation --update-env
```

## Verificar se Funcionou

```bash
# Ver logs do PM2
pm2 logs saitec-automation --lines 50

# Verificar status
pm2 status
```

