export interface BubbleHandlers {
  onAdd: () => void;
}

type PlatformTheme = "chatgpt" | "claude" | "gemini" | "grok" | "perplexity" | "default";

const detectPlatform = (): PlatformTheme => {
  const host = window.location.hostname;
  if (host === "chatgpt.com" || host === "chat.openai.com") return "chatgpt";
  if (host === "claude.ai") return "claude";
  if (host === "gemini.google.com") return "gemini";
  if (host === "grok.com" || (host === "x.com" && window.location.pathname.startsWith("/i/grok"))) return "grok";
  if (host.includes("perplexity")) return "perplexity";
  return "default";
};

const platformLabel: Record<PlatformTheme, string> = {
  chatgpt: "Add Context",
  claude: "Add Context",
  gemini: "Add Context",
  grok: "Add Context",
  perplexity: "Add Context",
  default: "Add Context"
};

export class ActionBubble {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private handlers: BubbleHandlers;
  private themeObserver: MutationObserver | null = null;
  private colorSchemeQuery: MediaQueryList | null = null;
  private platform: PlatformTheme;

  constructor(handlers: BubbleHandlers) {
    this.handlers = handlers;
    this.platform = detectPlatform();
    this.host = document.createElement("div");
    this.host.id = "ucs-bubble-host";
    this.host.style.position = "fixed";
    this.host.style.zIndex = "2147483647";
    this.host.style.top = "0";
    this.host.style.left = "0";
    this.host.style.display = "none";
    this.host.style.pointerEvents = "none";
    this.host.dataset.platform = this.platform;
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = this.template();
    document.documentElement.appendChild(this.host);
    this.bindTheme();

    // Prevent mousedown from collapsing the native text selection
    this.root.getElementById("ucs-add-btn")?.addEventListener("mousedown", (e) => {
      e.preventDefault();
    });
    this.root.getElementById("ucs-add-btn")?.addEventListener("click", () => this.handlers.onAdd());
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

  show(x: number, y: number): void {
    if (!this.host.isConnected) {
      document.documentElement.appendChild(this.host);
    }
    this.host.style.display = "block";
    this.host.style.left = `${x}px`;
    this.host.style.top = `${y}px`;
  }

  hide(): void {
    this.host.style.display = "none";
  }

  contains(target: EventTarget | null): boolean {
    if (!(target instanceof Node)) {
      return false;
    }
    return this.host.contains(target) || this.root.contains(target);
  }

  private template(): string {
    const label = platformLabel[this.platform];
    const fontUrl = typeof chrome !== "undefined" && chrome.runtime?.getURL
      ? chrome.runtime.getURL("fonts/Google_Sans.ttf")
      : "";

    // SVG icon: reply/quote arrow matching the native "Ask ChatGPT" / "Ask Gemini" button
    const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="icon"><polyline points="15 10 20 15 15 20"></polyline><path d="M4 4v7a4 4 0 0 0 4 4h12"></path></svg>`;

    return `
      <style>
        ${fontUrl ? `@font-face {
          font-family: 'Google Sans';
          src: url('${fontUrl}') format('truetype');
          font-weight: 100 900;
          font-style: normal;
          font-display: swap;
        }` : ""}

        :host { all: initial; }

        /* ─── Base / ChatGPT ─── */
        :host {
          --btn-bg: #ffffff;
          --btn-text: #0d0d0d;
          --btn-shadow: 0 4px 14px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
          --btn-shadow-hover: 0 6px 20px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.08);
          --btn-radius: 12px;
          --btn-padding: 10px 16px;
          --btn-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
          --btn-size: 14px;
          --btn-weight: 500;
          --btn-gap: 6px;
          --icon-size: 18px;
        }
        :host([data-theme="dark"]) {
          --btn-bg: #2f2f2f;
          --btn-text: #ececec;
          --btn-shadow: 0 4px 14px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.08);
          --btn-shadow-hover: 0 6px 20px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.12);
        }

        /* ─── Claude ─── */
        :host([data-platform="claude"]) {
          --btn-bg: #eae5dc;
          --btn-text: #3d3929;
          --btn-shadow: 0 3px 10px rgba(60, 50, 30, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05);
          --btn-shadow-hover: 0 5px 16px rgba(60, 50, 30, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.08);
          --btn-radius: 12px;
        }
        :host([data-platform="claude"][data-theme="dark"]) {
          --btn-bg: #3d3b37;
          --btn-text: #e9e0d0;
          --btn-shadow: 0 3px 10px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.06);
          --btn-shadow-hover: 0 5px 16px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.1);
        }

        /* ─── Gemini: replicate the native "Ask Gemini" popover exactly ─── */
        :host([data-platform="gemini"]) {
          --btn-bg: #ffffff;
          --btn-text: #1f1f1f;
          --btn-shadow: 0 2px 12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.04);
          --btn-shadow-hover: 0 4px 18px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(0, 0, 0, 0.06);
          --btn-radius: 12px;
          --btn-font: 'Google Sans', 'Product Sans', ui-sans-serif, system-ui, sans-serif;
          --btn-size: 14px;
          --btn-weight: 500;
        }
        :host([data-platform="gemini"][data-theme="dark"]) {
          --btn-bg: #37393b;
          --btn-text: #e3e3e3;
          --btn-shadow: 0 2px 12px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.06);
          --btn-shadow-hover: 0 4px 18px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.1);
        }

        /* ─── Grok ─── */
        :host([data-platform="grok"]) {
          --btn-bg: #ffffff;
          --btn-text: #0f1419;
          --btn-shadow: 0 2px 10px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.04);
          --btn-shadow-hover: 0 4px 16px rgba(0, 0, 0, 0.16), 0 0 0 1px rgba(0, 0, 0, 0.06);
          --btn-radius: 12px;
        }
        :host([data-platform="grok"][data-theme="dark"]) {
          --btn-bg: #1d1f23;
          --btn-text: #e7e9ea;
          --btn-shadow: 0 2px 10px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.08);
          --btn-shadow-hover: 0 4px 16px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.12);
        }

        *, *::before, *::after { box-sizing: border-box; }

        .shell {
          display: inline-flex;
          overflow: hidden;
          border-radius: var(--btn-radius);
          pointer-events: auto;
          opacity: 0;
          transform: translateY(3px) scale(0.97);
          animation: pop-in 160ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
          box-shadow: var(--btn-shadow);
          transition: box-shadow 150ms ease;
        }
        .shell:hover {
          box-shadow: var(--btn-shadow-hover);
        }

        button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--btn-gap);
          border: none;
          border-radius: var(--btn-radius);
          padding: var(--btn-padding);
          cursor: pointer;
          font-family: var(--btn-font);
          font-size: var(--btn-size);
          font-weight: var(--btn-weight);
          line-height: 1;
          letter-spacing: 0;
          white-space: nowrap;
          color: var(--btn-text);
          background: var(--btn-bg);
          transition: opacity 100ms ease;
          -webkit-user-select: none;
          user-select: none;
        }
        button:active {
          opacity: 0.8;
        }

        .icon {
          flex-shrink: 0;
          width: var(--icon-size);
          height: var(--icon-size);
          color: inherit;
        }

        @keyframes pop-in {
          from { opacity: 0; transform: translateY(4px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)  scale(1);    }
        }
      </style>
      <div class="shell">
        <button id="ucs-add-btn" type="button">
          ${icon}
          <span>${label}</span>
        </button>
      </div>
    `;
  }
}
