// utils/poll-until.js
async function pollUntil(fetchFn, conditionFn, { timeoutMs = 10000, intervalMs = 500 } = {}) {
  const start = Date.now();
  let lastResult;

  while (Date.now() - start < timeoutMs) {
    lastResult = await fetchFn();
    if (conditionFn(lastResult)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `pollUntil: condition not met within ${timeoutMs}ms. Last result: ${JSON.stringify(lastResult)}`
  );
}

module.exports = { pollUntil };