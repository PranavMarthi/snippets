export interface BubbleHandlers {
  onAdd: () => void;
}

export class ActionBubble {
  private host: HTMLDivElement;
  private root: ShadowRoot;
  private handlers: BubbleHandlers;
  private themeObserver: MutationObserver | null = null;
  private colorSchemeQuery: MediaQueryList | null = null;

  constructor(handlers: BubbleHandlers) {
    this.handlers = handlers;
    this.host = document.createElement("div");
    this.host.id = "ucs-bubble-host";
    this.host.style.position = "fixed";
    this.host.style.zIndex = "2147483647";
    this.host.style.top = "0";
    this.host.style.left = "0";
    this.host.style.display = "none";
    this.host.style.pointerEvents = "none";
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = this.template();
    document.documentElement.appendChild(this.host);
    this.bindTheme();

    this.root.getElementById("ucs-add-btn")?.addEventListener("click", () => this.handlers.onAdd());
  }

  private bindTheme(): void {
    const applyTheme = (): void => {
      const doc = document.documentElement;
      const className = (doc.className || "").toLowerCase();
      const dataTheme = (doc.getAttribute("data-theme") || "").toLowerCase();
      const colorScheme = (doc.style.colorScheme || "").toLowerCase();
      const prefersDark = this.colorSchemeQuery?.matches ?? false;
      const isDark =
        className.includes("dark") ||
        dataTheme.includes("dark") ||
        colorScheme.includes("dark") ||
        prefersDark;
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

    applyTheme();
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
    return `
      <style>
        :host { all: initial; }
        :host {
          --bubble-border: rgba(15, 23, 42, 0.16);
          --bubble-bg: #ffffff;
          --bubble-text: #121212;
          --bubble-shadow: 0 3px 10px rgba(15, 23, 42, 0.18);
          --bubble-hover-border: rgba(15, 23, 42, 0.26);
          --bubble-hover-shadow: 0 6px 16px rgba(15, 23, 42, 0.22);
        }
        :host([data-theme="dark"]) {
          --bubble-border: rgba(255, 255, 255, 0.22);
          --bubble-bg: #202123;
          --bubble-text: rgba(255, 255, 255, 0.94);
          --bubble-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
          --bubble-hover-border: rgba(255, 255, 255, 0.35);
          --bubble-hover-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
        }
        *, *::before, *::after { box-sizing: border-box; }
        .wrap {
          display: inline-flex;
          align-items: center;
          pointer-events: auto;
          opacity: 0;
          transform: translateY(3px) scale(0.985);
          animation: fade-in 140ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
        }
        button {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          border: 1px solid var(--bubble-border);
          border-radius: 22px;
          padding: 12px 28px;
          cursor: pointer;
          font-weight: 500;
          letter-spacing: -0.01em;
          font-size: 18px;
          line-height: 1;
          color: var(--bubble-text);
          background: var(--bubble-bg);
          box-shadow: var(--bubble-shadow);
          transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
        }
        button:hover {
          transform: translateY(-1px);
          border-color: var(--bubble-hover-border);
          box-shadow: var(--bubble-hover-shadow);
        }
        button:active {
          transform: translateY(0);
        }
        .mark {
          font-size: 28px;
          line-height: 0.7;
          transform: translateY(-2px);
        }
        .label {
          font-size: 18px;
          line-height: 1;
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(4px) scale(0.98); filter: blur(2px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
      </style>
      <div class="wrap">
        <button id="ucs-add-btn" type="button"><span class="mark">”</span><span class="label">Ask ChatGPT</span></button>
      </div>
    `;
  }
}
