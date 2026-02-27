import { ContextStackEngine, formatCompiledContext } from "../engine/contextStack";
import { storageManager } from "../storage/storageManager";
import { ContextStackState, RuntimeMessage } from "../shared/types";
import { debounce, throttle } from "../shared/utils";
import { ActionBubble } from "../ui/bubble";
import { SidebarPanel } from "../ui/sidebar";
import { SiteAdapterManager } from "./adapterManager";
import { ChatGPTAdapter } from "./adapters/chatgptAdapter";
import { ClaudeAdapter } from "./adapters/claudeAdapter";
import { PerplexityAdapter } from "./adapters/perplexityAdapter";
import { GeminiAdapter } from "./adapters/geminiAdapter";
import { GrokAdapter } from "./adapters/grokAdapter";

const contextEngine = new ContextStackEngine();
const adapterManager = new SiteAdapterManager([
  new ChatGPTAdapter(),
  new ClaudeAdapter(),
  new PerplexityAdapter(),
  new GeminiAdapter(),
  new GrokAdapter()
]);
adapterManager.detect();

const getAdapter = () => adapterManager.getActiveAdapter();
const isChatGPTActive = (): boolean => getAdapter()?.name === "ChatGPT";
const CONTEXT_MARKER = "### SELECTED CONTEXT (User-Collected)";
const PAGE_PATCH_EVENT = "UCS_PAGE_PATCH_EVENT";
const PAGE_PATCH_SOURCE = "ucs-page-bridge";

type PagePatchEventDetail = {
  source: string;
  direction: "to-page" | "to-content";
  type: string;
  context?: string;
  ok?: boolean;
  txId?: number;
};

const EMPTY_STATE: ContextStackState = { snippets: [], totalChars: 0, updatedAt: Date.now() };
let latestContextState: ContextStackState = EMPTY_STATE;

const isSelectionInInput = (selection: Selection): boolean => {
  const node = selection.anchorNode;
  if (!node) return true;
  const element = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement | null;
  if (!element) return true;

  // Only consider actual form input elements as "input" — not contenteditable divs
  // which are used as chat editors on most AI platforms
  const inputAncestor = element.closest("input, textarea");
  if (!inputAncestor) return false;

  // If the input/textarea is also the chat editor, don't suppress the bubble
  const adapter = getAdapter();
  const editor = adapter?.getEditorElement();
  if (editor && (inputAncestor === editor || editor.contains(inputAncestor))) {
    return true; // Selection IS in the chat editor input — suppress bubble
  }

  return true; // Selection is in some other input/textarea — suppress bubble
};

const getSelectionRect = (selection: Selection): DOMRect | null => {
  if (selection.rangeCount < 1) {
    return null;
  }
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) {
    return rect;
  }

  const clientRects = range.getClientRects();
  if (clientRects.length > 0) {
    return clientRects[clientRects.length - 1] ?? clientRects[0] ?? null;
  }

  return null;
};

const compileAndInjectAll = async (ids?: string[]): Promise<boolean> => {
  const adapter = getAdapter();
  if (!adapter) return false;

  const state = await contextEngine.getState();
  if (!state.snippets.length) return false;

  const snippets = ids?.length ? state.snippets.filter((snippet) => ids.includes(snippet.id)) : state.snippets;
  if (!snippets.length) {
    return false;
  }

  const payload = formatCompiledContext(snippets);
  return adapter.insertText(payload);
};

const addSelectionToContext = async (text: string): Promise<void> => {
  const normalized = text.trim();
  if (normalized.length < 3) {
    return;
  }

  const result = await contextEngine.addSnippet({
    text: normalized,
    sourceUrl: window.location.href
  });

  if (result.ok) {
    sidebar.toggle(true);
    setSidebarState(result.state);
  }
};

const copyCompiledContext = async (ids?: string[]): Promise<void> => {
  const state = await contextEngine.getState();
  const snippets = ids?.length ? state.snippets.filter((snippet) => ids.includes(snippet.id)) : state.snippets;
  const text = formatCompiledContext(snippets);
  await navigator.clipboard.writeText(text);
};

const clearContextAfterSend = (): void => {
  resolveSendTransaction();
  dispatchPagePatchEvent({ type: "clear-context" });
  void contextEngine.clear().then((next) => setSidebarState(next));
};

