import { BaseAdapter } from "./baseAdapter";

export class KimiAdapter extends BaseAdapter {
  name = "Kimi";
  protected hostPatterns = [
    /https:\/\/kimi\.moonshot\.cn\//,
    /https:\/\/www\.kimi\.moonshot\.cn\//,
    /https:\/\/kimi\.com\//,
    /https:\/\/www\.kimi\.com\//,
    /https:\/\/kimi\.ai\//,
    /https:\/\/www\.kimi\.ai\//
  ];

  protected override editorSelectors = [
    ".chat-input-editor[contenteditable='true'][role='textbox']",
    ".chat-input-editor[data-lexical-editor='true'][contenteditable='true']",
    ".chat-input .chat-input-editor[contenteditable='true']",
    "div[data-lexical-editor='true'][contenteditable='true'][role='textbox']",
    "div[contenteditable='true'].chat-input-editor",
    "div[contenteditable='true'][role='textbox']"
  ];

  protected override editorPrioritySelectors = [];

  override getEditorElement(): HTMLElement | null {
    const active = document.activeElement as HTMLElement | null;
    if (active && this.isLikelyKimiEditor(active) && this.isElementVisible(active)) {
      return active;
    }

    const candidates: HTMLElement[] = [];
    for (const selector of this.editorSelectors) {
      candidates.push(...Array.from(document.querySelectorAll<HTMLElement>(selector)));
    }

    const ranked = candidates
      .filter((candidate) => this.isLikelyKimiEditor(candidate) && this.isElementVisible(candidate))
      .map((candidate) => ({ candidate, score: this.scoreEditorCandidate(candidate) }))
      .sort((a, b) => b.score - a.score);

    return ranked[0]?.candidate ?? null;
  }

  override getComposerMountTarget(): HTMLElement | null {
    const editor = this.getEditorElement();
    if (!editor) return null;

    const direct = editor.closest<HTMLElement>(".chat-input");
    if (direct && this.isElementVisible(direct)) {
      return direct;
    }

    const candidates = Array.from(document.querySelectorAll<HTMLElement>(".chat-editor .chat-input, .chat-input"))
      .filter((candidate) => this.isElementVisible(candidate))
      .filter((candidate) => candidate.contains(editor))
      .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);

    if (candidates[0]) {
      return candidates[0];
    }

    return editor.parentElement;
  }

  override getConversationRoot(): HTMLElement | null {
    return (
      document.querySelector<HTMLElement>("main") ??
      document.querySelector<HTMLElement>("[role='main']") ??
      document.body
    );
  }

  private isLikelyKimiEditor(element: HTMLElement): boolean {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const className = (element.className ?? "").toLowerCase();
    const role = (element.getAttribute("role") ?? "").toLowerCase();
    const isEditable = element.getAttribute("contenteditable") === "true" || element.isContentEditable;
    const lexical = (element.getAttribute("data-lexical-editor") ?? "").toLowerCase() === "true";

    if (className.includes("chat-input-editor")) {
      return true;
    }

    if (isEditable && lexical && role === "textbox") {
      return true;
    }

    const rect = element.getBoundingClientRect();
    return isEditable && role === "textbox" && rect.bottom > window.innerHeight * 0.45 && rect.width > 220 && rect.height >= 20;
  }

  private scoreEditorCandidate(element: HTMLElement): number {
    const rect = element.getBoundingClientRect();
    const className = (element.className ?? "").toLowerCase();
    const lexical = (element.getAttribute("data-lexical-editor") ?? "").toLowerCase() === "true";
    const inChatInput = !!element.closest(".chat-input");
    const hasPlaceholderSibling = !!element.parentElement?.querySelector(".chat-input-placeholder");

    let score = 0;
    if (className.includes("chat-input-editor")) score += 80;
    if (lexical) score += 30;
    if (inChatInput) score += 25;
    if (hasPlaceholderSibling) score += 10;
    if (rect.bottom > window.innerHeight * 0.5) score += 20;
    if (rect.width > 300) score += 8;
    if (rect.height >= 20) score += 6;
    score += rect.bottom / 12;
    return score;
  }

  private isElementVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
}
