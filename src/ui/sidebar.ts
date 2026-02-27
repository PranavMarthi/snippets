import { ContextStackState, Snippet } from "../shared/types";

export interface SidebarHandlers {
  onDelete: (id: string) => void;
  onClear: () => void;
  onCopyAll: () => void;
  onReorder: (from: number, to: number) => void;
  onInjectSelected: (ids: string[]) => void;
}

type SidebarPlatform = "chatgpt" | "claude" | "gemini" | "grok" | "perplexity" | "default";

const detectSidebarPlatform = (): SidebarPlatform => {
  const host = window.location.hostname;
  if (host === "chatgpt.com" || host === "chat.openai.com") return "chatgpt";
  if (host === "claude.ai") return "claude";
  if (host === "gemini.google.com") return "gemini";
  if (host === "grok.com" || (host === "x.com" && window.location.pathname.startsWith("/i/grok"))) return "grok";
  if (host.includes("perplexity")) return "perplexity";
  return "default";
};

export class SidebarPanel {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private handlers: SidebarHandlers;
  private visible = true;
  private state: ContextStackState = { snippets: [], totalChars: 0, updatedAt: Date.now() };
  private includedIds = new Set<string>();
  private mountTargetGetter: () => HTMLElement | null = () => null;
  private isInline = false;
  private themeObserver: MutationObserver | null = null;
  private colorSchemeQuery: MediaQueryList | null = null;
  private platform: SidebarPlatform;

  constructor(handlers: SidebarHandlers) {
    this.handlers = handlers;
    this.platform = detectSidebarPlatform();
    this.host = document.createElement("div");
    this.host.id = "ucs-sidebar-host";
    this.host.style.display = "none";
    this.host.style.pointerEvents = "auto";
    this.host.dataset.platform = this.platform;
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = this.template();
    document.documentElement.appendChild(this.host);
    this.bindTheme();
    this.bindEvents();
  }

