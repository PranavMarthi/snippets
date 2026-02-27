import { ContextStackState, Snippet } from "../shared/types";

export interface SidebarHandlers {
  onDelete: (id: string) => void;
  onClear: () => void;
  onCopyAll: () => void;
  onReorder: (from: number, to: number) => void;
  onInjectSelected: (ids: string[]) => void;
}

type SidebarPlatform = "chatgpt" | "claude" | "gemini" | "grok" | "deepseek" | "qwen" | "perplexity" | "default";

const detectSidebarPlatform = (): SidebarPlatform => {
  const host = window.location.hostname;
  if (host === "chatgpt.com" || host === "chat.openai.com") return "chatgpt";
  if (host === "claude.ai") return "claude";
  if (host === "gemini.google.com") return "gemini";
  if (host === "grok.com" || (host === "x.com" && window.location.pathname.startsWith("/i/grok"))) return "grok";
  if (host === "chat.deepseek.com" || host === "deepseek.com" || host === "www.deepseek.com") return "deepseek";
  if (host === "chat.qwen.ai" || host === "qwen.ai" || host === "www.qwen.ai") return "qwen";
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
      if (this.platform === "chatgpt" || this.platform === "grok" || this.platform === "deepseek" || this.platform === "qwen") {
        // ChatGPT, Grok, DeepSeek & Qwen: prepend inside the container (full width)
        if (this.host.parentElement !== target || target.firstElementChild !== this.host) {
          target.prepend(this.host);
        }
        if (this.platform === "chatgpt") {
          this.applyInlineStyles();
        } else {
          this.applyAboveComposerStyles();
        }
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

    if (this.platform === "grok" || this.platform === "deepseek" || this.platform === "qwen") {
      // Grok/DeepSeek/Qwen: prepended inside the composer shell, use full width layout
      this.host.style.position = "relative";
      this.host.style.width = "100%";
      this.host.style.maxWidth = "100%";
      this.host.style.height = "auto";
      this.host.style.maxHeight = "none";
      this.host.style.minHeight = "0";
      this.host.style.overflow = "visible";
      this.host.style.boxSizing = "border-box";
      this.host.style.margin = "0";
      this.host.style.marginBottom = "8px";
      this.host.style.padding = "0";
      this.host.style.left = "";
      this.host.style.top = "";
      this.host.style.bottom = "";
      this.host.style.transform = "none";
      this.host.style.gridColumn = "";
      this.host.style.zIndex = "1";
      if (this.platform === "deepseek") {
        this.host.style.marginBottom = "6px";
      }
      if (this.platform === "qwen") {
        this.host.style.marginBottom = "6px";
      }
      return;
    }

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
      deepseek: "118px",
      qwen: "112px",
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

        :host([data-platform="grok"]) {
          width: 100% !important;
          height: auto !important;
          max-height: none !important;
          overflow: visible !important;
          box-sizing: border-box !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        :host([data-platform="deepseek"]) {
          width: 100% !important;
          height: auto !important;
          max-height: none !important;
          overflow: visible !important;
          box-sizing: border-box !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        :host([data-platform="qwen"]) {
          width: 100% !important;
          height: auto !important;
          max-height: none !important;
          overflow: visible !important;
          box-sizing: border-box !important;
          margin: 0 !important;
          padding: 0 !important;
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

        /* ── DeepSeek theme (cool blue-gray) ── */
        :host([data-platform="deepseek"]) {
          --tile-text-color: #cfd8ee;
          --tile-muted-icon: rgba(166, 187, 238, 0.7);
          --tile-remove-icon: rgba(166, 187, 238, 0.66);
          --tile-remove-hover: rgba(166, 187, 238, 0.12);
          --tile-remove-icon-hover: rgba(209, 224, 255, 0.96);
          --tile-focus-ring: rgba(96, 142, 230, 0.62);
        }
        :host([data-platform="deepseek"][data-theme="dark"]) {
          --tile-text-color: #dbe6ff;
          --tile-muted-icon: rgba(180, 198, 240, 0.74);
          --tile-remove-icon: rgba(180, 198, 240, 0.7);
          --tile-remove-hover: rgba(180, 198, 240, 0.14);
          --tile-remove-icon-hover: rgba(222, 233, 255, 0.98);
          --tile-focus-ring: rgba(108, 153, 241, 0.72);
        }

        /* ── Qwen theme (charcoal ant-style) ── */
        :host([data-platform="qwen"]) {
          --tile-text-color: #e6eaf4;
          --tile-muted-icon: rgba(198, 208, 231, 0.72);
          --tile-remove-icon: rgba(198, 208, 231, 0.66);
          --tile-remove-hover: rgba(198, 208, 231, 0.14);
          --tile-remove-icon-hover: rgba(237, 242, 255, 0.98);
          --tile-focus-ring: rgba(151, 168, 213, 0.7);
        }
        :host([data-platform="qwen"][data-theme="dark"]) {
          --tile-text-color: #ecf0fb;
          --tile-muted-icon: rgba(205, 214, 237, 0.74);
          --tile-remove-icon: rgba(205, 214, 237, 0.68);
          --tile-remove-hover: rgba(205, 214, 237, 0.16);
          --tile-remove-icon-hover: rgba(242, 247, 255, 1);
          --tile-focus-ring: rgba(165, 182, 226, 0.76);
        }

        /* ── Grok font sizing ── */
        :host([data-platform="grok"]) {
          --text-body-small-regular: 0.9375rem;
          --text-body-small-regular--line-height: 1.25rem;
        }

        *, *::before, *::after { box-sizing: border-box; }

        .container {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 6px 12px 4px 12px;
          font-family: var(--default-font-family);
          --container-bg: transparent;
          --container-border: none;
          --container-radius: 0;
          --container-padding: 6px 12px 4px 12px;
          --container-margin: 0;
          --container-shadow: none;
          --container-gap: 4px;
          background: var(--container-bg);
          border: var(--container-border);
          border-radius: var(--container-radius);
          box-shadow: var(--container-shadow);
          gap: var(--container-gap);
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
          --container-gap: 4px;
          padding: 12px 16px;
          margin: 0 0 8px 0;
          height: auto !important;
          max-height: none !important;
          min-height: 40px;
          overflow: visible !important;
          flex-direction: column !important;
          width: 100% !important;
          box-sizing: border-box !important;
          display: flex !important;
        }
        :host([data-platform="grok"][data-theme="dark"]) .container {
          --container-bg: #16181c;
          --container-border: 1px solid rgba(255, 255, 255, 0.08);
        }

        /* ── DeepSeek container: inset tiles inside composer shell ── */
        :host([data-platform="deepseek"]) .container {
          --container-bg: transparent;
          --container-border: none;
          --container-radius: 0;
          --container-gap: 5px;
          padding: 8px 12px 4px 12px;
          margin: 0;
        }

        /* ── Qwen container: inline chips above textarea ── */
        :host([data-platform="qwen"]) .container {
          --container-bg: transparent;
          --container-border: none;
          --container-radius: 0;
          --container-gap: 6px;
          padding: 8px 12px 4px 12px;
          margin: 0;
        }

        .snippet-row {
          display: flex;
          align-items: center;
          gap: 0;
          min-height: 40px;
          width: 100%;
          flex-shrink: 0;
        }
        :host([data-platform="grok"]) .snippet-row {
          min-height: 40px;
          margin-bottom: 2px;
          width: 100% !important;
          display: flex !important;
          flex-direction: row !important;
        }
        :host([data-platform="deepseek"]) .snippet-row {
          min-height: 36px;
          margin-bottom: 0;
          align-items: center;
          gap: 4px;
          border-radius: 12px;
          border: 1px solid rgba(138, 162, 216, 0.22);
          background: rgba(37, 42, 56, 0.58);
          padding: 1px 4px 1px 2px;
          transition: border-color 120ms ease, background 120ms ease;
        }
        :host([data-platform="deepseek"]) .snippet-row:hover {
          border-color: rgba(159, 182, 237, 0.34);
          background: rgba(40, 46, 61, 0.7);
        }
        :host([data-platform="deepseek"][data-theme="dark"]) .snippet-row {
          border: 1px solid rgba(148, 170, 224, 0.28);
          background: rgba(38, 44, 59, 0.72);
        }
        :host([data-platform="deepseek"][data-theme="dark"]) .snippet-row:hover {
          border-color: rgba(168, 192, 247, 0.42);
          background: rgba(41, 48, 64, 0.84);
        }
        :host([data-platform="qwen"]) .snippet-row {
          min-height: 36px;
          margin-bottom: 0;
          align-items: center;
          gap: 4px;
          border-radius: 12px;
          border: 1px solid rgba(169, 181, 213, 0.24);
          background: rgba(47, 49, 56, 0.72);
          padding: 1px 4px 1px 2px;
          transition: border-color 120ms ease, background 120ms ease;
        }
        :host([data-platform="qwen"]) .snippet-row:hover {
          border-color: rgba(186, 198, 231, 0.4);
          background: rgba(54, 57, 66, 0.86);
        }
        :host([data-platform="qwen"][data-theme="dark"]) .snippet-row {
          border: 1px solid rgba(176, 188, 220, 0.3);
          background: rgba(46, 48, 56, 0.82);
        }
        :host([data-platform="qwen"][data-theme="dark"]) .snippet-row:hover {
          border-color: rgba(196, 208, 240, 0.46);
          background: rgba(55, 58, 68, 0.9);
        }
        .snippet-row.excluded {
          opacity: 0.45;
        }

        .snippet-toggle {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 0;
          border: none;
          background: transparent;
          cursor: pointer;
          text-align: start;
          border-radius: 0.375rem;
          color: inherit;
        }
        :host([data-platform="grok"]) .snippet-toggle {
          padding: 8px 0;
          gap: 10px;
        }
        :host([data-platform="deepseek"]) .snippet-toggle {
          padding: 6px 8px;
          gap: 8px;
          border-radius: 10px;
          border: none;
          background: transparent;
        }
        :host([data-platform="qwen"]) .snippet-toggle {
          padding: 6px 8px;
          gap: 8px;
          border-radius: 10px;
          border: none;
          background: transparent;
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
          height: 20px;
          color: var(--tile-muted-icon);
          margin-top: 0;
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
          padding-top: 0;
        }
        :host([data-platform="deepseek"]) .snippet-text {
          font-weight: 400;
          letter-spacing: -0.01rem;
          font-size: 0.9rem;
          line-height: 1.2rem;
        }
        :host([data-platform="qwen"]) .snippet-text {
          font-weight: 400;
          letter-spacing: -0.01rem;
          font-size: 0.9rem;
          line-height: 1.2rem;
        }
        :host([data-platform="deepseek"]) .snippet-arrow {
          width: 18px;
          height: 18px;
        }
        :host([data-platform="qwen"]) .snippet-arrow {
          width: 18px;
          height: 18px;
        }

        .snippet-remove {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          margin-top: 0;
          align-self: center;
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
        :host([data-platform="deepseek"]) .snippet-remove {
          width: 26px;
          height: 26px;
          border-radius: 999px;
          border: none;
          background: transparent;
          opacity: 0.86;
        }
        :host([data-platform="deepseek"][data-theme="dark"]) .snippet-remove {
          border: none;
          background: transparent;
        }
        :host([data-platform="deepseek"]) .snippet-remove:hover {
          color: rgba(222, 233, 255, 0.98);
          background: rgba(162, 185, 236, 0.16);
        }
        :host([data-platform="qwen"]) .snippet-remove {
          width: 26px;
          height: 26px;
          border-radius: 999px;
          border: none;
          background: transparent;
          opacity: 0.88;
        }
        :host([data-platform="qwen"][data-theme="dark"]) .snippet-remove {
          border: none;
          background: transparent;
        }
        :host([data-platform="qwen"]) .snippet-remove:hover {
          color: rgba(242, 247, 255, 1);
          background: rgba(188, 200, 234, 0.2);
        }
      </style>
      <div class="container" id="ucs-list"></div>
    `;
  }
}
