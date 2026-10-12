# ChatGPT Voice Adoption & Usage

Product case study exploring Voice adoption and usage among Indian mobile ChatGPT users, from research and validation to product design and prototype.

## Project

This project explores how ChatGPT can help users discover situations where Voice is more useful than typing.

The work covers:
- User research and opportunity identification
- Target user and problem validation
- Product requirements and prioritization
- Voice discovery experience
- Functional prototype planning

## Project Artifacts

### PRD
[ChatGPT Voice Discovery PRD](https://github.com/pmradha/ChatGPT-Voice-Adoption-Usage/blob/main/PRD%20-%20ChatGPT%20Voice%20Discovery%20%26%20Habit%20%20-%20Copy.pdf)

Product requirements, problem framing, target user, opportunity selection, solution, metrics, experiment plan, and prototype requirements.

### Working Prototype
[Open Prototype](https://chatgptvoiceusage.lovable.app)

Interactive prototype demonstrating the proposed Voice discovery experience.

### Codebase Handoff
[ChatGPT Voice Discovery Codebase Handoff](https://github.com/pmradha/ChatGPT-Voice-Adoption-Usage/blob/main/ChatGPT_Voice_Discovery_doc%20handoff.docx)

Implementation handoff covering the functional requirements and expected prototype behavior.

## Context

PM Fellowship — Product Project

## Run the functional prototype

The prototype uses Node.js built-in modules and browser speech APIs; it has no npm dependencies or `package.json` requirement. Use Node.js 20 or later.

Set the Groq key in the server environment, then start the app:

```sh
GROQ_API_KEY='your-groq-api-key' node server.mjs
```

Open http://localhost:3000. Keep the key in the server environment; never put it in browser code or commit it. On a hosted server, configure `GROQ_API_KEY` through that server's environment settings.

The default model is `llama-3.3-70b-versatile`. The server can be configured with `GROQ_MODEL`, `GROQ_BASE_URL`, and `PORT`. Override the model/base URL only with a model and endpoint supported by the selected provider.

Run the offline server tests with `node --test`. They use an injected test provider and do not make paid or live AI requests.

Voice uses the browser's `SpeechRecognition` and `speechSynthesis` APIs when available. Microphone use generally requires localhost or HTTPS and explicit browser permission. Speech recognition language and voice availability depend on the browser, device, and its configured locale; English, Hindi, Hinglish, and mixed-language recognition are not guaranteed. Browser speech services may process audio according to that browser/provider's own policies. Only recognized text and conversation history are sent to the Groq backend. Typing remains available if microphone access, recognition, or playback is unavailable.

The live Groq call and end-to-end microphone/speech experience still require verification with a configured key and a browser that supports the necessary APIs.
