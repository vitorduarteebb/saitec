/**
 * Utilitário para retry de operações assíncronas
 */

const logger = require('./logger');

/**
 * Executa uma função com retry automático
 * @param {Function} fn - Função assíncrona a ser executada
 * @param {Object} options - Opções de retry
 * @param {number} options.maxRetries - Número máximo de tentativas (padrão: 3)
 * @param {number} options.delay - Delay entre tentativas em ms (padrão: 1000)
 * @param {Function} options.onRetry - Callback chamado em cada retry
 * @returns {Promise} Resultado da função
 */
async function retry(fn, options = {}) {
  const {
    maxRetries = 3,
    delay = 1000,
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries) {
        const waitTime = delay * attempt; // Backoff exponencial
        logger.warn(`Tentativa ${attempt}/${maxRetries} falhou. Tentando novamente em ${waitTime}ms...`, {
          error: error.message,
          attempt
        });

        if (onRetry) {
          onRetry(attempt, error);
        }

        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else {
        logger.error(`Todas as ${maxRetries} tentativas falharam`, {
          error: error.message,
          stack: error.stack
        });
      }
    }
  }

  throw lastError;
}

module.exports = { retry };

