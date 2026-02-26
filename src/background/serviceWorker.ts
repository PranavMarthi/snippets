import { RuntimeCommand, RuntimeMessage } from "../shared/types";

let latestStatus: { connected: boolean; adapter: string | null; tabId?: number } = {
  connected: false,
  adapter: null
};

const relayCommandToActiveTab = async (command: RuntimeCommand): Promise<void> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }

  await chrome.tabs.sendMessage(tab.id, { type: "UCS_COMMAND", command } satisfies RuntimeMessage);
};

chrome.commands.onCommand.addListener((command) => {
  if (command === "inject-all-context" || command === "clear-context-stack" || command === "toggle-sidebar") {
    void relayCommandToActiveTab(command);
  }
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  if (message.type === "UCS_STATUS") {
    latestStatus = {
      connected: message.payload.connected,
      adapter: message.payload.adapter,
      tabId: sender.tab?.id
    };
    return;
  }

  if (message.type === "UCS_SYNC_REQUEST") {
    sendResponse(latestStatus);
  }
});
