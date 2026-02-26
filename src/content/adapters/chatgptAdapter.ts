import { BaseAdapter } from "./baseAdapter";

export class ChatGPTAdapter extends BaseAdapter {
  name = "ChatGPT";
  protected hostPatterns = [/https:\/\/chat\.openai\.com\//, /https:\/\/chatgpt\.com\//];
  protected override editorSelectors = [
    "form[data-type='unified-composer'] #prompt-textarea.ProseMirror[contenteditable='true']",
    "form[data-type='unified-composer'] #prompt-textarea[contenteditable='true']",
    "#prompt-textarea.ProseMirror[contenteditable='true']"
  ];

  protected override editorPrioritySelectors = [];

  override getEditorElement(): HTMLElement | null {
    const active = document.activeElement as HTMLElement | null;
    if (
      active &&
      active.matches("#prompt-textarea.ProseMirror[contenteditable='true'], #prompt-textarea[contenteditable='true']")
    ) {
      return active;
    }

    for (const selector of this.editorSelectors) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) {
        return element;
      }
    }

    return null;
  }

  override getComposerMountTarget(): HTMLElement | null {
    // Return the composer surface (the rounded box). The sidebar will be prepended
    // inside it as the first child, using grid-column: 1/-1 to span the full width
    // without disturbing the surface's existing grid tracks.
    return (
      document.querySelector<HTMLElement>("form[data-type='unified-composer'] [data-composer-surface='true']") ??
      document.querySelector<HTMLElement>("[data-composer-surface='true']") ??
      null
    );
  }
}
