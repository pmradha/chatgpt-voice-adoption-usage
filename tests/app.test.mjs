import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const projectDirectory = new URL('../', import.meta.url);

function createElement() {
  return {
    dataset: {},
    handlers: {},
    hidden: false,
    style: {},
    value: '',
    focusCount: 0,
    addEventListener(type, handler) {
      this.handlers[type] = handler;
    },
    focus() {
      this.focusCount += 1;
    },
    querySelector() {
      return { textContent: '' };
    },
    replaceChildren() {},
    append() {},
  };
}

test('discovery CTA starts a general voice conversation while context cards remain connected', async () => {
  const [html, app] = await Promise.all([
    readFile(new URL('public/index.html', projectDirectory), 'utf8'),
    readFile(new URL('public/app.js', projectDirectory), 'utf8'),
  ]);
  const buttonPosition = html.indexOf('id="general-talk-button"');
  const cardsPosition = html.indexOf('class="situation-list"');
  assert.ok(buttonPosition >= 0 && buttonPosition < cardsPosition);
  assert.match(html.slice(buttonPosition, cardsPosition), /🎙️ Tap to Talk/);

  const elements = new Map();
  const selectorIds = [
    'discovery-view', 'general-talk-button', 'chat-view', 'selected-label', 'selected-title',
    'opening-invitation', 'message-list', 'voice-panel', 'voice-state', 'voice-hint',
    'talk-button', 'type-instead-button', 'end-button', 'composer-wrap', 'composer-form',
    'message-input', 'send-button', 'feedback-view', 'feedback-question',
    'feedback-options', 'another-situation', 'notice', 'new-chat-button',
  ];
  for (const id of selectorIds) elements.set(`#${id}`, createElement());
  elements.get('#talk-button').querySelector = () => ({ textContent: '' });
  elements.get('#message-list').replaceChildren = () => {};
  elements.set('.send-button', elements.get('#send-button'));
  elements.set('.new-chat-button', elements.get('#new-chat-button'));
  const cardButtons = ['presentation', 'interview', 'decision'].map((situation) => {
    const button = createElement();
    button.dataset.situation = situation;
    return button;
  });
  let recognitionStarted = false;
  class MockSpeechRecognition {
    start() {
      recognitionStarted = true;
      this.onstart();
    }
  }
  const document = {
    querySelector(selector) {
      return elements.get(selector);
    },
    querySelectorAll(selector) {
      assert.equal(selector, '[data-situation]');
      return cardButtons;
    },
  };

  runInNewContext(app, {
    document,
    navigator: { language: 'en-US' },
    window: { SpeechRecognition: MockSpeechRecognition },
    setTimeout,
    clearTimeout,
  });

  assert.deepEqual(cardButtons.map((button) => typeof button.handlers.click), ['function', 'function', 'function']);
  cardButtons[0].handlers.click();
  assert.equal(elements.get('#selected-title').textContent, 'Presentation in 30 minutes?');
  assert.equal(elements.get('#message-input').focusCount, 0);
  elements.get('.new-chat-button').handlers.click();
  assert.equal(elements.get('#discovery-view').hidden, false);

  elements.get('#general-talk-button').handlers.click();

  assert.equal(elements.get('#discovery-view').hidden, true);
  assert.equal(elements.get('#chat-view').hidden, false);
  assert.equal(elements.get('#selected-label').textContent, 'GENERAL CONVERSATION');
  assert.equal(elements.get('#selected-title').textContent, 'What’s on your mind?');
  assert.equal(elements.get('#voice-panel').hidden, false);
  assert.equal(recognitionStarted, true);
  assert.equal(elements.get('#message-input').focusCount, 0);

  elements.get('#type-instead-button').handlers.click();
  assert.equal(elements.get('#message-input').focusCount, 1);
});

test('unsupported voice keeps the typing fallback focused', async () => {
  const app = await readFile(new URL('public/app.js', projectDirectory), 'utf8');
  const elements = new Map();
  const selectorIds = [
    'discovery-view', 'general-talk-button', 'chat-view', 'selected-label', 'selected-title',
    'opening-invitation', 'message-list', 'voice-panel', 'voice-state', 'voice-hint',
    'talk-button', 'type-instead-button', 'end-button', 'composer-wrap', 'composer-form',
    'message-input', 'send-button', 'feedback-view', 'feedback-question',
    'feedback-options', 'another-situation', 'notice', 'new-chat-button',
  ];
  for (const id of selectorIds) elements.set(`#${id}`, createElement());
  elements.get('#talk-button').querySelector = () => ({ textContent: '' });
  elements.set('.send-button', elements.get('#send-button'));
  elements.set('.new-chat-button', elements.get('#new-chat-button'));
  const document = {
    querySelector: (selector) => elements.get(selector),
    querySelectorAll: () => [],
  };

  runInNewContext(app, {
    document,
    navigator: { language: 'en-US' },
    window: {},
    setTimeout,
    clearTimeout,
  });

  elements.get('#general-talk-button').handlers.click();
  assert.equal(elements.get('#message-input').focusCount, 1);
  assert.equal(elements.get('#notice').hidden, false);
});
