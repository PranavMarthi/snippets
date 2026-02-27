import { BaseAdapter } from "./baseAdapter";

export class NovaAdapter extends BaseAdapter {
  name = "Nova";
  protected hostPatterns = [
    /https:\/\/(?:www\.|app\.|chat\.)?novaapp\.ai\//,
    /https:\/\/(?:www\.|chat\.)?nova\.ai\//
  ];

  protected override editorSelectors = [
    "textarea[class*='messagebox__textarea']",
    "textarea._messagebox__textarea_1sfl3_93",
    "textarea[placeholder='Type a message...']",
    "div[class*='messagebox__input'] textarea",
    "textarea"
  ];

  protected override editorPrioritySelectors = [];

  override getEditorElement(): HTMLElement | null {
    const active = document.activeElement as HTMLElement | null;
    if (active instanceof HTMLTextAreaElement && this.isLikelyNovaEditor(active) && this.isElementVisible(active)) {
      return active;
    }

    const candidates = new Set<HTMLTextAreaElement>();
    for (const selector of this.editorSelectors) {
      for (const element of Array.from(document.querySelectorAll<HTMLTextAreaElement>(selector))) {
        candidates.add(element);
      }
    }

    const ranked = [...candidates]
      .filter((candidate) => this.isLikelyNovaEditor(candidate) && this.isElementVisible(candidate))
      .map((candidate) => ({ candidate, score: this.scoreEditorCandidate(candidate) }))
      .sort((a, b) => b.score - a.score);

    return ranked[0]?.candidate ?? null;
  }

  override getComposerMountTarget(): HTMLElement | null {
    const editor = this.getEditorElement();
    if (!(editor instanceof HTMLTextAreaElement)) return null;

    let candidate: HTMLElement | null = editor.parentElement;
    const ranked: Array<{ candidate: HTMLElement; score: number }> = [];
    for (let i = 0; i < 10 && candidate; i += 1) {
      const rect = candidate.getBoundingClientRect();
      const className = (candidate.className ?? "").toLowerCase();
      const hasTextarea = !!candidate.querySelector("textarea[class*='messagebox__textarea'], textarea[placeholder='Type a message...']");
      const hasBottomActions = !!candidate.querySelector(
        "[class*='messagebox__bottom-content'], [class*='message-box__footer'], [class*='messagebox__suffix'], [class*='messagebox__prefix']"
      );
      const nearBottom = rect.bottom > window.innerHeight * 0.45;
      const looksComposer = className.includes("messagebox") || className.includes("message-box__content");
      const hasComposerShape = rect.width > 320 && rect.height > 44 && rect.height < window.innerHeight * 0.7;
      if (
        this.isElementVisible(candidate) &&
        hasTextarea &&
        nearBottom &&
        hasComposerShape &&
        looksComposer &&
        candidate.contains(editor) &&
        (hasBottomActions || className.includes("message-box__content"))
      ) {
        let score = 0;
        if (hasBottomActions) score += 80;
        if (className.includes("message-box__content")) score += 30;
        if (className.includes("messagebox_")) score += 20;
        if (className.includes("messagebox__input")) score -= 12;
        score += rect.bottom / 18;
        score += Math.min(rect.width, 980) / 64;
        ranked.push({ candidate, score });
      }

      if (candidate === document.body) {
        break;
      }
      candidate = candidate.parentElement;
    }

    if (ranked.length) {
      ranked.sort((a, b) => b.score - a.score);
      return ranked[0]?.candidate ?? null;
    }

    const explicit = editor.closest<HTMLElement>(
      "div[class*='messagebox_'], div[class*='message-box__content'], div[class*='messagebox__input-container']"
    );
    if (explicit && this.isElementVisible(explicit)) {
      return explicit;
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

  private isLikelyNovaEditor(element: HTMLTextAreaElement): boolean {
    const placeholder = (element.getAttribute("placeholder") ?? "").toLowerCase();
    const className = (element.className ?? "").toLowerCase();

    if (className.includes("messagebox__textarea")) {
      return true;
    }
    if (placeholder.includes("type a message")) {
      return true;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 280 && rect.height >= 18 && rect.bottom > window.innerHeight * 0.45;
  }

  private scoreEditorCandidate(element: HTMLTextAreaElement): number {
    const rect = element.getBoundingClientRect();
    const className = (element.className ?? "").toLowerCase();
    const placeholder = (element.getAttribute("placeholder") ?? "").toLowerCase();

    let score = 0;
    if (className.includes("messagebox__textarea")) score += 80;
    if (placeholder.includes("type a message")) score += 40;
    if (rect.bottom > window.innerHeight * 0.5) score += 24;
    if (rect.width > 340) score += 10;
    if (rect.height >= 18) score += 8;
    score += rect.bottom / 12;

    return score;
  }

  private isElementVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
}
