# CDPilot MCP Server 使用文档

本文档详细介绍了 CDPilot MCP Server 的安装、配置及使用方法。该服务器遵循 [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) 标准，允许 AI 模型（如 Claude Desktop, Cursor 等）直接控制 Chrome 浏览器进行自动化操作。

## 1. 架构说明

系统由三部分组成：

```mermaid
graph LR
    AI[AI 客户端\n(Claude Desktop/Cursor)] <--> MCP[MCP Server\n(mcp-server)]
    MCP <--> Relay[中继服务器\n(relay-server.js)]
    Relay <--> Ext[Chrome 扩展\n(CDPilot)] <--> Chrome[Chrome 标签页]
```

1.  **Relay Server**: WebSocket 中继，负责转发消息。
2.  **Chrome 扩展**: 连接到 Relay，执行实际的浏览器操作。
3.  **MCP Server**: 连接到 Relay，将 AI 的指令转换为浏览器操作。

## 2. 快速开始

### 2.1 启动中继服务器 (Relay)

在项目根目录 (`f:\python\自动化测试版\浏览器插件\ex`) 下运行：

```bash
node relay-server.js
```

成功启动后会显示：
```
[17:55:09] CDPilot Relay Server started on http://127.0.0.1:18792
```

### 2.2 安装与配置 Chrome 扩展

1.  打开 Chrome 浏览器，访问 `chrome://extensions`。
2.  开启右上角的“开发者模式”。
3.  点击“加载已解压的扩展程序”，选择 `f:\python\自动化测试版\浏览器插件\ex` 目录。
4.  打开你要控制的网页（例如 `https://www.google.com`）。
5.  点击浏览器右上角的 **CDPilot 扩展图标**。
    *   图标变为 **橙红色 (ON)** 表示连接成功。
    *   如果图标显示红色感叹号 (!)，请检查 Relay 服务器是否已启动。

### 2.3 启动 MCP Server

进入 `mcp-server` 目录并安装依赖（首次运行时）：

```bash
cd mcp-server
npm install
npm run build
```

## 3. 在 AI 客户端中使用

### 3.1 Claude Desktop 配置

编辑 Claude Desktop 的配置文件（通常位于 `%APPDATA%\Claude\claude_desktop_config.json`），添加以下内容：

```json
{
  "mcpServers": {
    "cdpilot": {
      "command": "node",
      "args": [
        "F:/python/自动化测试版/浏览器插件/ex/mcp-server/dist/index.js"
      ],
      "env": {
        "RELAY_HOST": "127.0.0.1",
        "RELAY_PORT": "18792"
      }
    }
  }
}
```

*注意：请将路径替换为你实际的绝对路径。*

### 3.2 环境变量配置

MCP Server 支持以下环境变量：

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `RELAY_HOST` | `127.0.0.1` | 中继服务器地址 |
| `RELAY_PORT` | `18792` | 中继服务器端口 |
| `RELAY_TOKEN` | (空) | (可选) 连接认证令牌 |

## 4. 可用工具 (Tools)

MCP Server 提供了以下工具供 AI 调用：

### 4.1 基础导航与信息

#### `navigate`
导航到指定 URL。
*   **参数**:
    *   `url` (string, 必填): 目标网址。
    *   `sessionId` (string, 可选): 指定标签页 ID。

#### `get_page_info`
获取当前页面的基本信息。
*   **参数**:
    *   `includeAccessibilityTree` (boolean, 默认 false): 是否包含无障碍树（用于理解页面结构）。
    *   `sessionId` (string, 可选): 指定标签页 ID。

#### `screenshot`
获取当前页面截图。
*   **参数**:
    *   `format` (string, 默认 'png'): 图片格式 ('png', 'jpeg', 'webp')。
    *   `quality` (number, 可选): 图片质量 (0-100)。
    *   `fullPage` (boolean, 默认 false): 是否截取长图。
    *   `sessionId` (string, 可选): 指定标签页 ID。

### 4.2 交互操作

#### `click`
点击页面元素。会自动模拟人类鼠标移动轨迹。
*   **参数**:
    *   `selector` (string, 必填): 元素的 CSS 选择器。
    *   `sessionId` (string, 可选): 指定标签页 ID。

#### `type`
在元素中输入文本。会自动模拟人类键盘输入（逐字符输入）。
*   **参数**:
    *   `text` (string, 必填): 要输入的文本。
    *   `selector` (string, 可选): 输入前要聚焦的元素选择器。
    *   `sessionId` (string, 可选): 指定标签页 ID。

#### `wait`
等待指定时间。
*   **参数**:
    *   `ms` (number, 必填): 等待的毫秒数 (最大 30000)。

### 4.3 浏览器执行

#### `evaluate`
在页面上下文中执行 JavaScript 代码。
*   **参数**:
    *   `expression` (string, 必填): 要执行的 JS 代码。
    *   `awaitPromise` (boolean, 默认 false): 是否等待 Promise 结果。
    *   `sessionId` (string, 可选): 指定标签页 ID。

#### `cdp_command`
发送原始 Chrome DevTools Protocol (CDP) 命令。
*   **参数**:
    *   `method` (string, 必填): CDP 方法名 (如 "DOM.getDocument")。
    *   `params` (object, 可选): CDP 参数。
    *   `sessionId` (string, 可选): 指定标签页 ID。

### 4.4 多标签页管理

#### `get_tabs`
获取所有已连接的标签页列表。
*   **参数**: 无。

#### `switch_tab`
切换/激活指定的标签页。
*   **参数**:
    *   `sessionId` (string, 必填): 要激活的标签页 Session ID。

## 5. 常见问题 (FAQ)

**Q: 为什么工具调用总是超时或失败？**
A: 请按顺序检查：
1.  **Relay 服务器** 是否正在运行 (`node relay-server.js`)？
2.  **Chrome 扩展** 是否已连接（图标是否为橙色）？
3.  如果是首次运行，请尝试刷新 Chrome 页面并重新点击扩展图标。

**Q: 如何控制多个标签页？**
A:
1.  在不同标签页中分别点击扩展图标，将它们都连接到 Relay。
2.  使用 `get_tabs` 工具查看所有已连接标签页的 `sessionId`。
3.  在调用其他工具（如 `navigate`, `click`）时，传入对应的 `sessionId` 参数。如果未传入，默认操作第一个连接的标签页。

**Q: 截图只显示可视区域？**
A: `screenshot` 工具默认只截取视口。如果需要全页面截图，请设置 `fullPage: true`。

**Q: 元素点击无效？**
A:
1.  确认 CSS 选择器是否正确。
2.  尝试使用 `evaluate` 工具执行 `document.querySelector('...').click()` 作为备选方案（但这会跳过人类鼠标模拟）。

**Q: 浏览器顶部的"CDPilot 已开始调试此浏览器"提示会被网站检测到吗？**
A: **不会**。这个提示条属于 Chrome 浏览器的 UI 界面，网页的 JavaScript 无法读取或检测到它。
如果你想隐藏这个提示，可以在启动 Chrome 时添加参数 `--silent-debugger-extension-api`。

**Q: 如何提高防检测能力？**
A: 本扩展已内置防检测脚本（覆盖 `navigator.webdriver` 等）。为了进一步降低风险，建议：
1.  使用普通用户的 Chrome 配置文件（Profile），保留这里的 Cookies 和历史记录。
2.  避免在极短时间内进行大量高频操作。

