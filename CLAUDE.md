# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 项目概览

**CDPilot** — 一个 Chrome 扩展程序（Manifest V3）+ MCP Server，通过本地 CDP（Chrome DevTools Protocol）中继服务器将自动化平台连接到 Chrome 标签页。

- **Chrome 扩展**：无需构建系统或依赖；全部采用原生 JavaScript 使用 Chrome 扩展程序 API。
- **MCP Server**：TypeScript 项目（`mcp-server/`），为 Claude、ChatGPT 等 AI 平台提供标准化浏览器控制接口。

```
AI 平台 (Claude/ChatGPT) → MCP Server → WebSocket → CDP 中继服务器 → Chrome 扩展 → Chrome 标签页
```

## 开发

### Chrome 扩展

没有构建步骤。开发和测试方法：

1. 在 Chrome 中打开 `chrome://extensions`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"并选择此目录
4. 修改代码后，点击扩展程序卡片上的刷新图标

扩展程序连接到本地中继服务器地址 `ws://127.0.0.1:{port}/extension`（默认端口：18792）。

### MCP Server

```bash
cd mcp-server
npm install
npm run build    # TypeScript → dist/
npm run dev      # 使用 tsx 直接运行（开发模式）
npm start        # 运行编译后的 JS
```

环境变量：`RELAY_PORT`（默认 18792）、`RELAY_HOST`（默认 127.0.0.1）、`RELAY_ENDPOINT`（默认 /client）、`RELAY_TOKEN`、`HTTP_PORT`（默认 3000）。

启动模式：
- **stdio**（默认）：`node dist/index.js` — 供 Claude Desktop 等本地客户端 spawn
- **HTTP**：`node dist/index.js --http` — 启动 HTTP 服务器供远程客户端使用

## 架构

### Chrome 扩展

五个组件遵循标准 Chrome Extension V3 结构：

- **background.js** — Service Worker。核心逻辑：管理与中继服务器的 WebSocket 连接，对标签页进行 Chrome Debugger 的附加/分离，在中继服务器和 Chrome 标签页之间双向转发 CDP 命令/事件。通过会话 ID 跟踪多个附加的标签页。处理标签页生命周期（创建、关闭、激活）和子目标会话。包含防检测脚本注入、交互延迟、人类化键盘/鼠标模拟、自动重连（指数退避）、心跳监控、会话保存/恢复、日志缓冲等功能。

- **options.html + options.js** — 设置 UI，用于配置中继服务器端口和认证令牌。包含针对中继服务器的实时连接性验证、Chrome 启动参数提示、调试日志入口。

- **log.html + log.js** — 调试日志面板，从 `chrome.storage.local._logs` 读取环形日志缓冲并渲染，显示连接事件、附加/分离操作和错误信息。

- **manifest.json** — 权限：`debugger`、`tabs`、`activeTab`、`storage`。主机权限仅限本地主机。

### MCP Server（`mcp-server/`）

TypeScript 项目，依赖 `@modelcontextprotocol/sdk`、`ws`、`zod`。

- **src/index.ts** — 入口：检测 `--http` 参数选择 stdio 或 StreamableHTTP 传输
- **src/server.ts** — 创建 McpServer 实例，注册全部 10 个工具
- **src/relay-client.ts** — WebSocket 客户端，连接中继服务器（发送 `forwardCDPCommand`，接收结果和 `forwardCDPEvent`）。包含预检 HEAD、指数退避重连、心跳 ping/pong
- **src/session-manager.ts** — 监听 `Target.attachedToTarget`/`detachedFromTarget` 事件维护会话列表
- **src/config.ts** — 环境变量配置
- **src/tools/** — 10 个工具实现：
  - 高层：`navigate`、`click`、`type`、`screenshot`、`evaluate`、`get_page_info`、`wait`、`get_tabs`、`switch_tab`
  - 低层：`cdp_command`（原始 CDP 透传）

## 关键模式

- WebSocket 连接在连接前有预检 HEAD 请求，断开连接时自动重连（指数退避，1s → 30s 上限）
- 心跳监控：每 15s 发送 ping，10s 内无 pong 则强制关闭 WebSocket
- 徽章文本提供视觉状态：`ON`（已连接）、`…`（连接中）、`!`（错误）、空白（关闭）
- CDP 命令通过会话跟踪进行中继 — 每个附加的标签页都获得唯一的会话 ID
- 子目标会话（例如 iframe、worker）通过 `Target.attachToTarget` 支持
- 使用 `chrome.storage.local` 持久化存储中继端口设置、认证令牌、会话标签页
- 防检测：附加时注入 `Page.addScriptToEvaluateOnNewDocument` 覆盖 `navigator.webdriver` 和 `navigator.plugins`
- 交互命令（Input.dispatch*）自动添加 30-150ms 随机延迟
- 自定义 CDP 方法：`Input.dispatchRealKey`（完整键盘事件链）、`Input.humanMouseMove`（贝塞尔曲线鼠标轨迹）、`Extension.restoreSession`（会话恢复）
- 环形日志缓冲（上限 200 条）持久化到 `chrome.storage.local._logs`

### MCP Server 关键模式

- 懒连接：首次工具调用时才连接中继服务器 WebSocket
- 复用扩展的 `forwardCDPCommand`/`forwardCDPEvent` 协议，连接端点为 `/client`
- 工具的 `sessionId` 参数可选，未指定时自动选择第一个已附加标签页
- `click` 工具组合 `Runtime.evaluate`（取坐标）→ `Input.humanMouseMove`（贝塞尔曲线）→ `Input.dispatchMouseEvent`
- `type` 工具使用 `Input.dispatchRealKey` 逐字符输入（完整 keyDown→char→keyUp 事件链）
- `screenshot` 返回 MCP image content（base64 + mimeType）
- 命令超时 30 秒
