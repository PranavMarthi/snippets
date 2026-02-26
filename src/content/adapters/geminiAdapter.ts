import { BaseAdapter } from "./baseAdapter";

export class GeminiAdapter extends BaseAdapter {
  name = "Gemini";
  protected hostPatterns = [/https:\/\/gemini\.google\.com\//];
  protected override editorSelectors = ["div[contenteditable='true']"];
}
