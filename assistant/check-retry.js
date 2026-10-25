// Offline check of the single retry in callGemini. Mocks fetch, makes no Gemini requests.
process.env.LLM_PROVIDER = 'gemini';
process.env.GEMINI_API_KEY = 'test-key';
process.env.LLM_RETRY_DELAY_MS = '0';
const llm = require('./llm');

const good = () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'RESULT' }] } }] }) });
const bad = (status) => () => ({ ok: false, status, text: async () => 'mock error' });
const timeout = () => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }); };

const cases = [
    { name: 'first call ok, no retry', steps: [good], pass: (t, e, n) => t === 'RESULT' && !e && n === 1 },
    { name: '503 then ok, retried once', steps: [bad(503), good], pass: (t, e, n) => t === 'RESULT' && !e && n === 2 },
    { name: '429 then ok, retried once', steps: [bad(429), good], pass: (t, e, n) => t === 'RESULT' && !e && n === 2 },
    { name: '503 twice, error after one retry', steps: [bad(503)], pass: (t, e, n) => e instanceof llm.LlmError && e.message.includes('HTTP 503') && n === 2 },
    { name: '500 is not retried', steps: [bad(500)], pass: (t, e, n) => e instanceof llm.LlmError && e.message.includes('HTTP 500') && n === 1 },
    { name: 'timeout is not retried', steps: [timeout], pass: (t, e, n) => e && e.name === 'TimeoutError' && n === 1 },
];

(async () => {
    let failed = 0;
    for (const c of cases) {
        let calls = 0;
        global.fetch = async () => {
            const step = c.steps[Math.min(calls, c.steps.length - 1)];
            calls += 1;
            return step();
        };
        let text = null;
        let err = null;
        try { text = await llm.complete({ prompt: 'p', question: 'q' }); } catch (e) { err = e; }
        const ok = c.pass(text, err, calls);
        if (!ok) failed += 1;
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}  (fetch calls: ${calls})`);
    }
    console.log(failed ? `${failed} FAILED` : 'retry check: all passed');
    process.exitCode = failed ? 1 : 0;
})();
