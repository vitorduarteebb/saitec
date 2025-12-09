# Changelog - Automação SAITEC

Todas as mudanças notáveis neste projeto serão documentadas neste arquivo.

## [1.0.0] - 2025-12-09

### Adicionado

- Sistema completo de coleta de produtos TikTok Shop via Kalodata
- Persistência automática em banco de dados MySQL
- Tabela `tiktok_shop_products` para armazenamento de produtos
- Endpoint `/shop/top-products` para coleta de produtos
- Endpoint `/shop/products/all.csv` para download de CSV completo
- Interface web moderna (`/painel`) para visualização
- Sistema de login automático com gerenciamento de cookies
- Prevenção de duplicatas no mesmo dia
- Suporte a múltiplas fontes (Kalodata, TikTok Shop direto)
- Documentação completa (DOCUMENTACAO_COMPLETA.md)
- Guia de deploy em VPS (DEPLOY_VPS.md)
- Guia de instalação rápida (INSTALACAO_RAPIDA.md)
- Script de setup automatizado (scripts/setup.sh)

### Funcionalidades Principais

- Coleta automatizada de produtos mais vendidos
- Extração de métricas completas (receita, crescimento, vendas, etc.)
- Salvamento automático no banco de dados
- Exportação em CSV com todos os dados coletados
- Filtros por data, fonte e país
- Interface responsiva e moderna

### Melhorias

- Sistema robusto de extração com múltiplas estratégias (DOM, API, texto)
- Tratamento de erros e fallbacks
- Logs detalhados para debugging
- Suporte a modo headless para produção
- Suporte a modo visível para primeiro login

### Documentação

- README.md atualizado com informações do sistema
- DOCUMENTACAO_COMPLETA.md com documentação técnica detalhada
- DEPLOY_VPS.md com guia passo a passo para VPS
- INSTALACAO_RAPIDA.md com guia rápido de instalação
- PRODUTOS_SETUP.md com instruções de configuração

### Segurança

- Arquivo .env adicionado ao .gitignore
- Cookies não são commitados
- Logs de debug não são commitados
- Permissões adequadas para diretórios sensíveis

---

## Formato

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

[1.0.0]: https://github.com/saitec/automation/releases/tag/v1.0.0