/**
 * For non-ChatGPT platforms (Claude, Gemini, Grok, Perplexity):
 * Inject context directly into the editor DOM before the send completes.
 * Returns true if context was injected.
 */
const injectContextIntoEditorDOM = (): boolean => {
  if (!sidebar.getIncludedIds().length) {
    return false;
  }

  const compiledContext = getCompiledSelectedContext();
  if (!compiledContext) {
    return false;
  }

  const adapter = getAdapter();
  if (!adapter) {
    return false;
  }

  const editor = adapter.getEditorElement();
  if (!editor) {
    return false;
  }

  // Check if context is already injected (prevent duplicates)
  const currentText = editor instanceof HTMLTextAreaElement
    ? editor.value
    : editor.textContent ?? "";
  if (currentText.includes(CONTEXT_MARKER)) {
    return true;
  }

  // For contenteditable elements, prepend context before existing content
  if (editor instanceof HTMLTextAreaElement) {
    const originalValue = editor.value;
    const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (nativeSet) {
      nativeSet.call(editor, `${compiledContext}\n${originalValue}`);
    } else {
      editor.value = `${compiledContext}\n${originalValue}`;
    }
    editor.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    // contenteditable div — use execCommand for undo-stack compatibility
    editor.focus();

    // Move cursor to start
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(editor);
    range.collapse(true); // collapse to start
    sel?.removeAllRanges();
    sel?.addRange(range);

    // Insert context at start
    document.execCommand("insertText", false, `${compiledContext}\n`);
  }

  // Schedule context clear after a short delay to let the send complete
  window.setTimeout(() => {
    void contextEngine.clear().then((next) => setSidebarState(next));
  }, 300);

  return true;
};

const dispatchPagePatchEvent = (detail: Omit<PagePatchEventDetail, "source" | "direction">): void => {
  document.dispatchEvent(
    new CustomEvent<PagePatchEventDetail>(PAGE_PATCH_EVENT, {
      detail: {
        source: PAGE_PATCH_SOURCE,
        direction: "to-page",
        ...detail
      }
    })
  );
};

const getCompiledSelectedContext = (): string | null => {
  const includedIds = sidebar.getIncludedIds();
  if (!includedIds.length) {
    return null;
  }

  const snippets = latestContextState.snippets.filter((snippet) => includedIds.includes(snippet.id));
  if (!snippets.length) {
    return null;
  }

  return formatCompiledContext(snippets);
};

const setSidebarState = (state: ContextStackState): void => {
  latestContextState = state;
  sidebar.setState(state);
};

const sidebar = new SidebarPanel({
  onDelete: async (id: string) => {
    const next = await contextEngine.removeSnippet(id);
    setSidebarState(next);
  },
  onClear: async () => {
    const next = await contextEngine.clear();
    setSidebarState(next);
  },
  onCopyAll: async () => {
    await copyCompiledContext(sidebar.getIncludedIds());
  },
  onReorder: async (from, to) => {
    const next = await contextEngine.reorderSnippet(from, to);
    setSidebarState(next);
  },
  onInjectSelected: async (ids) => {
    await compileAndInjectAll(ids);
  }
});

let latestSelectedText = "";
let pendingNativeAskSelection = "";
let lastStableSelectionText = "";
let lastStableSelectionAt = 0;

const bubble = new ActionBubble({
  onAdd: async () => {
    const text = latestSelectedText || lastStableSelectionText;
    if (!text) return;
    await addSelectionToContext(text);
    // Don't hide — let the user click "Add Context" again for the same selection
  }
});

let lastMousePoint: { x: number; y: number } | null = null;

const updateSelectionUI = () => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    bubble.hide();
    latestSelectedText = "";
    return;
  }

  if (isSelectionInInput(selection)) {
    bubble.hide();
    latestSelectedText = "";
    return;
  }

  const text = selection.toString().trim();
  if (text.length < 3) {
    bubble.hide();
    latestSelectedText = "";
    return;
  }

  latestSelectedText = text;
  lastStableSelectionText = text;
  lastStableSelectionAt = Date.now();

  if (isChatGPTActive()) {
    bubble.hide();
    return;
  }

  const rect = getSelectionRect(selection);
  const x = rect
    ? Math.min(window.innerWidth - 250, Math.max(8, rect.right - 160))
    : Math.min(window.innerWidth - 250, Math.max(8, (lastMousePoint?.x ?? 200) - 160));
  const y = rect ? Math.max(8, rect.top - 48) : Math.max(8, (lastMousePoint?.y ?? 120) - 48);
  bubble.show(x, y);
};

