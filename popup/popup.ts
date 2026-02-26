import type { RuntimeCommand, RuntimeMessage } from "../src/shared/types";

const statusEl = document.getElementById("status") as HTMLParagraphElement;

const sendCommand = async (command: RuntimeCommand): Promise<void> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }
  await chrome.tabs.sendMessage(tab.id, { type: "UCS_COMMAND", command } satisfies RuntimeMessage);
};

document.getElementById("inject")?.addEventListener("click", () => {
  void sendCommand("inject-all-context");
});

document.getElementById("toggle")?.addEventListener("click", () => {
  void sendCommand("toggle-sidebar");
});

document.getElementById("clear")?.addEventListener("click", () => {
  void sendCommand("clear-context-stack");
});

chrome.runtime.sendMessage({ type: "UCS_SYNC_REQUEST" } satisfies RuntimeMessage, (response) => {
  if (chrome.runtime.lastError) {
    statusEl.textContent = "No active supported AI tab detected.";
    return;
  }
  if (!response?.connected) {
    statusEl.textContent = "Open ChatGPT, Claude, Gemini, or Perplexity.";
    return;
  }
  statusEl.textContent = `Connected: ${response.adapter ?? "Unknown"}`;
});
