const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const LABELS = ['ANSWERABLE', 'NOT_COVERED', 'CONFLICT', 'AMBIGUOUS'];

class LlmError extends Error { }
class ReplyError extends Error { }

const GEMINI_SCHEMA = {
    type: 'OBJECT',
    properties: {
        answer: { type: 'STRING' },
        clauses: { type: 'ARRAY', items: { type: 'STRING' } },
        label: { type: 'STRING', enum: LABELS },
    },
    required: ['answer', 'clauses', 'label'],
    propertyOrdering: ['answer', 'clauses', 'label'],
};

const OLLAMA_SCHEMA = {
    type: 'object',
    properties: {
        answer: { type: 'string' },
        clauses: { type: 'array', items: { type: 'string' } },
        label: { type: 'string', enum: LABELS },
    },
    required: ['answer', 'clauses', 'label'],
};

function info() {
    const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();
    const defaults = { gemini: 'gemini-3.5-flash-lite', ollama: 'llama3.1:8b', stub: 'stub' };
    const model = process.env.LLM_MODEL || defaults[provider] || 'unknown';
    return { provider, model };
}

function describe() {
    const { provider, model } = info();
    return `provider=${provider} model=${model}`;
}

function settings() {
    return {
        ...info(),
        temperature: Number(process.env.LLM_TEMPERATURE || 0),
        timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 90000),
    };
}

async function callGemini(prompt, { model, temperature, timeoutMs }) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new LlmError('GEMINI_API_KEY is not set');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature,
                responseMimeType: 'application/json',
                responseSchema: GEMINI_SCHEMA,
            },
        }),
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        throw new LlmError(`gemini HTTP ${res.status}: ${detail}`);
    }
    const body = await res.json();
    const parts = body.candidates && body.candidates[0] && body.candidates[0].content && body.candidates[0].content.parts;
    const text = (parts || []).map((p) => p.text || '').join('');
    if (!text) throw new LlmError('gemini returned no text');
    return text;
}

async function callOllama(prompt, { model, temperature, timeoutMs }) {
    const base = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
    const res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            stream: false,
            format: OLLAMA_SCHEMA,
            options: { temperature },
            messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new LlmError(`ollama HTTP ${res.status}`);
    const body = await res.json();
    const text = body.message && body.message.content;
    if (!text) throw new LlmError('ollama returned no text');
    return text;
}

async function callStub(question, prompt) {
    const delay = Number(process.env.STUB_LATENCY_MS || 0);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    const orderStatus = prompt && prompt.match(/"status":"([A-Z_]+)"/);
    if (orderStatus) {
        return JSON.stringify({
            answer: `STUB: your order status is ${orderStatus[1]}.`,
            clauses: [],
            label: 'ANSWERABLE',
        });
    }
    if (question.toLowerCase().includes('deliver')) {
        return JSON.stringify({
            answer: 'STUB: delivery takes 3 to 5 working days to Lahore, Karachi and Islamabad/Rawalpindi.',
            clauses: ['3.1'],
            label: 'ANSWERABLE',
        });
    }
    return JSON.stringify({
        answer: 'STUB: the policy does not cover this, please contact support.',
        clauses: [],
        label: 'NOT_COVERED',
    });
}

async function complete({ prompt, question }) {
    const s = settings();
    if (s.provider === 'stub') return callStub(question, prompt);
    if (s.provider === 'gemini') return callGemini(prompt, s);
    if (s.provider === 'ollama') return callOllama(prompt, s);
    throw new LlmError(`unknown LLM_PROVIDER "${s.provider}"`);
}

// Hand check plus clause cleanup; schemas/chat.js is the strict final guard in the server.
function parseReply(text) {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let data;
    try {
        data = JSON.parse(cleaned);
    } catch {
        throw new ReplyError('model reply is not valid JSON');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ReplyError('model reply is not an object');
    if (typeof data.answer !== 'string' || !data.answer.trim()) throw new ReplyError('answer missing');
    if (!Array.isArray(data.clauses) || data.clauses.some((c) => typeof c !== 'string')) throw new ReplyError('clauses invalid');
    if (!LABELS.includes(data.label)) throw new ReplyError('label invalid');
    const tokens = data.clauses.flatMap((c) => c.match(/\d+\.\d+/g) || []);
    const clauses = [...new Set(tokens)];
    return { answer: data.answer, clauses, label: data.label };
}

module.exports = { complete, parseReply, info, describe, LABELS, LlmError, ReplyError };