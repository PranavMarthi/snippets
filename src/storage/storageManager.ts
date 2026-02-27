import { ContextStackState } from "../shared/types";

const STORAGE_KEY_PREFIX = "ucs_context_stack_v2";

const extractChatIdFromPath = (pathOrUrl: string): string | null => {
  const match = pathOrUrl.match(/\/c\/([^/?#]+)/);
  return match?.[1] ?? null;
};

const findConversationIdInObject = (value: unknown, depth = 0): string | null => {
  if (!value || depth > 4) {
    return null;
  }

  if (typeof value === "string") {
    return extractChatIdFromPath(value);
  }

  if (typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const directKeys = ["conversationId", "conversation_id", "chatId", "chat_id", "threadId", "thread_id"];
  for (const key of directKeys) {
    const item = record[key];
    if (typeof item === "string" && item.trim()) {
      return item;
    }
  }

  for (const nested of Object.values(record)) {
    const found = findConversationIdInObject(nested, depth + 1);
    if (found) {
      return found;
    }
  }

  return null;
};

const deriveChatGPTConversationId = (): string | null => {
  const fromPath = extractChatIdFromPath(window.location.pathname);
  if (fromPath) {
    return fromPath;
  }

  const params = new URLSearchParams(window.location.search);
  const fromParams =
    params.get("conversation") ?? params.get("conversationId") ?? params.get("conversation_id") ?? params.get("c");
  if (fromParams) {
    return fromParams;
  }

  const fromHistory = findConversationIdInObject(window.history.state);
  if (fromHistory) {
    return fromHistory;
  }

  const activeSidebarLink = document.querySelector<HTMLAnchorElement>("a[aria-current='page'][href*='/c/']");
  if (activeSidebarLink?.href) {
    const fromSidebar = extractChatIdFromPath(activeSidebarLink.href);
    if (fromSidebar) {
      return fromSidebar;
    }
  }

  const canonicalLink = document.querySelector<HTMLLinkElement>("link[rel='canonical'][href*='/c/']");
  if (canonicalLink?.href) {
    const fromCanonical = extractChatIdFromPath(canonicalLink.href);
    if (fromCanonical) {
      return fromCanonical;
    }
  }

  return null;
};

const deriveConversationScope = (): string => {
  const { hostname, pathname, search } = window.location;

  const pathParts = pathname.split("/").filter(Boolean);

  if (hostname === "chatgpt.com" || hostname === "chat.openai.com") {
    const conversationId = deriveChatGPTConversationId();
    if (conversationId) {
      return `chatgpt:${conversationId}`;
    }
    // New-chat / unknown route: keep isolated from saved conversations.
    return `chatgpt:route:${pathname}${search}`;
  }

  if (hostname === "claude.ai") {
    const chatIndex = pathParts.indexOf("chat");
    if (chatIndex >= 0 && pathParts[chatIndex + 1]) {
      return `claude:${pathParts[chatIndex + 1]}`;
    }
  }

  if (hostname === "gemini.google.com") {
    // Gemini conversation IDs appear in the path as /app/<id>
    const appIndex = pathParts.indexOf("app");
    if (appIndex >= 0 && pathParts[appIndex + 1]) {
      return `gemini:${pathParts[appIndex + 1]}`;
    }
  }

  if (hostname === "grok.com") {
    // Grok conversation IDs appear in the path as /chat/<id> or similar
    const chatIndex = pathParts.indexOf("chat");
    if (chatIndex >= 0 && pathParts[chatIndex + 1]) {
      return `grok:${pathParts[chatIndex + 1]}`;
    }
    // Also check for conversation path segments
    if (pathParts.length >= 2) {
      return `grok:${pathParts.join("/")}`;
    }
  }

  if (hostname === "x.com" && pathname.startsWith("/i/grok")) {
    // Grok embedded in X
    return `grok-x:${pathname}${search}`;
  }

  if (hostname === "chat.deepseek.com" || hostname === "deepseek.com" || hostname === "www.deepseek.com") {
    // DeepSeek conversation routes commonly include /a/chat/s/<id>
    const sessionMatch = pathname.match(/\/(?:a\/)?chat\/s\/([^/?#]+)/);
    if (sessionMatch?.[1]) {
      return `deepseek:${sessionMatch[1]}`;
    }

    const chatIndex = pathParts.indexOf("chat");
    if (chatIndex >= 0 && pathParts[chatIndex + 1]) {
      return `deepseek:${pathParts[chatIndex + 1]}`;
    }

    return `deepseek:route:${pathname}${search}`;
  }

  if (hostname === "chat.qwen.ai" || hostname === "qwen.ai" || hostname === "www.qwen.ai") {
    // Qwen often uses /c/<id> or /chat/<id> style routes.
    const fromCPath = pathname.match(/\/c\/([^/?#]+)/);
    if (fromCPath?.[1]) {
      return `qwen:${fromCPath[1]}`;
    }

    const chatIndex = pathParts.indexOf("chat");
    if (chatIndex >= 0 && pathParts[chatIndex + 1]) {
      return `qwen:${pathParts[chatIndex + 1]}`;
    }

    const params = new URLSearchParams(search);
    const paramId = params.get("conversationId") ?? params.get("conversation_id") ?? params.get("chatId");
    if (paramId) {
      return `qwen:${paramId}`;
    }

    return `qwen:route:${pathname}${search}`;
  }

  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  return `${hostname}${normalizedPath}`;
};

const getActiveStorageKey = (): string => `${STORAGE_KEY_PREFIX}::${encodeURIComponent(deriveConversationScope())}`;

const EMPTY_STATE: ContextStackState = {
  snippets: [],
  totalChars: 0,
  updatedAt: Date.now()
};

const getStore = async (): Promise<ContextStackState> => {
  const storageKey = getActiveStorageKey();
  const data = await chrome.storage.local.get(storageKey);
  const state = data[storageKey] as ContextStackState | undefined;

  if (!state || !Array.isArray(state.snippets)) {
    return { ...EMPTY_STATE };
  }

  return {
    snippets: state.snippets.map((snippet) => ({
      ...snippet,
      sourceUrl: (snippet as { sourceUrl?: string; url?: string }).sourceUrl ??
        (snippet as { sourceUrl?: string; url?: string }).url ??
        window.location.href
    })),
    totalChars: state.totalChars ?? state.snippets.reduce((sum, item) => sum + item.charCount, 0),
    updatedAt: state.updatedAt ?? Date.now()
  };
};

const setStore = async (state: ContextStackState): Promise<void> => {
  await chrome.storage.local.set({ [getActiveStorageKey()]: state });
};

const onStoreChange = (listener: (next: ContextStackState) => void): (() => void) => {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: chrome.storage.AreaName
  ) => {
    if (areaName !== "local") {
      return;
    }

    const activeKey = getActiveStorageKey();
    const activeChange = changes[activeKey];
    if (activeChange?.newValue) {
      listener(activeChange.newValue as ContextStackState);
      return;
    }

  };

  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
};

export const storageManager = {
  STORAGE_KEY: STORAGE_KEY_PREFIX,
  getActiveStorageKey,
  getStore,
  setStore,
  onStoreChange
};
