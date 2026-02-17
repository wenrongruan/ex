# CDPilot Python 客户端

此目录包含一个 Python 客户端，可以通过 CDPilot Relay Server 控制浏览器。
这允许你编写标准的 Python 脚本来自动化浏览器任务，而**不需要消耗 LLM Token**。

## 文件说明

-   **`cdpilot.py`**: 核心库。封装了 WebSocket 通信和常用操作。
-   **`search_x.py`**: 示例脚本。演示打开 X.com 并搜索 "ibkr"。
-   **`requirements.txt`**: 依赖列表。

## 如何运行

1.  **确保 Relay Server 正在运行**:
    在 `F:\python\自动化测试版\浏览器插件\ex` 目录下打开终端运行：
    ```bash
    node relay-server.js
    ```

2.  **安装依赖**:
    ```bash
    pip install -r requirements.txt
    ```

3.  **运行脚本**:
    ```bash
    python search_x.py
    ```

## 编写你自己的脚本

你可以参考以下模板编写自动化脚本：

```python
import asyncio
from cdpilot import CDPilot

async def main():
    # 初始化客户端
    client = CDPilot()
    await client.connect()
    
    # 导航到网页
    await client.navigate("https://www.google.com")
    
    # 等待元素出现
    await client.wait_for_element("textarea[name='q']")
    
    # 输入内容并回车
    await client.type("textarea[name='q']", "Hello World")
    await client.press("Enter")
    
    # 执行任意 JavaScript 获取数据
    title = await client.evaluate("document.title")
    print(f"网页标题: {title}")

    await client.close()

if __name__ == "__main__":
    asyncio.run(main())
```
