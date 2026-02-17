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
            
        if found:
            # 6. 输入 "ibkr"
            await client.type(search_selector, "ibkr")
            await client.wait(1000)
            
            # 7. 按下回车键
            await client.press("Enter")
            print("搜索已提交！")

            # 8. 等待搜索结果
            await client.wait(5000)
            
            # 9. 获取页面内容
            page_info = await client.evaluate("document.body.innerHTML")
            print("页面内容:", page_info)

            # 10. 根据页面内容判断是否成功
            if "ibkr" in page_info:
                print("搜索成功！")
               
            else:
                print("搜索失败！")
                exit()
            # 11. 点击包含ibkr的第一条评论
            # 查找 "View all" 下面的第一条内容
            click_script = """
            (function() {
                // 1. 找到 "View all" span
                const viewAllSpan = Array.from(document.querySelectorAll('span')).find(el => el.textContent === 'View all');
                if (!viewAllSpan) return "View all not found";

                // 2. 向上找到它的容器 cell (假设它在一个 cellInnerDiv 里或类似的结构)
                // 通过观察 HTML，View all 在一个带 role="link" 的 a 标签里，这个 a 标签在一个 div[data-testid="cellInnerDiv"] 里
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
                await client.click('article[data-testid="tweet"]')

            # 12. 等待 Tweet 详情页加载 (等待回复按钮出现)
            print("等待 Tweet 详情页加载...")
            reply_btn_selector = 'button[data-testid="reply"]'
            await client.wait_for_element(reply_btn_selector)

            # 13. 获取 Tweet 内容
            print("获取 Tweet 内容...")
            tweet_text = await client.evaluate("""
                (function() {
                    // 尝试获取详情页的主要 Tweet 内容
                    // 通常是 article[data-testid="tweet"] 里的 tweetText，且不应该包含 reader-hidden (被折叠的)
                    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
                    // 详情页通常主要 tweet 是第一个或者是最显眼的。
                    // 简单起见，取第一个可见的 tweetText
                    for (const article of articles) {
                        const textEl = article.querySelector('div[data-testid="tweetText"]');
                        if (textEl) return textEl.innerText;
                    }
                    return "";
                })()
            """)
            print(f"Tweet 内容: {tweet_text}")

            # 14. 使用 Gemini 生成回复
            api_key = os.getenv("GEMINI_API_KEY") or "YOUR_API_KEY_HERE"

            if not api_key or api_key == "YOUR_API_KEY_HERE":
                print("请在 python_client/.env 中设置 GEMINI_API_KEY，或者设置环境变量。")
                # 为了演示流程，如果没 Key，跳过生成或使用默认文本
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
            await client.click(reply_btn_selector)
            
            # 16. 等待输入框出现
            print("等待回复输入框...")
            # 这里的 selector 可能是 div[data-testid="tweetTextarea_0"]
            textbox_selector = 'div[data-testid="tweetTextarea_0"]'
            found_box = await client.wait_for_element(textbox_selector)
            if not found_box:
                 # 备选 selector
                 textbox_selector = 'div[role="textbox"]'
                 await client.wait_for_element(textbox_selector)

            # 17. 输入回复内容
            await client.type(textbox_selector, reply_text)
            await client.wait(1000)
            
            # 18. 点击发送按钮
            send_btn_selector = 'button[data-testid="tweetButton"]'
            await client.click(send_btn_selector)
            print("回复已发送！")

    except Exception as e:
        print(f"发生错误: {e}")
    finally:
        await client.close()

if __name__ == "__main__":
    asyncio.run(main())
