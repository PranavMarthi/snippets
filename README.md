# Universal AI Multi-Context Selector

Chrome extension (Manifest V3) that lets you multi-select snippets across AI chat platforms and inject a compiled context block into the active prompt editor.

## Supported Sites

- `chat.openai.com`
- `chatgpt.com`
- `claude.ai`
- `perplexity.ai`
- `gemini.google.com`
- `grok.com`
- `chat.deepseek.com`
- `kimi.moonshot.cn`
- `novaapp.ai`

## Features

- Adapter-based site integration (no single-site hardcoding)
- Floating action bubble on text selection
- Persistent context stack in `chrome.storage.local`
- Shadow-DOM sidebar with search, delete, clear, copy, drag reorder
- Compiled context formatter + safe prompt injection strategy chain
- Keyboard shortcuts via `commands` plus in-page fallback listeners

## Development

```bash
npm install
npm run build
```

Build output is written to `dist/`.

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

## Shortcuts

- `Ctrl/Cmd + Shift + Y`: Inject all context
- `Ctrl/Cmd + Shift + Delete`: Clear stack
- `Ctrl/Cmd + Shift + K`: Toggle sidebar

You can customize shortcuts in `chrome://extensions/shortcuts`.
