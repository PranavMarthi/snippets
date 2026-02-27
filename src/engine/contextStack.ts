import { storageManager } from "../storage/storageManager";
import { ContextStackState, DEFAULT_STORAGE_LIMITS, Snippet, StorageLimits } from "../shared/types";
import { generateId, now } from "../shared/utils";

export interface AddSnippetInput {
  text: string;
  sourceUrl: string;
}

const normalizeText = (text: string): string => text.trim();

export class ContextStackEngine {
  private limits: StorageLimits;

  constructor(limits: StorageLimits = DEFAULT_STORAGE_LIMITS) {
    this.limits = limits;
  }

  async getState(): Promise<ContextStackState> {
    return storageManager.getStore();
  }

  async addSnippet(input: AddSnippetInput): Promise<{ ok: boolean; reason?: string; state: ContextStackState }> {
    const state = await this.getState();
    const text = normalizeText(input.text);

    if (text.length < 3) {
      return { ok: false, reason: "Selection too short", state };
    }

    if (text.length > 10000) {
      return { ok: false, reason: "Selection too large", state };
    }

    const isDuplicate = state.snippets.some((existing) => existing.text === text);
    if (isDuplicate) {
      return { ok: false, reason: "Duplicate snippet", state };
    }

    const snippet: Snippet = {
      id: generateId(),
      text,
      sourceUrl: input.sourceUrl,
      timestamp: now(),
      charCount: text.length
    };

    const nextSnippets = [...state.snippets, snippet].slice(-this.limits.maxSnippets);
    const totalChars = nextSnippets.reduce((sum, item) => sum + item.charCount, 0);

    if (totalChars > this.limits.maxTotalChars) {
      return { ok: false, reason: "Context stack char limit reached", state };
    }

    const nextState: ContextStackState = {
      snippets: nextSnippets,
      totalChars,
      updatedAt: now()
    };

    await storageManager.setStore(nextState);
    return { ok: true, state: nextState };
  }

  async removeSnippet(id: string): Promise<ContextStackState> {
    const state = await this.getState();
    const snippets = state.snippets.filter((snippet) => snippet.id !== id);
    const nextState: ContextStackState = {
      snippets,
      totalChars: snippets.reduce((sum, item) => sum + item.charCount, 0),
      updatedAt: now()
    };
    await storageManager.setStore(nextState);
    return nextState;
  }

  async updateSnippet(id: string, nextText: string): Promise<ContextStackState> {
    const state = await this.getState();
    const text = normalizeText(nextText);
    const snippets = state.snippets.map((snippet) => {
      if (snippet.id !== id) {
        return snippet;
      }
      return {
        ...snippet,
        text,
        charCount: text.length,
        timestamp: now()
      };
    });

    const nextState: ContextStackState = {
      snippets,
      totalChars: snippets.reduce((sum, item) => sum + item.charCount, 0),
      updatedAt: now()
    };
    await storageManager.setStore(nextState);
    return nextState;
  }

  async reorderSnippet(startIndex: number, endIndex: number): Promise<ContextStackState> {
    const state = await this.getState();
    const snippets = [...state.snippets];
    const [moved] = snippets.splice(startIndex, 1);
    if (!moved) {
      return state;
    }
    snippets.splice(endIndex, 0, moved);

    const nextState: ContextStackState = {
      snippets,
      totalChars: snippets.reduce((sum, item) => sum + item.charCount, 0),
      updatedAt: now()
    };
    await storageManager.setStore(nextState);
    return nextState;
  }

  async clear(): Promise<ContextStackState> {
    const nextState: ContextStackState = { snippets: [], totalChars: 0, updatedAt: now() };
    await storageManager.setStore(nextState);
    return nextState;
  }

  search(snippets: Snippet[], query: string): Snippet[] {
    const q = query.trim().toLowerCase();
    if (!q) {
      return snippets;
    }
    return snippets.filter((item) => item.text.toLowerCase().includes(q) || item.sourceUrl.toLowerCase().includes(q));
  }
}

export const formatCompiledContext = (snippets: Snippet[]): string => {
  const body = snippets.map((snippet, index) => `[Snippet ${index + 1}]\n${snippet.text}`).join("\n\n");

  return [
    "### SELECTED CONTEXT (User-Collected)",
    "IMPORTANT: Do not let this context influence anything outside this specific message/prompt request.",
    "The following snippets were highlighted from earlier conversation:",
    "",
    body,
    "",
    "User Question:"
  ].join("\n");
};
