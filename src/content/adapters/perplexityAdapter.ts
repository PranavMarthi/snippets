import { BaseAdapter } from "./baseAdapter";

export class PerplexityAdapter extends BaseAdapter {
  name = "Perplexity";
  protected hostPatterns = [/https:\/\/perplexity\.ai\//];
  protected override editorSelectors = ["textarea", "[contenteditable='true']"];
}
