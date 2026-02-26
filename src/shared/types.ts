export interface Snippet {
  id: string;
  text: string;
  sourceUrl: string;
  timestamp: number;
  charCount: number;
}

export interface ContextStackState {
  snippets: Snippet[];
  totalChars: number;
  updatedAt: number;
}

export interface AISiteAdapter {
  name: string;
  match(url: string): boolean;
  getEditorElement(): HTMLElement | null;
  insertText(text: string): Promise<boolean>;
  getConversationRoot(): HTMLElement | null;
  observeDOMChanges(callback: () => void): void;
  /** Return a container element inside the composer where the sidebar should be prepended as a real child.
   *  When non-null the sidebar becomes an inline flow element instead of a fixed overlay. */
  getComposerMountTarget(): HTMLElement | null;
}

export interface StorageLimits {
  maxSnippets: number;
  maxTotalChars: number;
}

export const DEFAULT_STORAGE_LIMITS: StorageLimits = {
  maxSnippets: 75,
  maxTotalChars: 30000
};

export type RuntimeCommand = "inject-all-context" | "clear-context-stack" | "toggle-sidebar";

export type RuntimeMessage =
  | { type: "UCS_SYNC_REQUEST" }
  | { type: "UCS_SYNC_PUSH"; payload: ContextStackState }
  | { type: "UCS_COMMAND"; command: RuntimeCommand }
  | { type: "UCS_STATUS"; payload: { connected: boolean; adapter: string | null } };
