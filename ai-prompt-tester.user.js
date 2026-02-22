// ==UserScript==
// @name         AI Prompt Tester
// @namespace    http://tampermonkey.net/
// @version      1.4.0
// @description  Build & test AI prompts with placeholder substitution, then invoke Claude or other agents
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
// @downloadURL  https://raw.githubusercontent.com/yellyloveai-ops/userscripts/main/ai-prompt-tester.user.js
// @updateURL    https://raw.githubusercontent.com/yellyloveai-ops/userscripts/main/ai-prompt-tester.user.js
// @license      Apache-2.0
// ==/UserScript==

/**
 * AI Prompt Tester - Modular Userscript
 * 
 * Architecture:
 * - Config: Configuration management with GM_setValue/GM_getValue
 * - Utils: Utility functions (placeholder parsing, HTML escaping, etc.)
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

  const API_MODES = Object.freeze({
    CLAUDE_API: 'claude-api',
    OPENAI_API: 'openai-api',
    CLAUDE_WEB: 'claude-web',
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

    _getKey(base, legacy) {
      return `apt_${base}`;
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

    /**
     * Load settings from dialog form inputs
     */
    loadFromForm(formData) {
      const { mode, claudeApiKey, claudeModel, openaiApiKey, openaiModel } = formData;
      if (mode) this.mode = mode;
      if (claudeApiKey !== undefined) this.claudeApiKey = claudeApiKey;
      if (claudeModel) this.claudeModel = claudeModel;
      if (openaiApiKey !== undefined) this.openaiApiKey = openaiApiKey;
      if (openaiModel) this.openaiModel = openaiModel;
    }

    /**
     * Load GitHub settings from dialog form inputs
     */
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
    /**
     * Generate a unique ID for prompts
     */
    uid() {
      return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    },

    /**
     * Get current ISO timestamp
     */
    nowIso() {
      return new Date().toISOString();
    },

    /**
     * Parse comma-separated values into array
     */
    toArrayCSV(text) {
      return String(text || '')
        .split(',')
        .map(x => x.trim())
        .filter(Boolean);
    },

    /**
     * Parse placeholder hints from text (name: hint format)
     */
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

    /**
     * Convert placeholder hints array to text
     */
    hintsToText(placeholders) {
      return (Array.isArray(placeholders) ? placeholders : [])
        .map(p => `${p.name}: ${p.hint || ''}`.trim())
        .join('\n');
    },

    /**
     * Base64 encode Unicode string
     */
    b64EncodeUnicode(s) {
      return btoa(unescape(encodeURIComponent(s)));
    },

    /**
     * Base64 decode Unicode string
     */
    b64DecodeUnicode(s) {
      return decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));
    },

    /**
     * Safe localStorage get with fallback
     */
    safeLocalGet(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (raw == null) return fallback;
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },

    /**
     * Safe localStorage set
     */
    safeLocalSet(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // ignore localStorage write failures
      }
    },

    /**
     * Safe GM_getValue with localStorage fallback
     */
    safeGet(key, fallback) {
      try {
        const v = GM_getValue(key);
        if (v !== undefined && v !== null) return v;
      } catch {
        // GM unavailable
      }
      return this.safeLocalGet(key, fallback);
    },

    /**
     * Safe GM_setValue with localStorage backup
     */
    safeSet(key, value) {
      try { GM_setValue(key, value); } catch { /* ignore */ }
      this.safeLocalSet(key, value);
    },

    /**
     * Escape HTML special characters
     */
    escapeHtml(s) {
      return s.replace(/&/g, '&')
              .replace(/</g, '<')
              .replace(/>/g, '>');
    },

    /**
     * Parse placeholders from template text
     */
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

    /**
     * Fill template with placeholder values
     */
    fillTemplate(template, values) {
      return template.replace(PLACEHOLDER_RE, (_, name) => 
        values[name.trim()] ?? `{{${name}}}`
      );
    },

    /**
     * Build preview HTML with highlighted placeholders
     */
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

    /**
     * Create empty document structure
     */
    emptyDoc() {
      return {
        schemaVersion: 1,
        updatedAt: Utils.nowIso(),
        prompts: []
      };
    }

    /**
     * Normalize document structure
     */
    normalizeDoc(doc) {
      if (!doc || typeof doc !== 'object') return this.emptyDoc();
      
      const prompts = Array.isArray(doc.prompts) ? doc.prompts : [];
      
      return {
        schemaVersion: 1,
        updatedAt: doc.updatedAt || Utils.nowIso(),
        prompts: prompts.map(p => ({
          id: p.id || Utils.uid(),
          name: String(p.name || 'Untitled Prompt'),
          includeX: Array.isArray(p.includeX) ? p.includeX.map(String) : [],
          excludeY: Array.isArray(p.excludeY) ? p.excludeY.map(String) : [],
          promptTemplate: String(p.promptTemplate || ''),
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

    /**
     * Load document from storage
     */
    load() {
      const doc = this.normalizeDoc(Utils.safeGet(this._libKey, this.emptyDoc()));
      const sha = Utils.safeGet(this._libShaKey, '');
      return { doc, sha: String(sha || '') };
    }

    /**
     * Save document to storage
     */
    save(doc, sha = null) {
      const next = this.normalizeDoc({ ...doc, updatedAt: Utils.nowIso() });
      Utils.safeSet(this._libKey, next);
      Utils.safeSet(this._libCacheTsKey, Date.now());
      if (typeof sha === 'string') Utils.safeSet(this._libShaKey, sha);
      return next;
    }

    /**
     * Check if cache is fresh
     */
    hasFreshCache() {
      const lastTs = Number(Utils.safeGet(this._libCacheTsKey, 0));
      const ttlMs = Math.max(1, this._config.cacheTtlMinutes) * 60 * 1000;
      return lastTs > 0 && Date.now() - lastTs <= ttlMs;
    }

    /**
     * Find prompt by ID
     */
    findPrompt(doc, id) {
      return doc.prompts.find(p => p.id === id) || null;
    }

    /**
     * Insert or update prompt
     */
    upsertPrompt(doc, promptInput) {
      const now = Utils.nowIso();
      const id = promptInput.id || Utils.uid();
      const existing = this.findPrompt(doc, id);
      
      const nextPrompt = {
        id,
        name: String(promptInput.name || 'Untitled Prompt').trim() || 'Untitled Prompt',
        includeX: Utils.toArrayCSV(promptInput.includeX),
        excludeY: Utils.toArrayCSV(promptInput.excludeY),
        promptTemplate: String(promptInput.promptTemplate || ''),
        placeholders: Utils.parsePlaceholderHints(promptInput.placeholderHints),
        createdAt: existing?.createdAt || now,
        updatedAt: now
      };
      
      const prompts = existing
        ? doc.prompts.map(p => (p.id === id ? nextPrompt : p))
        : [nextPrompt, ...doc.prompts];
      
      return this.normalizeDoc({ ...doc, prompts, updatedAt: now });
    }

    /**
     * Remove prompt by ID
     */
    removePrompt(doc, id) {
      return this.normalizeDoc({
        ...doc,
        prompts: doc.prompts.filter(p => p.id !== id),
        updatedAt: Utils.nowIso()
      });
    }

    /**
     * Get GitHub API URL configuration
     */
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

    /**
     * Make GitHub API request
     */
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

    /**
     * Pull prompts from GitHub
     */
    async pullFromGitHub() {
      const { readUrl } = this.githubApiUrl();
      const raw = await this.ghRequest('GET', readUrl);
      
      if (!raw.content) throw new Error('GitHub response has no file content');
      
      const parsed = this.normalizeDoc(JSON.parse(Utils.b64DecodeUnicode(raw.content)));
      this.save(parsed, raw.sha || '');
      
      return { doc: parsed, sha: raw.sha || '' };
    }

    /**
     * Push prompts to GitHub
     */
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
          width: 380px; background: #1e1e2e; border-radius: 14px;
          box-shadow: 0 8px 40px rgba(0,0,0,.5); border: 1px solid #313244;
          transition: height .25s ease, opacity .2s;
        }
        #apt-panel.collapsed { height: 52px; overflow: hidden; }
        #apt-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 16px; cursor: move; user-select: none;
          border-bottom: 1px solid #313244;
        }
        #apt-header-left { display: flex; align-items: center; gap: 8px; }
        #apt-logo { font-size: 18px; }
        #apt-title { color: #cdd6f4; font-weight: 600; font-size: 14px; }
        #apt-header-btns { display: flex; gap: 6px; }
        .apt-icon-btn {
          background: none; border: none; cursor: pointer; color: #6c7086;
          font-size: 16px; padding: 2px 5px; border-radius: 6px; line-height: 1;
          transition: color .15s, background .15s;
        }
        .apt-icon-btn:hover { color: #cdd6f4; background: #313244; }
        #apt-body { padding: 14px 16px 16px; }
        #apt-label { color: #a6adc8; font-size: 12px; font-weight: 500; margin-bottom: 6px; display: block; }
        #apt-prompt {
          width: 100%; height: 160px; background: #181825; border: 1px solid #313244;
          border-radius: 8px; color: #cdd6f4; font-size: 13px; padding: 10px 12px;
          resize: vertical; outline: none; transition: border-color .15s;
          line-height: 1.55;
        }
        #apt-prompt:focus { border-color: #89b4fa; }
        #apt-prompt::placeholder { color: #45475a; }
        #apt-hint {
          margin-top: 6px; color: #585b70; font-size: 11px;
        }
        #apt-hint code { background: #313244; padding: 1px 4px; border-radius: 4px; color: #89b4fa; }
        #apt-footer { display: flex; gap: 8px; margin-top: 12px; }
        .apt-btn {
          flex: 1; padding: 9px 0; border-radius: 8px; border: none;
          font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity .15s, transform .1s;
        }
        .apt-btn:active { transform: scale(.97); }
        #apt-btn-test { background: #89b4fa; color: #1e1e2e; }
        #apt-btn-library { background: #313244; color: #a6adc8; flex: 0 0 40px; font-size: 16px; }
        #apt-btn-settings { background: #313244; color: #a6adc8; flex: 0 0 40px; font-size: 16px; }
        #apt-btn-test:disabled { opacity: .5; cursor: not-allowed; }
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

    getLibraryStyles() {
      return `
        .apt-flex { display: flex; gap: 10px; }
        .apt-flex-1 { flex: 1; }
        .apt-small { font-size: 11px; color: #6c7086; }
        .apt-section-box {
          border: 1px solid #313244; border-radius: 10px; padding: 10px; margin-bottom: 12px;
          background: rgba(24,24,37,.4);
        }
        .apt-row { display: flex; gap: 8px; margin-bottom: 8px; }
        .apt-list {
          border: 1px solid #313244; border-radius: 8px; max-height: 170px; overflow-y: auto;
          background: #181825;
        }
        .apt-list-item {
          border-bottom: 1px solid #313244; padding: 8px 10px; cursor: pointer;
          color: #cdd6f4; font-size: 12px;
        }
        .apt-list-item:last-child { border-bottom: 0; }
        .apt-list-item:hover { background: #232438; }
        .apt-list-item.active { background: rgba(137,180,250,.12); outline: 1px solid #89b4fa; }
        .apt-list-meta { color: #6c7086; font-size: 10px; margin-top: 2px; }
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

    /**
     * Get all styles combined
     */
    getAllStyles() {
      return [
        this.getBaseStyles(),
        this.getOverlayStyles(),
        this.getDialogStyles(),
        this.getFormStyles(),
        this.getPreviewStyles(),
        this.getResponseStyles(),
        this.getStatusStyles(),
        this.getDialogButtonStyles(),
        this.getSettingsStyles(),
        this.getLibraryStyles(),
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

    /**
     * Make streaming API request
     */
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

      console.log('[APT] ▶ request', { provider, model, promptLen: prompt.length, payload });

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
          console.log(`[APT] readyState=${res.readyState} status=${res.status}`);

          // Handle HTTP errors
          if (res.status && res.status !== 200) {
            if (res.readyState < 4) return;
            console.error('[APT] HTTP error', res.status, res.responseText);
            let errMsg = `HTTP ${res.status}`;
            try {
              const body = JSON.parse(res.responseText);
              console.error('[APT] error body', body);
              if (body.error?.message) errMsg += ` — ${body.error.message}`;
              else if (body.message) errMsg += ` — ${body.message}`;
            } catch (e) {
              console.error('[APT] could not parse error body', e, res.responseText);
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
              console.warn('[APT] failed to parse SSE line', line, parseErr);
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
          console.error('[APT] network error', err);
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
      this._activePromptId = '';
      this._libraryState = this._storage.load();
      this._host = null;
      this._shadow = null;
      this._panel = null;
      
      this._init();
    }

    _init() {
      // Create Shadow DOM
      this._host = document.createElement('div');
      document.body.appendChild(this._host);
      this._shadow = this._host.attachShadow({ mode: 'open' });

      // Add styles
      const styleEl = document.createElement('style');
      styleEl.textContent = Styles.getAllStyles();
      this._shadow.appendChild(styleEl);

      // Build panel
      this._panel = this._createMainPanel();
      this._shadow.appendChild(this._panel);

      // Setup interactions
      this._setupDraggable();
      this._setupPanelEvents();
    }

    _createMainPanel() {
      const panel = document.createElement('div');
      panel.id = 'apt-panel';
      panel.innerHTML = `
        <div id="apt-header">
          <div id="apt-header-left">
            <span id="apt-logo">⚡</span>
            <span id="apt-title">Prompt Tester</span>
          </div>
          <div id="apt-header-btns">
            <button class="apt-icon-btn" id="apt-btn-collapse" title="Collapse">—</button>
            <button class="apt-icon-btn" id="apt-btn-close" title="Close">✕</button>
          </div>
        </div>
        <div id="apt-body">
          <label id="apt-label">Prompt Template</label>
          <textarea id="apt-prompt" placeholder="Write your prompt here…\n\nUse {{placeholder}} syntax for dynamic values.\nExample: Summarize {{topic}} in {{language}}."></textarea>
          <div id="apt-hint">Use <code>{{placeholder}}</code> for values you want to fill in at test time.</div>
          <div id="apt-footer">
            <button class="apt-btn" id="apt-btn-library" title="Prompt Library">📚</button>
            <button class="apt-btn" id="apt-btn-settings" title="Settings">⚙</button>
            <button class="apt-btn" id="apt-btn-test">▶ Test</button>
          </div>
        </div>
      `;
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

      document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        this._panel.style.left = (e.clientX - ox) + 'px';
        this._panel.style.top = (e.clientY - oy) + 'px';
      });

      document.addEventListener('mouseup', () => { dragging = false; });
    }

    _setupPanelEvents() {
      // Collapse button
      this._shadow.querySelector('#apt-btn-collapse').addEventListener('click', () => {
        this._panel.classList.toggle('collapsed');
        const btn = this._shadow.querySelector('#apt-btn-collapse');
        btn.textContent = this._panel.classList.contains('collapsed') ? '□' : '—';
      });

      // Close button
      this._shadow.querySelector('#apt-btn-close').addEventListener('click', () => {
        this._host.remove();
      });

      // Library button
      this._shadow.querySelector('#apt-btn-library').addEventListener('click', () => {
        this._openLibraryDialog();
      });

      // Settings button
      this._shadow.querySelector('#apt-btn-settings').addEventListener('click', () => {
        this._openSettingsDialog();
      });

      // Test button
      this._shadow.querySelector('#apt-btn-test').addEventListener('click', () => {
        this._handleTestClick();
      });

      // Prompt input tracking
      this._shadow.querySelector('#apt-prompt').addEventListener('input', () => {
        const active = this._getActivePrompt();
        if (!active) return;
        if (this._shadow.querySelector('#apt-prompt').value !== active.promptTemplate) {
          this._activePromptId = '';
        }
      });
    }

    _getActivePrompt() {
      return this._storage.findPrompt(this._libraryState.doc, this._activePromptId);
    }

    _getPlaceholderHintMap(promptObj) {
      const map = {};
      if (!promptObj || !Array.isArray(promptObj.placeholders)) return map;
      for (const ph of promptObj.placeholders) {
        map[ph.name] = ph.hint || '';
      }
      return map;
    }

    _applyPromptToEditor(promptObj) {
      const input = this._shadow.querySelector('#apt-prompt');
      input.value = promptObj.promptTemplate || '';
      this._activePromptId = promptObj.id;
    }

    _handleTestClick() {
      const template = this._shadow.querySelector('#apt-prompt').value.trim();
      if (!template) return;

      const placeholders = Utils.parsePlaceholders(template);
      const active = this._getActivePrompt();
      const hintMap = this._getPlaceholderHintMap(active);
      this._openFillDialog(template, placeholders, hintMap, active);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FILL DIALOG
    // ═══════════════════════════════════════════════════════════════════════

    _openFillDialog(template, placeholders, hintMap = {}, promptMeta = null) {
      const dlg = document.createElement('div');
      dlg.className = 'apt-dialog';

      const fieldsHtml = placeholders.length
        ? placeholders.map(p => `
            <div class="apt-field">
              <div class="apt-field-label">Fill in: <span>{{${Utils.escapeHtml(p)}}}</span></div>
              <input class="apt-field-input" data-ph="${Utils.escapeHtml(p)}"
                placeholder="${Utils.escapeHtml(hintMap[p] || `Value for {{${p}}}`)}" autocomplete="off">
            </div>`).join('')
        : `<div style="color:#6c7086;font-size:13px;padding:4px 0">
             No placeholders found. The prompt will be sent as-is.
           </div>`;

      dlg.innerHTML = `
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
            ? `<div class="apt-small" style="margin-bottom:8px">includeX: ${Utils.escapeHtml(promptMeta.includeX.join(', ') || '-')} · excludeY: ${Utils.escapeHtml(promptMeta.excludeY.join(', ') || '-')}</div>` 
            : ''}
          <div id="apt-preview-box">${Utils.buildPreviewHtml(template, {})}</div>
        </div>
        <div class="apt-dialog-footer">
          <button class="apt-dbtn apt-dbtn-cancel" id="apt-fill-cancel">Cancel</button>
          <button class="apt-dbtn apt-dbtn-submit" id="apt-fill-submit">
            ${this._config.mode === 'copy' 
              ? '📋 Copy Prompt' 
              : this._config.mode === 'claude-web' 
                ? '🌐 Open Claude.ai' 
                : '⚡ Run Agent'}
          </button>
        </div>
      `;

      const ov = this._showOverlay(dlg);

      // Autofocus first input
      const firstInput = dlg.querySelector('.apt-field-input[data-ph]');
      if (firstInput) setTimeout(() => firstInput.focus(), 50);

      // Get values from inputs
      const getValues = () => {
        const v = {};
        dlg.querySelectorAll('.apt-field-input[data-ph]').forEach(inp => {
          v[inp.dataset.ph] = inp.value;
        });
        return v;
      };

      // Live preview update
      dlg.querySelectorAll('.apt-field-input[data-ph]').forEach(inp => {
        inp.addEventListener('input', () => {
          dlg.querySelector('#apt-preview-box').innerHTML = Utils.buildPreviewHtml(template, getValues());
        });
      });

      // Submit handler
      const doSubmit = () => {
        const values = getValues();
        const filled = Utils.fillTemplate(template, values);
        ov.remove();
        this._dispatch(filled);
      };

      dlg.querySelector('#apt-fill-cancel').addEventListener('click', () => ov.remove());
      dlg.querySelector('#apt-fill-submit').addEventListener('click', doSubmit);
      
      dlg.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSubmit(); }
        if (e.key === 'Escape') ov.remove();
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LIBRARY DIALOG
    // ═══════════════════════════════════════════════════════════════════════

    _openLibraryDialog() {
      const dlg = document.createElement('div');
      dlg.className = 'apt-dialog';
      dlg.innerHTML = `
        <div class="apt-dialog-header">
          <div>
            <div class="apt-dialog-title">Prompt Library</div>
            <div class="apt-dialog-subtitle">Manage prompts at scale (GM/local cache + GitHub JSON)</div>
          </div>
        </div>
        <div class="apt-dialog-body">
          <div class="apt-section-box">
            <div class="apt-row">
              <button class="apt-dbtn apt-dbtn-submit apt-flex-1" id="apt-lib-new">New Prompt</button>
              <button class="apt-dbtn apt-dbtn-cancel apt-flex-1" id="apt-lib-pull">Pull GitHub</button>
              <button class="apt-dbtn apt-dbtn-cancel apt-flex-1" id="apt-lib-push">Push GitHub</button>
            </div>
            <div class="apt-small">Schema: each prompt includes <code>includeX</code>, <code>excludeY</code>, template, and placeholder hints.</div>
          </div>

          <div class="apt-section-box">
            <div class="apt-settings-section-title">Prompt List</div>
            <input class="apt-field-input" id="apt-lib-search" placeholder="Search by name, includeX, excludeY...">
            <div class="apt-list" id="apt-lib-list" style="margin-top:8px"></div>
          </div>

          <div class="apt-section-box">
            <div class="apt-settings-section-title">Prompt Editor</div>
            <input class="apt-field-input" id="apt-lib-id" type="hidden">
            <div class="apt-field">
              <input class="apt-field-input" id="apt-lib-name" placeholder="Prompt name">
            </div>
            <div class="apt-row">
              <input class="apt-field-input apt-flex-1" id="apt-lib-include" placeholder="includeX (comma-separated)">
              <input class="apt-field-input apt-flex-1" id="apt-lib-exclude" placeholder="excludeY (comma-separated)">
            </div>
            <div class="apt-field">
              <textarea class="apt-field-input" id="apt-lib-template" style="min-height:100px;resize:vertical" placeholder="Prompt template using {{placeholder}}"></textarea>
            </div>
            <div class="apt-field">
              <textarea class="apt-field-input" id="apt-lib-hints" style="min-height:80px;resize:vertical" placeholder="placeholderName: user input hint"></textarea>
              <div class="apt-small" style="margin-top:4px">One hint per line using <code>name: hint</code>.</div>
            </div>
            <div class="apt-row">
              <button class="apt-dbtn apt-dbtn-submit apt-flex-1" id="apt-lib-save">Save Prompt</button>
              <button class="apt-dbtn apt-dbtn-cancel apt-flex-1" id="apt-lib-load">Load to Tester</button>
              <button class="apt-dbtn apt-dbtn-cancel apt-flex-1" id="apt-lib-delete">Delete</button>
            </div>
          </div>

          <div class="apt-section-box">
            <div class="apt-settings-section-title">GitHub Storage</div>
            <div class="apt-row">
              <input class="apt-field-input apt-flex-1" id="apt-gh-owner" placeholder="Owner" value="${Utils.escapeHtml(this._config.githubOwner)}">
              <input class="apt-field-input apt-flex-1" id="apt-gh-repo" placeholder="Repo" value="${Utils.escapeHtml(this._config.githubRepo)}">
            </div>
            <div class="apt-row">
              <input class="apt-field-input apt-flex-1" id="apt-gh-branch" placeholder="Branch" value="${Utils.escapeHtml(this._config.githubBranch)}">
              <input class="apt-field-input apt-flex-1" id="apt-gh-path" placeholder="prompts/library.json" value="${Utils.escapeHtml(this._config.githubPath)}">
            </div>
            <div class="apt-row">
              <input class="apt-field-input apt-flex-1" id="apt-gh-token" type="password" placeholder="GitHub token (repo scope for private repos)" value="${Utils.escapeHtml(this._config.githubToken)}">
              <input class="apt-field-input" style="width:120px" id="apt-cache-ttl" type="number" min="1" value="${Utils.escapeHtml(String(this._config.cacheTtlMinutes))}" title="Cache TTL (minutes)">
            </div>
          </div>
        </div>
        <div class="apt-dialog-footer">
          <button class="apt-dbtn apt-dbtn-cancel" id="apt-lib-close">Close</button>
        </div>
      `;

      const ov = this._showOverlay(dlg);
      const listEl = dlg.querySelector('#apt-lib-list');
      const statusNote = document.createElement('div');
      statusNote.className = 'apt-small';
      statusNote.style.marginTop = '8px';
      dlg.querySelector('.apt-dialog-body').appendChild(statusNote);

      const setNote = (msg, isErr = false) => {
        statusNote.textContent = msg;
        statusNote.style.color = isErr ? '#f38ba8' : '#6c7086';
      };

      const readForm = () => ({
        id: dlg.querySelector('#apt-lib-id').value,
        name: dlg.querySelector('#apt-lib-name').value,
        includeX: dlg.querySelector('#apt-lib-include').value,
        excludeY: dlg.querySelector('#apt-lib-exclude').value,
        promptTemplate: dlg.querySelector('#apt-lib-template').value,
        placeholderHints: dlg.querySelector('#apt-lib-hints').value
      });

      const writeForm = (promptObj) => {
        dlg.querySelector('#apt-lib-id').value = promptObj?.id || '';
        dlg.querySelector('#apt-lib-name').value = promptObj?.name || '';
        dlg.querySelector('#apt-lib-include').value = (promptObj?.includeX || []).join(', ');
        dlg.querySelector('#apt-lib-exclude').value = (promptObj?.excludeY || []).join(', ');
        dlg.querySelector('#apt-lib-template').value = promptObj?.promptTemplate || '';
        dlg.querySelector('#apt-lib-hints').value = Utils.hintsToText(promptObj?.placeholders || []);
      };

      const saveSettingsFromDialog = () => {
        this._config.loadGithubFromForm({
          owner: dlg.querySelector('#apt-gh-owner').value.trim(),
          repo: dlg.querySelector('#apt-gh-repo').value.trim(),
          branch: dlg.querySelector('#apt-gh-branch').value.trim() || 'main',
          path: dlg.querySelector('#apt-gh-path').value.trim() || 'prompts/library.json',
          token: dlg.querySelector('#apt-gh-token').value.trim(),
          cacheTtl: dlg.querySelector('#apt-cache-ttl').value
        });
      };

      const renderList = () => {
        const q = dlg.querySelector('#apt-lib-search').value.trim().toLowerCase();
        const prompts = this._libraryState.doc.prompts.filter(p => {
          if (!q) return true;
          const hay = [
            p.name,
            p.includeX.join(' '),
            p.excludeY.join(' '),
            p.promptTemplate
          ].join(' ').toLowerCase();
          return hay.includes(q);
        });

        listEl.innerHTML = prompts.length
          ? prompts.map(p => `
              <div class="apt-list-item ${p.id === this._activePromptId ? 'active' : ''}" data-id="${Utils.escapeHtml(p.id)}">
                <div>${Utils.escapeHtml(p.name)}</div>
                <div class="apt-list-meta">includeX: ${Utils.escapeHtml(p.includeX.join(', ') || '-')} · excludeY: ${Utils.escapeHtml(p.excludeY.join(', ') || '-')}</div>
              </div>
            `).join('')
          : `<div class="apt-list-item">No prompts yet. Create one with "New Prompt".</div>`;

        listEl.querySelectorAll('.apt-list-item[data-id]').forEach(item => {
          item.addEventListener('click', () => {
            this._activePromptId = item.dataset.id;
            const p = this._getActivePrompt();
            writeForm(p);
            renderList();
          });
        });
      };

      const persistLibrary = (noteMsg = 'Saved to short-term cache') => {
        this._libraryState.doc = this._storage.save(this._libraryState.doc, this._libraryState.sha);
        setNote(noteMsg);
      };

      // Event handlers
      dlg.querySelector('#apt-lib-close').addEventListener('click', () => {
        saveSettingsFromDialog();
        ov.remove();
      });

      dlg.querySelector('#apt-lib-search').addEventListener('input', renderList);

      dlg.querySelector('#apt-lib-new').addEventListener('click', () => {
        this._activePromptId = '';
        writeForm(null);
        renderList();
        setNote('Ready for a new prompt');
      });

      dlg.querySelector('#apt-lib-save').addEventListener('click', () => {
        const form = readForm();
        if (!form.name.trim()) {
          setNote('Prompt name is required', true);
          return;
        }
        if (!form.promptTemplate.trim()) {
          setNote('Prompt template is required', true);
          return;
        }
        this._libraryState.doc = this._storage.upsertPrompt(this._libraryState.doc, form);
        this._activePromptId = form.id || this._libraryState.doc.prompts[0]?.id || '';
        persistLibrary('Prompt saved to short-term cache');
        renderList();
      });

      dlg.querySelector('#apt-lib-load').addEventListener('click', () => {
        const form = readForm();
        if (!form.promptTemplate.trim()) {
          setNote('Nothing to load. Add or select a prompt first.', true);
          return;
        }
        const current = form.id ? this._storage.findPrompt(this._libraryState.doc, form.id) : null;
        if (current) {
          this._applyPromptToEditor(current);
        } else {
          this._shadow.querySelector('#apt-prompt').value = form.promptTemplate;
          this._activePromptId = '';
        }
        this._showToast('Prompt loaded into tester');
        setNote('Loaded into main tester panel');
      });

      dlg.querySelector('#apt-lib-delete').addEventListener('click', () => {
        const id = dlg.querySelector('#apt-lib-id').value;
        if (!id) {
          setNote('Select a saved prompt to delete', true);
          return;
        }
        this._libraryState.doc = this._storage.removePrompt(this._libraryState.doc, id);
        this._activePromptId = '';
        writeForm(null);
        persistLibrary('Prompt deleted from short-term cache');
        renderList();
      });

      dlg.querySelector('#apt-lib-pull').addEventListener('click', async () => {
        saveSettingsFromDialog();
        try {
          setNote('Pulling from GitHub...');
          this._libraryState = await this._storage.pullFromGitHub();
          this._activePromptId = '';
          writeForm(null);
          renderList();
          setNote(`Pulled ${this._libraryState.doc.prompts.length} prompt(s) from GitHub`);
        } catch (err) {
          setNote(err.message, true);
        }
      });

      dlg.querySelector('#apt-lib-push').addEventListener('click', async () => {
        saveSettingsFromDialog();
        try {
          setNote('Pushing to GitHub...');
          const nextSha = await this._storage.pushToGitHub(this._libraryState.doc, this._libraryState.sha);
          this._libraryState.sha = nextSha || this._libraryState.sha;
          this._storage.save(this._libraryState.doc, this._libraryState.sha);
          setNote(`Pushed ${this._libraryState.doc.prompts.length} prompt(s) to GitHub`);
        } catch (err) {
          setNote(err.message, true);
        }
      });

      // Initial load
      if (!this._storage.hasFreshCache() && this._config.githubOwner && this._config.githubRepo) {
        try {
          setNote('Cache expired; pulling latest library from GitHub...');
          this._libraryState = await this._storage.pullFromGitHub();
        } catch (err) {
          setNote(`Using local cache (${err.message})`, true);
        }
      } else {
        setNote(`Loaded ${this._libraryState.doc.prompts.length} prompt(s) from short-term cache`);
      }

      renderList();
      const active = this._getActivePrompt();
      if (active) writeForm(active);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SETTINGS DIALOG
    // ═══════════════════════════════════════════════════════════════════════

    _openSettingsDialog() {
      const dlg = document.createElement('div');
      dlg.className = 'apt-dialog';
      dlg.innerHTML = `
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
      `;

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
      dlg.innerHTML = `
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
      `;

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
        box.innerHTML = `<span style="color:#f38ba8">${Utils.escapeHtml(msg)}</span>`;
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
    // DISPATCH & TOAST
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

    _showOverlay(contentEl) {
      const ov = document.createElement('div');
      ov.className = 'apt-overlay';
      ov.appendChild(contentEl);
      this._shadow.appendChild(ov);
      ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
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
      this._ui = new UIManager(this._config, this._storage, this._apiClient);
      console.log('[APT] AI Prompt Tester initialized');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════

  // Start the application
  const app = new App();
  app.init();

})();
</parameter>
<task_progress>
- [x] Analyze existing code structure
- [x] Identify refactoring opportunities
- [x] Plan refactoring approach
- [x] Implement refactoring changes
- [ ] Test refactored code
- [ ] Verify functionality
</task_progress>
</write_to_file>