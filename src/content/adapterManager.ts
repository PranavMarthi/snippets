import { AISiteAdapter } from "../shared/types";
import { ChatGPTAdapter } from "./adapters/chatgptAdapter";
import { ClaudeAdapter } from "./adapters/claudeAdapter";
import { PerplexityAdapter } from "./adapters/perplexityAdapter";
import { GeminiAdapter } from "./adapters/geminiAdapter";
import { GrokAdapter } from "./adapters/grokAdapter";

export class SiteAdapterManager {
  private adapters: AISiteAdapter[];
  private active: AISiteAdapter | null = null;

  constructor(adapters: AISiteAdapter[]) {
    this.adapters = adapters;
  }

  detect(url: string = window.location.href): AISiteAdapter | null {
    this.active = this.adapters.find((adapter) => adapter.match(url)) ?? null;
    return this.active;
  }

  getActiveAdapter(): AISiteAdapter | null {
    return this.active ?? this.detect();
  }
}

declare global {
  interface Window {
    __UCS_ADAPTER_MANAGER__?: SiteAdapterManager;
  }
}

export const createDefaultAdapterManager = (): SiteAdapterManager => {
  const manager = new SiteAdapterManager([
    new ChatGPTAdapter(),
    new ClaudeAdapter(),
    new PerplexityAdapter(),
    new GeminiAdapter(),
    new GrokAdapter()
  ]);
  manager.detect();
  return manager;
};
