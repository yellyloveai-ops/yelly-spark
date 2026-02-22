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
- **Prompt Library (📚)** — create/search/edit/delete prompts with metadata for large prompt collections
- **Structured prompt schema** per prompt:
  - `includeX`: list of included tags/conditions
  - `excludeY`: list of excluded tags/conditions
  - `promptTemplate`: template text
  - `placeholders`: placeholder hints for user input (`name` + `hint`)
- **Two-tier storage**:
  - **Short-term**: `GM_setValue` with `localStorage` fallback cache
  - **Long-term**: GitHub JSON file via GitHub Contents API (pull/push)
- **Four output modes**:
  - **Claude API** — calls `api.anthropic.com` directly, streams the response inline
  - **ChatGPT API** — calls `api.openai.com` directly, streams the response inline
  - **Claude.ai** — opens claude.ai in a new tab with your prompt pre-filled
  - **Copy to clipboard** — copies the filled prompt to paste anywhere
- **Draggable panel** — move it anywhere on the page
- **Persistent settings** — API key, model, and mode saved across sessions via `GM_setValue`

### Usage

1. A floating **⚡ Prompt Tester** panel appears on every page (bottom-right corner)
2. Write a prompt in the textarea — use `{{name}}` syntax for dynamic values
3. Click **📚 Prompt Library** to manage prompts at scale:
   - Add prompt name, `includeX`, `excludeY`, template, and placeholder hints
   - Use **Pull GitHub** / **Push GitHub** for long-term sync
4. Load a saved prompt into the tester
5. Click **▶ Test** — placeholder dialog uses saved hints as input guidance
6. Choose your output mode in **⚙ Settings**
   - For Claude API mode, paste your Anthropic API key in Settings first
   - For ChatGPT API mode, paste your OpenAI API key in Settings first

### Prompt Library JSON Example

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-02-22T00:00:00.000Z",
  "prompts": [
    {
      "id": "p_abc123",
      "name": "Blog Summary",
      "includeX": ["blog", "marketing"],
      "excludeY": ["legal-review"],
      "promptTemplate": "Summarize {{topic}} for {{audience}} in {{language}}.",
      "placeholders": [
        { "name": "topic", "hint": "What content should be summarized?" },
        { "name": "audience", "hint": "Who is the target reader?" },
        { "name": "language", "hint": "Output language, e.g. English" }
      ],
      "createdAt": "2026-02-22T00:00:00.000Z",
      "updatedAt": "2026-02-22T00:00:00.000Z"
    }
  ]
}
```

### Supported Models (Claude API mode)

| Model | ID |
|---|---|
| Claude Opus 4.6 | `claude-opus-4-6` |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` |

### Supported Models (ChatGPT API mode)

| Model | ID |
|---|---|
| GPT-5 | `gpt-5` |
| GPT-4.1 | `gpt-4.1` |
| GPT-4.1 mini | `gpt-4.1-mini` |
