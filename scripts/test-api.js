/**
 * Script de teste da API
 * Execute: node scripts/test-api.js
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

async function testHealth() {
  console.log('\n🔍 Testando Health Check...');
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    console.log('✅ Health Check OK:', response.data);
  } catch (error) {
    console.error('❌ Erro no Health Check:', error.message);
  }
}

async function testTopTrends() {
  console.log('\n📊 Testando GET /trends/top...');
  try {
    const response = await axios.get(`${BASE_URL}/trends/top`, {
      params: {
        niche: 'beleza',
        country: 'BR',
        limit: 5
      }
    });
    console.log(`✅ Coletadas ${response.data.count} tendências`);
    console.log('Primeira tendência:', response.data.data[0]);
  } catch (error) {
    console.error('❌ Erro ao buscar tendências:', error.message);
  }
}

async function testCollectAndSave() {
  console.log('\n💾 Testando POST /trends/collect-and-save...');
  try {
    const response = await axios.post(`${BASE_URL}/trends/collect-and-save`, {
      niche: 'beleza',
      country: 'BR',
      limit: 5,
      sources: 'tiktok_cc'
    });
    console.log(`✅ Coletadas ${response.data.collected} tendências`);
    console.log(`✅ Salvas ${response.data.saved} tendências no banco`);
  } catch (error) {
    console.error('❌ Erro ao coletar e salvar:', error.message);
  }
}

async function testLatestTrends() {
  console.log('\n📋 Testando GET /trends/latest...');
  try {
    const response = await axios.get(`${BASE_URL}/trends/latest`, {
      params: { limit: 5 }
    });
    console.log(`✅ Encontradas ${response.data.count} tendências no banco`);
  } catch (error) {
    console.error('❌ Erro ao buscar últimas tendências:', error.message);
  }
}

async function runAllTests() {
  console.log('🧪 Iniciando testes da API...\n');
  console.log(`📍 URL base: ${BASE_URL}\n`);

  await testHealth();
  await testTopTrends();
  await testCollectAndSave();
  await testLatestTrends();

  console.log('\n✨ Testes concluídos!');
}

runAllTests().catch(console.error);

