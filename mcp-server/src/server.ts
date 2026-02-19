import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RelayClient } from './relay-client.js';
import { SessionManager } from './session-manager.js';
import { navigateSchema, navigate } from './tools/navigate.js';
import { clickSchema, click } from './tools/click.js';
import { typeSchema, type as typeTool } from './tools/type.js';
import { screenshotSchema, screenshot } from './tools/screenshot.js';
import { evaluateSchema, evaluate } from './tools/evaluate.js';
import { getContentSchema, getContent } from './tools/get-content.js';
import { waitForSchema, waitFor } from './tools/wait-for.js';
import { scrollSchema, scroll } from './tools/scroll.js';
import { getTabsSchema, getTabs } from './tools/get-tabs.js';
import { switchTabSchema, switchTab } from './tools/switch-tab.js';
import { closeTabSchema, closeTab } from './tools/close-tab.js';
import { newTabSchema, newTab } from './tools/new-tab.js';
import { detectCaptchaSchema, detectCaptcha } from './tools/detect-captcha.js';
import { captchaScreenshotSchema, captchaScreenshot } from './tools/captcha-screenshot.js';
import { simulateDragSchema, simulateDrag } from './tools/simulate-drag.js';
import { waitForHumanSchema, waitForHuman } from './tools/wait-for-human.js';
import { solveCaptchaSchema, solveCaptcha } from './tools/solve-captcha.js';
import { cdpCommandSchema, cdpCommand } from './tools/cdp-command.js';

export function createServer() {
  const relay = new RelayClient();
  const sessions = new SessionManager(relay);

  const server = new McpServer({
    name: 'cdpilot',
    version: '1.1.0',
  });

  // Connect to relay on first tool call (concurrent-safe: reuse in-flight promise)
  let connectingPromise: Promise<void> | null = null;
  async function ensureConnected() {
    if (relay.connected) return;
    if (!connectingPromise) {
      connectingPromise = relay.connect().finally(() => { connectingPromise = null; });
    }
    return connectingPromise;
  }

  // --- 基础浏览工具 ---

  server.tool(
    'navigate',
    '导航到指定URL。支持访问任何网站，包括 x.com、facebook.com、amazon.com 等。',
    navigateSchema.shape,
    async (args) => {
      await ensureConnected();
      return navigate(relay, sessions, args);
    },
  );

  server.tool(
    'screenshot',
    '截取当前页面截图，返回 base64 编码的 PNG 图片。',
    screenshotSchema.shape,
    async (args) => {
      await ensureConnected();
      return screenshot(relay, sessions, args);
    },
  );

  server.tool(
    'click',
    '点击页面上的指定元素。使用人类化鼠标移动轨迹。',
    clickSchema.shape,
    async (args) => {
      await ensureConnected();
      return click(relay, sessions, args);
    },
  );

  server.tool(
    'type',
    '在指定输入框中输入文本，会先清空原有内容。使用人类化按键模拟。',
    typeSchema.shape,
    async (args) => {
      await ensureConnected();
      return typeTool(relay, sessions, args);
    },
  );

  server.tool(
    'get_content',
    '获取页面或指定元素的文本内容。',
    getContentSchema.shape,
    async (args) => {
      await ensureConnected();
      return getContent(relay, sessions, args);
    },
  );

  server.tool(
    'evaluate',
    '在当前页面执行 JavaScript 代码并返回结果。',
    evaluateSchema.shape,
    async (args) => {
      await ensureConnected();
      return evaluate(relay, sessions, args);
    },
  );

  server.tool(
    'wait_for',
    '等待指定元素在页面上出现。',
    waitForSchema.shape,
    async (args) => {
      await ensureConnected();
      return waitFor(relay, sessions, args);
    },
  );

  server.tool(
    'scroll',
    '滚动页面。',
    scrollSchema.shape,
    async (args) => {
      await ensureConnected();
      return scroll(relay, sessions, args);
    },
  );

  server.tool(
    'get_tabs',
    '列出所有打开的标签页信息。',
    getTabsSchema.shape,
    async () => {
      await ensureConnected();
      return getTabs(sessions);
    },
  );

  server.tool(
    'switch_tab',
    '切换到指定标签页。',
    switchTabSchema.shape,
    async (args) => {
      await ensureConnected();
      return switchTab(relay, sessions, args);
    },
  );

  server.tool(
    'close_tab',
    '关闭指定标签页。不指定则关闭当前标签页。',
    closeTabSchema.shape,
    async (args) => {
      await ensureConnected();
      return closeTab(relay, sessions, args);
    },
  );

  server.tool(
    'new_tab',
    '创建新标签页并可选导航到指定URL。',
    newTabSchema.shape,
    async (args) => {
      await ensureConnected();
      return newTab(relay, sessions, args);
    },
  );

  // --- 验证码工具 ---

  server.tool(
    'detect_captcha',
    '检测当前页面的验证码类型。返回 JSON 含 type（recaptcha_v2/hcaptcha/slider/image_captcha 等）、suggested_action（建议下一步操作）、site_key 等字段。',
    detectCaptchaSchema.shape,
    async (args) => {
      await ensureConnected();
      return detectCaptcha(relay, sessions, args);
    },
  );

  server.tool(
    'captcha_screenshot',
    '自动定位验证码区域并截图，返回 PNG 图片供 AI Vision 识别。不指定 selector 时自动检测验证码元素位置。',
    captchaScreenshotSchema.shape,
    async (args) => {
      await ensureConnected();
      return captchaScreenshot(relay, sessions, args);
    },
  );

  server.tool(
    'simulate_drag',
    '模拟真实鼠标拖动，主要用于滑块验证码，也支持任意拖拽场景。使用缓动函数和随机抖动模拟人类操作。',
    simulateDragSchema.shape,
    async (args) => {
      await ensureConnected();
      return simulateDrag(relay, sessions, args);
    },
  );

  server.tool(
    'wait_for_human',
    '轮询等待人工在可见 Chrome 窗口完成验证码操作。检测验证码元素消失或目标元素出现。',
    waitForHumanSchema.shape,
    async (args) => {
      await ensureConnected();
      return waitForHuman(relay, sessions, args);
    },
  );

  server.tool(
    'solve_captcha',
    '调用配置的第三方验证码服务（2Captcha/CapSolver）自动求解并注入 token。需设置环境变量 CAPTCHA_PROVIDER 和 CAPTCHA_API_KEY。',
    solveCaptchaSchema.shape,
    async (args) => {
      await ensureConnected();
      return solveCaptcha(relay, sessions, args);
    },
  );

  // --- 低级工具 ---

  server.tool(
    'cdp_command',
    '发送原始 CDP（Chrome DevTools Protocol）命令。适合需要直接访问任意 CDP 方法的高级用户。',
    cdpCommandSchema.shape,
    async (args) => {
      await ensureConnected();
      return cdpCommand(relay, sessions, args);
    },
  );

  return { server, relay };
}
