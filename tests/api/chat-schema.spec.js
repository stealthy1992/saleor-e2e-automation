const { test, expect } = require('@playwright/test');
const { validateChat } = require('../../schemas/chat');

const good = { answer: 'Delivery takes 3 to 5 working days.', clauses: ['3.1'], label: 'ANSWERABLE' };

const replyCases = [
  ['CHAT-SCHEMA-001 a well-formed reply is valid', good, true],
  ['CHAT-SCHEMA-002 empty clauses are valid', { ...good, clauses: [], label: 'NOT_COVERED' }, true],
  ['CHAT-SCHEMA-003 an unknown label is rejected', { ...good, label: 'MAYBE' }, false],
  ['CHAT-SCHEMA-004 a missing answer is rejected', { clauses: ['3.1'], label: 'ANSWERABLE' }, false],
  ['CHAT-SCHEMA-005 an extra key is rejected', { ...good, claims: [] }, false],
  ['CHAT-SCHEMA-006 an empty answer is rejected', { ...good, answer: '' }, false],
  ['CHAT-SCHEMA-007 a clause that is not a bare number is rejected', { ...good, clauses: ['Clause 3.1'] }, false],
  ['CHAT-SCHEMA-008 clauses must be an array', { ...good, clauses: '3.1' }, false],
];

const errorCases = [
  ['CHAT-SCHEMA-009 a well-formed error body is valid', { error: 'llm_error' }, true],
  ['CHAT-SCHEMA-010 a non-string error is rejected', { error: 500 }, false],
];

test.describe('Chat reply contract (schema only, no server needed) @contract', () => {
  for (const [name, payload, expected] of replyCases) {
    test(name, () => {
      const { valid, errors } = validateChat('chatReply', payload);
      expect(valid, errors.join('; ')).toBe(expected);
    });
  }
  for (const [name, payload, expected] of errorCases) {
    test(name, () => {
      const { valid, errors } = validateChat('chatError', payload);
      expect(valid, errors.join('; ')).toBe(expected);
    });
  }
});