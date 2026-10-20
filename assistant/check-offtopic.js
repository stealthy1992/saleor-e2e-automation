// Offline check for OFF_TOPIC handling. Needs no server and no network.
process.env.LLM_PROVIDER = 'stub';
const { complete, parseReply, LABELS, SCOPE_MESSAGE } = require('./llm');

async function ask(question) {
  const raw = await complete({ prompt: '', question });
  return parseReply(raw);
}

(async () => {
  console.log('labels', LABELS.length);
  const questions = ['Hi', 'thanks!', 'Hi, how long does delivery take?', 'What is your return window?'];
  for (const q of questions) {
    const r = await ask(q);
    console.log(JSON.stringify(q), '->', r.label, 'clauses=' + r.clauses.length, 'scope=' + (r.answer === SCOPE_MESSAGE));
  }
  const forced = parseReply(JSON.stringify({ answer: 'model text', clauses: ['3.1'], label: 'OFF_TOPIC' }));
  console.log('forced ->', forced.label, 'clauses=' + forced.clauses.length, 'scope=' + (forced.answer === SCOPE_MESSAGE));
  const forcedEmpty = parseReply(JSON.stringify({ answer: '', clauses: [], label: 'OFF_TOPIC' }));
  console.log('forced-empty ->', forcedEmpty.label, 'clauses=' + forcedEmpty.clauses.length, 'scope=' + (forcedEmpty.answer === SCOPE_MESSAGE));
})();
