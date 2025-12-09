# 🔐 Instruções para Primeiro Login - Cliente

## 📍 Links de Acesso

### Painel Principal (Interface Web)
```
http://72.62.9.29:3000/painel
```

### Health Check (Verificar se está funcionando)
```
http://72.62.9.29:3000/health
```

### API de Produtos
```
http://72.62.9.29:3000/shop/top-products
```

---

## 🔑 Passo a Passo para Primeiro Login

### ⚠️ IMPORTANTE: Configuração Inicial Necessária

**Antes de acessar o painel**, o administrador precisa configurar as credenciais do Kalodata no servidor.

### 1. Acessar o Painel
Abra no navegador:
```
http://72.62.9.29:3000/painel
```

**Se aparecer "Acesso Não Autorizado":**
- O administrador precisa configurar `PANEL_ACCESS_TOKEN=` (vazio) no arquivo `.env`
- OU acesse com token: `http://72.62.9.29:3000/painel?token=seu_token`

### 2. Configurar Credenciais do Kalodata

**O administrador deve editar o arquivo `.env` na VPS e adicionar:**

```env
KALODATA_EMAIL=seu_email@kalodata.com
KALODATA_PASSWORD=sua_senha
KALODATA_HEADLESS=true
NODE_ENV=development
PANEL_ACCESS_TOKEN=
```

Depois reiniciar: `pm2 restart saitec-automation`

### 3. Fazer Login no Kalodata (Automático)

Após configurar as credenciais:
1. O sistema tentará fazer login automático usando as credenciais do `.env`
2. Se funcionar, os produtos serão coletados automaticamente
3. Os cookies serão salvos para próximas execuções

### 3. Verificar se Funcionou
Após o login, o sistema coletará produtos automaticamente.

Acesse:
```
http://72.62.9.29:3000/shop/top-products?limit=10
```

Deve retornar uma lista de produtos em JSON.

---

## ⚙️ Configuração Atual

- **Servidor**: Rodando na porta 3000
- **Status**: Online (PM2)
- **Modo**: Headless (sem interface gráfica)
- **Primeiro Login**: Necessário fazer manualmente

---

## 🔧 Se o Login Não Funcionar Automaticamente

### Opção 1: Configurar Credenciais no Servidor
O administrador pode configurar as credenciais no arquivo `.env`:
- `KALODATA_EMAIL=seu_email@exemplo.com`
- `KALODATA_PASSWORD=sua_senha`

### Opção 2: Login Manual via VNC
Se necessário, o administrador pode configurar VNC para acesso remoto e fazer login manualmente.

---

## 📞 Suporte

Se houver problemas:
1. Verifique se o servidor está online: `http://72.62.9.29:3000/health`
2. Verifique os logs do sistema
3. Entre em contato com o administrador

