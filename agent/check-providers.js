'use strict';
// Offline check of the model adapters, prompt and clause index. 0 real model requests:
// the adapters talk to FAKE Ollama and Gemini servers started on random local ports.
//   node agent/check-providers.js     (or: npm run agent:check-providers)
const http = require('http');
const assert = require('assert');
const { createOllama, toOllamaMessages, toOllamaTools, coerceBooleans } = require('./providers/ollama');
const { createGemini, toGeminiSchema, toGeminiContents, toResponseObject } = require('./providers/gemini');
const { buildClauseIndex, mockClauseIndex } = require('./clause-index');
const { buildSystemPrompt } = require('./prompt');
const { TOOLS } = require('./tools');
const { createSession, runTurn } = require('./loop');
const { createMockTools } = require('./mock-tools');

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed += 1; console.log(`  ok   ${name}`); } catch (e) { failures.push(name); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

// handler(req, bodyObject, n) -> [status, jsonBody]; n = how many requests the fake has seen so far (1-based)
async function startFake(handler) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      seen.push({ url: req.url, headers: req.headers, body });
      const [status, out] = handler(req, body, seen.length);
      const payload = JSON.stringify(out);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(payload);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, seen, close: () => new Promise((r) => server.close(r)) };
}

const ollamaText = (t) => [200, { message: { role: 'assistant', content: t } }];
const ollamaCall = (name, args) => [200, { message: { role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] } }];
const geminiText = (t) => [200, { candidates: [{ content: { role: 'model', parts: [{ text: t }] }, finishReason: 'STOP' }] }];
const geminiCall = (name, args, sig) => [200, { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args }, ...(sig ? { thoughtSignature: sig } : {}) }] } }] }];

const HISTORY = [
  { role: 'user', content: 'delivery to Lahore?' },
  { role: 'assistant', tool_call: { name: 'get_policy_clause', args: { section: '3.1' }, meta: { thoughtSignature: 'SIG1' } } },
  { role: 'tool', name: 'get_policy_clause', content: '{"found":true,"text":"3 to 5 days"}' },
  { role: 'assistant', content: 'About 3 to 5 days.' },
];

const SYNTH_POLICY = [
  '# Tulip & Teak Store Policy', 'Version 1.0. Effective 1 January.', '## 1. General',
  '1.1 This policy covers apparel, home textiles and small home appliances sold by the store.',
  '1.2 Short clause.', '## 3. Delivery', '3.1 Delivery takes 3 to 5 working days to Lahore, Karachi and Islamabad/Rawalpindi. Costs $& extra.',
  '3.1 duplicate number is ignored', '  4.1   Cancellation    is free   before dispatch.  ', 'not a clause 5 line',
].join('\n');

