const ORDER_REF = /(?:\border(?:\s+(?:number|no\.?|id))?\s*#?\s*|#)(\d{3,10})\b/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function extractOrderRef(message) {
  const n = message.match(ORDER_REF);
  const e = message.match(EMAIL);
  return { number: n ? n[1] : null, email: e ? e[0] : null };
}

module.exports = { extractOrderRef };