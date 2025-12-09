# 🔐 Solução: Configurar Login do Kalodata via Painel Web

## ✅ Nova Funcionalidade Implementada

Agora você pode configurar o login do Kalodata **diretamente pelo painel web**, sem precisar acessar a VPS!

## 🎯 Como Funciona

### 1. Acessar o Painel
```
http://72.62.9.29:3000/painel
```

### 2. Clicar no Botão "🔐 Configurar Login"
- Um modal será aberto com instruções passo a passo

### 3. Fazer Login no Kalodata
- Abra uma nova aba: https://www.kalodata.com
- Faça login com suas credenciais

### 4. Copiar Cookies (2 Métodos)

#### **Método 1 - Usando Extensão (RECOMENDADO - MAIS FÁCIL):**
1. Instale a extensão **"Cookie-Editor"** no Chrome/Edge:
   - Link: https://chrome.google.com/webstore/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm
2. Após fazer login no Kalodata, clique no ícone da extensão
3. Clique em **"Export"** → **"JSON"**
4. Cole o JSON completo no campo do modal

#### **Método 2 - Manual:**
1. Pressione **F12** (ou clique com botão direito → Inspecionar)
2. Vá na aba **"Application"** (Aplicativo)
3. No menu lateral, expanda **"Cookies"** → **"https://www.kalodata.com"**
4. Copie manualmente os cookies importantes
5. Formate como JSON: `[{"name":"nome","value":"valor","domain":".kalodata.com"}]`

### 5. Salvar Cookies
- Clique em **"💾 Salvar Cookies e Testar"**
- O sistema salvará os cookies e testará automaticamente
- Se funcionar, os produtos serão coletados!

## 📋 Passo a Passo Visual

1. **Painel** → Clicar em **"🔐 Configurar Login"**
2. **Nova Aba** → Acessar https://www.kalodata.com e fazer login
3. **Extensão** → Usar Cookie-Editor para exportar cookies
4. **Modal** → Colar cookies no campo
5. **Salvar** → Clicar em "Salvar Cookies e Testar"
6. **Pronto!** → Cookies salvos e sistema funcionando

## 🔄 Atualizar Cookies

Se os cookies expirarem:
1. Repita o processo acima
2. Os novos cookies substituirão os antigos automaticamente

## ⚠️ Importante

- Os cookies são salvos na VPS em: `/root/saitec-automation/cookies/kalodata-cookies.json`
- Os cookies expiram após algum tempo (depende do Kalodata)
- Quando expirar, basta repetir o processo

## 🎉 Vantagens

✅ **Não precisa acessar VPS**  
✅ **Não precisa instalar VNC**  
✅ **Fácil e rápido**  
✅ **Funciona de qualquer lugar**  
✅ **Teste automático após salvar**

## 📝 Notas Técnicas

- Endpoint criado: `POST /api/kalodata/cookies`
- Cookies salvos em formato JSON
- Validação automática do formato
- Teste automático após salvar

