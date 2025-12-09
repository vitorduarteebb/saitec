# 📖 Leia-me Primeiro - Automação SAITEC

Bem-vindo ao sistema de Automação SAITEC para coleta de produtos TikTok Shop!

## 🎯 O que este sistema faz?

Este sistema automatiza a coleta diária dos produtos mais vendidos no TikTok Shop através da plataforma Kalodata, armazenando todas as informações em banco de dados MySQL e permitindo exportação em CSV.

## 🚀 Começando

### Para Instalação Rápida

1. Leia **[INSTALACAO_RAPIDA.md](INSTALACAO_RAPIDA.md)** - Guia passo a passo rápido
2. Configure o arquivo `.env` com suas credenciais
3. Execute `npm start`

### Para Deploy em VPS

1. Leia **[DEPLOY_VPS.md](DEPLOY_VPS.md)** - Guia completo de deploy
2. Siga as instruções passo a passo
3. Configure PM2 para gerenciamento

### Para Entender o Sistema

1. Leia **[DOCUMENTACAO_COMPLETA.md](DOCUMENTACAO_COMPLETA.md)** - Documentação técnica completa
2. Consulte **[README.md](README.md)** - Visão geral e referência rápida

## 📚 Documentação Disponível

| Documento | Descrição |
|-----------|-----------|
| **[README.md](README.md)** | Visão geral, endpoints e referência rápida |
| **[INSTALACAO_RAPIDA.md](INSTALACAO_RAPIDA.md)** | Guia rápido de instalação local/VPS |
| **[DEPLOY_VPS.md](DEPLOY_VPS.md)** | Guia detalhado de deploy em servidor |
| **[DOCUMENTACAO_COMPLETA.md](DOCUMENTACAO_COMPLETA.md)** | Documentação técnica completa |
| **[PRODUTOS_SETUP.md](PRODUTOS_SETUP.md)** | Configuração de persistência de produtos |
| **[KALODATA_SETUP.md](KALODATA_SETUP.md)** | Configuração do login Kalodata |

## ⚡ Início Rápido (30 segundos)

```bash
# 1. Instalar dependências
npm install

# 2. Configurar banco
mysql -u root -p < database/schema.sql
mysql -u root -p saitec_trends < database/create_products_table.sql

# 3. Configurar .env
cp config.example.env .env
# Edite .env com suas credenciais

# 4. Primeiro login (modo visível)
export KALODATA_HEADLESS=false
npm start

# 5. Quando o navegador abrir, faça login no Kalodata
```

## 🔑 Pontos Importantes

### Primeiro Login

Na primeira execução, você **DEVE** fazer login manualmente no Kalodata:

1. Configure `KALODATA_HEADLESS=false` no `.env`
2. Execute `npm start`
3. Quando o navegador abrir, faça login
4. Os cookies serão salvos automaticamente
5. Depois, configure `KALODATA_HEADLESS=true` para produção

### Persistência de Dados

Todos os produtos coletados são **automaticamente salvos** no banco de dados. Não há risco de perder dados!

### Download de CSV

- **Coleta atual**: `/shop/top-products.csv` - Apenas produtos desta coleta
- **Completo do dia**: `/shop/products/all.csv` - Todos os produtos salvos do dia

## 🆘 Precisa de Ajuda?

1. **Problemas de instalação?** → Consulte `INSTALACAO_RAPIDA.md`
2. **Problemas em VPS?** → Consulte `DEPLOY_VPS.md`
3. **Erros ou bugs?** → Consulte seção Troubleshooting em `DOCUMENTACAO_COMPLETA.md`
4. **Dúvidas técnicas?** → Consulte `DOCUMENTACAO_COMPLETA.md`

## 📋 Checklist de Instalação

- [ ] Node.js 18+ instalado
- [ ] MySQL instalado e configurado
- [ ] Banco de dados criado
- [ ] Tabelas criadas (schema.sql + create_products_table.sql)
- [ ] Arquivo .env configurado
- [ ] Dependências npm instaladas
- [ ] Primeiro login no Kalodata realizado
- [ ] Cookies salvos em cookies/kalodata-cookies.json
- [ ] Teste de coleta bem-sucedido

## 🎯 Próximos Passos Após Instalação

1. ✅ Sistema instalado e funcionando
2. 📊 Acessar painel: `http://localhost:3000/painel`
3. 🔄 Testar coleta: `http://localhost:3000/shop/top-products`
4. 📥 Baixar CSV: `http://localhost:3000/shop/products/all.csv`
5. 🚀 Configurar agendamento (se necessário)

---

**Versão**: 1.0  
**Última Atualização**: Dezembro 2025

