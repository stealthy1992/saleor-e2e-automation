(function () {
  'use strict';

  var MAX_MESSAGE = 1000;
  var root = document.getElementById('chat-widget');
  if (!root) return;

  function el(tag, testId, text, cls) {
    var node = document.createElement(tag);
    if (testId) node.setAttribute('data-test-id', testId);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  var header = el('div', 'chat-header', 'Tulip & Teak support', 'chat-header');
  var messages = el('div', 'chat-messages', '', 'chat-messages');
  messages.setAttribute('aria-live', 'polite');
  var form = el('form', 'chat-form', '', 'chat-form');
  var input = el('input', 'chat-input');
  input.type = 'text';
  input.maxLength = MAX_MESSAGE;
  input.autocomplete = 'off';
  input.placeholder = 'Ask about delivery, returns or your order';
  input.setAttribute('aria-label', 'Your message');
  var send = el('button', 'chat-send', 'Send');
  send.type = 'submit';
  form.appendChild(input);
  form.appendChild(send);
  root.appendChild(header);
  root.appendChild(messages);
  root.appendChild(form);

  function add(node) {
    messages.appendChild(node);
    messages.scrollTop = messages.scrollHeight;
    return node;
  }

  function addUser(text) {
    add(el('div', 'chat-message-user', text, 'msg user'));
  }

  function addAssistant(reply) {
    var node = el('div', 'chat-message-assistant', '', 'msg bot');
    node.setAttribute('data-label', reply.label);
    node.appendChild(el('span', 'chat-answer', reply.answer));
    if (Array.isArray(reply.clauses) && reply.clauses.length) {
      node.appendChild(el('div', 'chat-clauses', 'Policy clauses: ' + reply.clauses.join(', '), 'clauses'));
    }
    add(node);
  }

  function addError() {
    add(el('div', 'chat-error', 'Something went wrong. Please try again.', 'msg error'));
  }

  var busy = false;

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text || busy) return;
    busy = true;
    send.disabled = true;
    input.value = '';
    addUser(text);
    var pending = add(el('div', 'chat-pending', 'Typing...', 'msg pending'));

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (r) {
        pending.remove();
        if (r.ok && r.body && typeof r.body.answer === 'string') addAssistant(r.body);
        else addError();
      })
      .catch(function () {
        pending.remove();
        addError();
      })
      .then(function () {
        busy = false;
        send.disabled = false;
        input.focus();
      });
  });
})();