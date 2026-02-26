import { AISiteAdapter } from "../../shared/types";
import { injectText } from "../../engine/injectionEngine";

export abstract class BaseAdapter implements AISiteAdapter {
  abstract name: string;
  protected abstract hostPatterns: RegExp[];
  protected editorSelectors: string[] = [];
  protected editorPrioritySelectors: string[] = ["[contenteditable='true']", "div[role='textbox']", "textarea"];
  protected rootSelectors: string[] = ["main", "[role='main']", "body"];
  private observer?: MutationObserver;

  match(url: string): boolean {
    return this.hostPatterns.some((pattern) => pattern.test(url));
  }

  getEditorElement(): HTMLElement | null {
    const selectors = [...this.editorPrioritySelectors, ...this.editorSelectors];
    const active = document.activeElement as HTMLElement | null;
    if (active && selectors.some((selector) => active.matches(selector)) && this.isVisible(active)) {
      return active;
    }

    for (const selector of selectors) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element && this.isVisible(element)) {
        return element;
      }
    }
    return null;
  }

  async insertText(text: string): Promise<boolean> {
    return injectText(this.getEditorElement(), text);
  }

  getConversationRoot(): HTMLElement | null {
    for (const selector of this.rootSelectors) {
      const root = document.querySelector<HTMLElement>(selector);
      if (root) {
        return root;
      }
    }
    return document.body;
  }

  getComposerMountTarget(): HTMLElement | null {
    return null;
  }

  observeDOMChanges(callback: () => void): void {
    this.observer?.disconnect();
    const root = this.getConversationRoot();
    if (!root) {
      return;
    }

    this.observer = new MutationObserver(() => callback());
    this.observer.observe(root, {
      childList: true,
      subtree: true
    });
  }

  private isVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
}
