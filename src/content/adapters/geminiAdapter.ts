import { BaseAdapter } from "./baseAdapter";

export class GeminiAdapter extends BaseAdapter {
  name = "Gemini";
  protected hostPatterns = [/https:\/\/gemini\.google\.com\//];

  // Exact selectors from Gemini's actual DOM structure:
  // <rich-textarea> contains <div class="ql-editor textarea new-input-ui" contenteditable="true" aria-label="Enter a prompt for Gemini">
  protected override editorSelectors = [
    "rich-textarea .ql-editor[contenteditable='true']",
    "rich-textarea div[contenteditable='true']",
    ".ql-editor[contenteditable='true']",
    "div[contenteditable='true'][aria-label*='prompt']",
    "div[contenteditable='true'][aria-label*='Gemini']",
    "div[contenteditable='true'].textarea",
    "div[contenteditable='true']"
  ];

  protected override editorPrioritySelectors = [];

  override getEditorElement(): HTMLElement | null {
    // Try exact selectors first
    for (const selector of this.editorSelectors) {
      const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
      for (const element of elements) {
        if (this.isElementVisible(element) && this.isLikelyInputEditor(element)) {
          return element;
        }
      }
    }

    // Fallback: any visible contenteditable in the lower part of the page
    const allEditable = Array.from(document.querySelectorAll<HTMLElement>("[contenteditable='true']"));
    for (const el of allEditable) {
      if (this.isElementVisible(el) && this.isLikelyInputEditor(el)) {
        return el;
      }
    }

    return null;
  }

  override getComposerMountTarget(): HTMLElement | null {
    // From the HTML: the outer container is div.text-input-field
    const textInputField = document.querySelector<HTMLElement>(".text-input-field");
    if (textInputField && this.isElementVisible(textInputField)) {
      return textInputField;
    }

    // Fallback: walk up from the editor
    const editor = this.getEditorElement();
    if (!editor) return null;

    // Walk up to find div.text-input-field or a suitable container
    const field = editor.closest<HTMLElement>(".text-input-field");
    if (field) return field;

    // Last resort: find the rich-textarea's parent container
    const richTextarea = editor.closest<HTMLElement>("rich-textarea");
    if (richTextarea?.parentElement) {
      return richTextarea.parentElement;
    }

    return null;
  }

  override getConversationRoot(): HTMLElement | null {
    return (
      document.querySelector<HTMLElement>("main") ??
      document.querySelector<HTMLElement>("[role='main']") ??
      document.body
    );
  }

  private isLikelyInputEditor(el: HTMLElement): boolean {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.35) return false;
    if (rect.width < 100 || rect.height < 15) return false;
    return true;
  }

  private isElementVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
}
