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

    // Qwen: mount into the bottom composer shell (contains textarea + right controls).
    let candidate: HTMLElement | null = editor.parentElement;
    for (let i = 0; i < 10 && candidate; i += 1) {
      const rect = candidate.getBoundingClientRect();
      const hasEditor = candidate.contains(editor);
      const hasRightControls = !!candidate.querySelector(
        ".message-input-right-button, .message-input-right-button-send, .chat-prompt-send-button"
      );
      const hasTextareaClass = !!candidate.querySelector("textarea.message-input-textarea");
      const nearBottom = rect.bottom > window.innerHeight * 0.72;
      const reasonableHeight = rect.height >= 44 && rect.height <= 260;
      const reasonableWidth = rect.width >= 360;

      if (hasEditor && hasTextareaClass && hasRightControls && nearBottom && reasonableHeight && reasonableWidth) {
        return candidate;
      }

      if (candidate === document.body) {
        break;
      }
      candidate = candidate.parentElement;
    }

    // Fallback: locate by right controls and pick the nearest bottom shell that contains the editor.
    const control = editor
      .closest<HTMLElement>("[class*='message-input'], [class*='chat-prompt']")
      ?.querySelector<HTMLElement>(".message-input-right-button, .message-input-right-button-send, .chat-prompt-send-button");
    if (control) {
      let controlAncestor: HTMLElement | null = control;
      for (let i = 0; i < 8 && controlAncestor; i += 1) {
        const rect = controlAncestor.getBoundingClientRect();
        if (
          controlAncestor.contains(editor) &&
          rect.bottom > window.innerHeight * 0.72 &&
          rect.width >= 360 &&
          rect.height >= 44 &&
          rect.height <= 260
        ) {
          return controlAncestor;
        }
        controlAncestor = controlAncestor.parentElement;
      }
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
}
