# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 项目概览

**OpenClaw Browser Relay** — 一个 Chrome 扩展程序（Manifest V3），通过本地 CDP（Chrome DevTools Protocol）中继服务器将 OpenClaw 自动化平台连接到 Chrome 标签页。无需构建系统或依赖；全部采用原生 JavaScript 使用 Chrome 扩展程序 API。

## 开发

没有构建步骤。开发和测试方法：

1. 在 Chrome 中打开 `chrome://extensions`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"并选择此目录
4. 修改代码后，点击扩展程序卡片上的刷新图标

扩展程序连接到本地中继服务器地址 `ws://127.0.0.1:{port}/extension`（默认端口：18792）。

## 架构

三个组件遵循标准 Chrome Extension V3 结构：

- **background.js** — Service Worker。核心逻辑：管理与中继服务器的 WebSocket 连接，对标签页进行 Chrome Debugger 的附加/分离，在中继服务器和 Chrome 标签页之间双向转发 CDP 命令/事件。通过会话 ID 跟踪多个附加的标签页。处理标签页生命周期（创建、关闭、激活）和子目标会话。

- **options.html + options.js** — 设置 UI，用于配置中继服务器端口。包含针对中继服务器的实时连接性验证。

- **manifest.json** — 权限：`debugger`、`tabs`、`activeTab`、`storage`。主机权限仅限本地主机。

## 关键模式

- WebSocket 连接在连接前有预检 HEAD 请求，断开连接时自动重试
- 徽章文本提供视觉状态：`ON`（已连接）、`…`（连接中）、`!`（错误）、空白（关闭）
- CDP 命令通过会话跟踪进行中继 — 每个附加的标签页都获得唯一的会话 ID
- 子目标会话（例如 iframe、worker）通过 `Target.attachToTarget` 支持
- 使用 `chrome.storage.local` 持久化存储中继端口设置
