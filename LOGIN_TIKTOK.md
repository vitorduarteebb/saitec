# 🔐 Login no TikTok - Guia de Configuração

## Como usar login para acessar For You e pegar vídeos virais reais

### 1. Configurar variáveis de ambiente

Adicione no arquivo `.env`:

```env
# Ativar login no TikTok (necessário para acessar For You)
TIKTOK_REQUIRE_LOGIN=true

# Opcional: Credenciais para login automático
# Se não fornecer, o sistema abrirá navegador para login manual
TIKTOK_USERNAME=seu_usuario_aqui
TIKTOK_PASSWORD=sua_senha_aqui

# Opcional: Modo headless (false = navegador visível, necessário para login manual)
HEADLESS=false
```

### 2. Modos de Login

#### Modo 1: Login Automático (com credenciais)
- Configure `TIKTOK_USERNAME` e `TIKTOK_PASSWORD` no `.env`
- O sistema tentará fazer login automaticamente
- ⚠️ **Atenção**: Armazenar senhas em texto plano não é seguro. Use apenas em ambiente de desenvolvimento.

#### Modo 2: Login Manual (recomendado)
- Não configure credenciais no `.env`
- Configure `HEADLESS=false` para ver o navegador
- O sistema abrirá o navegador e aguardará você fazer login manualmente
- Você terá até 5 minutos para completar o login
- Após login bem-sucedido, os cookies serão salvos para próximas execuções

### 3. Cookies Salvos

- Os cookies são salvos automaticamente em: `cookies/tiktok-cookies.json`
- Na próxima execução, o sistema tentará usar os cookies salvos primeiro
- Se os cookies expirarem, será necessário fazer login novamente

### 4. Como Funciona

1. **Primeira execução**:
   - Sistema detecta que precisa de login
   - Abre navegador (se `HEADLESS=false`)
   - Aguarda login manual ou tenta automático
   - Salva cookies após login bem-sucedido

2. **Próximas execuções**:
   - Carrega cookies salvos
   - Verifica se ainda são válidos
   - Se válidos, usa cookies (sem precisar login novamente)
   - Se inválidos, solicita login novamente

3. **Acesso ao For You**:
   - Após login, acessa `https://www.tiktok.com/foryou`
   - Coleta vídeos virais reais do dia
   - Ordena por viralidade (curtidas + engajamento)

### 5. Fallback Automático

- Se login falhar, o sistema automaticamente usa Creative Center como fallback
- Creative Center não requer login mas mostra conteúdo promocional/antigo

### 6. Segurança

⚠️ **IMPORTANTE**:
- Não compartilhe seu arquivo `.env` com credenciais
- Adicione `.env` ao `.gitignore` (já deve estar)
- Use login manual em produção para maior segurança
- Cookies salvos contêm sessão ativa - mantenha seguro

### 7. Teste

```bash
# 1. Configure .env com TIKTOK_REQUIRE_LOGIN=true
# 2. Reinicie o servidor
npm start

# 3. Acesse o painel ou API
# O sistema abrirá navegador para login (se HEADLESS=false)
```

### 8. Troubleshooting

**Problema**: Login não funciona
- Verifique se `HEADLESS=false` (necessário para login manual)
- Verifique se navegador está abrindo
- Verifique credenciais no `.env` (se usando automático)

**Problema**: Cookies expirados
- Delete `cookies/tiktok-cookies.json`
- Faça login novamente

**Problema**: Timeout no login
- Aumente o tempo de espera no código (padrão: 5 minutos)
- Ou configure credenciais para login automático

