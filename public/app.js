const scenarios = {
  presentation: {
    label: 'PRESENTATION PRACTICE',
    title: 'Presentation in 30 minutes?',
    invitation: 'Tell me what you’re presenting and what you want to practice.',
  },
  interview: {
    label: 'INTERVIEW PRACTICE',
    title: 'Interview coming up?',
    invitation: 'Tell me about the role you’re interviewing for.',
  },
  decision: {
    label: 'THINK IT THROUGH',
    title: 'Stuck between two options?',
    invitation: 'Tell me what you’re trying to decide between.',
  },
  general: {
    label: 'GENERAL CONVERSATION',
    title: 'What’s on your mind?',
    invitation: 'Start wherever you like. I’m here to listen and help think it through.',
  },
};

const elements = {
  discovery: document.querySelector('#discovery-view'),
  generalTalkButton: document.querySelector('#general-talk-button'),
  chat: document.querySelector('#chat-view'),
  selectedLabel: document.querySelector('#selected-label'),
  selectedTitle: document.querySelector('#selected-title'),
  invitation: document.querySelector('#opening-invitation'),
  messages: document.querySelector('#message-list'),
  voicePanel: document.querySelector('#voice-panel'),
  voiceState: document.querySelector('#voice-state'),
  voiceHint: document.querySelector('#voice-hint'),
  talkButton: document.querySelector('#talk-button'),
  typeInsteadButton: document.querySelector('#type-instead-button'),
  endButton: document.querySelector('#end-button'),
  composerWrap: document.querySelector('#composer-wrap'),
  composer: document.querySelector('#composer-form'),
  input: document.querySelector('#message-input'),
  sendButton: document.querySelector('.send-button'),
  feedback: document.querySelector('#feedback-view'),
  feedbackQuestion: document.querySelector('#feedback-question'),
  feedbackOptions: document.querySelector('#feedback-options'),
  anotherSituation: document.querySelector('#another-situation'),
  notice: document.querySelector('#notice'),
};

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const browserLanguage = navigator.language || 'en-US';
let selectedSituation = null;
let messages = [];
let recognition = null;
let voiceActive = false;
let busy = false;
let sessionNumber = 0;
let activeRequest = null;
let noticeTimeout = null;
let feedbackStep = 0;
let feedbackAnswers = [];

function setVoiceState(state, hint) {
  elements.voiceState.textContent = state;
  elements.voiceHint.textContent = hint;
  const talkLabel = elements.talkButton.querySelector('span');
  talkLabel.textContent = state === 'Listening' ? 'Listening…' : 'Tap to Talk';
  elements.talkButton.disabled = state === 'Processing' || state === 'Speaking';
}

function showNotice(message) {
  clearTimeout(noticeTimeout);
  elements.notice.textContent = message;
  elements.notice.hidden = false;
  noticeTimeout = setTimeout(() => { elements.notice.hidden = true; }, 6200);
}

