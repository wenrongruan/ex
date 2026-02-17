import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RelayClient } from './relay-client.js';
import { SessionManager } from './session-manager.js';
import { navigateSchema, navigate } from './tools/navigate.js';
import { clickSchema, click } from './tools/click.js';
import { typeSchema, type as typeTool } from './tools/type.js';
import { screenshotSchema, screenshot } from './tools/screenshot.js';
import { evaluateSchema, evaluate } from './tools/evaluate.js';
import { getPageInfoSchema, getPageInfo } from './tools/get-page-info.js';
import { waitSchema, wait } from './tools/wait.js';
import { getTabsSchema, getTabs } from './tools/get-tabs.js';
import { switchTabSchema, switchTab } from './tools/switch-tab.js';
import { cdpCommandSchema, cdpCommand } from './tools/cdp-command.js';

export function createServer() {
  const relay = new RelayClient();
  const sessions = new SessionManager(relay);

  const server = new McpServer({
    name: 'cdpilot',
    version: '1.0.0',
  });

  // Connect to relay on first tool call
  async function ensureConnected() {
    if (!relay.connected) {
      await relay.connect();
    }
  }

  // --- High-level tools ---

  server.tool(
    'navigate',
    'Navigate to a URL in the browser and wait for the page to load',
    navigateSchema.shape,
    async (args) => {
      await ensureConnected();
      return navigate(relay, sessions, args);
    },
  );

  server.tool(
    'click',
    'Click an element on the page by CSS selector. Uses human-like mouse movement.',
    clickSchema.shape,
    async (args) => {
      await ensureConnected();
      return click(relay, sessions, args);
    },
  );

  server.tool(
    'type',
    'Type text into the page using human-like keystroke simulation. Optionally focus an element first.',
    typeSchema.shape,
    async (args) => {
      await ensureConnected();
      return typeTool(relay, sessions, args);
    },
  );

  server.tool(
    'screenshot',
    'Take a screenshot of the current page. Returns an image.',
    screenshotSchema.shape,
    async (args) => {
      await ensureConnected();
      return screenshot(relay, sessions, args);
    },
  );

  server.tool(
    'evaluate',
    'Execute JavaScript code in the page context and return the result',
    evaluateSchema.shape,
    async (args) => {
      await ensureConnected();
      return evaluate(relay, sessions, args);
    },
  );

  server.tool(
    'get_page_info',
    'Get current page URL, title, ready state, and optionally the accessibility tree',
    getPageInfoSchema.shape,
    async (args) => {
      await ensureConnected();
      return getPageInfo(relay, sessions, args);
    },
  );

  server.tool(
    'wait',
    'Wait for a specified number of milliseconds',
    waitSchema.shape,
    async (args) => {
      return wait(args);
    },
  );

  server.tool(
    'get_tabs',
    'List all currently attached browser tabs with their session IDs, URLs, and titles',
    getTabsSchema.shape,
    async () => {
      await ensureConnected();
      return getTabs(sessions);
    },
  );

  server.tool(
    'switch_tab',
    'Switch to (activate) a specific browser tab by its session ID',
    switchTabSchema.shape,
    async (args) => {
      await ensureConnected();
      return switchTab(relay, sessions, args);
    },
  );

  // --- Low-level tool ---

  server.tool(
    'cdp_command',
    'Send a raw CDP (Chrome DevTools Protocol) command. For advanced users who need direct access to any CDP method.',
    cdpCommandSchema.shape,
    async (args) => {
      await ensureConnected();
      return cdpCommand(relay, sessions, args);
    },
  );

  return { server, relay };
}
