/**
 * Script para criar arquivo .env a partir do config.example.env
 * Execute: node scripts/create-env.js
 */

const fs = require('fs');
const path = require('path');

const examplePath = path.join(__dirname, '..', 'config.example.env');
const envPath = path.join(__dirname, '..', '.env');

try {
  // Verificar se .env já existe
  if (fs.existsSync(envPath)) {
    console.log('⚠️  Arquivo .env já existe!');
    console.log('   Se quiser recriar, delete o arquivo .env primeiro.');
    process.exit(0);
  }

  // Ler arquivo de exemplo
  if (!fs.existsSync(examplePath)) {
    console.error('❌ Arquivo config.example.env não encontrado!');
    process.exit(1);
  }

  const content = fs.readFileSync(examplePath, 'utf8');
  
  // Criar arquivo .env
  fs.writeFileSync(envPath, content, 'utf8');
  
  console.log('✅ Arquivo .env criado com sucesso!');
  console.log('📝 Edite o arquivo .env e configure:');
  console.log('   - DB_PASSWORD=blade1411');
  console.log('   - Outras variáveis conforme necessário');
  console.log('');
  console.log('⚠️  IMPORTANTE: O arquivo .env contém informações sensíveis');
  console.log('   NUNCA commite este arquivo no git!');
  
} catch (error) {
  console.error('❌ Erro ao criar arquivo .env:', error.message);
  process.exit(1);
}


