import { BaseAdapter } from "./baseAdapter";

export class ClaudeAdapter extends BaseAdapter {
  name = "Claude";
  protected hostPatterns = [/https:\/\/claude\.ai\//];
  protected override editorSelectors = [
    "div[contenteditable='true'].ProseMirror",
    "div[contenteditable='true'][data-placeholder]",
    "fieldset div[contenteditable='true']",
    "div[contenteditable='true']",
    "textarea"
  ];

  override getComposerMountTarget(): HTMLElement | null {
    // Claude's input area: find the fieldset or form container wrapping the editor
    const editor = this.getEditorElement();
    if (!editor) return null;

    // Claude wraps the editor in a fieldset inside a form-like container
    const fieldset = editor.closest("fieldset");
    if (fieldset) return fieldset as HTMLElement;

    // Fallback: walk up from editor to find a suitable container
    let candidate: HTMLElement | null = editor.parentElement;
    for (let i = 0; i < 6 && candidate; i++) {
      const rect = candidate.getBoundingClientRect();
      if (rect.bottom > window.innerHeight * 0.5 && rect.width > 200) {
        // Check if this looks like the composer container (has some height, near bottom)
        if (rect.height > 50 && rect.height < window.innerHeight * 0.5) {
          return candidate;
        }
      }
      if (candidate === document.body) break;
      candidate = candidate.parentElement;
    }

    return null;
  }
}
