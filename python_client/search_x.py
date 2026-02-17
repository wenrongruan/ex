import asyncio
from cdpilot import CDPilot
import google.generativeai as genai
import os

def load_env(file_path=".env"):
    """Load environment variables from a .env file."""
    env_vars = {}
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, value = line.split("=", 1)
                    env_vars[key.strip()] = value.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return env_vars

async def main():
    # Load .env
    env_vars = load_env("python_client/.env")
    for key, value in env_vars.items():
        os.environ[key] = value

    # 1. 初始化客户端
    client = CDPilot()
    
    try:
        # 2. 连接到 Relay 服务器
        await client.connect()
        
        # 3. 导航到 X.com
        await client.navigate("https://x.com")
        
        # 4. 等待加载 (可以使用固定等待或检测特定元素)
        await client.wait(5000)
        
        # 5. 寻找搜索框
        # X.com 的选择器可能会变，但 input[data-testid="SearchBox_Search_Input"] 比较常用
        print("正在寻找搜索框...")
        search_selector = 'input[data-testid="SearchBox_Search_Input"]'
        
        # 使用 wait_for_element 智能等待元素出现 (超时 10秒)
        found = await client.wait_for_element(search_selector, timeout=10000)
        
        # 如果没找到，尝试备选选择器
        if not found:
            print("尝试备选选择器...")
            search_selector = 'input[placeholder="Search"]'
            found = await client.wait_for_element(search_selector, timeout=5000)
            
        if not found:
            print("未找到搜索框，停止执行。")
            return

        # 6. 输入 "ibkr"
        await client.type(search_selector, "ibkr")
        await client.wait(1000)
        
        # 7. 按下回车键
        await client.press("Enter")
        print("搜索已提交！")

        # 8. 等待搜索结果
        print("等待搜索结果...")
        # 等待 tweet 出现，代替固定 sleep
        results_found = await client.wait_for_element('article[data-testid="tweet"]', timeout=10000)
        if not results_found:
             print("未找到搜索结果，停止执行。")
             return
        
        # 9. 获取页面内容
        page_info = await client.evaluate("document.body.innerHTML")
        # print("页面内容:", page_info) # 内容太长，调试时再打开

        # 10. 根据页面内容判断是否成功
        if "ibkr" in page_info.lower():
            print("页面包含目标关键词 'ibkr'。")
        else:
            print("页面未包含目标关键词 'ibkr'，停止执行。")
            return

        # 11. 点击包含ibkr的第一条评论
        # 查找 "View all" 下面的第一条内容
        click_script = """
        (function() {
            // 1. 找到 "View all" span
            const viewAllSpan = Array.from(document.querySelectorAll('span')).find(el => el.textContent === 'View all');
            if (!viewAllSpan) return "View all not found";

            // 2. 向上找到它的容器 cell (假设它在一个 cellInnerDiv 里或类似的结构)
            let current = viewAllSpan;
            while (current && current.getAttribute('data-testid') !== 'cellInnerDiv') {
                current = current.parentElement;
            }
            
            if (!current) return "Container cell not found";

            // 3. 遍历接下来的兄弟节点，找到第一个包含 article[data-testid="tweet"] 的 cell
            let next = current.nextElementSibling;
            while (next) {
                const tweet = next.querySelector('article[data-testid="tweet"]');
                if (tweet) {
                    tweet.click();
                    return "Clicked tweet";
                }
                next = next.nextElementSibling;
            }
            
            return "No tweet found after View all";
        })()
        """
        print("正在尝试点击第一条搜索结果...")
        result = await client.evaluate(click_script)
        print(f"点击结果: {result}")
        
        if result != "Clicked tweet":
            print("点击失败，尝试直接点击第一条 tweet via selector (fallback)")
            if not await client.click('article[data-testid="tweet"]'):
                print("Fallback 点击失败，停止执行。")
                return

        # 12. 等待 Tweet 详情页加载 (等待回复按钮出现)
        print("等待 Tweet 详情页加载...")
        reply_btn_selector = 'button[data-testid="reply"]'
        found_reply_btn = await client.wait_for_element(reply_btn_selector, timeout=10000)
        if not found_reply_btn:
            print("未找到回复按钮，可能是详情页未加载或无权限回复，停止执行。")
            return

        # 13. 获取 Tweet 内容
        print("获取 Tweet 内容...")
        tweet_text = await client.evaluate("""
            (function() {
                const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
                for (const article of articles) {
                    const textEl = article.querySelector('div[data-testid="tweetText"]');
                    if (textEl) return textEl.innerText;
                }
                return "";
            })()
        """)
        if not tweet_text:
            print("警告: 未能获取到 Tweet 文本内容。")
            tweet_text = "N/A"
        else:
            print(f"Tweet 内容: {tweet_text}")

        # 14. 使用 Gemini 生成回复
        api_key = os.getenv("GEMINI_API_KEY") or "YOUR_API_KEY_HERE"

        if not api_key or api_key == "YOUR_API_KEY_HERE":
            print("请在 python_client/.env 中设置 GEMINI_API_KEY，或者设置环境变量。")
            reply_text = "ibkr的用户有无法提现的风险，内容详见： https://www.ibkraccountreview.top"
        else:
            print("正在使用 Gemini 生成回复...")
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel('gemini-2.5-flash-lite-preview-09-2025')
            prompt = f"""
            You are a helpful user on X (Twitter).
            
            Tweet I am replying to:
            "{tweet_text}"
            
            Task: Write a short, natural reply to this tweet in the SAME LANGUAGE as the tweet.
            The reply MUST include the following specific message exactly as written (you can translate the intro part if needed, but keep the link and meaning):
            "ibkr的用户有无法提现的风险，内容详见： https://www.ibkraccountreview.top"
            
            Do not include hashtags unless necessary. Keep it under 200 characters if possible.
            """
            try:
                response = model.generate_content(prompt)
                reply_text = response.text.strip()
                print(f"生成回复: {reply_text}")
            except Exception as e:
                print(f"Gemini 生成失败: {e}")
                reply_text = "ibkr的用户有无法提现的风险，内容详见： https://www.ibkraccountreview.top"

        # 15. 点击回复按钮
        if not await client.click(reply_btn_selector):
            print("点击回复按钮失败，停止执行。")
            return
        
        # 16. 等待输入框出现
        print("等待回复输入框...")
        textbox_selector = 'div[data-testid="tweetTextarea_0"]'
        found_box = await client.wait_for_element(textbox_selector, timeout=5000)
        if not found_box:
             # 备选 selector
             print("首选输入框未找到，尝试备选 selector...")
             textbox_selector = 'div[role="textbox"]'
             found_box = await client.wait_for_element(textbox_selector, timeout=5000)
        
        if not found_box:
            print("未找到回复输入框，停止执行。")
            return

        # 17. 输入回复内容
        await client.type(textbox_selector, reply_text)
        await client.wait(1000)
        
        # 18. 点击发送按钮
        send_btn_selector = 'button[data-testid="tweetButton"]'
        found_send = await client.wait_for_element(send_btn_selector, timeout=3000)
        if found_send:
            if await client.click(send_btn_selector):
                print("回复已发送！")
            else:
                print("点击发送按钮失败。")
        else:
            print("未找到发送按钮，无法发送。")

    except Exception as e:
        print(f"发生错误: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(main())