function appendMessage(role, content) {
  const bubble = document.createElement('div');
  bubble.className = `message message-${role}`;
  bubble.textContent = content;
  elements.messages.append(bubble);
  bubble.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function stopRecognition() {
  if (!recognition) return;
  recognition.onend = null;
  try { recognition.stop(); } catch { /* The browser may already have stopped it. */ }
  recognition = null;
}

function startListening() {
  if (!voiceActive || busy || !SpeechRecognition) return;
  stopRecognition();
  const nextRecognition = new SpeechRecognition();
  recognition = nextRecognition;
  nextRecognition.lang = browserLanguage;
  nextRecognition.continuous = false;
  nextRecognition.interimResults = false;
  nextRecognition.maxAlternatives = 1;
  nextRecognition.onstart = () => {
    if (recognition === nextRecognition && voiceActive) {
      setVoiceState('Listening', 'Speak naturally. Your words will appear here.');
    }
  };
  nextRecognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .filter((result) => result.isFinal)
      .map((result) => result[0]?.transcript || '')
      .join(' ')
      .trim();
    if (!transcript || recognition !== nextRecognition) return;
    submitMessage(transcript, { spoken: true });
  };
  nextRecognition.onerror = (event) => {
    if (recognition !== nextRecognition) return;
    voiceActive = false;
    stopRecognition();
    setVoiceState('Ready to talk', 'Tap to try Voice again, or type below.');
    const messagesByError = {
      'not-allowed': 'Microphone access was blocked. Allow microphone access in your browser settings, or type instead.',
      'service-not-allowed': 'Speech recognition is unavailable in this browser. You can continue by typing.',
      'audio-capture': 'No microphone was found. Connect one or continue by typing.',
      'no-speech': 'I didn’t catch any speech. Tap to try again, or type instead.',
      network: 'Speech recognition could not connect. Check your connection, then try again or type instead.',
    };
    showNotice(messagesByError[event.error] || 'Speech recognition stopped. Tap to try again, or type instead.');
  };
  nextRecognition.onend = () => {
    if (recognition === nextRecognition) recognition = null;
    if (voiceActive && !busy) {
      setTimeout(startListening, 280);
    }
  };
  setVoiceState('Listening', 'Connecting to your microphone…');
  try {
    nextRecognition.start();
  } catch {
    voiceActive = false;
    stopRecognition();
    setVoiceState('Ready to talk', 'Tap to try Voice again, or type below.');
    showNotice('Could not start speech recognition. Check microphone permission or type instead.');
  }
}

function speakReply(text, currentSession) {
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
    voiceActive = false;
    busy = false;
    setVoiceState('Ready to talk', 'Your reply is shown above. Text-to-speech is unavailable here.');
    showNotice('Spoken playback is not supported in this browser. You can keep chatting by typing.');
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = browserLanguage;
  utterance.onend = () => {
    if (currentSession !== sessionNumber || !voiceActive) return;
    busy = false;
    startListening();
  };
  utterance.onerror = () => {
    if (currentSession !== sessionNumber || !voiceActive) return;
    busy = false;
    voiceActive = false;
    setVoiceState('Ready to talk', 'Your reply is shown above. Tap to try Voice again or type below.');
    showNotice('The browser could not play this reply aloud. The text is still available above.');
  };
  setVoiceState('Speaking', 'You can end the conversation at any time.');
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

async function submitMessage(text, { spoken = false } = {}) {
  const content = text.trim();
  if (!content || !selectedSituation || busy) return;
  if (spoken) stopRecognition();
  const currentSession = sessionNumber;
  messages.push({ role: 'user', content });
  appendMessage('user', content);
  elements.input.value = '';
  elements.input.style.height = 'auto';
  busy = true;
  elements.sendButton.disabled = true;
  setVoiceState('Processing', 'Thinking about what you said…');
  activeRequest = new AbortController();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ situation: selectedSituation, messages }),
      signal: activeRequest.signal,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The AI service could not respond.');
    if (currentSession !== sessionNumber) return;
    messages.push({ role: 'assistant', content: result.message });
    appendMessage('assistant', result.message);
    if (spoken && voiceActive) {
      speakReply(result.message, currentSession);
    } else {
      busy = false;
      setVoiceState('Ready to talk', 'Tap to Talk, or keep typing below.');
    }
  } catch (error) {
    if (error.name === 'AbortError' || currentSession !== sessionNumber) return;
    busy = false;
    voiceActive = false;
    stopRecognition();
    setVoiceState('Ready to talk', 'Tap to try Voice again, or continue by typing.');
    showNotice(error.message || 'Could not reach the AI service. Check your connection and try again.');
  } finally {
    if (currentSession === sessionNumber) {
      activeRequest = null;
      elements.sendButton.disabled = false;
    }
  }
}

