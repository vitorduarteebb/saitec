/**
 * Script para matar processo usando uma porta específica
 * Execute: node scripts/kill-port.js [porta]
 * Exemplo: node scripts/kill-port.js 3000
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const port = process.argv[2] || 3000;

async function killPort(port) {
  try {
    console.log(`🔍 Procurando processo na porta ${port}...`);

    // Windows: netstat -ano | findstr :PORT
    const { stdout } = await execPromise(`netstat -ano | findstr :${port}`);
    
    if (!stdout || stdout.trim().length === 0) {
      console.log(`✅ Nenhum processo encontrado na porta ${port}`);
      return;
    }

    // Extrair PID (última coluna)
    const lines = stdout.trim().split('\n');
    const pids = new Set();
    
    lines.forEach(line => {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && !isNaN(pid)) {
        pids.add(pid);
      }
    });

    if (pids.size === 0) {
      console.log(`⚠️  Não foi possível identificar o PID do processo`);
      return;
    }

    console.log(`📋 Processos encontrados na porta ${port}:`);
    pids.forEach(pid => console.log(`   PID: ${pid}`));

    // Matar processos
    for (const pid of pids) {
      try {
        console.log(`🛑 Matando processo PID ${pid}...`);
        await execPromise(`taskkill /PID ${pid} /F`);
        console.log(`✅ Processo ${pid} finalizado com sucesso`);
      } catch (error) {
        console.log(`⚠️  Não foi possível matar processo ${pid}: ${error.message}`);
      }
    }

    console.log(`\n✅ Concluído! Agora você pode iniciar o servidor com: npm start`);

  } catch (error) {
    if (error.message.includes('findstr')) {
      console.log(`✅ Nenhum processo encontrado na porta ${port}`);
    } else {
      console.error(`❌ Erro:`, error.message);
      console.log(`\n💡 Tente manualmente:`);
      console.log(`   netstat -ano | findstr :${port}`);
      console.log(`   taskkill /PID <PID> /F`);
    }
  }
}

killPort(port);


