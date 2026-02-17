# CDPilot — Chrome CDP Relay Extension

Connect automation platforms to existing Chrome tabs via a local CDP (Chrome DevTools Protocol) relay server.

## Dev / load unpacked

1. Start the CDP relay server, ensure it is reachable at `http://127.0.0.1:18792/` (default).
2. Chrome → `chrome://extensions` → enable "Developer mode".
3. "Load unpacked" → select this directory.
4. Pin the extension. Click the icon on a tab to attach/detach.

## Options

- `Relay port`: defaults to `18792`.
- `Auth Token`: optional token for relay server authentication.
