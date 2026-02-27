import { BaseAdapter } from "./baseAdapter";

export class DeepSeekAdapter extends BaseAdapter {
  name = "DeepSeek";
  protected hostPatterns = [/https:\/\/chat\.deepseek\.com\//, /https:\/\/(www\.)?deepseek\.com\//];
  protected override editorSelectors = [
    "textarea[placeholder='Message DeepSeek']",
    "textarea[placeholder*='DeepSeek']",
    "textarea[aria-label*='DeepSeek']",
    "textarea.ds-scroll-area",
    "textarea._27c9245",
    "textarea"
  ];

  protected override editorPrioritySelectors = [];

  override getEditorElement(): HTMLElement | null {
    const active = document.activeElement as HTMLElement | null;
    if (active instanceof HTMLTextAreaElement && this.isLikelyDeepSeekEditor(active) && this.isElementVisible(active)) {
      return active;
    }

    for (const selector of this.editorSelectors) {
      const elements = Array.from(document.querySelectorAll<HTMLTextAreaElement>(selector));
      for (const element of elements) {
        if (this.isLikelyDeepSeekEditor(element) && this.isElementVisible(element)) {
          return element;
        }
      }
    }

    const allTextareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea"));
    for (const element of allTextareas) {
      if (this.isLikelyDeepSeekEditor(element) && this.isElementVisible(element)) {
        return element;
      }
    }

    return null;
  }

  override getComposerMountTarget(): HTMLElement | null {
    const editor = this.getEditorElement();
    if (!editor) return null;

    const explicitContainer = editor.closest<HTMLElement>(
      "div.aaff8b8f, div[class*='aaff8b8f'], div[class*='_020ab5b'], div[class*='_77cefa5']"
    );
    if (explicitContainer) {
      return explicitContainer;
    }

    let candidate: HTMLElement | null = editor.parentElement;
    for (let i = 0; i < 8 && candidate; i += 1) {
      const rect = candidate.getBoundingClientRect();
      const hasTextarea = !!candidate.querySelector("textarea");
      const hasControls = !!candidate.querySelector("[class*='ds-toggle-button'], [class*='ds-icon-button'], [role='button']");

      if (
        hasTextarea &&
        hasControls &&
        rect.width > 320 &&
        rect.height > 48 &&
        rect.height < window.innerHeight * 0.65 &&
        rect.bottom > window.innerHeight * 0.45
      ) {
        return candidate;
      }

      if (candidate === document.body) {
        break;
      }
      candidate = candidate.parentElement;
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

  private isLikelyDeepSeekEditor(el: HTMLTextAreaElement): boolean {
    const placeholder = (el.getAttribute("placeholder") ?? "").toLowerCase();
    const aria = (el.getAttribute("aria-label") ?? "").toLowerCase();
    const className = (el.className ?? "").toLowerCase();

    if (placeholder.includes("deepseek") || aria.includes("deepseek")) {
      return true;
    }

    if (className.includes("ds-scroll-area")) {
      return true;
    }

    const rect = el.getBoundingClientRect();
    return rect.width > 280 && rect.height >= 40 && rect.bottom > window.innerHeight * 0.45;
  }

  private isElementVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
}
