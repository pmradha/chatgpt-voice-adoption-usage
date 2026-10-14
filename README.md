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

Set the Groq key in the server environment, then start the local app:

```sh
GROQ_API_KEY='your-groq-api-key' node server.mjs
```

Open http://localhost:3000. Keep the key in the server environment; never put it in browser code or commit it.

The default model is `llama-3.3-70b-versatile`. The server can be configured with `GROQ_MODEL`, `GROQ_BASE_URL`, and `PORT`. Set `GROQ_MODEL=openai/gpt-oss-120b` to use that Groq model. Override the model/base URL only with a model and endpoint supported by the selected provider.

## Deploy to Vercel

Import this repository into Vercel and use the **Other** framework preset. The root `vercel.json` sets `public` as the static output directory; Vercel automatically deploys `api/chat.mjs` as the same-origin `/api/chat` Node.js Function. No build command or runtime dependency installation is required.

In the Vercel project settings, add these server-side environment variables for each deployment environment you use:

- `GROQ_API_KEY` — required Groq API key.
- `GROQ_MODEL` — optional; defaults to `llama-3.3-70b-versatile`. Set it to `openai/gpt-oss-120b` to use that model.
- `GROQ_BASE_URL` — optional; defaults to `https://api.groq.com/openai/v1`.

Do not use a frontend-prefixed variable for the key or include it in source control. Redeploy after changing environment variables so the Function receives the updated configuration.

Run the offline tests locally with `node --test tests/*.test.mjs`. They use injected mock providers and do not make live Groq requests.

Voice uses the browser's `SpeechRecognition` and `speechSynthesis` APIs when available. Microphone use generally requires localhost or HTTPS and explicit browser permission. Speech recognition language and voice availability depend on the browser, device, and its configured locale; English, Hindi, Hinglish, and mixed-language recognition are not guaranteed. Browser speech services may process audio according to that browser/provider's own policies. Only recognized text and conversation history are sent to the Groq backend. Typing remains available if microphone access, recognition, or playback is unavailable.

The live Groq call and end-to-end microphone/speech experience still require verification with a configured key and a browser that supports the necessary APIs.
