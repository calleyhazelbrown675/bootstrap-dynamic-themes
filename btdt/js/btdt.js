/**
 * BTDT production loader — CSP compliant.
 * No inline styles, no eval, no nonce required.
 */
(function() {
    if (window.btdt && window.btdt._initialized) return;

    const script = document.currentScript;
    if (!script) return;

    const detectedBase    = script.src.split('/').slice(0, -2).join('/') + '/';
    const basePath        = (script.getAttribute('data-base-path') || detectedBase).replace(/\/?$/, '/');
    const autoInit        = script.getAttribute('data-auto-init') !== 'false';
    const initialPreset   = script.getAttribute('data-preset') || null;
    const initialMode     = script.getAttribute('data-mode') || null;
    const defaultMinified = script.getAttribute('data-minified') === 'true';
    const darkVarName     = script.getAttribute('data-dark-var') || null;
    const darkCookieName  = script.getAttribute('data-dark-cookie') || null;
    const useSystemDark   = script.getAttribute('data-dark-system') === 'true';

    const DARK_VALUES  = new Set(['1', 'true', 'yes', 'dark', 'on']);
    const LIGHT_VALUES = new Set(['0', 'false', 'no', 'light', 'off']);

    function classifyValue(value) {
        if (value == null) return null;
        const n = String(value).trim().toLowerCase();
        if (DARK_VALUES.has(n))  return 'dark';
        if (LIGHT_VALUES.has(n)) return 'light';
        return null;
    }

    function getCookie(name) {
        const match = document.cookie.match(
            new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)')
        );
        return match ? decodeURIComponent(match[1]) : null;
    }

    function resolveTargetMode() {
        if (initialMode === 'dark' || initialMode === 'light') return initialMode;
        if (darkVarName)    { const r = classifyValue(window[darkVarName]);       if (r) return r; }
        if (darkCookieName) { const r = classifyValue(getCookie(darkCookieName)); if (r) return r; }
        if (useSystemDark && window.matchMedia) {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return 'light';
    }

    const targetMode = resolveTargetMode();
    const html       = document.documentElement;

    // Apply mode to <html> immediately — attribute manipulation is CSP-safe
    html.setAttribute('data-bs-theme', targetMode);
    if (targetMode === 'dark') {
        html.setAttribute('data-mode', 'dark');
    } else {
        html.removeAttribute('data-mode');
    }

    const CACHE_TOKEN = Date.now();

    function withCacheBust(path) {
        const sep = path.includes('?') ? '&' : '?';
        return `${path}${sep}v=${CACHE_TOKEN}`;
    }

    function findLinkByFilename(filename) {
        const links = document.head.querySelectorAll('link[rel="stylesheet"]');
        for (let i = 0; i < links.length; i++) {
            if (links[i].href.includes(filename)) return links[i];
        }
        return null;
    }

    function findPresetLink() {
        return document.getElementById('theme-preset') ||
               findLinkByFilename('themes/preset/') ||
               null;
    }

    function resolvePresetHref(name, options) {
        if (!name) return null;
        if (name.endsWith('.css') || name.includes('/')) return name;
        const min = (options && options.minified != null) ? options.minified : defaultMinified;
        return `${basePath}themes/preset/${name}${min ? '.min' : ''}.css`;
    }

    function ensurePresetLink() {
        const existing = findPresetLink();
        if (existing) { existing.id = 'theme-preset'; return existing; }
        const link = document.createElement('link');
        link.id  = 'theme-preset';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
        return link;
    }

    let _modeLinkCache = null;

    function ensureModeLink() {
        if (_modeLinkCache) return _modeLinkCache;
        let link = document.getElementById('theme-preset-dark');
        if (!link) {
            link = document.createElement('link');
            link.id  = 'theme-preset-dark';
            link.rel = 'stylesheet';
            link.href = withCacheBust(`${basePath}themes/modes/dark.min.css`);
            document.head.appendChild(link);
        }
        // link.disabled is a DOM property, not an inline style — CSP safe
        link.disabled = targetMode !== 'dark';
        _modeLinkCache = link;
        return link;
    }

    function applyMode(mode) {
        const normalized = mode === 'dark' ? 'dark' : 'light';
        const modeLink   = ensureModeLink();

        html.setAttribute('data-bs-theme', normalized);
        if (normalized === 'dark') {
            html.setAttribute('data-mode', 'dark');
            modeLink.disabled = false;
        } else {
            html.removeAttribute('data-mode');
            modeLink.disabled = true;
        }

        html.dispatchEvent(new CustomEvent('btdt:modechange', {
            bubbles: true,
            detail: { mode: normalized }
        }));

        return normalized;
    }

    window.btdt = {
        _initialized: true,
        _mode: targetMode,

        load: function(name, options) {
            const href     = resolvePresetHref(name, options);
            if (!href) return this;
            const link     = ensurePresetLink();
            const resolved = withCacheBust(href);
            if (link.href !== resolved) link.href = resolved;
            return this;
        },

        setMode: function(mode) {
            this._mode = applyMode(mode);
            return this;
        },

        toggleMode: function() {
            return this.setMode(this._mode === 'dark' ? 'light' : 'dark');
        },

        getMode: function() {
            return this._mode;
        }
    };

    if (autoInit) {
        const existingPreset = findPresetLink();

        if (existingPreset) {
            existingPreset.id = 'theme-preset';
        } else if (initialPreset) {
            window.btdt.load(initialPreset);
        }

        // Dark link always after preset so its overrides win in cascade
        const modeLink = ensureModeLink();
        document.head.appendChild(modeLink);

        if (useSystemDark && !initialMode && !darkVarName && !darkCookieName && window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)')
                .addEventListener('change', function(e) {
                    window.btdt.setMode(e.matches ? 'dark' : 'light');
                });
        }
    }
})();