function selectSituation(key) {
  const scenario = scenarios[key];
  if (!scenario) return;
  sessionNumber += 1;
  selectedSituation = key;
  messages = [];
  voiceActive = false;
  busy = false;
  elements.discovery.hidden = true;
  elements.feedback.hidden = true;
  elements.chat.hidden = false;
  elements.composerWrap.hidden = false;
  elements.messages.replaceChildren();
  elements.selectedLabel.textContent = scenario.label;
  elements.selectedTitle.textContent = scenario.title;
  elements.invitation.textContent = scenario.invitation;
  elements.voicePanel.hidden = false;
  setVoiceState('Ready to talk', 'Your microphone stays off until you tap to talk.');
}

function startVoice() {
  if (!SpeechRecognition) {
    showNotice('Voice recognition is not available in this browser. You can continue by typing below.');
    elements.input.focus();
    return;
  }
  if (voiceActive || busy) return;
  voiceActive = true;
  startListening();
}

function endConversation() {
  sessionNumber += 1;
  activeRequest?.abort();
  activeRequest = null;
  busy = false;
  elements.sendButton.disabled = false;
  voiceActive = false;
  stopRecognition();
  window.speechSynthesis?.cancel();
  feedbackStep = 0;
  feedbackAnswers = [];
  elements.chat.hidden = true;
  elements.composerWrap.hidden = true;
  elements.feedback.hidden = false;
  showFeedbackStep();
}

function showFeedbackStep() {
  const questions = [
    { title: 'Did Voice help?', options: ['Yes', 'Somewhat', 'No'] },
    { title: 'Would you use Voice for something similar again?', options: ['Definitely', 'Probably', 'Probably not'] },
  ];
  const step = questions[feedbackStep];
  elements.feedbackQuestion.textContent = step.title;
  elements.feedbackOptions.replaceChildren();
  elements.anotherSituation.hidden = true;
  for (const option of step.options) {
    const button = document.createElement('button');
    button.className = 'feedback-choice';
    button.type = 'button';
    button.textContent = option;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      feedbackAnswers[feedbackStep] = option;
      if (feedbackStep === 0) {
        feedbackStep = 1;
        showFeedbackStep();
      } else {
        elements.feedbackQuestion.textContent = 'Thanks for sharing.';
        elements.feedbackOptions.replaceChildren();
        elements.anotherSituation.hidden = false;
      }
    }, { once: true });
    elements.feedbackOptions.append(button);
  }
}

function resetToDiscovery() {
  sessionNumber += 1;
  activeRequest?.abort();
  activeRequest = null;
  stopRecognition();
  window.speechSynthesis?.cancel();
  voiceActive = false;
  busy = false;
  elements.sendButton.disabled = false;
  selectedSituation = null;
  messages = [];
  elements.chat.hidden = true;
  elements.feedback.hidden = true;
  elements.composerWrap.hidden = true;
  elements.discovery.hidden = false;
  elements.input.value = '';
  elements.notice.hidden = true;
}

document.querySelectorAll('[data-situation]').forEach((button) => {
  button.addEventListener('click', () => selectSituation(button.dataset.situation));
});
elements.generalTalkButton.addEventListener('click', () => {
  selectSituation('general');
  startVoice();
});
elements.talkButton.addEventListener('click', startVoice);
elements.typeInsteadButton.addEventListener('click', () => {
  voiceActive = false;
  stopRecognition();
  window.speechSynthesis?.cancel();
  if (!activeRequest) busy = false;
  setVoiceState('Ready to talk', 'Type your message below, or tap to talk when ready.');
  elements.input.focus();
});
elements.endButton.addEventListener('click', endConversation);
elements.anotherSituation.addEventListener('click', resetToDiscovery);
document.querySelector('.new-chat-button').addEventListener('click', resetToDiscovery);
elements.composer.addEventListener('submit', (event) => {
  event.preventDefault();
  if (busy) return;
  voiceActive = false;
  stopRecognition();
  window.speechSynthesis?.cancel();
  submitMessage(elements.input.value);
});
elements.input.addEventListener('input', () => {
  elements.input.style.height = 'auto';
  elements.input.style.height = `${Math.min(elements.input.scrollHeight, 120)}px`;
});
elements.input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    elements.composer.requestSubmit();
  }
});