  private bindTheme(): void {
    const applyTheme = (): void => {
      const doc = document.documentElement;
      const body = document.body;
      const className = (doc.className || "").toLowerCase();
      const bodyClassName = (body?.className || "").toLowerCase();
      const dataTheme = (doc.getAttribute("data-theme") || body?.getAttribute("data-theme") || "").toLowerCase();
      const colorScheme = (doc.style.colorScheme || body?.style.colorScheme || "").toLowerCase();
      const prefersDark = this.colorSchemeQuery?.matches ?? false;

      // Check background color for dark detection (Claude doesn't use class/data-theme)
      let bgIsDark = false;
      try {
        const bodyBg = body ? window.getComputedStyle(body).backgroundColor : "";
        const htmlBg = window.getComputedStyle(doc).backgroundColor;
        const bg = bodyBg || htmlBg;
        if (bg && bg !== "rgba(0, 0, 0, 0)") {
          const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (match) {
            const luminance = (parseInt(match[1] ?? "0") * 299 + parseInt(match[2] ?? "0") * 587 + parseInt(match[3] ?? "0") * 114) / 1000;
            bgIsDark = luminance < 128;
          }
        }
      } catch { /* ignore */ }

      const isDark =
        className.includes("dark") ||
        bodyClassName.includes("dark") ||
        dataTheme.includes("dark") ||
        colorScheme.includes("dark") ||
        prefersDark ||
        bgIsDark;
      this.host.dataset.theme = isDark ? "dark" : "light";
    };

    this.colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    if (typeof this.colorSchemeQuery.addEventListener === "function") {
      this.colorSchemeQuery.addEventListener("change", applyTheme);
    }

    this.themeObserver = new MutationObserver(() => applyTheme());
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"]
    });
    if (document.body) {
      this.themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "data-theme", "style"]
      });
    }

    applyTheme();
    window.setTimeout(applyTheme, 500);
    window.setTimeout(applyTheme, 2000);
  }

  setMountTargetGetter(getter: () => HTMLElement | null): void {
    this.mountTargetGetter = getter;
    this.ensureMounted();
  }

  /** @deprecated – use setMountTargetGetter instead */
  setAnchorGetter(getter: () => HTMLElement | null): void {
    this.mountTargetGetter = getter;
    this.ensureMounted();
  }

  setState(state: ContextStackState): void {
    this.state = state;

    const existing = new Set(state.snippets.map((snippet) => snippet.id));
    for (const id of [...this.includedIds]) {
      if (!existing.has(id)) {
        this.includedIds.delete(id);
      }
    }
    for (const snippet of state.snippets) {
      if (!this.includedIds.has(snippet.id)) {
        this.includedIds.add(snippet.id);
      }
    }

    this.render();
  }

  toggle(force?: boolean): void {
    this.visible = force ?? !this.visible;
    this.render();
  }

  getIncludedIds(): string[] {
    return this.state.snippets.filter((snippet) => this.includedIds.has(snippet.id)).map((snippet) => snippet.id);
  }

  refreshPosition(): void {
    this.ensureMounted();
  }

  /**
   * If a mount target is available, mount the sidebar inline near the composer.
   * On ChatGPT: prepended inside the composer surface (grid layout).
   * On other platforms: inserted as a sibling just before the composer container.
   * Otherwise fall back to fixed overlay.
   */
  private ensureMounted(): void {
    const target = this.mountTargetGetter();

    if (target) {
      if (this.platform === "chatgpt") {
        // ChatGPT: prepend inside the composer surface (grid-column span)
        if (this.host.parentElement !== target || target.firstElementChild !== this.host) {
          target.prepend(this.host);
        }
        this.applyInlineStyles();
      } else {
        // Other platforms: insert as sibling before the composer container
        if (this.host.nextElementSibling !== target) {
          target.parentElement?.insertBefore(this.host, target);
        }
        this.applyAboveComposerStyles();
      }
      this.isInline = true;
      return;
    }

    if (this.host.parentElement !== document.documentElement) {
      document.documentElement.appendChild(this.host);
    }
    this.applyFloatingStyles();
    this.isInline = false;
  }

  private applyInlineStyles(): void {
    this.host.style.position = "relative";
    this.host.style.zIndex = "1";
    this.host.style.left = "";
    this.host.style.top = "";
    this.host.style.bottom = "";
    this.host.style.width = "100%";
    this.host.style.transform = "none";
    this.host.style.gridColumn = "1 / -1";
    this.host.style.minWidth = "0";
    this.host.style.maxWidth = "";
    this.host.style.margin = "";
  }

  private applyAboveComposerStyles(): void {
    this.host.style.position = "relative";
    this.host.style.zIndex = "1";
    this.host.style.left = "";
    this.host.style.top = "";
    this.host.style.bottom = "";
    this.host.style.transform = "none";
    this.host.style.gridColumn = "";
    this.host.style.minWidth = "0";

    // Match the width of the composer container this is mounted next to
    const target = this.mountTargetGetter();
    if (target) {
      const targetWidth = target.getBoundingClientRect().width;
      this.host.style.width = `${targetWidth}px`;
      this.host.style.maxWidth = `${targetWidth}px`;
      // Align horizontally with the target
      const targetStyle = window.getComputedStyle(target);
      this.host.style.marginLeft = targetStyle.marginLeft;
      this.host.style.marginRight = targetStyle.marginRight;
      this.host.style.marginBottom = "4px";
      this.host.style.marginTop = "0";
    } else {
      this.host.style.width = "100%";
      this.host.style.maxWidth = "100%";
      this.host.style.margin = "0 0 4px 0";
    }
  }

  private applyFloatingStyles(): void {
    // Platform-specific bottom offsets to position above each platform's input area
    const bottomOffset: Record<string, string> = {
      chatgpt: "108px",
      claude: "120px",
      gemini: "120px",
      grok: "100px",
      perplexity: "108px",
      default: "108px"
    };
    this.host.style.position = "fixed";
    this.host.style.zIndex = "2147483646";
    this.host.style.left = "50%";
    this.host.style.bottom = bottomOffset[this.platform] ?? "108px";
    this.host.style.transform = "translateX(-50%)";
    this.host.style.top = "auto";
    this.host.style.width = "min(760px, calc(100vw - 20px))";
    this.host.style.gridColumn = "";
    this.host.style.minWidth = "";
    this.host.style.maxWidth = "";
    this.host.style.margin = "";
  }

  private render(): void {
    this.ensureMounted();
    const shouldShow = this.visible && this.state.snippets.length > 0;
    this.host.style.display = shouldShow ? "block" : "none";
    if (!shouldShow) {
      return;
    }

    const list = this.root.getElementById("ucs-list");
    if (!list) {
      return;
    }

    list.innerHTML = "";
    for (const snippet of this.state.snippets) {
      list.appendChild(this.createSnippetRow(snippet));
    }

    const rows = list.querySelectorAll<HTMLElement>(".snippet-row");
    rows.forEach((row) => {
      const textEl = row.querySelector<HTMLElement>(".snippet-text");
      const rawText = row.dataset.rawText;
      if (textEl && rawText !== undefined) {
        this.fitSnippetTextToOneLine(textEl, rawText);
      }
    });
  }

  private createSnippetRow(snippet: Snippet): HTMLElement {
    const row = document.createElement("div");
    const included = this.includedIds.has(snippet.id);
    row.className = `snippet-row${included ? "" : " excluded"}`;
    row.draggable = true;

    row.innerHTML = `
      <button type="button" class="snippet-toggle" data-role="toggle" aria-pressed="${included}" aria-label="More about replied content">
        <span class="snippet-arrow" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 10 20 15 15 20"></polyline>
            <path d="M4 4v7a4 4 0 0 0 4 4h12"></path>
          </svg>
        </span>
        <span class="snippet-text"></span>
      </button>
      <button type="button" class="snippet-remove" data-role="remove" aria-label="Remove snippet">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;

    row.dataset.rawText = snippet.text;

    row.querySelector<HTMLButtonElement>("[data-role='toggle']")?.addEventListener("click", () => {
      if (this.includedIds.has(snippet.id)) {
        this.includedIds.delete(snippet.id);
      } else {
        this.includedIds.add(snippet.id);
      }
      this.render();
    });

    row.querySelector<HTMLButtonElement>("[data-role='remove']")?.addEventListener("click", (event) => {
      event.stopPropagation();
      this.handlers.onDelete(snippet.id);
    });

    row.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("text/plain", snippet.id);
    });
    row.addEventListener("dragover", (event) => event.preventDefault());
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const sourceId = event.dataTransfer?.getData("text/plain");
      if (!sourceId || sourceId === snippet.id) {
        return;
      }
      const from = this.state.snippets.findIndex((entry) => entry.id === sourceId);
      const to = this.state.snippets.findIndex((entry) => entry.id === snippet.id);
      if (from >= 0 && to >= 0) {
        this.handlers.onReorder(from, to);
      }
    });

    return row;
  }

  private fitSnippetTextToOneLine(textEl: HTMLElement, rawText: string): void {
    const normalized = rawText.replace(/\s+/g, " ").trim();
    if (!normalized) {
      textEl.textContent = "\u201C\u201D";
      return;
    }

    const words = normalized.split(" ");
    const full = `\u201C${normalized}\u201D`;
    textEl.textContent = full;

    if (textEl.scrollWidth <= textEl.clientWidth) {
      return;
    }

    let low = 1;
    let high = words.length;
    let best = `\u201C${words[0]}...\u201D`;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = `\u201C${words.slice(0, mid).join(" ")}...\u201D`;
      textEl.textContent = candidate;

      if (textEl.scrollWidth <= textEl.clientWidth) {
        best = candidate;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    textEl.textContent = best;
  }

  private bindEvents(): void {
    window.addEventListener("resize", () => this.ensureMounted(), { passive: true });
    window.addEventListener("scroll", () => this.ensureMounted(), { passive: true, capture: true });
  }

  private template(): string {
    const fontUrl = typeof chrome !== "undefined" && chrome.runtime?.getURL
      ? chrome.runtime.getURL("fonts/Google_Sans.ttf")
      : "";
    return `
      <style>
        ${fontUrl ? `@font-face {
          font-family: 'Google Sans';
          src: url('${fontUrl}') format('truetype');
          font-weight: 100 900;
          font-style: normal;
          font-display: swap;
        }` : ""}

        :host {
          all: initial;
          display: block;
          --default-font-family: ui-sans-serif, -apple-system, system-ui, "Segoe UI", "Helvetica", "Apple Color Emoji", "Arial", sans-serif, "Segoe UI Emoji", "Segoe UI Symbol";
          --tile-font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif;
          --text-body-small-regular: 0.875rem;
          --text-body-small-regular--line-height: 1.125rem;
          --text-body-small-regular--letter-spacing: -0.01875rem;
          --text-body-small-regular--font-weight: 400;
          --tile-text-color: #5f6368;
          --tile-muted-icon: rgba(0, 0, 0, 0.4);
          --tile-remove-icon: rgba(0, 0, 0, 0.35);
          --tile-remove-hover: rgba(0, 0, 0, 0.05);
          --tile-remove-icon-hover: rgba(0, 0, 0, 0.7);
          --tile-focus-ring: rgba(16, 163, 127, 0.55);
        }

        :host([data-theme="dark"]) {
          --tile-text-color: rgba(255, 255, 255, 0.82);
          --tile-muted-icon: rgba(255, 255, 255, 0.55);
          --tile-remove-icon: rgba(255, 255, 255, 0.56);
          --tile-remove-hover: rgba(255, 255, 255, 0.1);
          --tile-remove-icon-hover: rgba(255, 255, 255, 0.9);
          --tile-focus-ring: rgba(16, 163, 127, 0.75);
        }

        /* ── Claude theme (warm brown/tan tones) ── */
        :host([data-platform="claude"]) {
          --tile-text-color: #5c5244;
          --tile-muted-icon: rgba(92, 82, 68, 0.5);
          --tile-remove-icon: rgba(92, 82, 68, 0.4);
          --tile-remove-hover: rgba(92, 82, 68, 0.08);
          --tile-remove-icon-hover: rgba(92, 82, 68, 0.8);
          --tile-focus-ring: rgba(191, 133, 72, 0.55);
        }
        :host([data-platform="claude"][data-theme="dark"]) {
          --tile-text-color: rgba(233, 224, 208, 0.82);
          --tile-muted-icon: rgba(200, 185, 160, 0.5);
          --tile-remove-icon: rgba(200, 185, 160, 0.45);
          --tile-remove-hover: rgba(200, 185, 160, 0.1);
          --tile-remove-icon-hover: rgba(233, 224, 208, 0.9);
          --tile-focus-ring: rgba(204, 163, 107, 0.65);
        }

        /* ── Gemini theme (dark blue-gray) ── */
        :host([data-platform="gemini"]) {
          --tile-text-color: #5f6368;
          --tile-muted-icon: rgba(95, 99, 104, 0.5);
          --tile-remove-icon: rgba(95, 99, 104, 0.4);
          --tile-remove-hover: rgba(95, 99, 104, 0.08);
          --tile-remove-icon-hover: rgba(95, 99, 104, 0.8);
          --tile-focus-ring: rgba(66, 133, 244, 0.55);
        }
        :host([data-platform="gemini"][data-theme="dark"]) {
          --tile-text-color: rgba(232, 234, 237, 0.82);
          --tile-muted-icon: rgba(232, 234, 237, 0.45);
          --tile-remove-icon: rgba(232, 234, 237, 0.4);
          --tile-remove-hover: rgba(232, 234, 237, 0.08);
          --tile-remove-icon-hover: rgba(232, 234, 237, 0.9);
          --tile-focus-ring: rgba(138, 180, 248, 0.65);
        }

        /* ── Grok theme (pure black) ── */
        :host([data-platform="grok"]) {
          --tile-text-color: #536471;
          --tile-muted-icon: rgba(83, 100, 113, 0.5);
          --tile-remove-icon: rgba(83, 100, 113, 0.4);
          --tile-remove-hover: rgba(83, 100, 113, 0.08);
          --tile-remove-icon-hover: rgba(83, 100, 113, 0.8);
          --tile-focus-ring: rgba(29, 155, 240, 0.55);
        }
        :host([data-platform="grok"][data-theme="dark"]) {
          --tile-text-color: rgba(255, 255, 255, 0.85);
          --tile-muted-icon: rgba(255, 255, 255, 0.45);
          --tile-remove-icon: rgba(255, 255, 255, 0.4);
          --tile-remove-hover: rgba(255, 255, 255, 0.08);
          --tile-remove-icon-hover: rgba(255, 255, 255, 0.92);
          --tile-focus-ring: rgba(29, 155, 240, 0.7);
        }
        *, *::before, *::after { box-sizing: border-box; }

        .container {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 1px 12px 0 12px;
          font-family: var(--default-font-family);
          --container-bg: transparent;
          --container-border: none;
          --container-radius: 0;
          --container-padding: 1px 12px 0 12px;
          --container-margin: 0;
          --container-shadow: none;
          background: var(--container-bg);
          border: var(--container-border);
          border-radius: var(--container-radius);
          box-shadow: var(--container-shadow);
        }

        /* ── ChatGPT container: transparent, blends into composer surface ── */
        :host([data-platform="chatgpt"]) .container {
          --container-bg: transparent;
        }

        /* ── Gemini: use Google Sans for snippets ── */
        :host([data-platform="gemini"]) {
          --default-font-family: 'Google Sans', 'Product Sans', ui-sans-serif, -apple-system, system-ui, sans-serif;
          --tile-font-family: 'Google Sans', 'Product Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        /* ── Gemini container: matches Gemini's dark card style ── */
        :host([data-platform="gemini"]) .container {
          --container-bg: #f0f4f9;
          --container-border: 1px solid rgba(0, 0, 0, 0.08);
          --container-radius: 24px;
          --container-shadow: none;
          padding: 8px 16px;
          margin: 0 0 8px 0;
        }
        :host([data-platform="gemini"][data-theme="dark"]) .container {
          --container-bg: #1e1f20;
          --container-border: 1px solid rgba(255, 255, 255, 0.08);
        }

        /* ── Claude container: matches Claude's warm dark card ── */
        :host([data-platform="claude"]) .container {
          --container-bg: #f7f5f0;
          --container-border: 1px solid rgba(0, 0, 0, 0.06);
          --container-radius: 16px;
          padding: 6px 14px;
          margin: 0 0 6px 0;
        }
        :host([data-platform="claude"][data-theme="dark"]) .container {
          --container-bg: #35332f;
          --container-border: 1px solid rgba(255, 255, 255, 0.06);
        }

        /* ── Grok container: matches Grok's pure black card ── */
        :host([data-platform="grok"]) .container {
          --container-bg: #f7f9f9;
          --container-border: 1px solid rgba(0, 0, 0, 0.06);
          --container-radius: 20px;
          padding: 6px 14px;
          margin: 0 0 6px 0;
        }
        :host([data-platform="grok"][data-theme="dark"]) .container {
          --container-bg: #16181c;
          --container-border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .snippet-row {
          display: flex;
          align-items: flex-start;
          gap: 0;
          min-height: 36px;
        }
        .snippet-row.excluded {
          opacity: 0.45;
        }

        .snippet-toggle {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 6px 0;
          border: none;
          background: transparent;
          cursor: pointer;
          text-align: start;
          border-radius: 0.375rem;
          color: inherit;
        }
        .snippet-toggle:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px var(--token-border-brand, var(--tile-focus-ring));
        }

        .snippet-arrow {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 22px;
          color: var(--tile-muted-icon);
          margin-top: 1px;
        }

        .snippet-text {
          flex: 1;
          min-width: 0;
          font-family: var(--tile-font-family);
          font-size: var(--text-body-small-regular);
          line-height: var(--text-body-small-regular--line-height);
          letter-spacing: var(--text-body-small-regular--letter-spacing);
          font-weight: 300;
          color: var(--tile-text-color);
          display: block;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: clip;
          padding-top: 2px;
        }

        .snippet-remove {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          margin-top: 4px;
          border: none;
          background: transparent;
          color: var(--tile-remove-icon);
          cursor: pointer;
          border-radius: 6px;
          transition: color 120ms ease, background 120ms ease;
        }
        .snippet-remove:hover {
          color: var(--tile-remove-icon-hover);
          background: var(--tile-remove-hover);
        }
      </style>
      <div class="container" id="ucs-list"></div>
    `;
  }
}
