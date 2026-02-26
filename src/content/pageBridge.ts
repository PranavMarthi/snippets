const PAGE_PATCH_EVENT = "UCS_PAGE_PATCH_EVENT";
const PAGE_PATCH_SOURCE = "ucs-page-bridge";
const CONTEXT_MARKER = "### SELECTED CONTEXT (User-Collected)";
const CONTEXT_TTL_MS = 12000;

type PagePatchEventDetail = {
  source: string;
  direction: "to-page" | "to-content";
  type: string;
  context?: string;
  ok?: boolean;
  txId?: number;
  mode?: "hidden" | "visible" | "none";
};

type PendingContext = {
  txId: number;
  context: string;
  expiresAt: number;
};

const rootWindow = window as Window & { __ucsPagePatchInstalled?: boolean };
if (!rootWindow.__ucsPagePatchInstalled) {
  rootWindow.__ucsPagePatchInstalled = true;

  let pending: PendingContext | null = null;

  const sendToContent = (detail: Omit<PagePatchEventDetail, "source" | "direction">): void => {
    document.dispatchEvent(
      new CustomEvent<PagePatchEventDetail>(PAGE_PATCH_EVENT, {
        detail: {
          source: PAGE_PATCH_SOURCE,
          direction: "to-content",
          ...detail
        }
      })
    );
  };

  const clearPending = (eventType?: "context-expired", txIdOverride?: number): void => {
    const txId = txIdOverride ?? pending?.txId;
    pending = null;
    if (eventType && typeof txId === "number") {
      sendToContent({ type: eventType, txId });
    }
  };

  const getLivePending = (): PendingContext | null => {
    if (!pending) {
      return null;
    }
    if (Date.now() <= pending.expiresAt) {
      return pending;
    }
    clearPending("context-expired", pending.txId);
    return null;
  };

  const roleOf = (message: Record<string, unknown>): string | null =>
    (typeof message.role === "string" ? message.role : null) ??
    (message.author &&
    typeof message.author === "object" &&
    typeof (message.author as Record<string, unknown>).role === "string"
      ? ((message.author as Record<string, unknown>).role as string)
      : null);

  const contentHasMarker = (content: unknown): boolean => {
    if (typeof content === "string") {
      return content.includes(CONTEXT_MARKER);
    }
    if (Array.isArray(content)) {
      return content.some((part) => {
        if (typeof part === "string") {
          return part.includes(CONTEXT_MARKER);
        }
        if (part && typeof part === "object") {
          return typeof (part as Record<string, unknown>).text === "string" &&
            ((part as Record<string, unknown>).text as string).includes(CONTEXT_MARKER);
        }
        return false;
      });
    }
    if (content && typeof content === "object") {
      return typeof (content as Record<string, unknown>).text === "string" &&
        ((content as Record<string, unknown>).text as string).includes(CONTEXT_MARKER);
    }
    return false;
  };

  const prependContextToContent = (content: unknown, context: string): { next: unknown; changed: boolean } => {
    if (typeof content === "string") {
      if (content.includes(CONTEXT_MARKER)) {
        return { next: content, changed: true };
      }
      return { next: `${context}\n${content}`, changed: true };
    }

    if (Array.isArray(content)) {
      if (contentHasMarker(content)) {
        return { next: content, changed: true };
      }

      const parts = [...content];
      let changed = false;
      for (let i = 0; i < parts.length; i += 1) {
        const part = parts[i];
        if (typeof part === "string") {
          parts[i] = `${context}\n${part}`;
          changed = true;
          break;
        }
        if (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") {
          parts[i] = {
            ...(part as Record<string, unknown>),
            text: `${context}\n${(part as Record<string, unknown>).text as string}`
          };
          changed = true;
          break;
        }
      }

      if (!changed) {
        parts.unshift({ type: "text", text: context });
        changed = true;
      }

      return { next: parts, changed };
    }

    if (content && typeof content === "object") {
      const record = content as Record<string, unknown>;

      if (Array.isArray(record.parts)) {
        const parts = [...record.parts];
        if (contentHasMarker(parts)) {
          return { next: record, changed: true };
        }

        let changed = false;
        for (let i = 0; i < parts.length; i += 1) {
          const part = parts[i];
          if (typeof part === "string") {
            parts[i] = `${context}\n${part}`;
            changed = true;
            break;
          }
          if (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") {
            parts[i] = {
              ...(part as Record<string, unknown>),
              text: `${context}\n${(part as Record<string, unknown>).text as string}`
            };
            changed = true;
            break;
          }
        }

        if (!changed) {
          parts.unshift(context);
          changed = true;
        }

        return { next: { ...record, parts }, changed };
      }

      if (typeof record.text === "string") {
        if (record.text.includes(CONTEXT_MARKER)) {
          return { next: record, changed: true };
        }
        return {
          next: { ...record, text: `${context}\n${record.text}` },
          changed: true
        };
      }
    }

    return { next: content, changed: false };
  };

  const buildSyntheticHiddenEntry = (template: Record<string, unknown>, context: string): Record<string, unknown> => {
    const next: Record<string, unknown> = { ...template };

    if (typeof next.id === "string") {
      next.id = `ucs-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    if (next.author && typeof next.author === "object") {
      next.author = { ...(next.author as Record<string, unknown>), role: "developer" };
    }

    if (typeof next.role === "string") {
      next.role = "developer";
    } else {
      next.role = "developer";
    }

    if ("text" in next && typeof next.text === "string") {
      next.text = context;
    }

    const contentResult = prependContextToContent(next.content, context);
    if (contentResult.changed) {
      next.content = contentResult.next;
    } else {
      next.content = context;
    }

    return next;
  };

  const injectHiddenContextIntoPayload = (payload: Record<string, unknown>, context: string): boolean => {
    if (typeof payload.instructions === "string") {
      payload.instructions = payload.instructions.includes(CONTEXT_MARKER)
        ? payload.instructions
        : `${context}\n${payload.instructions}`;
      return true;
    }

    if (!payload.instructions) {
      payload.instructions = context;
      return true;
    }

    if (Array.isArray(payload.input)) {
      const items = [...payload.input];

      for (let i = items.length - 1; i >= 0; i -= 1) {
        const entry = items[i];
        if (!entry || typeof entry !== "object") {
          continue;
        }

        const record = entry as Record<string, unknown>;
        const role = typeof record.role === "string" ? record.role : null;
        if (role !== "system" && role !== "developer") {
          continue;
        }

        const contentResult = prependContextToContent(record.content, context);
        if (contentResult.changed) {
          items[i] = { ...record, content: contentResult.next };
          payload.input = items;
          return true;
        }

        if (typeof record.text === "string") {
          items[i] = {
            ...record,
            text: record.text.includes(CONTEXT_MARKER) ? record.text : `${context}\n${record.text}`
          };
          payload.input = items;
          return true;
        }
      }

      const templateInput = items.find((entry) => entry && typeof entry === "object") as Record<string, unknown> | undefined;
      if (templateInput) {
        const synthetic = buildSyntheticHiddenEntry(templateInput, context);
        synthetic.role = "developer";
        if (synthetic.author && typeof synthetic.author === "object") {
          synthetic.author = { ...(synthetic.author as Record<string, unknown>), role: "developer" };
        }
        items.unshift(synthetic);
        payload.input = items;
        return true;
      }
    }

    if (!Array.isArray(payload.messages)) {
      return false;
    }

    const messages = [...payload.messages];

    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const entry = messages[i];
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const message = entry as Record<string, unknown>;
      const role = roleOf(message);
      if (role !== "system" && role !== "developer") {
        continue;
      }

      const contentResult = prependContextToContent(message.content, context);
      if (contentResult.changed) {
        messages[i] = { ...message, content: contentResult.next };
        payload.messages = messages;
        return true;
      }

      if (typeof message.text === "string") {
        messages[i] = {
          ...message,
          text: message.text.includes(CONTEXT_MARKER) ? message.text : `${context}\n${message.text}`
        };
        payload.messages = messages;
        return true;
      }
    }

    const templateMessage =
      (messages.find((entry) => {
        if (!entry || typeof entry !== "object") {
          return false;
        }
        return roleOf(entry as Record<string, unknown>) === "user";
      }) as Record<string, unknown> | undefined) ??
      (messages.find((entry) => entry && typeof entry === "object") as Record<string, unknown> | undefined);

    if (templateMessage) {
      const synthetic = buildSyntheticHiddenEntry(templateMessage, context);
      messages.unshift(synthetic);
      payload.messages = messages;
      return true;
    }

    return false;
  };

  const injectVisibleFallbackIntoPayload = (payload: Record<string, unknown>, context: string): boolean => {
    if (typeof payload.prompt === "string") {
      payload.prompt = payload.prompt.includes(CONTEXT_MARKER) ? payload.prompt : `${context}\n${payload.prompt}`;
      return true;
    }

    if (typeof payload.input === "string") {
      payload.input = payload.input.includes(CONTEXT_MARKER) ? payload.input : `${context}\n${payload.input}`;
      return true;
    }

    if (Array.isArray(payload.input)) {
      const items = [...payload.input];
      for (let i = items.length - 1; i >= 0; i -= 1) {
        const entry = items[i];
        if (!entry || typeof entry !== "object") {
          continue;
        }
        const record = entry as Record<string, unknown>;
        if (record.role !== "user") {
          continue;
        }

        const contentResult = prependContextToContent(record.content, context);
        if (contentResult.changed) {
          items[i] = { ...record, content: contentResult.next };
          payload.input = items;
          return true;
        }

        if (typeof record.text === "string") {
          items[i] = {
            ...record,
            text: record.text.includes(CONTEXT_MARKER) ? record.text : `${context}\n${record.text}`
          };
          payload.input = items;
          return true;
        }
      }
    }

    if (!Array.isArray(payload.messages)) {
      return false;
    }

    const messages = [...payload.messages];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const entry = messages[i];
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const message = entry as Record<string, unknown>;
      if (roleOf(message) !== "user") {
        continue;
      }

      const contentResult = prependContextToContent(message.content, context);
      if (contentResult.changed) {
        messages[i] = { ...message, content: contentResult.next };
        payload.messages = messages;
        return true;
      }

      if (typeof message.text === "string") {
        messages[i] = {
          ...message,
          text: message.text.includes(CONTEXT_MARKER) ? message.text : `${context}\n${message.text}`
        };
        payload.messages = messages;
        return true;
      }
    }

    return false;
  };

  const payloadLooksLikePromptSend = (payload: Record<string, unknown>): boolean =>
    Array.isArray(payload.messages) ||
    typeof payload.prompt === "string" ||
    typeof payload.input === "string" ||
    Array.isArray(payload.input);

  document.addEventListener(PAGE_PATCH_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<PagePatchEventDetail>).detail;
    if (!detail || detail.source !== PAGE_PATCH_SOURCE || detail.direction !== "to-page") {
      return;
    }

    if (detail.type === "set-context") {
      pending = {
        context: typeof detail.context === "string" ? detail.context : "",
        txId: typeof detail.txId === "number" ? detail.txId : 0,
        expiresAt: Date.now() + CONTEXT_TTL_MS
      };
      return;
    }

    if (detail.type === "clear-context") {
      clearPending();
    }
  });

  const originalFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const isChatGPTHost = window.location.hostname === "chatgpt.com" || window.location.hostname === "chat.openai.com";
    const isBackendApi = /\/backend-(api|anon)\//.test(requestUrl);
    const isLikelyPromptEndpoint = /\/(conversation|messages|responses)(\/|\?|$)/.test(requestUrl);
    if (!isChatGPTHost || !isBackendApi || !isLikelyPromptEndpoint || method !== "POST") {
      return originalFetch(input, init);
    }

    let bodyText: string | null = null;
    let requestForRead: Request | null = null;
    if (typeof init?.body === "string") {
      bodyText = init.body;
    } else {
      try {
        requestForRead =
          input instanceof Request ? new Request(input, init) : new Request(input, init);
        bodyText = await requestForRead.clone().text();
      } catch {
        bodyText = null;
      }
    }

    let response: Response | null = null;
    let promptRequest = false;
    const livePending = getLivePending();
    let txId: number | undefined = livePending?.txId;

    if (bodyText) {
      try {
        const payload = JSON.parse(bodyText) as Record<string, unknown>;
        promptRequest = payloadLooksLikePromptSend(payload);

        if (promptRequest && livePending) {
          const visibleInjected = injectVisibleFallbackIntoPayload(payload, livePending.context);
          const hiddenInjected = visibleInjected ? false : injectHiddenContextIntoPayload(payload, livePending.context);
          const injected = visibleInjected || hiddenInjected;
          sendToContent({
            type: "context-injected",
            txId: livePending.txId,
            ok: injected,
            mode: visibleInjected ? "visible" : hiddenInjected ? "hidden" : "none"
          });
          clearPending();

          if (injected) {
            const nextBody = JSON.stringify(payload);
            if (requestForRead) {
              response = await originalFetch(new Request(requestForRead, { body: nextBody }));
            } else if (input instanceof Request) {
              response = await originalFetch(new Request(input, { ...init, body: nextBody }));
            } else {
              response = await originalFetch(input, { ...init, body: nextBody });
            }
          }
        }
      } catch {
      }
    }

    if (!response) {
      response = requestForRead ? await originalFetch(requestForRead) : await originalFetch(input, init);
    }

    if (promptRequest || livePending) {
      sendToContent({ type: "prompt-request-finished", ok: response.ok, txId });
    }

    return response;
  }) as typeof window.fetch;
}