const normalizeControlText = (value: string | null | undefined): string =>
  (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();

const isNativeAskLabel = (value: string): boolean => {
  if (!value) {
    return false;
  }

  if (value.includes("ask chatgpt") || value.includes("ask chat gpt")) {
    return true;
  }

  return value.includes("ask") && value.includes("chatgpt");
};

const isButtonLikeElement = (element: Element): boolean => {
  if (element instanceof HTMLButtonElement) {
    return true;
  }
  if (element.getAttribute("role") === "button") {
    return true;
  }
  if (element instanceof HTMLDivElement && element.tabIndex >= 0) {
    return true;
  }

  return false;
};

const elementLooksLikeNativeAskControl = (element: Element): boolean => {
  const candidateText = normalizeControlText(
    [
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-testid"),
      element.id
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (isNativeAskLabel(candidateText)) {
    return true;
  }

  const className = element.className;
  const hasNativeAskClasses =
    typeof className === "string" && className.includes("btn") && className.includes("btn-secondary");
  const insideNativeAskShell =
    !!element.closest("div.shadow-long.flex.overflow-hidden.rounded-xl") ||
    !!element.closest("div.shadow-long") ||
    !!element.closest("[class*='shadow-long']");

  return hasNativeAskClasses && insideNativeAskShell;
};

const findNativeAskButton = (target: EventTarget | null, event?: Event): Element | null => {
  const path = event?.composedPath?.() ?? [];
  for (const node of path) {
    if (!(node instanceof Element)) {
      continue;
    }

    const control = isButtonLikeElement(node) ? node : node.closest("button, [role='button']");
    if (!(control instanceof Element)) {
      continue;
    }

    if (elementLooksLikeNativeAskControl(control)) {
      return control;
    }
  }

  if (!(target instanceof Element)) {
    return null;
  }

  const control = target.closest("button, [role='button']");
  if (!(control instanceof Element)) {
    return null;
  }

  if (elementLooksLikeNativeAskControl(control)) {
    return control;
  }

  return null;
};

const findSubmitButton = (target: EventTarget | null): HTMLElement | null => {
  if (!(target instanceof Element)) {
    return null;
  }

  const button = target.closest("button, [role='button']");
  if (!(button instanceof HTMLElement)) {
    return null;
  }

  // ChatGPT-specific selectors
  if (button.id === "composer-submit-button") {
    return button;
  }

  if (button.dataset.testid === "send-button") {
    return button;
  }

  // Gemini: button.send-button class
  if (button.classList.contains("send-button")) {
    return button;
  }

  const normalizedText = normalizeControlText(
    [
      button.getAttribute("aria-label"),
      button.getAttribute("title"),
      button.textContent,
      button.dataset.testid,
      button.id
    ]
      .filter(Boolean)
      .join(" ")
  );

  // Generic send-button detection (works across platforms)
  const looksLikeSendControl =
    normalizedText.includes("send-button") ||
    normalizedText.includes("send prompt") ||
    normalizedText.includes("send message") ||
    normalizedText.includes("send reply") ||
    (normalizedText.includes("send") && (normalizedText.includes("prompt") || normalizedText.includes("message") || normalizedText.includes("reply")));
  if (looksLikeSendControl) {
    return button;
  }

  // Claude: send button has aria-label containing "Send" or "Reply"
  const ariaLabel = (button.getAttribute("aria-label") ?? "").toLowerCase();
  if (ariaLabel === "send message" || ariaLabel === "send" || ariaLabel === "reply") {
    return button;
  }

  // Gemini: send button typically has aria-label "Send message"
  if (ariaLabel.includes("send message") || ariaLabel.includes("send prompt")) {
    return button;
  }

  // Grok: look for submit-type buttons inside the chat form
  if (button.getAttribute("type") === "submit") {
    return button;
  }

  // Look for SVG-only send buttons (common pattern: button with only an SVG child, near the editor)
  const hasSvgChild = button.querySelector("svg") !== null;
  const hasMinimalText = (button.textContent ?? "").trim().length < 3;
  const nearEditor = !!button.closest("form, [class*='composer'], [class*='input'], [class*='chat'], [class*='prompt']");
  if (hasSvgChild && hasMinimalText && nearEditor) {
    // Further check: is this near the bottom of the page (where chat inputs live)?
    const rect = button.getBoundingClientRect();
    if (rect.bottom > window.innerHeight * 0.5) {
      return button;
    }
  }

  const composerForm = button.closest("form[data-type='unified-composer']");
  const isSubmitType = (button.getAttribute("type") ?? "").toLowerCase() === "submit";
  if (composerForm && isSubmitType) {
    return button;
  }

  return null;
};

const getMessageText = (message: Record<string, unknown>): string | null => {
  const content = message.content;
  if (typeof content === "string") {
    return content;
  }

  if (content && typeof content === "object") {
    const contentRecord = content as Record<string, unknown>;
    if (typeof contentRecord.text === "string") {
      return contentRecord.text;
    }

    if (Array.isArray(contentRecord.parts)) {
      const firstPart = contentRecord.parts.find((part) => typeof part === "string");
      if (typeof firstPart === "string") {
        return firstPart;
      }
    }
  }

  if (typeof message.text === "string") {
    return message.text;
  }

  return null;
};

const setMessageText = (message: Record<string, unknown>, value: string): boolean => {
  const content = message.content;
  if (typeof content === "string") {
    message.content = value;
    return true;
  }

  if (content && typeof content === "object") {
    const contentRecord = content as Record<string, unknown>;
    if (typeof contentRecord.text === "string") {
      contentRecord.text = value;
      return true;
    }

    if (Array.isArray(contentRecord.parts)) {
      const parts = [...contentRecord.parts];
      const index = parts.findIndex((part) => typeof part === "string");
      if (index >= 0) {
        parts[index] = value;
      } else {
        parts.unshift(value);
      }
      contentRecord.parts = parts;
      return true;
    }
  }

  if (typeof message.text === "string") {
    message.text = value;
    return true;
  }

  return false;
};

const injectContextIntoPayload = (payload: Record<string, unknown>, context: string): boolean => {
  if (typeof payload.prompt === "string") {
    const prompt = payload.prompt;
    if (!prompt.includes(CONTEXT_MARKER)) {
      payload.prompt = `${context}\n${prompt}`;
    }
    return true;
  }

  if (typeof payload.input === "string") {
    const input = payload.input;
    if (!input.includes(CONTEXT_MARKER)) {
      payload.input = `${context}\n${input}`;
    }
    return true;
  }

  if (Array.isArray(payload.input)) {
    const inputItems = [...payload.input];
    const userIndex = inputItems.findIndex((entry) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const record = entry as Record<string, unknown>;
      return record.role === "user" && typeof record.content === "string";
    });

    if (userIndex >= 0) {
      const userMessage = inputItems[userIndex] as Record<string, unknown>;
      const content = userMessage.content as string;
      if (!content.includes(CONTEXT_MARKER)) {
        userMessage.content = `${context}\n${content}`;
      }
      payload.input = inputItems;
      return true;
    }
  }

  if (!Array.isArray(payload.messages)) {
    return false;
  }

  for (let i = payload.messages.length - 1; i >= 0; i -= 1) {
    const candidate = payload.messages[i];
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const message = candidate as Record<string, unknown>;
    const role =
      (typeof message.role === "string" ? message.role : null) ??
      (message.author && typeof message.author === "object" && typeof (message.author as Record<string, unknown>).role === "string"
        ? ((message.author as Record<string, unknown>).role as string)
        : null);

    if (role !== "user") {
      continue;
    }

    const currentText = getMessageText(message);
    if (!currentText) {
      return false;
    }

    if (currentText.includes(CONTEXT_MARKER)) {
      return true;
    }

    return setMessageText(message, `${context}\n${currentText}`);
  }

  return false;
};

let fetchPatchInstalled = false;
let sendTxCounter = 0;
let pagePatchEventsBound = false;
let activeSendTxId: number | null = null;
const pendingClearTimers = new Map<number, number>();

const scheduleFallbackClear = (txId: number): void => {
  const timer = window.setTimeout(() => {
    resolveSendTransaction(txId);
    clearContextAfterSend();
  }, 5000);
  pendingClearTimers.set(txId, timer);
};

const resolveSendTransaction = (txId?: number): void => {
  if (typeof txId === "number") {
    if (activeSendTxId === txId) {
      activeSendTxId = null;
    }
    const timer = pendingClearTimers.get(txId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      pendingClearTimers.delete(txId);
    }
  } else {
    activeSendTxId = null;
    for (const [key, timer] of pendingClearTimers) {
      window.clearTimeout(timer);
      pendingClearTimers.delete(key);
    }
  }
};

const beginSendTransaction = (context: string): number => {
  if (activeSendTxId !== null) {
    return activeSendTxId;
  }

  const txId = ++sendTxCounter;
  activeSendTxId = txId;
  dispatchPagePatchEvent({ type: "set-context", context, txId });
  scheduleFallbackClear(txId);
  return txId;
};

const beginSelectedContextSendTransaction = (): number | null => {
  if (!sidebar.getIncludedIds().length) {
    return null;
  }

  const compiledContext = getCompiledSelectedContext();
  if (!compiledContext) {
    return null;
  }

  return beginSendTransaction(compiledContext);
};

const installChatGPTInvisibleContextPatch = (): void => {
  if (fetchPatchInstalled) {
    return;
  }

  fetchPatchInstalled = true;

  if (!pagePatchEventsBound) {
    pagePatchEventsBound = true;
    document.addEventListener(PAGE_PATCH_EVENT, (event: Event) => {
      const detail = (event as CustomEvent<PagePatchEventDetail>).detail;
      if (!detail || detail.source !== PAGE_PATCH_SOURCE || detail.direction !== "to-content") {
        return;
      }

      if (detail.type === "prompt-request-finished") {
        if (activeSendTxId === null) {
          return;
        }

        if (typeof detail.txId === "number" && activeSendTxId !== detail.txId) {
          return;
        }

        resolveSendTransaction(activeSendTxId);
        clearContextAfterSend();
        return;
      }

      if (detail.type === "context-expired" && typeof detail.txId === "number") {
        resolveSendTransaction(detail.txId);
      }
    });
  }
};

const debouncedMouseUp = debounce(updateSelectionUI, 50);
const throttledSelectionChange = throttle(updateSelectionUI, 80);

document.addEventListener("mouseup", (event) => {
  lastMousePoint = { x: event.clientX, y: event.clientY };
  debouncedMouseUp();
});
document.addEventListener(
  "pointerdown",
  (event) => {
    if (!isChatGPTActive()) {
      return;
    }

    if (!findNativeAskButton(event.target, event)) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || isSelectionInInput(selection)) {
      const isFresh = Date.now() - lastStableSelectionAt < 10000;
      pendingNativeAskSelection = isFresh ? lastStableSelectionText : latestSelectedText;
      return;
    }

    const text = selection.toString().trim();
    pendingNativeAskSelection = text.length >= 3 ? text : "";
  },
  true
);
document.addEventListener(
  "click",
  (event) => {
    if (!isChatGPTActive()) {
      return;
    }

    if (!findNativeAskButton(event.target, event)) {
      return;
    }

    const activeSelection = window.getSelection()?.toString().trim() ?? "";
    const isFresh = Date.now() - lastStableSelectionAt < 10000;
    const text = pendingNativeAskSelection || activeSelection || latestSelectedText || (isFresh ? lastStableSelectionText : "");
    // Don't clear pendingNativeAskSelection — keep it alive for repeated clicks
    // on the same highlighted text. It gets naturally replaced on next pointerdown.
    if (text.trim().length < 3) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void addSelectionToContext(text);
  },
  true
);
document.addEventListener(
  "click",
  (event) => {
    const adapter = getAdapter();
    if (!adapter) {
      return;
    }

    const button = findSubmitButton(event.target);
    if (!button) {
      return;
    }

    if (isChatGPTActive()) {
      // ChatGPT: use fetch interception via page bridge
      beginSelectedContextSendTransaction();
    } else {
      // Claude, Gemini, Grok, Perplexity: inject context into editor DOM
      injectContextIntoEditorDOM();
    }
  },
  true
);
document.addEventListener(
  "submit",
  (event) => {
    const adapter = getAdapter();
    if (!adapter) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLFormElement)) {
      return;
    }

    if (isChatGPTActive()) {
      if (!target.matches("form[data-type='unified-composer']")) {
        return;
      }
      beginSelectedContextSendTransaction();
    } else {
      // Non-ChatGPT: inject context into editor DOM on form submit
      injectContextIntoEditorDOM();
    }
  },
  true
);
document.addEventListener(
  "keydown",
  (event) => {
    const adapter = getAdapter();
    if (!adapter) {
      return;
    }

    if (event.defaultPrevented) {
      return;
    }

    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) {
      return;
    }

    const editor = adapter.getEditorElement();
    const target = event.target;
    if (!(target instanceof Node) || !editor || (target !== editor && !editor.contains(target))) {
      return;
    }

    if (isChatGPTActive()) {
      beginSelectedContextSendTransaction();
    } else {
      injectContextIntoEditorDOM();
    }
  },
  true
);
document.addEventListener("selectionchange", throttledSelectionChange);
document.addEventListener("mousedown", (event) => {
  if (bubble.contains(event.target)) {
    return;
  }
  if ((event.target as HTMLElement | null)?.closest("#ucs-sidebar-host")) {
    return;
  }
  bubble.hide();
});
document.addEventListener("keydown", (event) => {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod || !event.shiftKey) return;

  if (event.key === "Enter" || event.key.toLowerCase() === "y") {
    event.preventDefault();
    void compileAndInjectAll();
    return;
  }

  if (event.key === "Backspace" || event.key === "Delete") {
    event.preventDefault();
    void contextEngine.clear().then((next) => setSidebarState(next));
    return;
  }

  if (event.key.toLowerCase() === "k") {
    event.preventDefault();
    sidebar.toggle();
  }
});

