'use strict';

// Replays a fixed list of model steps. For unit tests of the loop and the confirmation guard.
// A step is { type: 'tool_call', name, args } or { type: 'text', text }.
function createScripted(steps) {
  let i = 0;
  return {
    name: 'scripted',
    async next() {
      if (i >= steps.length) throw new Error('scripted provider ran out of steps');
      return steps[i++];
    },
  };
}

module.exports = { createScripted };