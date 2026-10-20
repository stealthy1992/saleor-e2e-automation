// Prompt v2: v1 plus one label (OFF_TOPIC). v1 is tagged `prompt-v1` in git.
function buildPrompt(policy, question) {
  return `You are a customer-support assistant. Answer ONLY from the policy below. Never use outside knowledge or invent rules.

Choose exactly one label:
- ANSWERABLE: the policy answers the question. Apply it literally, including thresholds, exceptions and arithmetic.
- NOT_COVERED: the policy says nothing about this. Say so and refer the customer to support.
- CONFLICT: two clauses give contradictory answers and the policy has no rule that settles it. Name both clauses; do not pick one.
- AMBIGUOUS: the wording supports more than one reading. State the readings or ask for clarification.
- OFF_TOPIC: the message is a greeting, thanks, small talk, or has nothing to do with this store (weather, jokes, general knowledge, other companies). Use clauses []. A question about this store's orders, products, delivery, payment, returns or rules that the policy does not answer is NOT_COVERED, never OFF_TOPIC. If a greeting comes with a store question, ignore the greeting and label the store question.

Reply with JSON: "answer" (short, customer-facing), "clauses" (clause numbers you relied on, e.g. ["3.2"]), "label".

POLICY:
${policy}

CUSTOMER QUESTION:
${question}`;
}

// Unchanged from v1 (order flow). The OFF_TOPIC label is not offered here.
function buildOrderPrompt(policy, question, order) {
  return `You are a customer-support assistant. Answer ONLY from the policy and the verified order data below. Never use outside knowledge or invent rules or order details. Use the order data only for facts about this one order; never mention any other order.

Choose exactly one label:
- ANSWERABLE: the policy and the order data answer the question. Apply them literally, including thresholds, exceptions and arithmetic.
- NOT_COVERED: neither the policy nor the order data says anything about this. Say so and refer the customer to support.
- CONFLICT: two clauses give contradictory answers and the policy has no rule that settles it. Name both clauses; do not pick one.
- AMBIGUOUS: the wording supports more than one reading. State the readings or ask for clarification.

Reply with JSON: "answer" (short, customer-facing), "clauses" (clause numbers you relied on, e.g. ["3.2"]; empty if you used only the order data), "label".

POLICY:
${policy}

ORDER (verified by the store system; it belongs to this customer):
${JSON.stringify(order)}

CUSTOMER QUESTION:
${question}`;
}

module.exports = { buildPrompt, buildOrderPrompt };
