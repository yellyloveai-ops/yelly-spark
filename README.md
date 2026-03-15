# Userscripts

Tampermonkey / Greasemonkey user scripts.

---

## AI Prompt Rock

> Load context-aware prompts for any page, test with AI, and sync via GitHub — all from a floating panel.

[![Install](https://img.shields.io/badge/Install-AI%20Prompt%20Rock-blue?style=for-the-badge&logo=tampermonkey)](https://raw.githubusercontent.com/yellyloveai-ops/yelly-spark/main/ai-prompt-rock.user.js)

**Version:** 2.1.0 · **License:** Apache-2.0

### Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (Chrome / Firefox / Safari / Edge)
2. Click the **Install** button above, or [click here to install directly](https://raw.githubusercontent.com/yellyloveai-ops/yelly-spark/main/ai-prompt-rock.user.js)
3. Tampermonkey will open an install dialog — click **Install**

### Features

- **URL-aware prompt matching** — prompts with `include`/`exclude` URL patterns surface automatically for the current page
- **Placeholder substitution** — write `{{variable}}` in your prompt and fill values at test time
- **Live preview** — see the filled prompt update in real time as you type
- **Three panel view modes**:
  - **Minimized** — collapses to a small restore button; click 🚀 to expand
  - **Page view** — shows only prompts whose URL patterns match the current page; activates automatically when matches are found
  - **Full view** — shows all prompts with a search bar (visible when library has > 5 prompts)
- **Prompt Library** — create / search / edit / delete prompts with full metadata
- **Five output modes** — Claude API, ChatGPT API, Claude.ai tab, ChatGPT tab, Copy
- **Two-tier storage** — `GM_setValue` primary with `localStorage` fallback
- **GitHub sync** — pull/push the library JSON via the GitHub Contents API; auto-pulls when cache is stale
- **Configurable cache TTL** — default 60 minutes
- **Share config via URL** — generate a `#apt-cfg=<base64>` link to bootstrap GitHub settings on another browser
- **Draggable panel** — move it anywhere; position persists across sessions
- **Shadow DOM + TrustedTypes** — isolated styles, works on Gmail / Google Docs / CSP-strict pages
- **SPA-resilient** — MutationObserver re-attaches the panel if a single-page app rebuilds the DOM
- **Persistent settings** — API keys, model, mode, and GitHub config saved via `GM_setValue`

### Usage

1. A floating 🚀 panel appears on every page (bottom-right corner)
2. Click 🚀 to expand — it opens in **Page view** if any prompts match the current URL, otherwise **Full view**
3. Click a prompt to open the **Run dialog**:
   - Fill placeholder values (hints guide you)
   - Live preview shows substituted text
   - Click **Run Agent** / **Open Claude.ai** / **Copy Prompt** depending on your mode
4. Click **+** in the header to create a new prompt
5. Click **⇅** to open GitHub sync settings (Pull / Push)
6. Click **⚙** to open Settings (output mode, API keys, models)

### Output Modes

| Mode | Description |
|---|---|
| **Claude API** | Calls `api.anthropic.com` directly with your Anthropic key; streams response inline |
| **ChatGPT API** | Calls `api.openai.com` directly with your OpenAI key; streams response inline |
| **Claude.ai** | Opens `claude.ai` in a new tab with the filled prompt pre-pasted |
| **ChatGPT** | Opens `chatgpt.com` in a new tab with the filled prompt pre-pasted |
| **Copy** | Copies the filled prompt to the clipboard |

### Supported Models

**Claude API**

| Model | ID |
|---|---|
| Claude Opus 4.6 (most capable) | `claude-opus-4-6` |
| Claude Sonnet 4.6 (fast & smart) | `claude-sonnet-4-6` |
| Claude Haiku 4.5 (fastest) | `claude-haiku-4-5-20251001` |

**ChatGPT API**

| Model | ID |
|---|---|
| GPT-5 (most capable) | `gpt-5` |
| GPT-4.1 (balanced) | `gpt-4.1` |
| GPT-4.1 mini (faster) | `gpt-4.1-mini` |

### Prompt Library JSON Schema

The library is stored as a single JSON document (locally and on GitHub).

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-02-23T00:00:00.000Z",
  "prompts": [
    {
      "id": "p_abc123",
      "name": "Blog Summary",
      "include": ["blog.example.com", "marketing*"],
      "exclude": ["staging.*"],
      "prompt": "Summarize {{topic}} for {{audience}} in {{language}}.",
      "placeholders": [
        { "name": "topic", "hint": "What content should be summarized?" },
        { "name": "audience", "hint": "Who is the target reader?" },
        { "name": "language", "hint": "Output language, e.g. English" }
      ],
      "createdAt": "2026-02-23T00:00:00.000Z",
      "updatedAt": "2026-02-23T00:00:00.000Z"
    }
  ]
}
```

**Prompt fields**

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique ID (`p_<timestamp36>_<random>`) |
| `name` | string | Display name shown in the panel |
| `include` | string[] | URL patterns — prompt is highlighted when the current URL matches any; empty = match all |
| `exclude` | string[] | URL patterns — prompt is hidden when the current URL matches any |
| `prompt` | string | Template text; use `{{name}}` for placeholders |
| `placeholders` | `{name, hint}[]` | Hints shown in the fill dialog for each `{{name}}` |
| `createdAt` | ISO string | Auto-set on creation |
| `updatedAt` | ISO string | Auto-updated on every edit |

**URL pattern matching**

- Substring match by default (case-insensitive)
- `*` acts as a wildcard (e.g. `marketing*`, `*.example.com`)
- `exclude` takes priority over `include`
- Empty `include` array = match all URLs

### GitHub Sync

Click **⇅** in the panel header to configure:

| Setting | Description |
|---|---|
| Owner | GitHub username or org |
| Repo | Repository name |
| Branch | Default: `main` |
| File path | Default: `prompts/library.json` |
| Token | Personal access token with `repo` scope (stored locally, never transmitted except to GitHub) |
| Cache TTL | How long (minutes) before auto-pulling again; default 60 |

- **Pull GitHub** — fetches the remote file, overwrites local state
- **Push GitHub** — writes local state to the remote file (creates or updates via PUT)
- **Share link** — generates a `#apt-cfg=<base64>` URL fragment; pasting it in another browser auto-imports the GitHub config

### Architecture

The script is structured as a single IIFE with five internal modules:

| Module | Responsibility |
|---|---|
| `Config` | Read/write settings via `GM_setValue` / `GM_getValue` with backward-compatible key aliases |
| `Utils` | Placeholder parsing, template filling, URL pattern matching, base-64 helpers, safe storage wrappers |
| `PromptStorage` | Local persistence, library normalization, GitHub pull/push via `GM_xmlhttpRequest` |
| `Styles` | All CSS delivered into Shadow DOM (split into logical sections: base, items, dialogs, forms, etc.) |
| `APIClient` | SSE streaming for Claude and OpenAI APIs via `GM_xmlhttpRequest` |
| `UIManager` | Shadow DOM panel, dragging, view-mode switching, all dialogs (run, edit, settings, sync) |
