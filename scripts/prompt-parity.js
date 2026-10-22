const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HARNESS_DIR = process.env.EVAL_HARNESS_DIR || 'E:\\ollama-project';
const POLICY_PY = path.join(HARNESS_DIR, 'policy.py');
const TAG = process.env.PROMPT_TAG || 'prompt-v1';
const JS_PATH = 'assistant/prompt.js';

const norm = (s) => s.replace(/\r\n/g, '\n');

function skip(reason) {
  console.log(`prompt-parity: SKIP (${reason})`);
  process.exit(0);
}

function between(text, start, end, label) {
  const i = text.indexOf(start);
  if (i === -1) throw new Error(`${label}: start marker not found`);
  const from = i + start.length;
  const j = text.indexOf(end, from);
  if (j === -1) throw new Error(`${label}: end marker not found`);
  return text.slice(from, j);
}

if (!fs.existsSync(POLICY_PY)) skip(`reference file not found: ${POLICY_PY}`);

let jsSource;
try {
  jsSource = execFileSync('git', ['show', `${TAG}:${JS_PATH}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (e) {
  skip(`git tag ${TAG} not available in this checkout`);
}

try {
  const pySource = fs.readFileSync(POLICY_PY, 'utf8');

  // JS template literal -> same placeholder syntax as the Python f-string
  const jsPrompt = norm(
    between(jsSource, 'function buildPrompt(policy, question) {\n  return `', '`;\n}', JS_PATH)
  )
    .replace('${policy}', '{policy}')
    .replace('${question}', '{question}');

  const pyPrompt = norm(
    between(pySource, 'def build_prompt(policy: str, question: str) -> str:\n    return f"""', '"""', 'policy.py')
  );

  const a = jsPrompt.split('\n');
  const b = pyPrompt.split('\n');
  console.log(`${TAG} ${JS_PATH} lines=${a.length} policy.py build_prompt lines=${b.length}`);

  let diffs = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      diffs += 1;
      if (diffs <= 5) {
        console.log(`line ${i + 1}:\n  js: ${JSON.stringify(a[i])}\n  py: ${JSON.stringify(b[i])}`);
      }
    }
  }
  console.log(`differing lines: ${diffs}`);
  if (diffs > 0) {
    console.error('prompt-parity: MISMATCH between the JS prompt and policy.py build_prompt');
    process.exit(1);
  }
  console.log('prompt-parity: OK');
} catch (e) {
  console.error('prompt-parity error:', e.message);
  process.exit(1);
}