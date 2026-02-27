import { BaseAdapter } from "./baseAdapter";

export class GrokAdapter extends BaseAdapter {
  name = "Grok";
  protected hostPatterns = [/https:\/\/grok\.com\//, /https:\/\/x\.com\/i\/grok/];
  protected override editorSelectors = [
    "textarea[aria-label='Ask Grok anything']",
    ".query-bar textarea",
    "textarea[aria-label*='Grok']",
    "textarea[aria-label*='grok']",
    "textarea[placeholder*='anything']",
    "textarea"
  ];

  override getComposerMountTarget(): HTMLElement | null {
    // For Grok, we need to return a container element that will be used as the mount parent
    // The sidebar will be prepended as the first child of this container

    // Try to find the .query-bar container which spans the full width
    const queryBar = document.querySelector<HTMLElement>(".query-bar");
    if (queryBar) {
      return queryBar;
    }

    // Fallback: look for any container around the textarea
    const textarea = document.querySelector<HTMLElement>("textarea[aria-label*='Grok']");
    if (textarea) {
      // Walk up to find a suitable container
      let parent = textarea.parentElement;
      while (parent) {
        const styles = window.getComputedStyle(parent);
        const width = parseFloat(styles.width);
        // Find a parent that's reasonably wide (likely the full-width container)
        if (width > 400) {
          return parent;
        }
        parent = parent.parentElement;
        if (parent === document.body) break;
      }
      // If no wide parent found, return immediate parent
      return textarea.parentElement;
    }

    return null;
  }
}
