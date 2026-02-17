---
name: CDPilot 浏览器自动化 (Control Chrome)
description: 使用 CDPilot MCP Server 控制 Chrome 浏览器执行自动化任务，如数据抓取、测试、复杂工作流。
---

# CDPilot 浏览器自动化技能指南

本技能允许你通过 MCP Server 操控 Chrome 浏览器。你的目标是作为智能体 (Agent) 高效、稳定地完成用户的浏览器任务。

## 1. 核心原则 (Core Principles)

1.  **探索优先 (Exploration First)**: 进入新页面后，总是先调用 `get_page_info` 来理解当前页面上下文和结构。
2.  **稳健选择器 (Robust Selectors)**: 在使用 `click` 或 `type` 时，优先构建不易随布局变化而失效的 CSS 选择器（如 ID、data-属性、特定的类名组合）。
3.  **拟人化操作 (Stealth)**: 工具已内置拟人化行为（鼠标轨迹、随机延迟）。**不要**为了追求速度而尝试绕过这些延迟，除非用户明确要求极致速度。
4.  **错误处理 (Error Handling)**: 如果操作失败，使用 `screenshot` 查看当前状态，或使用 `evaluate` 检查 DOM，而不是盲目重试。

## 2. 工具能力详解 (Capabilities)

你拥有以下 10 个工具：

### 基础操作

-   **`navigate(url)`**: 导航到指定 URL。
    -   *场景*: 开始新任务或重置状态。
-   **`get_page_info(includeAccessibilityTree)`**: 获取页面详细信息（URL、标题、无障碍树）。
    -   *最佳实践*: 页面加载后立即调用。若页面内容复杂，设置 `includeAccessibilityTree: true` 以获取更结构化的视图。
-   **`screenshot(fullPage)`**: 截取当前页面。
    -   *场景*: 验证操作结果、调试错误、保存证据。
-   **`wait(ms)`**: 等待指定毫秒数。
    -   *最佳实践*: **不要盲目操作**。在 `click` 或 `type` 之前，总是先通过 `wait` 等待几秒，或者使用 `evaluate` 循环检查元素是否存在。

### 交互操作

-   **`click(selector)`**: 模拟人类点击元素。
    -   *注意*: 需要精准的 CSS 选择器。如果点击无效，尝试使用 `evaluate` 执行 JS 点击作为备选。
-   **`type(text, selector)`**: 模拟人类键盘输入。
    -   *最佳实践*: 总是提供 `selector` 以确保输入前聚焦正确的元素。如果不确定元素是否准备好，先用 `evaluate` 检查。

### 高级操作

-   **`evaluate(expression)`**: 执行任意 JavaScript 代码。
    -   *重要技巧*: **等待元素 (Wait for Element)**
        ```js
        // 循环检查元素是否出现
        const el = document.querySelector('textarea[name="q"]');
        return el ? true : false;
        ```
    -   *场景*:
        -   **数据抓取**: `Array.from(document.querySelectorAll(...)).map(...)`
        -   **复杂交互**: 处理 Shadow DOM、iframe 或标准点击无法触发的元素。
        -   **状态检查**: `document.querySelector(...) !== null`

### 多标签页管理

-   **`get_tabs()`**: 获取所有已连接的标签页列表。
-   **`switch_tab(sessionId)`**: 切换到指定标签页。
    -   *注意*: 所有其他工具都支持 `sessionId` 参数，可以在不切换标签页的情况下后台操作其他标签页。

## 3. 常见工作流示例 (Workflows)

### 场景 A: 谷歌搜索 (Google Search) - 稳健版

1.  `navigate(url="https://www.google.com")`
2.  `wait(ms=2000)` (等待页面加载)
3.  `evaluate(expression="document.querySelector('textarea[name=\\'q\\']') !== null")` (确认输入框存在)
4.  `type(text="MCP Protocol", selector="textarea[name='q']")`
5.  `click(selector="input[name='btnK']")` (或者通过 `cdp_command` 发送 "Enter" 键)
4.  `wait(ms=2000)` (等待结果加载)
5.  `get_page_info()` (验证搜索结果)

### 场景 B: 数据抓取 (Scraping)

1.  `navigate(url="https://example.com/products")`
2.  `evaluate(expression="Array.from(document.querySelectorAll('.product-item')).map(el => ({ name: el.querySelector('.title').innerText, price: el.querySelector('.price').innerText }))")`
3.  (如果需要翻页): `click(selector=".next-page")` 然后重复步骤 2。

### 场景 C: 处理登录 (Login)

1.  `navigate(url="https://example.com/login")`
2.  `type(text="myusername", selector="#username")`
3.  `type(text="mypassword", selector="#password")`
4.  `click(selector="button[type='submit']")`
5.  `wait(ms=3000)`
6.  `screenshot()` (验证是否登录成功)

## 4. 故障排除 (Troubleshooting)

-   **"Node not found" / "Element not found"**:
    -   元素可能位于 iframe 或 Shadow DOM 中。
    -   页面可能尚未完全加载。尝试 `wait` 或检查 `document.readyState`。
    -   选择器可能已过时。使用 `evaluate` 获取页面 HTML 片段来重新分析。
-   **"Interaction failed"**:
    -   元素可能被弹窗或遮罩层覆盖。使用 `screenshot` 检查。
    -   元素可能不可见（`display: none`）。
-   **脚本执行超时**:
    -   `evaluate` 中的 JS 代码死循环或执行时间过长。优化 JS 代码。