try {
  chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
    if (message.type === "UCS_COMMAND") {
      if (message.command === "inject-all-context") {
        void compileAndInjectAll(sidebar.getIncludedIds());
      }
      if (message.command === "clear-context-stack") {
        void contextEngine.clear().then((next) => setSidebarState(next));
      }
      if (message.command === "toggle-sidebar") {
        sidebar.toggle();
      }
    }
  });
} catch {
  // Extension context may be invalidated during navigation
}

let mutationGuard = false;
let activeStorageKey = storageManager.getActiveStorageKey();

const refreshScopedStateIfNeeded = (): void => {
  const nextStorageKey = storageManager.getActiveStorageKey();
  if (nextStorageKey === activeStorageKey) {
    return;
  }
  activeStorageKey = nextStorageKey;
  setSidebarState({ snippets: [], totalChars: 0, updatedAt: Date.now() });
  void contextEngine.getState().then((next) => setSidebarState(next));
};

const safeSendStatus = (adapterName: string | null): void => {
  try {
    chrome.runtime.sendMessage({
      type: "UCS_STATUS",
      payload: { connected: true, adapter: adapterName }
    } satisfies RuntimeMessage);
  } catch {
    // Extension context may be invalidated or background not ready — safe to ignore
  }
};

const init = async () => {
  try {
    const adapter = getAdapter();
    console.log("[UCS] init — adapter:", adapter?.name ?? "none", "url:", window.location.href);

    if (isChatGPTActive()) {
      installChatGPTInvisibleContextPatch();
    }

    // Wire up the mount target getter now that all UI elements are constructed
    sidebar.setMountTargetGetter(() => adapter?.getComposerMountTarget() ?? null);

    try {
      const state = await contextEngine.getState();
      setSidebarState(state);
    } catch (err) {
      console.warn("[UCS] Failed to load initial state:", err);
    }

    try {
      storageManager.onStoreChange((next) => {
        setSidebarState(next);
      });
    } catch (err) {
      console.warn("[UCS] Failed to bind storage listener:", err);
    }

    adapter?.observeDOMChanges(() => {
      if (mutationGuard) return;
      mutationGuard = true;
      try {
        refreshScopedStateIfNeeded();

        sidebar.refreshPosition();
        safeSendStatus(adapter.name);
      } finally {
        queueMicrotask(() => { mutationGuard = false; });
      }
    });

    safeSendStatus(adapter?.name ?? null);

    window.addEventListener("popstate", refreshScopedStateIfNeeded);
    window.addEventListener("hashchange", refreshScopedStateIfNeeded);

    window.setInterval(refreshScopedStateIfNeeded, 500);
  } catch (err) {
    console.error("[UCS] init failed:", err);
  }
};

void init();
