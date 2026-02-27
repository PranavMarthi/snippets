import { BaseAdapter } from "./baseAdapter";

export class GrokAdapter extends BaseAdapter {
  name = "Grok";
  protected hostPatterns = [/https:\/\/grok\.com\//, /https:\/\/x\.com\/i\/grok/];
  protected override editorSelectors = [
    "textarea[placeholder*='mind']",
    "textarea[placeholder*='Grok']",
    "div[contenteditable='true'][role='textbox']",
    "div[contenteditable='true']",
    "textarea"
  ];

  override getComposerMountTarget(): HTMLElement | null {
    const editor = this.getEditorElement();
    if (!editor) return null;

    // Walk up from editor to find the container wrapping the input area
    let candidate: HTMLElement | null = editor.parentElement;
    for (let i = 0; i < 6 && candidate; i++) {
      const rect = candidate.getBoundingClientRect();
      if (rect.bottom > window.innerHeight * 0.5 && rect.width > 200) {
        if (rect.height > 40 && rect.height < window.innerHeight * 0.5) {
          return candidate;
        }
      }
      if (candidate === document.body) break;
      candidate = candidate.parentElement;
    }

    return null;
  }
}
