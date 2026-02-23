// ==UserScript==
// @name         AI Prompt Rock
// @namespace    http://tampermonkey.net/
// @version      2.1.0
// @description  Load context-aware prompts for any page, test with AI, and sync via GitHub
// @author       yellyloveai-ops
// @match        http://*/*
// @match        https://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.anthropic.com
// @connect      api.openai.com
// @connect      api.github.com
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/yellyloveai-ops/userscripts/main/ai-prompt-rock.user.js
// @updateURL    https://raw.githubusercontent.com/yellyloveai-ops/userscripts/main/ai-prompt-rock.user.js
// @license      Apache-2.0
// ==/UserScript==

/**
 * AI Prompt Rock - Modular Userscript
 *
 * Architecture:
 * - Config: Configuration management with GM_setValue/GM_getValue
 * - Utils: Utility functions (placeholder parsing, HTML escaping, URL matching, etc.)
 * - Storage: Prompt persistence and GitHub sync
 * - UIManager: Shadow DOM panel and dialog management
 * - APIClient: Claude and OpenAI API integration
 * - App: Main application orchestrator
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: CONSTANTS
  // ═══════════════════════════════════════════════════════════════════════

  const PLACEHOLDER_RE = /\{\{([^{}]+?)\}\}/g;

  // Trusted Types: Gmail and Google Docs enforce require-trusted-types-for 'script'.
  // Create a passthrough policy so innerHTML assignments aren't blocked.
  console.log('[APR] env:', {
    browser: navigator.userAgent,
    trustedTypes: typeof trustedTypes !== 'undefined' ? 'available' : 'unavailable',
    GM_xmlhttpRequest: typeof GM_xmlhttpRequest !== 'undefined' ? 'available' : 'MISSING',
    GM_setValue: typeof GM_setValue !== 'undefined' ? 'available' : 'MISSING',
    GM_getValue: typeof GM_getValue !== 'undefined' ? 'available' : 'MISSING',
    shadowDOMSupport: !!document.createElement('div').attachShadow,
    url: location.href
  });

  let _ttPolicy = null;
  try {
    if (typeof trustedTypes !== 'undefined' && trustedTypes.createPolicy) {
      _ttPolicy = trustedTypes.createPolicy('apt-html', { createHTML: s => s });
      console.log('[APR] TrustedTypes policy created');
    }
  } catch (e) {
    console.warn('[APR] TrustedTypes policy creation failed:', e);
  }

  function setHTML(el, html) {
    try {
      el.innerHTML = _ttPolicy ? _ttPolicy.createHTML(html) : html;
    } catch (e) {
      console.error('[APR] setHTML failed:', e, { el, htmlLen: html?.length });
    }
  }

  const API_MODES = Object.freeze({
    CLAUDE_API: 'claude-api',
    OPENAI_API: 'openai-api',
    CLAUDE_WEB: 'claude-web',
    CHATGPT_WEB: 'chatgpt-web',
    COPY: 'copy'
  });

  const DEFAULT_CONFIG = Object.freeze({
    mode: API_MODES.CLAUDE_API,
    claudeApiKey: '',
    claudeModel: 'claude-opus-4-6',
    openaiApiKey: '',
    openaiModel: 'gpt-4.1',
    githubOwner: '',
    githubRepo: '',
    githubBranch: 'main',
    githubPath: 'prompts/library.json',
    githubToken: '',
    cacheTtlMinutes: 60
  });

  const CLAUDE_MODELS = Object.freeze([
    { id: 'claude-opus-4-6', name: 'Claude Opus 4.6 (most capable)' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (fast & smart)' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5 (fastest)' }
  ]);

  const OPENAI_MODELS = Object.freeze([
    { id: 'gpt-5', name: 'GPT-5 (most capable)' },
    { id: 'gpt-4.1', name: 'GPT-4.1 (balanced)' },
    { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini (faster)' }
  ]);

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: CONFIG - Configuration Management
  // ═══════════════════════════════════════════════════════════════════════

  class Config {
    constructor() {
      this._cache = {};
    }

    get mode() { return GM_getValue('apt_mode', DEFAULT_CONFIG.mode); }
    set mode(v) { GM_setValue('apt_mode', v); this._cache.mode = v; }

    get claudeApiKey() {
      return GM_getValue('apt_claude_api_key', GM_getValue('apt_api_key', DEFAULT_CONFIG.claudeApiKey));
    }
    set claudeApiKey(v) {
      GM_setValue('apt_claude_api_key', v);
      GM_setValue('apt_api_key', v);
    }

    get claudeModel() {
      return GM_getValue('apt_claude_model', GM_getValue('apt_model', DEFAULT_CONFIG.claudeModel));
    }
    set claudeModel(v) {
      GM_setValue('apt_claude_model', v);
      GM_setValue('apt_model', v);
    }

    get openaiApiKey() { return GM_getValue('apt_openai_api_key', DEFAULT_CONFIG.openaiApiKey); }
    set openaiApiKey(v) { GM_setValue('apt_openai_api_key', v); }

    get openaiModel() { return GM_getValue('apt_openai_model', DEFAULT_CONFIG.openaiModel); }
    set openaiModel(v) { GM_setValue('apt_openai_model', v); }

    get githubOwner() { return GM_getValue('apt_github_owner', DEFAULT_CONFIG.githubOwner); }
    set githubOwner(v) { GM_setValue('apt_github_owner', v); }

    get githubRepo() { return GM_getValue('apt_github_repo', DEFAULT_CONFIG.githubRepo); }
    set githubRepo(v) { GM_setValue('apt_github_repo', v); }

    get githubBranch() { return GM_getValue('apt_github_branch', DEFAULT_CONFIG.githubBranch); }
    set githubBranch(v) { GM_setValue('apt_github_branch', v); }

    get githubPath() { return GM_getValue('apt_github_path', DEFAULT_CONFIG.githubPath); }
    set githubPath(v) { GM_setValue('apt_github_path', v); }

    get githubToken() { return GM_getValue('apt_github_token', DEFAULT_CONFIG.githubToken); }
    set githubToken(v) { GM_setValue('apt_github_token', v); }

    get cacheTtlMinutes() {
      return Number(GM_getValue('apt_cache_ttl_minutes', DEFAULT_CONFIG.cacheTtlMinutes));
    }
    set cacheTtlMinutes(v) {
      GM_setValue('apt_cache_ttl_minutes', Number(v) || DEFAULT_CONFIG.cacheTtlMinutes);
    }

    loadFromForm(formData) {
      const { mode, claudeApiKey, claudeModel, openaiApiKey, openaiModel } = formData;
      if (mode) this.mode = mode;
      if (claudeApiKey !== undefined) this.claudeApiKey = claudeApiKey;
      if (claudeModel) this.claudeModel = claudeModel;
      if (openaiApiKey !== undefined) this.openaiApiKey = openaiApiKey;
      if (openaiModel) this.openaiModel = openaiModel;
    }

    loadGithubFromForm(formData) {
      const { owner, repo, branch, path, token, cacheTtl } = formData;
      if (owner !== undefined) this.githubOwner = owner;
      if (repo !== undefined) this.githubRepo = repo;
      if (branch) this.githubBranch = branch || 'main';
      if (path) this.githubPath = path;
      if (token !== undefined) this.githubToken = token;
      if (cacheTtl) this.cacheTtlMinutes = cacheTtl;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: UTILS - Utility Functions
  // ═══════════════════════════════════════════════════════════════════════

  const Utils = {
    uid() {
      return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    },

    nowIso() {
      return new Date().toISOString();
    },

    toArrayCSV(text) {
      return String(text || '')
        .split(',')
        .map(x => x.trim())
        .filter(Boolean);
    },

    parsePlaceholderHints(text) {
      return String(text || '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
          const i = line.indexOf(':');
          if (i <= 0) return null;
          const name = line.slice(0, i).trim();
          const hint = line.slice(i + 1).trim();
          if (!name) return null;
          return { name, hint };
        })
        .filter(Boolean);
    },

    hintsToText(placeholders) {
      return (Array.isArray(placeholders) ? placeholders : [])
        .map(p => `${p.name}: ${p.hint || ''}`.trim())
        .join('\n');
    },

    b64EncodeUnicode(s) {
      return btoa(unescape(encodeURIComponent(s)));
    },

    b64DecodeUnicode(s) {
      return decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));
    },

    safeLocalGet(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },

    safeLocalSet(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // ignore localStorage write failures
      }
    },

    safeGet(key, fallback) {
      try {
        const v = GM_getValue(key);
        if (v !== undefined && v !== null) return v;
      } catch {
        // GM unavailable
      }
      return this.safeLocalGet(key, fallback);
    },

    safeSet(key, value) {
      try { GM_setValue(key, value); } catch { /* ignore */ }
      this.safeLocalSet(key, value);
    },

    escapeHtml(s) {
      return s.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
    },

    parsePlaceholders(text) {
      const seen = new Set();
      const result = [];
      let m;
      PLACEHOLDER_RE.lastIndex = 0;
      while ((m = PLACEHOLDER_RE.exec(text)) !== null) {
        const name = m[1].trim();
        if (!seen.has(name)) {
          seen.add(name);
          result.push(name);
        }
      }
      return result;
    },

    fillTemplate(template, values) {
      return template.replace(PLACEHOLDER_RE, (_, name) =>
        values[name.trim()] ?? `{{${name}}}`
      );
    },

    buildPreviewHtml(template, values) {
      return Utils.escapeHtml(template).replace(
        /\{\{([^{}]+?)\}\}/g,
        (_, name) => {
          const v = values[name.trim()];
          return v
            ? `<strong style="color:#a6e3a1">${Utils.escapeHtml(v)}</strong>`
            : `<mark>{{${Utils.escapeHtml(name)}}}</mark>`;
        }
      );
    },

    matchesUrl(prompt, url) {
      const u = url.toLowerCase();
      const incl = Array.isArray(prompt.include) ? prompt.include.filter(Boolean) : [];
      const excl = Array.isArray(prompt.exclude) ? prompt.exclude.filter(Boolean) : [];
      const hit = (pat) => {
        const p = pat.toLowerCase().trim();
        if (!p) return false;
        if (p.includes('*')) {
          const re = new RegExp(p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'));
          return re.test(u);
        }
        return u.includes(p);
      };
      if (excl.some(hit)) return false;
      if (incl.length === 0) return true;
      return incl.some(hit);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: STORAGE - Prompt Persistence and GitHub Sync
  // ═══════════════════════════════════════════════════════════════════════

  class PromptStorage {
    constructor(config) {
      this._config = config;
      this._libKey = 'apt_prompt_library_doc';
      this._libShaKey = 'apt_prompt_library_sha';
      this._libCacheTsKey = 'apt_prompt_library_cache_ts';
    }

    emptyDoc() {
      return {
        schemaVersion: 1,
        updatedAt: Utils.nowIso(),
        prompts: []
      };
    }

    normalizeDoc(doc) {
      if (!doc || typeof doc !== 'object') return this.emptyDoc();

      const prompts = Array.isArray(doc.prompts) ? doc.prompts : [];

      return {
        schemaVersion: 1,
        updatedAt: doc.updatedAt || Utils.nowIso(),
        prompts: prompts.map(p => ({
          id: p.id || Utils.uid(),
          name: String(p.name || 'Untitled Prompt'),
          include: Array.isArray(p.include) ? p.include.map(String) : [],
          exclude: Array.isArray(p.exclude) ? p.exclude.map(String) : [],
          prompt: String(p.prompt || ''),
          placeholders: Array.isArray(p.placeholders)
            ? p.placeholders
                .map(ph => ({
                  name: String(ph.name || '').trim(),
                  hint: String(ph.hint || '')
                }))
                .filter(ph => ph.name)
            : [],
          createdAt: p.createdAt || Utils.nowIso(),
          updatedAt: p.updatedAt || Utils.nowIso()
        }))
      };
    }

    load() {
      const doc = this.normalizeDoc(Utils.safeGet(this._libKey, this.emptyDoc()));
      const sha = Utils.safeGet(this._libShaKey, '');
      return { doc, sha: String(sha || '') };
    }

    save(doc, sha = null) {
      const next = this.normalizeDoc({ ...doc, updatedAt: Utils.nowIso() });
      Utils.safeSet(this._libKey, next);
      Utils.safeSet(this._libCacheTsKey, Date.now());
      if (typeof sha === 'string') Utils.safeSet(this._libShaKey, sha);
      return next;
    }

    hasFreshCache() {
      const lastTs = Number(Utils.safeGet(this._libCacheTsKey, 0));
      const ttlMs = Math.max(1, this._config.cacheTtlMinutes) * 60 * 1000;
      return lastTs > 0 && Date.now() - lastTs <= ttlMs;
    }

    findPrompt(doc, id) {
      return doc.prompts.find(p => p.id === id) || null;
    }

    upsertPrompt(doc, promptInput) {
      const now = Utils.nowIso();
      const id = promptInput.id || Utils.uid();
      const existing = this.findPrompt(doc, id);

      const nextPrompt = {
        id,
        name: String(promptInput.name || 'Untitled Prompt').trim() || 'Untitled Prompt',
        include: Utils.toArrayCSV(promptInput.include),
        exclude: Utils.toArrayCSV(promptInput.exclude),
        prompt: String(promptInput.prompt || ''),
        placeholders: Utils.parsePlaceholderHints(promptInput.placeholderHints),
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };

      const prompts = existing
        ? doc.prompts.map(p => (p.id === id ? nextPrompt : p))
        : [nextPrompt, ...doc.prompts];

      return this.normalizeDoc({ ...doc, prompts, updatedAt: now });
    }

    removePrompt(doc, id) {
      return this.normalizeDoc({
        ...doc,
        prompts: doc.prompts.filter(p => p.id !== id),
        updatedAt: Utils.nowIso()
      });
    }

    githubApiUrl() {
      const owner = this._config.githubOwner.trim();
      const repo = this._config.githubRepo.trim();
      const branch = this._config.githubBranch.trim() || 'main';
      const path = (this._config.githubPath.trim() || 'prompts/library.json').replace(/^\/+/, '');

      if (!owner || !repo) throw new Error('GitHub owner/repo is required');

      const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`;

      return {
        branch,
        path,
        readUrl: `${base}?ref=${encodeURIComponent(branch)}`,
        writeUrl: base
      };
    }

    ghRequest(method, url, bodyObj = null) {
      return new Promise((resolve, reject) => {
        const headers = { Accept: 'application/vnd.github+json' };

        if (this._config.githubToken.trim()) {
          headers.Authorization = `Bearer ${this._config.githubToken.trim()}`;
        }

        GM_xmlhttpRequest({
          method,
          url,
          headers,
          data: bodyObj ? JSON.stringify(bodyObj) : undefined,
          onload: (res) => {
            if (res.status >= 200 && res.status < 300) {
              try {
                resolve(res.responseText ? JSON.parse(res.responseText) : {});
              } catch {
                resolve({});
              }
              return;
            }

            let extra = '';
            try {
              const parsed = JSON.parse(res.responseText || '{}');
              if (parsed.message) extra = `: ${parsed.message}`;
            } catch {
              // ignore parse failure
            }

            reject(new Error(`GitHub ${method} failed (${res.status})${extra}`));
          },
          onerror: () => reject(new Error(`GitHub ${method} request failed`))
        });
      });
    }

    async pullFromGitHub() {
      const { readUrl } = this.githubApiUrl();
      const raw = await this.ghRequest('GET', readUrl);

      if (!raw.content) throw new Error('GitHub response has no file content');

      const parsed = this.normalizeDoc(JSON.parse(Utils.b64DecodeUnicode(raw.content)));
      this.save(parsed, raw.sha || '');

      return { doc: parsed, sha: raw.sha || '' };
    }

    async pushToGitHub(doc, currentSha) {
      const { writeUrl, branch, path } = this.githubApiUrl();

      const payload = {
        message: `Update prompt library at ${path}`,
        content: Utils.b64EncodeUnicode(JSON.stringify(this.normalizeDoc(doc), null, 2)),
        branch
      };

      if (currentSha) payload.sha = currentSha;

      const raw = await this.ghRequest('PUT', writeUrl, payload);
      const nextSha = raw?.content?.sha || raw?.commit?.sha || '';

      if (nextSha) Utils.safeSet(this._libShaKey, nextSha);
      Utils.safeSet(this._libCacheTsKey, Date.now());

      return nextSha;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: STYLES - CSS Management
  // ═══════════════════════════════════════════════════════════════════════

  const Styles = {
    getBaseStyles() {
      return `
        #apt-panel * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        #apt-panel {
          position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;
          width: 340px; background: #1e1e2e; border-radius: 14px;
          box-shadow: 0 8px 40px rgba(0,0,0,.5); border: 1px solid #313244;
          display: flex; flex-direction: column;
        }
        #apt-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 12px; cursor: move; user-select: none;
          border-top: 1px solid #313244; flex-shrink: 0;
        }
        #apt-header-left { display: flex; align-items: center; gap: 8px; }
        #apt-logo { font-size: 18px; }
        #apt-title { color: #cdd6f4; font-weight: 600; font-size: 14px; }
        #apt-header-btns { display: flex; gap: 3px; align-items: center; }
        .apt-header-sep { width: 1px; height: 14px; background: #313244; margin: 0 3px; flex-shrink: 0; }
        .apt-icon-btn {
          background: none; border: none; cursor: pointer; color: #6c7086;
          font-size: 15px; padding: 3px 6px; border-radius: 6px; line-height: 1;
          transition: color .15s, background .15s;
        }
        .apt-icon-btn:hover { color: #cdd6f4; background: #313244; }
        #apt-body {
          overflow: hidden; display: flex; flex-direction: column;
          padding: 10px 12px 8px; max-height: 450px;
          transition: max-height .25s ease, padding .2s ease, opacity .2s;
        }
        #apt-search {
          width: 100%; background: #181825; border: 1px solid #313244;
          border-radius: 8px; color: #cdd6f4; font-size: 12px; padding: 7px 10px;
          outline: none; transition: border-color .15s; font-family: monospace;
          margin-bottom: 8px; flex-shrink: 0;
        }
        #apt-search:focus { border-color: #89b4fa; }
        #apt-search::placeholder { color: #45475a; }
        #apt-list-container { flex: 1; overflow-y: auto; }
        #apt-restore-pill {
          position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;
          background: transparent; border: 1px solid rgba(137,180,250,.3); border-radius: 50%;
          width: 40px; height: 40px; color: #89b4fa; font-size: 20px;
          cursor: pointer; box-shadow: none;
          display: flex; align-items: center; justify-content: center;
          transition: background .15s, border-color .15s; user-select: none;
        }
        #apt-restore-pill:hover { background: rgba(137,180,250,.12); border-color: #89b4fa; }
        #apt-restore-pill::after {
          content: 'Prompt Rock (by Yelly.ink)';
          position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%);
          background: #1e1e2e; border: 1px solid #313244; border-radius: 8px;
          color: #cdd6f4; font-size: 12px; font-weight: 500; white-space: nowrap;
          padding: 5px 10px; pointer-events: none;
          opacity: 0; transition: opacity .15s;
        }
        #apt-restore-pill:hover::after { opacity: 1; }
      `;
    },

    getItemStyles() {
      return `
        .apt-section-label {
          color: #6c7086; font-size: 10px; font-weight: 600; text-transform: uppercase;
          letter-spacing: .5px; padding: 6px 4px 4px;
        }
        .apt-item {
          display: flex; align-items: center; gap: 8px; padding: 8px 10px;
          border-radius: 8px; cursor: pointer; transition: background .12s;
          border: 1px solid transparent; margin-bottom: 2px;
        }
        .apt-item:hover { background: #232438; }
        .apt-item.url-match { border-color: rgba(137,180,250,.25); background: rgba(137,180,250,.04); }
        .apt-item.url-match:hover { background: rgba(137,180,250,.1); }
        .apt-item-info { flex: 1; min-width: 0; }
        .apt-item-name {
          font-size: 13px; font-weight: 500; color: #cdd6f4;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .apt-item-meta {
          font-size: 10px; color: #6c7086;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px;
        }
        .apt-item-actions { display: flex; gap: 4px; flex-shrink: 0; }
        .apt-item-btn {
          background: none; border: 1px solid #313244; cursor: pointer; color: #6c7086;
          font-size: 13px; padding: 3px 7px; border-radius: 5px; line-height: 1;
          transition: color .12s, background .12s, border-color .12s;
        }
        .apt-item-btn:hover { color: #cdd6f4; border-color: #585b70; }
        .apt-item-btn.run { color: #89b4fa; border-color: rgba(137,180,250,.4); }
        .apt-item-btn.run:hover { background: rgba(137,180,250,.15); border-color: #89b4fa; }
        .apt-empty {
          text-align: center; padding: 28px 16px; color: #585b70;
          font-size: 12px; line-height: 1.6;
        }
        .apt-section-toggle {
          cursor: pointer; display: flex; align-items: center;
          justify-content: space-between; border-radius: 4px;
          transition: color .12s;
        }
        .apt-section-toggle:hover { color: #a6adc8; }
        .apt-toggle-icon { font-size: 9px; opacity: .7; }
      `;
    },

    getOverlayStyles() {
      return `
        .apt-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,.6);
          z-index: 2147483646; display: flex; align-items: center; justify-content: center;
          animation: aptFadeIn .15s ease;
        }
        @keyframes aptFadeIn { from { opacity:0 } to { opacity:1 } }
      `;
    },

    getDialogStyles() {
      return `
        .apt-dialog {
          background: #1e1e2e; border: 1px solid #313244; border-radius: 16px;
          width: min(480px, 94vw); max-height: 85vh; display: flex; flex-direction: column;
          box-shadow: 0 12px 48px rgba(0,0,0,.6);
          animation: aptSlideUp .2s ease;
        }
        @keyframes aptSlideUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:none } }
        .apt-dialog-header {
          padding: 18px 20px 14px; border-bottom: 1px solid #313244;
          display: flex; align-items: flex-start; justify-content: space-between;
        }
        .apt-dialog-title { color: #cdd6f4; font-size: 16px; font-weight: 700; }
        .apt-dialog-subtitle { color: #6c7086; font-size: 12px; margin-top: 3px; }
        .apt-dialog-body { overflow-y: auto; padding: 16px 20px; flex: 1; }
        .apt-dialog-footer {
          padding: 14px 20px; border-top: 1px solid #313244;
          display: flex; gap: 8px; justify-content: flex-end;
        }
      `;
    },

    getFormStyles() {
      return `
        .apt-field { margin-bottom: 14px; }
        .apt-field:last-child { margin-bottom: 0; }
        .apt-field-label {
          display: flex; align-items: center; gap: 6px; color: #a6adc8;
          font-size: 12px; font-weight: 600; margin-bottom: 5px; text-transform: uppercase;
          letter-spacing: .5px;
        }
        .apt-field-label span { color: #89b4fa; font-family: monospace; text-transform: none; letter-spacing: 0; font-size: 13px; }
        .apt-field-input {
          width: 100%; background: #181825; border: 1px solid #313244;
          border-radius: 8px; color: #cdd6f4; font-size: 13px; padding: 9px 12px;
          outline: none; transition: border-color .15s;
        }
        .apt-field-input:focus { border-color: #89b4fa; }
        .apt-field-input::placeholder { color: #45475a; }
      `;
    },

    getPreviewStyles() {
      return `
        #apt-preview-box {
          background: #181825; border: 1px solid #313244; border-radius: 8px;
          padding: 12px; font-size: 12px; color: #a6adc8; line-height: 1.6;
          white-space: pre-wrap; word-break: break-word; max-height: 120px;
          overflow-y: auto; margin-top: 14px;
        }
        #apt-preview-box mark {
          background: #45475a; color: #f38ba8; border-radius: 3px; padding: 0 2px;
        }
      `;
    },

    getResponseStyles() {
      return `
        #apt-response-box {
          background: #181825; border: 1px solid #313244; border-radius: 8px;
          padding: 14px; font-size: 13px; color: #cdd6f4; line-height: 1.65;
          white-space: pre-wrap; word-break: break-word;
          max-height: 360px; overflow-y: auto;
        }
        .apt-response-label { color: #a6adc8; font-size: 11px; font-weight: 600;
          text-transform: uppercase; letter-spacing: .5px; margin-bottom: 8px; }
        .apt-spinner {
          display: inline-block; width: 16px; height: 16px;
          border: 2px solid #313244; border-top-color: #89b4fa;
          border-radius: 50%; animation: aptSpin .7s linear infinite;
          vertical-align: middle; margin-right: 8px;
        }
        @keyframes aptSpin { to { transform: rotate(360deg) } }
        .apt-phase-msg { color: #585b70; font-style: italic; vertical-align: middle; }
        #apt-response-box.streaming::after {
          content: '▌'; color: #89b4fa;
          animation: aptBlink 1s step-end infinite;
        }
        @keyframes aptBlink { 0%,100% { opacity:1 } 50% { opacity:0 } }
      `;
    },

    getStatusStyles() {
      return `
        .apt-status {
          margin-top: 8px; font-size: 11px; font-weight: 500;
          display: flex; align-items: center; gap: 6px; min-height: 18px;
        }
        .apt-status-dot {
          width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
        }
        .apt-status.connecting .apt-status-dot { background: #585b70; animation: aptPulse 1.2s ease infinite; }
        .apt-status.receiving  .apt-status-dot { background: #89b4fa; animation: aptPulse .8s ease infinite; }
        .apt-status.done       .apt-status-dot { background: #a6e3a1; }
        .apt-status.error      .apt-status-dot { background: #f38ba8; }
        .apt-status-text { color: #6c7086; }
        .apt-status.done  .apt-status-text { color: #a6e3a1; }
        .apt-status.error .apt-status-text { color: #f38ba8; }
        @keyframes aptPulse { 0%,100% { opacity:1 } 50% { opacity:.25 } }
      `;
    },

    getDialogButtonStyles() {
      return `
        .apt-dbtn {
          padding: 9px 18px; border-radius: 8px; border: none;
          font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity .15s, transform .1s;
        }
        .apt-dbtn:active { transform: scale(.97); }
        .apt-dbtn-cancel { background: #313244; color: #a6adc8; }
        .apt-dbtn-submit { background: #89b4fa; color: #1e1e2e; }
        .apt-dbtn-copy { background: #a6e3a1; color: #1e1e2e; }
        .apt-dbtn:disabled { opacity: .5; cursor: not-allowed; }
      `;
    },

    getSettingsStyles() {
      return `
        .apt-settings-section { margin-bottom: 18px; }
        .apt-settings-section-title {
          color: #6c7086; font-size: 11px; font-weight: 600; text-transform: uppercase;
          letter-spacing: .5px; margin-bottom: 10px;
        }
        .apt-radio-group { display: flex; flex-direction: column; gap: 8px; }
        .apt-radio-item {
          display: flex; align-items: flex-start; gap: 10px; cursor: pointer; padding: 10px;
          border: 1px solid #313244; border-radius: 8px; transition: border-color .15s;
        }
        .apt-radio-item:hover { border-color: #585b70; }
        .apt-radio-item.selected { border-color: #89b4fa; background: rgba(137,180,250,.05); }
        .apt-radio-item input { margin-top: 2px; accent-color: #89b4fa; cursor: pointer; }
        .apt-radio-label { color: #cdd6f4; font-size: 13px; font-weight: 500; }
        .apt-radio-desc { color: #6c7086; font-size: 11px; margin-top: 2px; }
      `;
    },

    getToastStyles() {
      return `
        .apt-toast {
          position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
          color: #1e1e2e; padding: 10px 20px; border-radius: 8px;
          font-size: 13px; font-weight: 600; z-index: 2147483647;
          box-shadow: 0 4px 20px rgba(0,0,0,.3);
          animation: aptFadeIn .15s ease; pointer-events: none;
        }
      `;
    },

    getAllStyles() {
      return [
        this.getBaseStyles(),
        this.getItemStyles(),
        this.getOverlayStyles(),
        this.getDialogStyles(),
        this.getFormStyles(),
        this.getPreviewStyles(),
        this.getResponseStyles(),
        this.getStatusStyles(),
        this.getDialogButtonStyles(),
        this.getSettingsStyles(),
        this.getToastStyles()
      ].join('\n');
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: API - Claude and OpenAI Integration
  // ═══════════════════════════════════════════════════════════════════════

  class APIClient {
    constructor(config) {
      this._config = config;
    }

    streamRequest(provider, prompt, onChunk, onStatus, onComplete, onError) {
      const isClaude = provider === 'claude';
      const model = isClaude ? this._config.claudeModel : this._config.openaiModel;
      const startTime = Date.now();

      const payload = isClaude
        ? {
            model,
            max_tokens: 4096,
            messages: [{ role: 'user', content: prompt }],
            stream: true
          }
        : {
            model,
            messages: [{ role: 'user', content: prompt }],
            stream: true,
            stream_options: { include_usage: true }
          };

      const request = isClaude
        ? {
            url: 'https://api.anthropic.com/v1/messages',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': this._config.claudeApiKey,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true'
            }
          }
        : {
            url: 'https://api.openai.com/v1/chat/completions',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this._config.openaiApiKey}`
            }
          };

      console.log('[APR] ▶ request', {
        provider, model, promptLen: prompt.length,
        url: request.url,
        hasApiKey: isClaude ? !!this._config.claudeApiKey : !!this._config.openaiApiKey,
        responseType: 'stream',
        GM_xmlhttpRequest: typeof GM_xmlhttpRequest
      });

      let fullText = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let streaming = false;

      GM_xmlhttpRequest({
        method: 'POST',
        url: request.url,
        headers: request.headers,
        data: JSON.stringify(payload),
        responseType: 'stream',
        onreadystatechange: (res) => {
          if (res.readyState < 3) return;
          console.log(`[APR] readyState=${res.readyState} status=${res.status} responseTextLen=${res.responseText?.length ?? 0}`);

          if (res.status && res.status !== 200) {
            if (res.readyState < 4) return;
            console.error('[APR] HTTP error', res.status, res.responseText);
            let errMsg = `HTTP ${res.status}`;
            try {
              const body = JSON.parse(res.responseText);
              console.error('[APR] error body', body);
              if (body.error?.message) errMsg += ` — ${body.error.message}`;
              else if (body.message) errMsg += ` — ${body.message}`;
            } catch (e) {
              console.error('[APR] could not parse error body', e, res.responseText);
              if (res.responseText) errMsg += ` — ${res.responseText.slice(0, 120)}`;
            }
            onError(errMsg);
            return;
          }

          const lines = res.responseText.split('\n');

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const json = line.slice(6).trim();
            if (json === '[DONE]') continue;

            try {
              const evt = JSON.parse(json);

              if (isClaude) {
                if (evt.type === 'message_start') {
                  inputTokens = evt.message?.usage?.input_tokens ?? 0;
                  onStatus('receiving', `Request received · waiting for first token… (${inputTokens} tokens sent)`);
                }

                if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
                  fullText += evt.delta.text;
                  if (!streaming) {
                    streaming = true;
                    onChunk(fullText, true);
                  }
                  onStatus('receiving', `Receiving… · ${fullText.length} chars`);
                }

                if (evt.type === 'message_delta') {
                  outputTokens = evt.usage?.output_tokens ?? 0;
                }

                if (evt.type === 'message_stop') {
                  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                  onStatus('done', `Done in ${elapsed}s · ${inputTokens} in → ${outputTokens} out tokens`);
                  onComplete(fullText, inputTokens, outputTokens);
                }

                if (evt.type === 'error') {
                  const msg = evt.error?.message ?? 'Unknown API error';
                  onError(msg);
                }
              } else {
                const delta = evt.choices?.[0]?.delta?.content;
                if (typeof delta === 'string' && delta.length) {
                  fullText += delta;
                  if (!streaming) {
                    streaming = true;
                    onChunk(fullText, true);
                    onStatus('receiving', 'Receiving…');
                  }
                }
                if (evt.usage) {
                  inputTokens = evt.usage.prompt_tokens ?? inputTokens;
                  outputTokens = evt.usage.completion_tokens ?? outputTokens;
                }
              }
            } catch (parseErr) {
              console.warn('[APR] failed to parse SSE line', line, parseErr);
            }
          }

          if (fullText) {
            onChunk(fullText, streaming);
          }

          if (!isClaude && res.readyState === 4 && res.status === 200) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const tokenText = (inputTokens || outputTokens)
              ? ` · ${inputTokens} in → ${outputTokens} out tokens`
              : '';
            onStatus('done', `Done in ${elapsed}s${tokenText}`);
            onComplete(fullText, inputTokens, outputTokens);
          }
        },
        onerror: (err) => {
          console.error('[APR] network error', {
            err,
            provider,
            url: request.url,
            userAgent: navigator.userAgent
          });
          onError('Network error — check your connection.');
        }
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: UI - User Interface Management
  // ═══════════════════════════════════════════════════════════════════════

  class UIManager {
    constructor(config, storage, apiClient) {
      this._config = config;
      this._storage = storage;
      this._apiClient = apiClient;
      this._libraryState = this._storage.load();
      this._host = null;
      this._shadow = null;
      this._panel = null;

      this._init();
    }

    _init() {
      console.log('[APR] UIManager._init() start');
      // Create Shadow DOM
      this._host = document.createElement('div');
      this._host.style.cssText = 'all:initial;position:static';
      this._attachHost();
      try {
        this._shadow = this._host.attachShadow({ mode: 'open' });
        console.log('[APR] Shadow DOM attached:', !!this._shadow);
      } catch (e) {
        console.error('[APR] attachShadow failed:', e);
        return;
      }

      // Add styles
      const styleEl = document.createElement('style');
      styleEl.textContent = Styles.getAllStyles();
      this._shadow.appendChild(styleEl);
      console.log('[APR] styles injected, length:', styleEl.textContent.length);

      // Build panel
      this._panel = this._createMainPanel();
      this._shadow.appendChild(this._panel);
      console.log('[APR] main panel created and appended');

      // Setup interactions
      this._setupDraggable();
      this._setupPanelEvents();
      this._renderPromptList();
      this._checkUrlForConfig();
      console.log('[APR] panel setup complete');

      // Auto-pull from GitHub if cache is stale and credentials are set
      if (!this._storage.hasFreshCache() && this._config.githubOwner && this._config.githubRepo) {
        this._storage.pullFromGitHub().then(state => {
          this._libraryState = state;
          this._renderPromptList();
        }).catch(() => { /* silent fail */ });
      }

      // Re-attach host if a SPA (Gmail, Google Docs, etc.) removes it from the DOM
      this._bodyObserver = new MutationObserver(() => {
        if (!document.documentElement.contains(this._host)) {
          this._attachHost();
        }
      });
      this._bodyObserver.observe(document.documentElement, { childList: true, subtree: false });
      const bodyTarget = document.body || document.documentElement;
      this._bodyObserver.observe(bodyTarget, { childList: true });
    }

    _attachHost() {
      // Prefer body; fall back to <html> so SPAs that rebuild body don't drop us
      const parent = document.body || document.documentElement;
      if (!parent.contains(this._host)) {
        parent.appendChild(this._host);
      }
    }

    _createMainPanel() {
      const panel = document.createElement('div');
      panel.id = 'apt-panel';
      setHTML(panel, `
        <div id="apt-body">
          <input id="apt-search" placeholder="Search prompts…">
          <div id="apt-list-container"></div>
        </div>
        <div id="apt-header">
          <div id="apt-header-left">
            <span id="apt-logo">🚀</span>
            <span id="apt-title">Prompt Rock</span>
          </div>
          <div id="apt-header-btns">
            <button class="apt-icon-btn" id="apt-btn-new" title="New prompt">+</button>
            <button class="apt-icon-btn" id="apt-btn-sync" title="GitHub sync">⇅</button>
            <button class="apt-icon-btn" id="apt-btn-settings" title="Settings">⚙</button>
            <span class="apt-header-sep"></span>
            <button class="apt-icon-btn" id="apt-btn-close" title="Minimize">−</button>
          </div>
        </div>
      `);
      return panel;
    }

    _setupDraggable() {
      const header = this._panel.querySelector('#apt-header');
      let ox = 0, oy = 0, dragging = false;

      header.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('apt-icon-btn')) return;
        dragging = true;
        const r = this._panel.getBoundingClientRect();
        ox = e.clientX - r.left;
        oy = e.clientY - r.top;

        // Switch from bottom/right anchoring to top/left
        this._panel.style.bottom = 'auto';
        this._panel.style.right = 'auto';
        this._panel.style.left = r.left + 'px';
        this._panel.style.top = r.top + 'px';
      });

      window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        this._panel.style.left = (e.clientX - ox) + 'px';
        this._panel.style.top = (e.clientY - oy) + 'px';
      }, true);

      window.addEventListener('mouseup', () => { dragging = false; }, true);
    }

    _setupPanelEvents() {
      // New prompt button
      this._shadow.querySelector('#apt-btn-new').addEventListener('click', () => {
        this._openPromptDialog(null);
      });

      // GitHub sync button
      this._shadow.querySelector('#apt-btn-sync').addEventListener('click', () => {
        this._openSyncDialog();
      });

      // Settings button
      this._shadow.querySelector('#apt-btn-settings').addEventListener('click', () => {
        this._openSettingsDialog();
      });

      // Minimize button — hide panel, show restore pill
      this._shadow.querySelector('#apt-btn-close').addEventListener('click', () => {
        this._panel.style.display = 'none';
        this._showRestoreButton();
      });

      // Search input
      this._shadow.querySelector('#apt-search').addEventListener('input', () => {
        this._renderPromptList();
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PROMPT LIST
    // ═══════════════════════════════════════════════════════════════════════

    _renderPromptList() {
      const container = this._shadow.querySelector('#apt-list-container');
      if (!container) return;

      const q = (this._shadow.querySelector('#apt-search')?.value || '').trim().toLowerCase();
      const currentUrl = location.href;

      let prompts = this._libraryState.doc.prompts;
      if (q) {
        prompts = prompts.filter(p => {
          const hay = [p.name, p.include.join(' '), p.prompt].join(' ').toLowerCase();
          return hay.includes(q);
        });
      }

      const hasInclude = (p) => Array.isArray(p.include) && p.include.filter(Boolean).length > 0;
      const matched = prompts.filter(p => hasInclude(p) && Utils.matchesUrl(p, currentUrl));
      const others = prompts.filter(p => !hasInclude(p) || !Utils.matchesUrl(p, currentUrl));

      if (prompts.length === 0) {
        setHTML(container, `<div class="apt-empty">${
          q
            ? `No prompts match &ldquo;${Utils.escapeHtml(q)}&rdquo;.`
            : 'No prompts yet.<br>Click <strong>+</strong> to create your first prompt.'
        }</div>`);
        return;
      }

      let html = '';
      if (matched.length > 0) {
        html += '<div class="apt-section-label">This page</div>';
        html += matched.map(p => this._promptItemHtml(p, true)).join('');
      }
      if (others.length > 0) {
        if (matched.length > 0) {
          const collapsed = !q; // hide by default only when not searching
          html += `<div class="apt-section-label apt-section-toggle" id="apt-others-toggle">
            <span>All prompts (${others.length})</span>
            <span class="apt-toggle-icon">${collapsed ? '▶' : '▼'}</span>
          </div>`;
          html += `<div id="apt-others-list"${collapsed ? ' style="display:none"' : ''}>${others.map(p => this._promptItemHtml(p, false)).join('')}</div>`;
        } else {
          html += others.map(p => this._promptItemHtml(p, false)).join('');
        }
      }

      setHTML(container, html);

      // Toggle "All prompts" section
      const othersToggle = container.querySelector('#apt-others-toggle');
      if (othersToggle) {
        othersToggle.addEventListener('click', () => {
          const list = container.querySelector('#apt-others-list');
          const icon = othersToggle.querySelector('.apt-toggle-icon');
          const nowHidden = list.style.display === 'none';
          list.style.display = nowHidden ? '' : 'none';
          icon.textContent = nowHidden ? '▼' : '▶';
        });
      }

      // Row click → edit dialog
      container.querySelectorAll('.apt-item[data-id]').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.closest('.apt-item-btn')) return;
          const p = this._storage.findPrompt(this._libraryState.doc, item.dataset.id);
          if (p) this._openPromptDialog(p);
        });
      });

      // Run button → execute prompt
      container.querySelectorAll('.apt-item-btn.run[data-id]').forEach(btn => {
        btn.addEventListener('mousedown', () => {
          this._pendingSelection = window.getSelection().toString().trim();
        });
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const p = this._storage.findPrompt(this._libraryState.doc, btn.dataset.id);
          if (p) this._runPrompt(p);
        });
      });
    }

    _promptItemHtml(p, isMatch) {
      const meta = p.include.length > 0 ? p.include.join(', ') : 'all pages';
      return `
        <div class="apt-item${isMatch ? ' url-match' : ''}" data-id="${Utils.escapeHtml(p.id)}">
          <div class="apt-item-info">
            <div class="apt-item-name">${Utils.escapeHtml(p.name)}</div>
            <div class="apt-item-meta">${Utils.escapeHtml(meta)}</div>
          </div>
          <div class="apt-item-actions">
            <button class="apt-item-btn run" data-id="${Utils.escapeHtml(p.id)}" title="Run prompt">▶</button>
          </div>
        </div>
      `;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RUN PROMPT
    // ═══════════════════════════════════════════════════════════════════════

    _runPrompt(promptObj) {
      const template = promptObj.prompt || '';
      const selection = this._pendingSelection ?? window.getSelection().toString().trim();
      this._pendingSelection = null;
      const placeholders = Utils.parsePlaceholders(template);
      const hintMap = this._getPlaceholderHintMap(promptObj);

      if (placeholders.length === 0) {
        const prompt = selection
          ? `${template}\n\n---\nContext (selected text):\n${selection}`
          : template;
        this._dispatch(prompt);
      } else {
        this._openFillDialog(template, placeholders, hintMap, promptObj, selection);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PROMPT DIALOG (new / edit)
    // ═══════════════════════════════════════════════════════════════════════

    _openPromptDialog(promptObj) {
      const promptId = promptObj?.id || Utils.uid();
      const isEdit = !!promptObj;

      const defaultInclude = !isEdit ? (() => {
        try {
          const u = new URL(location.href);
          const cleanPath = u.pathname
            .split('/')
            .filter(seg => !/^\d+$/.test(seg) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg))
            .join('/');
          return u.hostname + cleanPath;
        } catch { return ''; }
      })() : '';

      const dlg = document.createElement('div');
      dlg.className = 'apt-dialog';
      setHTML(dlg, `
        <div class="apt-dialog-header">
          <div>
            <div class="apt-dialog-title">${isEdit ? 'Edit Prompt' : 'New Prompt'}</div>
            <div class="apt-dialog-subtitle">${isEdit ? 'Update prompt details' : 'Create a new prompt'}</div>
          </div>
        </div>
        <div class="apt-dialog-body">
          <div class="apt-field">
            <div class="apt-field-label">Name</div>
            <input class="apt-field-input" id="apt-pd-name" placeholder="Prompt name…" value="${Utils.escapeHtml(promptObj?.name || '')}">
          </div>
          <div class="apt-field">
            <div class="apt-field-label">Include URLs <span style="font-weight:400;font-size:11px;color:#6c7086">(comma-sep, supports *)</span></div>
            <input class="apt-field-input" id="apt-pd-include" placeholder="e.g. github.com/*, *.notion.so" value="${Utils.escapeHtml(isEdit ? (promptObj?.include || []).join(', ') : defaultInclude)}">
          </div>
          <div class="apt-field">
            <div class="apt-field-label">Prompt</div>
            <textarea class="apt-field-input" id="apt-pd-prompt" style="min-height:120px;resize:vertical;font-family:monospace;font-size:12px" placeholder="Write your prompt… use {{placeholder}} for values">${Utils.escapeHtml(promptObj?.prompt || '')}</textarea>
          </div>
          <div class="apt-field">
            <div class="apt-field-label">Placeholder hints <span style="font-weight:400;font-size:11px;color:#6c7086">(name: hint, one per line)</span></div>
            <textarea class="apt-field-input" id="apt-pd-hints" style="min-height:60px;resize:vertical;font-size:12px" placeholder="topic: the main topic&#10;language: output language">${Utils.escapeHtml(Utils.hintsToText(promptObj?.placeholders || []))}</textarea>
          </div>
        </div>
        <div class="apt-dialog-footer">
          ${isEdit ? '<button class="apt-dbtn" id="apt-pd-delete" style="background:#45475a;color:#f38ba8;margin-right:auto">🗑 Delete</button>' : ''}
          <button class="apt-dbtn apt-dbtn-cancel" id="apt-pd-cancel">Cancel</button>
          <button class="apt-dbtn apt-dbtn-submit" id="apt-pd-test">▶ Test</button>
          <button class="apt-dbtn apt-dbtn-copy" id="apt-pd-save">💾 Save</button>
        </div>
      `);

      const ov = this._showOverlay(dlg);

      const doSave = () => {
        const name = dlg.querySelector('#apt-pd-name').value.trim();
        const prompt = dlg.querySelector('#apt-pd-prompt').value.trim();
        if (!name) { this._showToast('Name is required', 'error'); return null; }
        if (!prompt) { this._showToast('Prompt content is required', 'error'); return null; }

        const formData = {
          id: promptId,
          name,
          include: dlg.querySelector('#apt-pd-include').value,
          exclude: '',
          prompt: dlg.querySelector('#apt-pd-prompt').value,
          placeholderHints: dlg.querySelector('#apt-pd-hints').value
        };

        this._libraryState.doc = this._storage.upsertPrompt(this._libraryState.doc, formData);
        this._libraryState.doc = this._storage.save(this._libraryState.doc, this._libraryState.sha);
        this._renderPromptList();
        return this._storage.findPrompt(this._libraryState.doc, promptId);
      };

      dlg.querySelector('#apt-pd-cancel').addEventListener('click', () => ov.remove());

      dlg.querySelector('#apt-pd-save').addEventListener('click', () => {
        if (doSave()) {
          this._showToast('Prompt saved!');
          ov.remove();
        }
      });

      dlg.querySelector('#apt-pd-test').addEventListener('click', () => {
        const saved = doSave();
        if (!saved) return;
        ov.remove();
        this._runPrompt(saved);
      });

      if (isEdit) {
        dlg.querySelector('#apt-pd-delete').addEventListener('click', () => {
          this._libraryState.doc = this._storage.removePrompt(this._libraryState.doc, promptId);
          this._libraryState.doc = this._storage.save(this._libraryState.doc, this._libraryState.sha);
          this._renderPromptList();
          this._showToast('Prompt deleted');
          ov.remove();
        });
      }

      dlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') ov.remove(); });
      setTimeout(() => dlg.querySelector('#apt-pd-name').focus(), 50);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SYNC DIALOG (GitHub pull / push)
    // ═══════════════════════════════════════════════════════════════════════

    _openSyncDialog() {
      const dlg = document.createElement('div');
      dlg.className = 'apt-dialog';
      setHTML(dlg, `
        <div class="apt-dialog-header">
          <div>
            <div class="apt-dialog-title">GitHub Sync</div>
            <div class="apt-dialog-subtitle">Pull from or push prompts to a GitHub repository</div>
          </div>
        </div>
        <div class="apt-dialog-body">
          <div class="apt-field">
            <div class="apt-field-label">Owner</div>
            <input class="apt-field-input" id="apt-sync-owner" placeholder="github-username" value="${Utils.escapeHtml(this._config.githubOwner)}">
          </div>
          <div class="apt-field">
            <div class="apt-field-label">Repository</div>
            <input class="apt-field-input" id="apt-sync-repo" placeholder="my-prompts" value="${Utils.escapeHtml(this._config.githubRepo)}">
          </div>
          <div class="apt-field">
            <div class="apt-field-label">Branch</div>
            <input class="apt-field-input" id="apt-sync-branch" placeholder="main" value="${Utils.escapeHtml(this._config.githubBranch)}">
          </div>
          <div class="apt-field">
            <div class="apt-field-label">File path</div>
            <input class="apt-field-input" id="apt-sync-path" placeholder="prompts/library.json" value="${Utils.escapeHtml(this._config.githubPath)}">
          </div>
          <div class="apt-field">
            <div class="apt-field-label">Token</div>
            <input class="apt-field-input" id="apt-sync-token" type="password" placeholder="ghp_…" value="${Utils.escapeHtml(this._config.githubToken)}">
          </div>
          <div id="apt-sync-status" style="color:#6c7086;font-size:12px;margin-top:4px;min-height:18px"></div>
          <div class="apt-field" style="margin-top:12px">
            <div class="apt-field-label">Share config <span style="font-weight:400;font-size:11px;color:#6c7086;text-transform:none;letter-spacing:0">(owner/repo/branch/path — no token)</span></div>
            <div style="display:flex;gap:6px;align-items:center">
              <input class="apt-field-input" id="apt-sync-sharelink" readonly style="flex:1;font-size:11px;color:#6c7086;cursor:text" placeholder="Enter owner & repo above to generate link">
              <button class="apt-dbtn" id="apt-sync-copylink" style="background:#f9e2af;color:#1e1e2e;flex-shrink:0;padding:9px 12px;font-size:15px" title="Copy shareable link">🔗</button>
            </div>
          </div>
        </div>
        <div class="apt-dialog-footer">
          <button class="apt-dbtn apt-dbtn-cancel" id="apt-sync-close">Close</button>
          <button class="apt-dbtn" id="apt-sync-pull" style="background:#89dceb;color:#1e1e2e">⇓ Pull</button>
          <button class="apt-dbtn" id="apt-sync-push" style="background:#cba6f7;color:#1e1e2e">⇑ Push</button>
        </div>
      `);

      const ov = this._showOverlay(dlg);
      const statusEl = dlg.querySelector('#apt-sync-status');

      const setStatus = (msg, isErr = false) => {
        statusEl.textContent = msg;
        statusEl.style.color = isErr ? '#f38ba8' : '#6c7086';
      };

      const saveSettings = () => {
        this._config.loadGithubFromForm({
          owner: dlg.querySelector('#apt-sync-owner').value.trim(),
          repo: dlg.querySelector('#apt-sync-repo').value.trim(),
          branch: dlg.querySelector('#apt-sync-branch').value.trim() || 'main',
          path: dlg.querySelector('#apt-sync-path').value.trim() || 'prompts/library.json',
          token: dlg.querySelector('#apt-sync-token').value.trim()
        });
      };

      dlg.querySelector('#apt-sync-close').addEventListener('click', () => {
        saveSettings();
        ov.remove();
      });

      dlg.querySelector('#apt-sync-pull').addEventListener('click', async () => {
        saveSettings();
        setStatus('Pulling from GitHub…');
        try {
          this._libraryState = await this._storage.pullFromGitHub();
          this._renderPromptList();
          setStatus(`Pulled ${this._libraryState.doc.prompts.length} prompt(s) from GitHub`);
        } catch (err) {
          setStatus(err.message, true);
        }
      });

      dlg.querySelector('#apt-sync-push').addEventListener('click', async () => {
        saveSettings();
        setStatus('Pushing to GitHub…');
        try {
          const nextSha = await this._storage.pushToGitHub(this._libraryState.doc, this._libraryState.sha);
          this._libraryState.sha = nextSha || this._libraryState.sha;
          this._storage.save(this._libraryState.doc, this._libraryState.sha);
          setStatus(`Pushed ${this._libraryState.doc.prompts.length} prompt(s) to GitHub`);
        } catch (err) {
          setStatus(err.message, true);
        }
      });

      dlg.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { saveSettings(); ov.remove(); }
      });

      setTimeout(() => dlg.querySelector('#apt-sync-owner').focus(), 50);

      // Share link — generate from current form values
      const shareLinkInput = dlg.querySelector('#apt-sync-sharelink');
      const updateShareLink = () => {
        const owner = dlg.querySelector('#apt-sync-owner').value.trim();
        const repo = dlg.querySelector('#apt-sync-repo').value.trim();
        const branch = dlg.querySelector('#apt-sync-branch').value.trim() || 'main';
        const path = dlg.querySelector('#apt-sync-path').value.trim() || 'prompts/library.json';
        if (owner && repo) {
          const encoded = Utils.b64EncodeUnicode(JSON.stringify({ owner, repo, branch, path }));
          shareLinkInput.value = `${location.href.split('#')[0]}#apt-cfg=${encoded}`;
        } else {
          shareLinkInput.value = '';
        }
      };
      updateShareLink();
      ['#apt-sync-owner', '#apt-sync-repo', '#apt-sync-branch', '#apt-sync-path'].forEach(id => {
        dlg.querySelector(id).addEventListener('input', updateShareLink);
      });
      dlg.querySelector('#apt-sync-copylink').addEventListener('click', () => {
        updateShareLink();
        if (shareLinkInput.value) {
          navigator.clipboard.writeText(shareLinkInput.value).then(() => this._showToast('Config link copied!'));
        } else {
          this._showToast('Enter owner and repo first', 'error');
        }
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FILL DIALOG
    // ═══════════════════════════════════════════════════════════════════════

    _openFillDialog(template, placeholders, hintMap = {}, promptMeta = null, selection = '') {
      const dlg = document.createElement('div');
      dlg.className = 'apt-dialog';

      const fieldsHtml = placeholders.length
        ? placeholders.map(p => `
            <div class="apt-field">
              <div class="apt-field-label">Fill in: <span>{{${Utils.escapeHtml(p)}}}</span></div>
              <input class="apt-field-input" data-ph="${encodeURIComponent(p)}"
                placeholder="${Utils.escapeHtml(hintMap[p] || `Value for {{${p}}}`)}" autocomplete="off">
            </div>`).join('')
        : `<div style="color:#6c7086;font-size:13px;padding:4px 0">
             No placeholders found. The prompt will be sent as-is.
           </div>`;

      setHTML(dlg, `
        <div class="apt-dialog-header">
          <div>
            <div class="apt-dialog-title">Fill Placeholder Values</div>
            <div class="apt-dialog-subtitle">
              ${placeholders.length
                ? `${placeholders.length} placeholder${placeholders.length > 1 ? 's' : ''} detected — fill them in before submitting`
                : 'Ready to submit — no placeholders in your prompt'}
            </div>
          </div>
        </div>
        <div class="apt-dialog-body">
          <div id="apt-fill-fields">${fieldsHtml}</div>
          <div id="apt-preview-label" style="color:#6c7086;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-top:14px;">
            Preview
          </div>
          ${promptMeta
            ? `<div style="font-size:10px;color:#6c7086;margin-bottom:8px">include: ${Utils.escapeHtml(promptMeta.include.join(', ') || '-')} · exclude: ${Utils.escapeHtml(promptMeta.exclude.join(', ') || '-')}</div>`
            : ''}
          <div id="apt-preview-box">${Utils.buildPreviewHtml(template, {})}</div>
          ${selection && !placeholders.includes('selected_text')
            ? `<div style="margin-top:8px;padding:6px 8px;background:rgba(166,227,161,.08);border:1px solid rgba(166,227,161,.25);border-radius:6px;font-size:11px;color:#a6e3a1;display:flex;align-items:center;gap:6px;">
                <span>📌</span><span>Selected text (${selection.length} chars) will be appended as context</span>
               </div>`
            : ''}
        </div>
        <div class="apt-dialog-footer">
          <button class="apt-dbtn apt-dbtn-cancel" id="apt-fill-cancel">Cancel</button>
          <button class="apt-dbtn apt-dbtn-submit" id="apt-fill-submit">
            ${this._config.mode === API_MODES.COPY
              ? '📋 Copy Prompt'
              : this._config.mode === API_MODES.CLAUDE_WEB
                ? '🌐 Open Claude.ai'
                : this._config.mode === API_MODES.CHATGPT_WEB
                  ? '🌐 Open ChatGPT'
                  : '⚡ Run Agent'}
          </button>
        </div>
      `);

      const ov = this._showOverlay(dlg);

      // Autofocus first input
      const firstInput = dlg.querySelector('.apt-field-input[data-ph]');
      if (firstInput) setTimeout(() => firstInput.focus(), 50);

      const getValues = () => {
        const v = {};
        dlg.querySelectorAll('.apt-field-input[data-ph]').forEach(inp => {
          try {
            v[decodeURIComponent(inp.dataset.ph)] = inp.value;
          } catch (e) {
            v[inp.dataset.ph] = inp.value;
          }
        });
        return v;
      };

      // Pre-fill {{selected_text}} placeholder with page selection
      if (selection) {
        const selInput = dlg.querySelector(`.apt-field-input[data-ph="${encodeURIComponent('selected_text')}"]`);
        if (selInput) {
          selInput.value = selection;
          setHTML(dlg.querySelector('#apt-preview-box'), Utils.buildPreviewHtml(template, getValues()));
        }
      }

      // Live preview update
      dlg.querySelectorAll('.apt-field-input[data-ph]').forEach(inp => {
        inp.addEventListener('input', () => {
          setHTML(dlg.querySelector('#apt-preview-box'), Utils.buildPreviewHtml(template, getValues()));
        });
      });

      const doSubmit = () => {
        const values = getValues();
        const filled = Utils.fillTemplate(template, values);
        const finalPrompt = (selection && !placeholders.includes('selected_text'))
          ? `${filled}\n\n---\nContext (selected text):\n${selection}`
          : filled;
        ov.remove();
        this._dispatch(finalPrompt);
      };

      dlg.querySelector('#apt-fill-cancel').addEventListener('click', () => ov.remove());
      dlg.querySelector('#apt-fill-submit').addEventListener('click', doSubmit);

      dlg.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSubmit(); }
        if (e.key === 'Escape') ov.remove();
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SETTINGS DIALOG
    // ═══════════════════════════════════════════════════════════════════════

    _openSettingsDialog() {
      const dlg = document.createElement('div');
      dlg.className = 'apt-dialog';
      setHTML(dlg, `
        <div class="apt-dialog-header">
          <div>
            <div class="apt-dialog-title">Settings</div>
            <div class="apt-dialog-subtitle">Configure how prompts are submitted</div>
          </div>
        </div>
        <div class="apt-dialog-body">
          <div class="apt-settings-section">
            <div class="apt-settings-section-title">Agent Runtime</div>
            <div class="apt-radio-group" id="apt-mode-group">
              <label class="apt-radio-item ${this._config.mode === API_MODES.CLAUDE_API ? 'selected' : ''}" data-val="${API_MODES.CLAUDE_API}">
                <input type="radio" name="apt-mode" value="${API_MODES.CLAUDE_API}" ${this._config.mode === API_MODES.CLAUDE_API ? 'checked' : ''}>
                <div>
                  <div class="apt-radio-label">Claude API (direct)</div>
                  <div class="apt-radio-desc">Calls api.anthropic.com with your API key — response shown inline</div>
                </div>
              </label>
              <label class="apt-radio-item ${this._config.mode === API_MODES.OPENAI_API ? 'selected' : ''}" data-val="${API_MODES.OPENAI_API}">
                <input type="radio" name="apt-mode" value="${API_MODES.OPENAI_API}" ${this._config.mode === API_MODES.OPENAI_API ? 'checked' : ''}>
                <div>
                  <div class="apt-radio-label">ChatGPT API (direct)</div>
                  <div class="apt-radio-desc">Calls api.openai.com with your API key — response shown inline</div>
                </div>
              </label>
              <label class="apt-radio-item ${this._config.mode === API_MODES.CLAUDE_WEB ? 'selected' : ''}" data-val="${API_MODES.CLAUDE_WEB}">
                <input type="radio" name="apt-mode" value="${API_MODES.CLAUDE_WEB}" ${this._config.mode === API_MODES.CLAUDE_WEB ? 'checked' : ''}>
                <div>
                  <div class="apt-radio-label">Claude.ai (open in tab)</div>
                  <div class="apt-radio-desc">Opens claude.ai in a new tab with the filled prompt pre-pasted</div>
                </div>
              </label>
              <label class="apt-radio-item ${this._config.mode === API_MODES.CHATGPT_WEB ? 'selected' : ''}" data-val="${API_MODES.CHATGPT_WEB}">
                <input type="radio" name="apt-mode" value="${API_MODES.CHATGPT_WEB}" ${this._config.mode === API_MODES.CHATGPT_WEB ? 'checked' : ''}>
                <div>
                  <div class="apt-radio-label">ChatGPT (open in tab)</div>
                  <div class="apt-radio-desc">Opens chatgpt.com in a new tab with the filled prompt pre-pasted</div>
                </div>
              </label>
              <label class="apt-radio-item ${this._config.mode === API_MODES.COPY ? 'selected' : ''}" data-val="${API_MODES.COPY}">
                <input type="radio" name="apt-mode" value="${API_MODES.COPY}" ${this._config.mode === API_MODES.COPY ? 'checked' : ''}>
                <div>
                  <div class="apt-radio-label">Copy to clipboard</div>
                  <div class="apt-radio-desc">Just copies the filled prompt — paste it wherever you like</div>
                </div>
              </label>
            </div>
          </div>
          <div class="apt-settings-section" id="apt-claude-api-section" style="${this._config.mode !== API_MODES.CLAUDE_API ? 'display:none' : ''}">
            <div class="apt-settings-section-title">Claude API Key</div>
            <input class="apt-field-input" id="apt-claude-api-key-input" type="password"
              placeholder="sk-ant-…" value="${this._config.claudeApiKey}">
          </div>
          <div class="apt-settings-section" id="apt-claude-model-section" style="${this._config.mode !== API_MODES.CLAUDE_API ? 'display:none' : ''}">
            <div class="apt-settings-section-title">Claude Model</div>
            <select class="apt-field-input" id="apt-claude-model-select">
              ${CLAUDE_MODELS.map(m =>
                `<option value="${m.id}" ${this._config.claudeModel === m.id ? 'selected' : ''}>${m.name}</option>`
              ).join('')}
            </select>
          </div>
          <div class="apt-settings-section" id="apt-openai-api-section" style="${this._config.mode !== API_MODES.OPENAI_API ? 'display:none' : ''}">
            <div class="apt-settings-section-title">OpenAI API Key</div>
            <input class="apt-field-input" id="apt-openai-api-key-input" type="password"
              placeholder="sk-…" value="${this._config.openaiApiKey}">
          </div>
          <div class="apt-settings-section" id="apt-openai-model-section" style="${this._config.mode !== API_MODES.OPENAI_API ? 'display:none' : ''}">
            <div class="apt-settings-section-title">ChatGPT Model</div>
            <select class="apt-field-input" id="apt-openai-model-select">
              ${OPENAI_MODELS.map(m =>
                `<option value="${m.id}" ${this._config.openaiModel === m.id ? 'selected' : ''}>${m.name}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class="apt-dialog-footer">
          <button class="apt-dbtn apt-dbtn-cancel" id="apt-settings-cancel">Cancel</button>
          <button class="apt-dbtn apt-dbtn-submit" id="apt-settings-save">Save</button>
        </div>
      `);

      const ov = this._showOverlay(dlg);

      // Radio interaction
      dlg.querySelectorAll('.apt-radio-item').forEach(item => {
        item.addEventListener('click', () => {
          dlg.querySelectorAll('.apt-radio-item').forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');
          item.querySelector('input').checked = true;

          const mode = item.dataset.val;
          const isClaudeApi = mode === API_MODES.CLAUDE_API;
          const isOpenAiApi = mode === API_MODES.OPENAI_API;

          dlg.querySelector('#apt-claude-api-section').style.display = isClaudeApi ? '' : 'none';
          dlg.querySelector('#apt-claude-model-section').style.display = isClaudeApi ? '' : 'none';
          dlg.querySelector('#apt-openai-api-section').style.display = isOpenAiApi ? '' : 'none';
          dlg.querySelector('#apt-openai-model-section').style.display = isOpenAiApi ? '' : 'none';
        });
      });

      dlg.querySelector('#apt-settings-cancel').addEventListener('click', () => ov.remove());
      dlg.querySelector('#apt-settings-save').addEventListener('click', () => {
        this._config.loadFromForm({
          mode: dlg.querySelector('input[name="apt-mode"]:checked').value,
          claudeApiKey: dlg.querySelector('#apt-claude-api-key-input').value.trim(),
          claudeModel: dlg.querySelector('#apt-claude-model-select').value,
          openaiApiKey: dlg.querySelector('#apt-openai-api-key-input').value.trim(),
          openaiModel: dlg.querySelector('#apt-openai-model-select').value
        });
        ov.remove();
      });

      dlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') ov.remove(); });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RESPONSE DIALOG
    // ═══════════════════════════════════════════════════════════════════════

    _openResponseDialog(prompt, provider) {
      const isClaude = provider === 'claude';
      const model = isClaude ? this._config.claudeModel : this._config.openaiModel;

      const dlg = document.createElement('div');
      dlg.className = 'apt-dialog';
      setHTML(dlg, `
        <div class="apt-dialog-header">
          <div>
            <div class="apt-dialog-title">Agent Response</div>
            <div class="apt-dialog-subtitle">${model}</div>
          </div>
        </div>
        <div class="apt-dialog-body">
          <div class="apt-response-label">Response</div>
          <div id="apt-response-box"><span class="apt-spinner"></span> <span class="apt-phase-msg">Connecting to ${isClaude ? 'Claude' : 'OpenAI'} API…</span></div>
          <div id="apt-status-line" class="apt-status connecting">
            <span class="apt-status-dot"></span>
            <span class="apt-status-text">Connecting to ${isClaude ? 'Claude' : 'OpenAI'} API…</span>
          </div>
        </div>
        <div class="apt-dialog-footer">
          <button class="apt-dbtn apt-dbtn-cancel" id="apt-resp-close">Close</button>
          <button class="apt-dbtn apt-dbtn-copy" id="apt-resp-copy" disabled>📋 Copy</button>
        </div>
      `);

      const ov = this._showOverlay(dlg);
      dlg.querySelector('#apt-resp-close').addEventListener('click', () => ov.remove());
      dlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') ov.remove(); });

      const box = dlg.querySelector('#apt-response-box');
      const copyBtn = dlg.querySelector('#apt-resp-copy');
      const statusEl = dlg.querySelector('#apt-status-line');
      const statusTxt = statusEl.querySelector('.apt-status-text');

      const setStatus = (state, msg) => {
        statusEl.className = `apt-status ${state}`;
        statusTxt.textContent = msg;
      };

      const streamCallback = (text, streaming) => {
        box.textContent = text;
        if (streaming) box.classList.add('streaming');
        else box.classList.remove('streaming');
      };

      const completeCallback = (text, inputTokens, outputTokens) => {
        box.classList.remove('streaming');
        copyBtn.disabled = false;
      };

      const errorCallback = (msg) => {
        box.classList.remove('streaming');
        setHTML(box, `<span style="color:#f38ba8">${Utils.escapeHtml(msg)}</span>`);
        setStatus('error', msg);
      };

      this._apiClient.streamRequest(
        provider,
        prompt,
        streamCallback,
        setStatus,
        completeCallback,
        errorCallback
      );

      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(box.textContent).then(() =>
          this._showToast('Response copied!')
        );
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DISPATCH & HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    _dispatch(prompt) {
      const mode = this._config.mode;

      if (mode === API_MODES.COPY) {
        navigator.clipboard.writeText(prompt).then(() =>
          this._showToast('Prompt copied to clipboard!')
        );
        return;
      }

      if (mode === API_MODES.CLAUDE_WEB) {
        const url = `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
        window.open(url, '_blank');
        this._showToast('Opened Claude.ai in a new tab');
        return;
      }

      if (mode === API_MODES.CHATGPT_WEB) {
        const url = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
        window.open(url, '_blank');
        this._showToast('Opened ChatGPT in a new tab');
        return;
      }

      if (mode === API_MODES.CLAUDE_API) {
        if (!this._config.claudeApiKey) {
          this._showToast('No Claude API key — open Settings (⚙) to add one', 'error');
          return;
        }
        this._openResponseDialog(prompt, 'claude');
        return;
      }

      if (mode === API_MODES.OPENAI_API) {
        if (!this._config.openaiApiKey) {
          this._showToast('No OpenAI API key — open Settings (⚙) to add one', 'error');
          return;
        }
        this._openResponseDialog(prompt, 'openai');
        return;
      }

      this._showToast(`Unknown mode: ${mode}`, 'error');
    }

    _getPlaceholderHintMap(promptObj) {
      const map = {};
      if (!promptObj || !Array.isArray(promptObj.placeholders)) return map;
      for (const ph of promptObj.placeholders) {
        map[ph.name] = ph.hint || '';
      }
      return map;
    }

    _showOverlay(contentEl) {
      const ov = document.createElement('div');
      ov.className = 'apt-overlay';
      ov.appendChild(contentEl);
      this._shadow.appendChild(ov);
      return ov;
    }

    _showToast(msg, type = 'ok') {
      const t = document.createElement('div');
      t.className = 'apt-toast';
      t.style.background = type === 'error' ? '#f38ba8' : '#a6e3a1';
      t.textContent = msg;
      this._shadow.appendChild(t);
      setTimeout(() => t.remove(), 3000);
    }

    _showRestoreButton() {
      const pill = document.createElement('div');
      pill.id = 'apt-restore-pill';
      setHTML(pill, '<span>🚀</span>');
      this._shadow.appendChild(pill);
      pill.addEventListener('click', () => {
        this._panel.style.display = '';
        pill.remove();
      });
    }

    _checkUrlForConfig() {
      try {
        const match = location.hash.match(/apt-cfg=([A-Za-z0-9+/=%_-]+)/);
        if (!match) return;
        const cfg = JSON.parse(Utils.b64DecodeUnicode(decodeURIComponent(match[1])));
        if (!cfg.owner || !cfg.repo) return;
        this._showConfigImportBanner(cfg);
        const cleaned = location.href.replace(/#apt-cfg=[^&#]+/, '').replace(/#$/, '');
        history.replaceState(null, '', cleaned);
      } catch {
        // ignore invalid config in URL
      }
    }

    _showConfigImportBanner(cfg) {
      const banner = document.createElement('div');
      banner.className = 'apt-toast';
      banner.style.cssText = `
        background:#89b4fa; color:#1e1e2e; max-width:300px; width:auto;
        text-align:center; cursor:pointer; pointer-events:auto;
        white-space:normal; line-height:1.5;
      `;
      setHTML(banner, `Import GitHub config<br><strong>${Utils.escapeHtml(cfg.owner)}/${Utils.escapeHtml(cfg.repo)}</strong><br><small style="opacity:.8">Click to confirm</small>`);
      this._shadow.appendChild(banner);
      banner.addEventListener('click', () => {
        if (cfg.owner) this._config.githubOwner = cfg.owner;
        if (cfg.repo) this._config.githubRepo = cfg.repo;
        if (cfg.branch) this._config.githubBranch = cfg.branch;
        if (cfg.path) this._config.githubPath = cfg.path;
        banner.style.background = '#a6e3a1';
        banner.textContent = 'GitHub config imported! ✓';
        setTimeout(() => banner.remove(), 2000);
      });
      setTimeout(() => { if (banner.parentNode) banner.remove(); }, 10000);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION: APP - Main Application
  // ═══════════════════════════════════════════════════════════════════════

  class App {
    constructor() {
      this._config = new Config();
      this._storage = new PromptStorage(this._config);
      this._apiClient = new APIClient(this._config);
      this._ui = null;
    }

    init() {
      console.log('[APR] App.init() — constructing UIManager');
      try {
        this._ui = new UIManager(this._config, this._storage, this._apiClient);
        console.log('[APR] AI Prompt Rock initialized ✓');
      } catch (e) {
        console.error('[APR] UIManager construction failed:', e);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════

  const app = new App();
  app.init();

})();
