import { BaseAdapter } from "./baseAdapter";

export class QwenAdapter extends BaseAdapter {
  name = "Qwen";
  protected hostPatterns = [/https:\/\/chat\.qwen\.ai\//, /https:\/\/(www\.)?qwen\.ai\//];
  protected override editorSelectors = [
    "textarea.message-input-textarea",
    "textarea[placeholder='How can I help you today?']",
    "textarea[placeholder*='help you today']",
    "textarea"
  ];

  protected override editorPrioritySelectors = [];

  override getEditorElement(): HTMLElement | null {
    const sendAnchored = this.findEditorNearBottomSendButton();
    if (sendAnchored) {
      return sendAnchored;
    }

    const active = document.activeElement as HTMLElement | null;
    if (active instanceof HTMLTextAreaElement && this.isLikelyQwenEditor(active) && this.isVisibleTextarea(active)) {
      return active;
    }

    const candidates = new Set<HTMLTextAreaElement>();
    for (const selector of this.editorSelectors) {
      for (const element of Array.from(document.querySelectorAll<HTMLTextAreaElement>(selector))) {
        candidates.add(element);
      }
    }

    const ranked = [...candidates]
      .filter((el) => this.isLikelyQwenEditor(el) && this.isVisibleTextarea(el))
      .map((el) => ({ el, score: this.scoreEditorCandidate(el) }))
      .sort((a, b) => b.score - a.score);

    if (ranked.length > 0) {
      return ranked[0]?.el ?? null;
    }

    return null;
  }

  override getComposerMountTarget(): HTMLElement | null {
    const editor = this.getEditorElement();
    if (!(editor instanceof HTMLTextAreaElement)) return null;

    const sendBtn = this.getBottomSendButton();
    if (sendBtn) {
      let candidate: HTMLElement | null = sendBtn.parentElement;
      for (let i = 0; i < 12 && candidate; i += 1) {
        if (candidate.contains(editor) && this.isValidComposerShell(candidate, editor)) {
          return candidate;
        }
        if (candidate === document.body) break;
        candidate = candidate.parentElement;
      }
    }

    let editorAncestor: HTMLElement | null = editor.parentElement;
    for (let i = 0; i < 10 && editorAncestor; i += 1) {
      if (this.isValidComposerShell(editorAncestor, editor)) {
        return editorAncestor;
      }
      if (editorAncestor === document.body) break;
      editorAncestor = editorAncestor.parentElement;
    }

    return editor.closest<HTMLElement>("[class*='message-input'], [class*='chat-prompt'], form, footer") ?? editor.parentElement;
  }

  override getConversationRoot(): HTMLElement | null {
    return (
      document.querySelector<HTMLElement>("main") ??
      document.querySelector<HTMLElement>("[role='main']") ??
      document.body
    );
  }

  private isLikelyQwenEditor(element: HTMLTextAreaElement): boolean {
    const placeholder = (element.getAttribute("placeholder") ?? "").toLowerCase();
    const className = (element.className ?? "").toLowerCase();
    if (className.includes("message-input-textarea")) {
      return true;
    }
    if (placeholder.includes("help you today")) {
      return true;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 320 && rect.height >= 30 && rect.bottom > window.innerHeight * 0.45;
  }

  private isVisibleTextarea(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  private scoreEditorCandidate(element: HTMLTextAreaElement): number {
    const rect = element.getBoundingClientRect();
    const placeholder = (element.getAttribute("placeholder") ?? "").toLowerCase();
    const className = (element.className ?? "").toLowerCase();
    const parent = element.parentElement;
    const hasRightControls = !!parent?.parentElement?.querySelector(
      ".message-input-right-button, .message-input-right-button-send, .chat-prompt-send-button"
    );

    let score = 0;
    if (className.includes("message-input-textarea")) score += 100;
    if (placeholder.includes("help you today")) score += 40;
    if (rect.bottom > window.innerHeight * 0.45) score += 30;
    if (rect.height >= 28 && rect.height <= 180) score += 10;
    if (rect.width >= 320) score += 8;
    if (hasRightControls) score += 20;

    // Prefer the lower (composer) textarea when multiple candidates exist.
    score += rect.bottom / 10;
    return score;
  }

  private findEditorNearBottomSendButton(): HTMLTextAreaElement | null {
    const sendBtn = this.getBottomSendButton();
    if (!sendBtn) return null;

    let candidate: HTMLElement | null = sendBtn.parentElement;
    for (let i = 0; i < 10 && candidate; i += 1) {
      const textarea = candidate.querySelector<HTMLTextAreaElement>("textarea.message-input-textarea");
      if (textarea && this.isVisibleTextarea(textarea) && this.isLikelyQwenEditor(textarea)) {
        return textarea;
      }
      if (candidate === document.body) break;
      candidate = candidate.parentElement;
    }

    return null;
  }

  private getBottomSendButton(): HTMLElement | null {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".chat-prompt-send-button .send-button, .message-input-right-button-send .send-button"
      )
    );
    const visible = nodes.filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom > window.innerHeight * 0.5;
    });
    if (!visible.length) return null;

    visible.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom);
    return visible[0] ?? null;
  }

  private isValidComposerShell(candidate: HTMLElement, editor: HTMLTextAreaElement): boolean {
    const rect = candidate.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    const hasEditor = candidate.contains(editor);
    const hasTextareaClass = !!candidate.querySelector("textarea.message-input-textarea");
    const hasRightControls = !!candidate.querySelector(
      ".message-input-right-button, .message-input-right-button-send, .chat-prompt-send-button"
    );
    const nearBottom = rect.bottom > window.innerHeight * 0.65;
    const reasonableWidth = rect.width >= 360;
    const reasonableHeight = rect.height >= 44 && rect.height <= 320;
    const tightAroundEditor =
      editorRect.top >= rect.top &&
      editorRect.bottom <= rect.bottom &&
      editorRect.top - rect.top <= 190 &&
      rect.bottom - editorRect.bottom <= 130;

    return (
      hasEditor &&
      hasTextareaClass &&
      hasRightControls &&
      nearBottom &&
      reasonableWidth &&
      reasonableHeight &&
      tightAroundEditor &&
      !this.isRowLikeContainer(candidate)
    );
  }

  private isRowLikeContainer(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const hasTextarea = !!element.querySelector("textarea.message-input-textarea");
    const hasRightControls = !!element.querySelector(
      ".message-input-right-button, .message-input-right-button-send, .chat-prompt-send-button"
    );

    if (!hasTextarea || !hasRightControls) {
      return false;
    }

    const display = style.display.toLowerCase();
    const flexDirection = style.flexDirection.toLowerCase();
    const overflow = `${style.overflow} ${style.overflowY}`.toLowerCase();
    const looksHorizontalFlex = display.includes("flex") && !flexDirection.includes("column");
    const compactHeight = rect.height > 0 && rect.height <= 68;
    const clipped = /hidden|clip/.test(overflow) && rect.height <= 84;

    return looksHorizontalFlex || compactHeight || clipped;
  }
}
