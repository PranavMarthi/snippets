import { BaseAdapter } from "./baseAdapter";

export class ClaudeAdapter extends BaseAdapter {
  name = "Claude";
  protected hostPatterns = [/https:\/\/claude\.ai\//];
  protected override editorSelectors = ["div[contenteditable='true']", "textarea"];
}
