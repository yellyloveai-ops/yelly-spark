# Userscripts

Tampermonkey / Greasemonkey user scripts.

---

## AI Prompt Tester

> Build & test AI prompts with placeholder substitution, then invoke Claude or other agents — all from a floating panel on any page.

[![Install](https://img.shields.io/badge/Install-AI%20Prompt%20Tester-blue?style=for-the-badge&logo=tampermonkey)](https://raw.githubusercontent.com/yellyloveai-ops/userscripts/main/ai-prompt-tester.user.js)

### Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (Chrome / Firefox / Safari / Edge)
2. Click the **Install** button above, or [click here to install directly](https://raw.githubusercontent.com/yellyloveai-ops/userscripts/main/ai-prompt-tester.user.js)
3. Tampermonkey will open an install dialog — click **Install**

### Features

- **Placeholder substitution** — write `{{variable}}` in your prompt and fill values at test time
- **Live preview** — see the filled prompt update in real time as you type
- **Three output modes**:
  - **Claude API** — calls `api.anthropic.com` directly, streams the response inline
  - **Claude.ai** — opens claude.ai in a new tab with your prompt pre-filled
  - **Copy to clipboard** — copies the filled prompt to paste anywhere
- **Draggable panel** — move it anywhere on the page
- **Persistent settings** — API key, model, and mode saved across sessions via `GM_setValue`

### Usage

1. A floating **⚡ Prompt Tester** panel appears on every page (bottom-right corner)
2. Write a prompt in the textarea — use `{{name}}` syntax for dynamic values
3. Click **▶ Test** — a dialog appears to fill in each placeholder
4. Choose your output mode in **⚙ Settings**
   - For Claude API mode, paste your Anthropic API key in Settings first

### Supported Models (Claude API mode)

| Model | ID |
|---|---|
| Claude Opus 4.6 | `claude-opus-4-6` |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` |