(async () => {
  console.log('prompt and clause index');
  await check('clause index: only N.N lines, text cut at 70 chars + "...", duplicates and spacing handled', () => {
    const { index, count } = buildClauseIndex(SYNTH_POLICY);
    const lines = index.split('\n');
    assert.strictEqual(count, 4);
    assert.deepStrictEqual(lines.map((l) => l.split(' ')[0]), ['1.1', '1.2', '3.1', '4.1']);
    assert.ok(lines[0].endsWith('...') && lines[0].length <= 'x.x '.length + 70 + 3, lines[0]);
    assert.strictEqual(lines[1], '1.2 Short clause.');
    assert.strictEqual(lines[3], '4.1 Cancellation is free before dispatch.');
  });
  await check('clause index: empty or header-only text gives count 0; mock index has 2 clauses', () => {
    assert.strictEqual(buildClauseIndex('# Title\n## 1. Intro').count, 0);
    assert.strictEqual(mockClauseIndex().count, 2);
  });
  await check('system prompt: rules kept, index appended verbatim ("$&" is not a replace pattern), empty index refused', () => {
    const p = buildSystemPrompt('3.1 Costs $& and $1 extra');
    assert.ok(p.includes('POLICY CLAUSE INDEX:\n3.1 Costs $& and $1 extra'));
    assert.ok(p.startsWith('You are the Tulip & Teak customer-support agent.'));
    assert.strictEqual((p.match(/^\d\. /gm) || []).length, 8);
    assert.throws(() => buildSystemPrompt('  '));
  });

  console.log('loop');
  await check('loop: no "system" key and no "meta" when the provider gives none (stub path unchanged)', async () => {
    const calls = [];
    const provider = { name: 'spy', next: async (a) => { calls.push(a); return { type: 'text', text: 'hi' }; } };
    await runTurn(createSession(createMockTools()), provider, 'hello');
    assert.ok(!('system' in calls[0]));
  });
  await check('loop: system is passed through; meta is stored on the tool_call message and NOT in the trace', async () => {
    const steps = [{ type: 'tool_call', name: 'get_policy_clause', args: { section: '3.1' }, meta: { thoughtSignature: 'S' } }, { type: 'text', text: 'done' }];
    const seenSystem = [];
    const provider = { name: 'spy', next: async (a) => { seenSystem.push(a.system); return steps.shift(); } };
    const session = createSession(createMockTools());
    const r = await runTurn(session, provider, 'x', { system: 'SYS' });
    assert.deepStrictEqual(seenSystem, ['SYS', 'SYS']);
    assert.deepStrictEqual(session.messages[1].tool_call.meta, { thoughtSignature: 'S' });
    assert.ok(!JSON.stringify(r.trace).includes('thoughtSignature'));
  });

  console.log('ollama adapter');
  await check('ollama: messages translate (system first, tool_calls, tool_name); tools drop "kind"', () => {
    const m = toOllamaMessages(HISTORY, 'SYS');
    assert.deepStrictEqual(m[0], { role: 'system', content: 'SYS' });
    assert.deepStrictEqual(m[2], { role: 'assistant', content: '', tool_calls: [{ function: { name: 'get_policy_clause', arguments: { section: '3.1' } } }] });
    assert.deepStrictEqual(m[3], { role: 'tool', tool_name: 'get_policy_clause', content: '{"found":true,"text":"3 to 5 days"}' });
    assert.deepStrictEqual(m[4], { role: 'assistant', content: 'About 3 to 5 days.' });
    assert.ok(!JSON.stringify(m).includes('SIG1'), 'meta must not leak to Ollama');
    const t = toOllamaTools(TOOLS);
    assert.strictEqual(t.length, 4);
    assert.ok(t.every((x) => x.type === 'function' && !('kind' in x.function) && x.function.parameters.type === 'object'));
  });
  await check('ollama: tool call, text, string arguments, parallel calls, errors; request body is right', async () => {
    const script = [
      ollamaCall('get_stock', { product_name: 'Tulip & Teak Jeans' }),
      ollamaText('  We have 50.  '),
      ollamaCall('get_policy_clause', '{"section":"3.1"}'),
      [200, { message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'get_stock', arguments: { product_name: 'A' } } }, { function: { name: 'get_stock', arguments: { product_name: 'B' } } }] } }],
      [404, { error: 'model "x" not found' }],
      ollamaText('   '),
      ollamaCall('get_stock', '{not json'),
    ];
    const fake = await startFake((req, body, n) => script[n - 1]);
    const p = createOllama({ baseUrl: fake.url, model: 'llama3.1:8b', temperature: 0, timeoutMs: 5000 });
    const args = { messages: [{ role: 'user', content: 'hi' }], tools: TOOLS, system: 'SYS' };
    assert.deepStrictEqual(await p.next(args), { type: 'tool_call', name: 'get_stock', args: { product_name: 'Tulip & Teak Jeans' } });
    assert.deepStrictEqual(await p.next(args), { type: 'text', text: 'We have 50.' });
    assert.deepStrictEqual(await p.next(args), { type: 'tool_call', name: 'get_policy_clause', args: { section: '3.1' } });
    assert.deepStrictEqual((await p.next(args)).args, { product_name: 'A' });
    assert.strictEqual(p.stats.ignoredToolCalls, 1);
    await assert.rejects(p.next(args), /ollama HTTP 404.*not found/);
    await assert.rejects(p.next(args), /neither text nor a tool call/);
    await assert.rejects(p.next(args), /not valid JSON/);
    assert.strictEqual(p.stats.requests, 7);
    const b = fake.seen[0].body;
    assert.strictEqual(b.model, 'llama3.1:8b'); assert.strictEqual(b.stream, false);
    assert.strictEqual(b.options.temperature, 0); assert.strictEqual(b.tools.length, 4);
    assert.deepStrictEqual(b.messages[0], { role: 'system', content: 'SYS' });
    assert.strictEqual(fake.seen[0].url, '/api/chat');
    await fake.close();
  });
  await check('ollama: string "true"/"false" for a boolean field is converted (and counted); other values are left alone', async () => {
    const a = { order_number: '1001', email: 'a@b.co', reason: 'does not fit' };
    assert.deepStrictEqual(coerceBooleans('request_refund', { ...a, confirm: 'false' }), { args: { ...a, confirm: false }, count: 1 });
    assert.strictEqual(coerceBooleans('request_refund', { ...a, confirm: ' True ' }).args.confirm, true);
    assert.strictEqual(coerceBooleans('request_refund', { ...a, confirm: 'yes' }).args.confirm, 'yes');   // not a boolean word: Ajv rejects it
    assert.strictEqual(coerceBooleans('request_refund', { ...a, confirm: 1 }).args.confirm, 1);
    assert.strictEqual(coerceBooleans('get_order', { order_number: 'true', email: 'a@b.co' }).args.order_number, 'true'); // string field untouched
    assert.strictEqual(coerceBooleans('nope', { confirm: 'true' }).args.confirm, 'true');
    const fake = await startFake(() => ollamaCall('request_refund', { ...a, confirm: 'true' }));
    const p = createOllama({ baseUrl: fake.url });
    const out = await p.next({ messages: [{ role: 'user', content: 'x' }], tools: TOOLS });
    assert.strictEqual(out.args.confirm, true);
    assert.strictEqual(p.stats.coercions, 1);
    await fake.close();
  });
  await check('ollama: check() passes with the model installed, explains when it is missing or Ollama is down', async () => {
    const fake = await startFake(() => [200, { models: [{ name: 'llama3.1:8b' }, { name: 'llama3.2:3b' }] }]);
    await createOllama({ baseUrl: fake.url, model: 'llama3.1:8b' }).check();
    await assert.rejects(createOllama({ baseUrl: fake.url, model: 'qwen3:8b' }).check(), /no model "qwen3:8b".*ollama pull qwen3:8b/);
    await fake.close();
    await assert.rejects(createOllama({ baseUrl: fake.url, model: 'llama3.1:8b' }).check(), /not reachable/);
  });

  console.log('gemini adapter');
  await check('gemini: schema conversion uppercases types, drops pattern/minLength/maxLength/additionalProperties/kind', () => {
    const payload = JSON.stringify(require('./providers/gemini').toGeminiTools(TOOLS));
    for (const bad of ['pattern', 'minLength', 'maxLength', 'additionalProperties', '"kind"']) assert.ok(!payload.includes(bad), `${bad} still present`);
    const s = toGeminiSchema(TOOLS[3].parameters);
    assert.strictEqual(s.type, 'OBJECT');
    assert.strictEqual(s.properties.confirm.type, 'BOOLEAN');
    assert.strictEqual(s.properties.reason.type, 'STRING');
    assert.deepStrictEqual(s.required, ['order_number', 'email', 'reason', 'confirm']);
  });
  await check('gemini: contents translate (model/user roles, functionCall + signature, functionResponse object, wrapping)', () => {
    const c = toGeminiContents(HISTORY);
    assert.deepStrictEqual(c[1], { role: 'model', parts: [{ functionCall: { name: 'get_policy_clause', args: { section: '3.1' } }, thoughtSignature: 'SIG1' }] });
    assert.deepStrictEqual(c[2], { role: 'user', parts: [{ functionResponse: { name: 'get_policy_clause', response: { found: true, text: '3 to 5 days' } } }] });
    assert.deepStrictEqual(c[3], { role: 'model', parts: [{ text: 'About 3 to 5 days.' }] });
    assert.deepStrictEqual(toResponseObject('5'), { result: 5 });
    assert.deepStrictEqual(toResponseObject('[1,2]'), { result: [1, 2] });
    assert.deepStrictEqual(toResponseObject('plain words'), { result: 'plain words' });
    const noSig = toGeminiContents([{ role: 'assistant', tool_call: { name: 'get_stock', args: { product_name: 'x' } } }]);
    assert.ok(!('thoughtSignature' in noSig[0].parts[0]));
  });
  await check('gemini: full loop, thoughtSignature is sent back unchanged (fake API answers 400 if it is missing)', async () => {
    const fake = await startFake((req, body, n) => {
      const hasCallBack = body.contents.some((c) => c.parts.some((p) => p.functionCall));
      if (hasCallBack) {
        const part = body.contents.flatMap((c) => c.parts).find((p) => p.functionCall);
        if (part.thoughtSignature !== 'SIG-ABC') return [400, { error: { message: 'Function call is missing a thought_signature' } }];
        return geminiText('Delivery takes 3 to 5 days.');
      }
      return geminiCall('get_policy_clause', { section: '3.1' }, 'SIG-ABC');
    });
    const p = createGemini({ apiKey: 'k', baseUrl: fake.url, model: 'gemini-test', retryDelayMs: 0 });
    const r = await runTurn(createSession(createMockTools()), p, 'How long does delivery take?', { system: 'SYS' });
    assert.strictEqual(r.reply, 'Delivery takes 3 to 5 days.');
    assert.strictEqual(r.modelCalls, 2);
    assert.strictEqual(p.stats.requests, 2);
    assert.ok(!JSON.stringify(r.trace).includes('SIG-ABC'));
    const first = fake.seen[0];
    assert.strictEqual(first.url, '/models/gemini-test:generateContent');
    assert.strictEqual(first.headers['x-goog-api-key'], 'k');
    assert.deepStrictEqual(first.body.systemInstruction, { parts: [{ text: 'SYS' }] });
    assert.deepStrictEqual(first.body.toolConfig, { functionCallingConfig: { mode: 'AUTO' } });
    assert.strictEqual(first.body.generationConfig.temperature, 0);
    assert.strictEqual(first.body.tools[0].functionDeclarations.length, 4);
    await fake.close();
  });
  await check('gemini: refund flow over two messages (confirm=false, then confirm=true) records one action', async () => {
    const args = { order_number: '1001', email: 'amir.jee@example.com', reason: 'wrong size' };
    const script = [
      geminiCall('request_refund', { ...args, confirm: false }, 'S1'), geminiText('Please confirm the refund request.'),
      geminiCall('request_refund', { ...args, confirm: true }, 'S2'), geminiText('Recorded for staff review.'),
    ];
    const fake = await startFake((req, body, n) => script[n - 1]);
    const backend = createMockTools();
    const session = createSession(backend);
    const p = createGemini({ apiKey: 'k', baseUrl: fake.url, retryDelayMs: 0 });
    const r1 = await runTurn(session, p, 'Refund order 1001 amir.jee@example.com, wrong size', { system: 'S' });
    const r2 = await runTurn(session, p, 'Yes, please go ahead', { system: 'S' });
    assert.strictEqual(r1.trace[0].result.status, 'pending_confirmation');
    assert.strictEqual(r2.trace[0].status, 'ok');
    assert.strictEqual(backend.state().actions.length, 1);
    assert.strictEqual(p.stats.requests, 4);
    await fake.close();
  });
  await check('gemini: one retry on 429 and 503 (both requests counted), none on 400, gives up after one retry', async () => {
    const args = { messages: [{ role: 'user', content: 'hi' }], tools: TOOLS, system: 'S' };
    let f = await startFake((r, b, n) => (n === 1 ? [429, { error: 'rate' }] : geminiText('ok')));
    let p = createGemini({ apiKey: 'k', baseUrl: f.url, retryDelayMs: 0 });
    assert.deepStrictEqual(await p.next(args), { type: 'text', text: 'ok' });
    assert.deepStrictEqual({ r: p.stats.requests, t: p.stats.retries }, { r: 2, t: 1 }); await f.close();

    f = await startFake((r, b, n) => (n === 1 ? [503, { error: 'busy' }] : geminiText('ok')));
    p = createGemini({ apiKey: 'k', baseUrl: f.url, retryDelayMs: 0 });
    await p.next(args); assert.strictEqual(p.stats.requests, 2); await f.close();

    f = await startFake(() => [503, { error: 'busy' }]);
    p = createGemini({ apiKey: 'k', baseUrl: f.url, retryDelayMs: 0 });
    await assert.rejects(p.next(args), /gemini HTTP 503/); assert.strictEqual(p.stats.requests, 2); await f.close();

    f = await startFake(() => [400, { error: 'bad' }]);
    p = createGemini({ apiKey: 'k', baseUrl: f.url, retryDelayMs: 0 });
    await assert.rejects(p.next(args), /gemini HTTP 400/); assert.strictEqual(p.stats.requests, 1); await f.close();
  });
  await check('gemini: parallel calls (first used, rest counted), thought parts skipped, empty/blocked reply throws, no key throws', async () => {
    const script = [
      [200, { candidates: [{ content: { parts: [{ functionCall: { name: 'get_stock', args: { product_name: 'A' } }, thoughtSignature: 'P1' }, { functionCall: { name: 'get_stock', args: { product_name: 'B' } } }] } }] }],
      [200, { candidates: [{ content: { parts: [{ text: 'thinking...', thought: true }, { text: 'Answer.' }] } }] }],
      [200, { promptFeedback: { blockReason: 'SAFETY' } }],
    ];
    const f = await startFake((r, b, n) => script[n - 1]);
    const p = createGemini({ apiKey: 'k', baseUrl: f.url, retryDelayMs: 0 });
    const args = { messages: [{ role: 'user', content: 'hi' }], tools: TOOLS };
    assert.deepStrictEqual(await p.next(args), { type: 'tool_call', name: 'get_stock', args: { product_name: 'A' }, meta: { thoughtSignature: 'P1' } });
    assert.strictEqual(p.stats.ignoredToolCalls, 1);
    assert.deepStrictEqual(await p.next(args), { type: 'text', text: 'Answer.' });
    await assert.rejects(p.next(args), /SAFETY/);
    assert.ok(!('systemInstruction' in f.seen[0].body), 'no system given -> no systemInstruction');
    await f.close();
    const saved = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY;
    assert.throws(() => createGemini({}), /GEMINI_API_KEY is not set/);
    if (saved) process.env.GEMINI_API_KEY = saved;
  });

  console.log(`\n${passed} passed, ${failures.length} failed`);
  console.log(failures.length ? `check: FAILED (${failures.join('; ')})` : 'check: OK');
  process.exit(failures.length ? 1 : 0);
})();
