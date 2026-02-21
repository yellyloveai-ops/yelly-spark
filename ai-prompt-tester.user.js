// ==UserScript==
// @name         AI Prompt Tester
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Build & test AI prompts with placeholder substitution, then invoke Claude or other agents
// @author       yellyloveai-ops
// @match        http://*/*
// @match        https://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @connect      api.anthropic.com
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/yellyloveai-ops/userscripts/main/ai-prompt-tester.user.js
// @updateURL    https://raw.githubusercontent.com/yellyloveai-ops/userscripts/main/ai-prompt-tester.user.js
// @license      Apache-2.0
// ==/UserScript==

(function () {
  'use strict';

  // ─── Styles ───────────────────────────────────────────────────────────────
  GM_addStyle(`
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
    #apt-btn-settings { background: #313244; color: #a6adc8; flex: 0 0 40px; font-size: 16px; }
    #apt-btn-test:disabled { opacity: .5; cursor: not-allowed; }

    /* ── Overlay ── */
    .apt-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.6);
      z-index: 2147483646; display: flex; align-items: center; justify-content: center;
      animation: aptFadeIn .15s ease;
    }
    @keyframes aptFadeIn { from { opacity:0 } to { opacity:1 } }

    /* ── Dialog ── */
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

    /* ── Form ── */
    .apt-field { margin-bottom: 14px; }
    .apt-field:last-child { margin-bottom: 0; }
    .apt-field-label {
      display: flex; align-items: center; gap-6px; color: #a6adc8;
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

    /* ── Preview ── */
    #apt-preview-box {
      background: #181825; border: 1px solid #313244; border-radius: 8px;
      padding: 12px; font-size: 12px; color: #a6adc8; line-height: 1.6;
      white-space: pre-wrap; word-break: break-word; max-height: 120px;
      overflow-y: auto; margin-top: 14px;
    }
    #apt-preview-box mark {
      background: #45475a; color: #f38ba8; border-radius: 3px; padding: 0 2px;
    }

    /* ── Response ── */
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

    /* ── Dialog Btns ── */
    .apt-dbtn {
      padding: 9px 18px; border-radius: 8px; border: none;
      font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity .15s, transform .1s;
    }
    .apt-dbtn:active { transform: scale(.97); }
    .apt-dbtn-cancel { background: #313244; color: #a6adc8; }
    .apt-dbtn-submit { background: #89b4fa; color: #1e1e2e; }
    .apt-dbtn-copy { background: #a6e3a1; color: #1e1e2e; }
    .apt-dbtn:disabled { opacity: .5; cursor: not-allowed; }

    /* ── Settings dialog ── */
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
  `);

  // ─── State ────────────────────────────────────────────────────────────────
  const PLACEHOLDER_RE = /\{\{([^{}]+?)\}\}/g;

  const cfg = {
    get apiKey()   { return GM_getValue('apt_api_key', ''); },
    set apiKey(v)  { GM_setValue('apt_api_key', v); },
    get mode()     { return GM_getValue('apt_mode', 'claude-api'); },
    set mode(v)    { GM_setValue('apt_mode', v); },
    get model()    { return GM_getValue('apt_model', 'claude-opus-4-6'); },
    set model(v)   { GM_setValue('apt_model', v); },
  };

  // ─── Build panel ──────────────────────────────────────────────────────────
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
        <button class="apt-btn" id="apt-btn-settings" title="Settings">⚙</button>
        <button class="apt-btn" id="apt-btn-test">▶ Test</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // ─── Draggable ────────────────────────────────────────────────────────────
  (function makeDraggable() {
    const header = document.getElementById('apt-header');
    let ox = 0, oy = 0, dragging = false;
    header.addEventListener('mousedown', e => {
      if (e.target.classList.contains('apt-icon-btn')) return;
      dragging = true;
      const r = panel.getBoundingClientRect();
      ox = e.clientX - r.left; oy = e.clientY - r.top;
      // switch from bottom/right anchoring to top/left
      panel.style.bottom = 'auto'; panel.style.right = 'auto';
      panel.style.left = r.left + 'px'; panel.style.top = r.top + 'px';
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      panel.style.left = (e.clientX - ox) + 'px';
      panel.style.top  = (e.clientY - oy) + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  })();

  // ─── Collapse / close ─────────────────────────────────────────────────────
  document.getElementById('apt-btn-collapse').addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    document.getElementById('apt-btn-collapse').textContent = panel.classList.contains('collapsed') ? '□' : '—';
  });
  document.getElementById('apt-btn-close').addEventListener('click', () => {
    panel.remove();
  });

  // ─── Helper: parse placeholders ───────────────────────────────────────────
  function parsePlaceholders(text) {
    const seen = new Set();
    const result = [];
    let m;
    PLACEHOLDER_RE.lastIndex = 0;
    while ((m = PLACEHOLDER_RE.exec(text)) !== null) {
      const name = m[1].trim();
      if (!seen.has(name)) { seen.add(name); result.push(name); }
    }
    return result;
  }

  function fillTemplate(template, values) {
    return template.replace(PLACEHOLDER_RE, (_, name) => values[name.trim()] ?? `{{${name}}}`);
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ─── Live preview updater ─────────────────────────────────────────────────
  function buildPreviewHtml(template, values) {
    // highlight un-filled placeholders
    return escapeHtml(template).replace(/\{\{([^{}]+?)\}\}/g, (_, name) => {
      const v = values[name.trim()];
      return v ? `<strong style="color:#a6e3a1">${escapeHtml(v)}</strong>`
               : `<mark>{{${escapeHtml(name)}}}</mark>`;
    });
  }

  // ─── Show overlay helper ──────────────────────────────────────────────────
  function showOverlay(contentEl) {
    const ov = document.createElement('div');
    ov.className = 'apt-overlay';
    ov.appendChild(contentEl);
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    return ov;
  }

  // ─── Settings Dialog ──────────────────────────────────────────────────────
  document.getElementById('apt-btn-settings').addEventListener('click', () => {
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
            <label class="apt-radio-item ${cfg.mode==='claude-api'?'selected':''}" data-val="claude-api">
              <input type="radio" name="apt-mode" value="claude-api" ${cfg.mode==='claude-api'?'checked':''}>
              <div>
                <div class="apt-radio-label">Claude API (direct)</div>
                <div class="apt-radio-desc">Calls api.anthropic.com with your API key — response shown inline</div>
              </div>
            </label>
            <label class="apt-radio-item ${cfg.mode==='claude-web'?'selected':''}" data-val="claude-web">
              <input type="radio" name="apt-mode" value="claude-web" ${cfg.mode==='claude-web'?'checked':''}>
              <div>
                <div class="apt-radio-label">Claude.ai (open in tab)</div>
                <div class="apt-radio-desc">Opens claude.ai in a new tab with the filled prompt pre-pasted</div>
              </div>
            </label>
            <label class="apt-radio-item ${cfg.mode==='copy'?'selected':''}" data-val="copy">
              <input type="radio" name="apt-mode" value="copy" ${cfg.mode==='copy'?'checked':''}>
              <div>
                <div class="apt-radio-label">Copy to clipboard</div>
                <div class="apt-radio-desc">Just copies the filled prompt — paste it wherever you like</div>
              </div>
            </label>
          </div>
        </div>
        <div class="apt-settings-section" id="apt-api-section" style="${cfg.mode!=='claude-api'?'display:none':''}">
          <div class="apt-settings-section-title">Claude API Key</div>
          <input class="apt-field-input" id="apt-api-key-input" type="password"
            placeholder="sk-ant-…" value="${cfg.apiKey}">
        </div>
        <div class="apt-settings-section" id="apt-model-section" style="${cfg.mode!=='claude-api'?'display:none':''}">
          <div class="apt-settings-section-title">Model</div>
          <select class="apt-field-input" id="apt-model-select">
            <option value="claude-opus-4-6"   ${cfg.model==='claude-opus-4-6'?'selected':''}>Claude Opus 4.6 (most capable)</option>
            <option value="claude-sonnet-4-6" ${cfg.model==='claude-sonnet-4-6'?'selected':''}>Claude Sonnet 4.6 (fast &amp; smart)</option>
            <option value="claude-haiku-4-5-20251001"  ${cfg.model==='claude-haiku-4-5-20251001'?'selected':''}>Claude Haiku 4.5 (fastest)</option>
          </select>
        </div>
      </div>
      <div class="apt-dialog-footer">
        <button class="apt-dbtn apt-dbtn-cancel" id="apt-settings-cancel">Cancel</button>
        <button class="apt-dbtn apt-dbtn-submit" id="apt-settings-save">Save</button>
      </div>
    `;

    const ov = showOverlay(dlg);

    // radio interaction
    dlg.querySelectorAll('.apt-radio-item').forEach(item => {
      item.addEventListener('click', () => {
        dlg.querySelectorAll('.apt-radio-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        item.querySelector('input').checked = true;
        const isApi = item.dataset.val === 'claude-api';
        dlg.getElementById && null; // just reference for clarity
        document.getElementById('apt-api-section').style.display  = isApi ? '' : 'none';
        document.getElementById('apt-model-section').style.display = isApi ? '' : 'none';
      });
    });

    document.getElementById('apt-settings-cancel').addEventListener('click', () => ov.remove());
    document.getElementById('apt-settings-save').addEventListener('click', () => {
      cfg.mode = dlg.querySelector('input[name="apt-mode"]:checked').value;
      cfg.apiKey = document.getElementById('apt-api-key-input').value.trim();
      cfg.model  = document.getElementById('apt-model-select').value;
      ov.remove();
    });
  });

  // ─── Test Button ──────────────────────────────────────────────────────────
  document.getElementById('apt-btn-test').addEventListener('click', () => {
    const template = document.getElementById('apt-prompt').value.trim();
    if (!template) return;

    const placeholders = parsePlaceholders(template);
    showFillDialog(template, placeholders);
  });

  // ─── Fill Dialog ──────────────────────────────────────────────────────────
  function showFillDialog(template, placeholders) {
    const dlg = document.createElement('div');
    dlg.className = 'apt-dialog';

    const fieldsHtml = placeholders.length
      ? placeholders.map(p => `
          <div class="apt-field">
            <div class="apt-field-label">Fill in: <span>{{${p}}}</span></div>
            <input class="apt-field-input" data-ph="${escapeHtml(p)}"
              placeholder="Value for {{${escapeHtml(p)}}}" autocomplete="off">
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
              ? `${placeholders.length} placeholder${placeholders.length>1?'s':''} detected — fill them in before submitting`
              : 'Ready to submit — no placeholders in your prompt'}
          </div>
        </div>
      </div>
      <div class="apt-dialog-body">
        <div id="apt-fill-fields">${fieldsHtml}</div>
        <div id="apt-preview-label" style="color:#6c7086;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-top:14px;">
          Preview
        </div>
        <div id="apt-preview-box">${buildPreviewHtml(template, {})}</div>
      </div>
      <div class="apt-dialog-footer">
        <button class="apt-dbtn apt-dbtn-cancel" id="apt-fill-cancel">Cancel</button>
        <button class="apt-dbtn apt-dbtn-submit" id="apt-fill-submit">
          ${cfg.mode === 'copy' ? '📋 Copy Prompt' : cfg.mode === 'claude-web' ? '🌐 Open Claude.ai' : '⚡ Run Agent'}
        </button>
      </div>
    `;

    const ov = showOverlay(dlg);

    // live preview update
    function getValues() {
      const v = {};
      dlg.querySelectorAll('.apt-field-input[data-ph]').forEach(inp => {
        v[inp.dataset.ph] = inp.value;
      });
      return v;
    }

    dlg.querySelectorAll('.apt-field-input[data-ph]').forEach(inp => {
      inp.addEventListener('input', () => {
        document.getElementById('apt-preview-box').innerHTML = buildPreviewHtml(template, getValues());
      });
    });

    document.getElementById('apt-fill-cancel').addEventListener('click', () => ov.remove());

    document.getElementById('apt-fill-submit').addEventListener('click', () => {
      const values  = getValues();
      const filled  = fillTemplate(template, values);
      ov.remove();
      dispatch(filled);
    });
  }

  // ─── Dispatch to agent ────────────────────────────────────────────────────
  function dispatch(prompt) {
    if (cfg.mode === 'copy') {
      navigator.clipboard.writeText(prompt).then(() => showToast('Prompt copied to clipboard!'));
      return;
    }
    if (cfg.mode === 'claude-web') {
      const url = `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
      window.open(url, '_blank');
      showToast('Opened Claude.ai in a new tab');
      return;
    }
    // Default: claude-api
    if (!cfg.apiKey) {
      showToast('No API key — open Settings (⚙) to add one', 'error');
      return;
    }
    showResponseDialog(prompt);
  }

  // ─── Response Dialog (API mode) ───────────────────────────────────────────
  function showResponseDialog(prompt) {
    const dlg = document.createElement('div');
    dlg.className = 'apt-dialog';
    dlg.innerHTML = `
      <div class="apt-dialog-header">
        <div>
          <div class="apt-dialog-title">Agent Response</div>
          <div class="apt-dialog-subtitle">${cfg.model}</div>
        </div>
      </div>
      <div class="apt-dialog-body">
        <div class="apt-response-label">Response</div>
        <div id="apt-response-box">
          <span class="apt-spinner"></span> Running…
        </div>
      </div>
      <div class="apt-dialog-footer">
        <button class="apt-dbtn apt-dbtn-cancel" id="apt-resp-close">Close</button>
        <button class="apt-dbtn apt-dbtn-copy" id="apt-resp-copy" disabled>📋 Copy</button>
      </div>
    `;

    const ov = showOverlay(dlg);
    document.getElementById('apt-resp-close').addEventListener('click', () => ov.remove());

    const box = document.getElementById('apt-response-box');
    const copyBtn = document.getElementById('apt-resp-copy');
    let fullText = '';

    GM_xmlhttpRequest({
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      data: JSON.stringify({
        model: cfg.model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      }),
      responseType: 'stream',
      onreadystatechange(res) {
        if (res.readyState < 3) return;

        const raw = res.responseText;
        const lines = raw.split('\n');
        fullText = '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (json === '[DONE]') continue;
          try {
            const evt = JSON.parse(json);
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              fullText += evt.delta.text;
            }
            if (evt.type === 'message_stop') {
              copyBtn.disabled = false;
            }
          } catch (_) {}
        }

        if (fullText) {
          box.textContent = fullText;
        }
      },
      onerror(err) {
        box.innerHTML = `<span style="color:#f38ba8">Request failed — check your API key and network.</span>`;
        console.error('[APT]', err);
      },
    });

    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(fullText).then(() => showToast('Response copied!'));
    });
  }

  // ─── Toast ────────────────────────────────────────────────────────────────
  function showToast(msg, type = 'ok') {
    const t = document.createElement('div');
    t.style.cssText = `
      position:fixed; bottom:20px; left:50%; transform:translateX(-50%);
      background:${type==='error'?'#f38ba8':'#a6e3a1'}; color:#1e1e2e;
      padding:10px 20px; border-radius:8px; font-size:13px; font-weight:600;
      z-index:2147483647; box-shadow:0 4px 20px rgba(0,0,0,.3);
      animation:aptFadeIn .15s ease; pointer-events:none;
    `;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

})();
