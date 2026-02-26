const dispatchInputEvents = (element: HTMLElement): void => {
  element.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
};

const insertWithExecCommand = (editor: HTMLElement, text: string): boolean => {
  editor.focus();
  const inserted = document.execCommand("insertText", false, text);
  if (inserted) {
    dispatchInputEvents(editor);
  }
  return inserted;
};

const insertWithRange = (editor: HTMLElement, text: string): boolean => {
  editor.focus();
  const selection = window.getSelection();
  if (!selection) {
    return false;
  }

  let range: Range;
  if (selection.rangeCount > 0) {
    range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
  } else {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }

  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.setEndAfter(textNode);
  selection.removeAllRanges();
  selection.addRange(range);
  dispatchInputEvents(editor);
  return true;
};

const insertIntoTextarea = (editor: HTMLElement, text: string): boolean => {
  if (!(editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement)) {
    return false;
  }

  editor.focus();
  const start = editor.selectionStart ?? editor.value.length;
  const end = editor.selectionEnd ?? editor.value.length;
  const before = editor.value.slice(0, start);
  const after = editor.value.slice(end);
  editor.value = `${before}${text}${after}`;
  const cursor = start + text.length;
  editor.selectionStart = cursor;
  editor.selectionEnd = cursor;
  editor.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
  editor.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
};

export const injectText = async (editor: HTMLElement | null, text: string): Promise<boolean> => {
  if (!editor) {
    return false;
  }

  if (editor.isContentEditable) {
    if (insertWithExecCommand(editor, text)) {
      return true;
    }
    if (insertWithRange(editor, text)) {
      return true;
    }
  }

  return insertIntoTextarea(editor, text);
};
