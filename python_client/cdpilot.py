import asyncio
import json
import websockets

class CDPilot:
    def __init__(self, url="ws://127.0.0.1:18792/client"):
        self.url = url
        self.ws = None
        self.request_id = 1
        self.pending_requests = {}

    async def connect(self):
        """Connect to the Relay Server."""
        try:
            self.ws = await websockets.connect(self.url)
            print(f"Connected to {self.url}")
            # Start listener loop in background
            asyncio.create_task(self._listener())
        except Exception as e:
            print(f"Connection failed: {e}")
            raise

    async def _listener(self):
        """Listen for incoming messages."""
        try:
            async for message in self.ws:
                data = json.loads(message)
                if 'id' in data and data['id'] in self.pending_requests:
                    # Resolve pending request
                    future = self.pending_requests.pop(data['id'])
                    if 'error' in data:
                        future.set_exception(Exception(data['error']))
                    else:
                        future.set_result(data.get('result'))
        except websockets.exceptions.ConnectionClosed:
            print("Connection closed")

    async def send_command(self, method, params=None):
        """Send a CDP command via the Relay."""
        if not self.ws:
            raise Exception("Not connected")
        
        req_id = self.request_id
        self.request_id += 1
        
        payload = {
            "id": req_id,
            "method": "forwardCDPCommand",
            "params": {
                "method": method,
                "params": params or {}
            }
        }
        
        future = asyncio.Future()
        self.pending_requests[req_id] = future
        
        await self.ws.send(json.dumps(payload))
        return await future

    async def navigate(self, url):
        """Navigate to a URL."""
        print(f"Navigating to {url}...")
        return await self.send_command("Page.navigate", {"url": url})

    async def evaluate(self, expression, await_promise=False):
        """Evaluate JavaScript."""
        res = await self.send_command("Runtime.evaluate", {
            "expression": expression,
            "awaitPromise": await_promise,
            "returnByValue": True
        })
        return res.get("result", {}).get("value")

    async def wait(self, ms):
        """Wait for milliseconds (local sleep)."""
        print(f"Waiting {ms}ms...")
        await asyncio.sleep(ms / 1000)

    async def wait_for_element(self, selector, timeout=10000):
        """Wait for an element to appear via JS polling."""
        print(f"Waiting for element: {selector}...")
        start_time = asyncio.get_running_loop().time()
        while (asyncio.get_running_loop().time() - start_time) * 1000 < timeout:
            exists = await self.evaluate(f"document.querySelector('{selector}') !== null")
            if exists:
                print("Element found!")
                return True
            await asyncio.sleep(0.5)
        print("Element not found (timeout)")
        return False

    async def type(self, selector, text):
        """Type text into an element."""
        # 1. Focus
        await self.evaluate(f"""
            (function() {{
                const el = document.querySelector('{selector}');
                if (el) {{ el.focus(); el.click(); return true; }}
                return false;
            }})()
        """)
        # 2. Insert text
        print(f"Typing '{text}' into {selector}...")
        await self.send_command("Input.insertText", {"text": text})

    async def press(self, key):
        """Press a key (e.g. 'Enter')."""
        print(f"Pressing {key}...")
        # Simplification: Handling Enter commonly
        if key == "Enter":
            await self.send_command("Input.dispatchKeyEvent", {"type": "rawKeyDown", "windowsVirtualKeyCode": 13, "nativeVirtualKeyCode": 13, "unmodifiedText": "\r", "text": "\r"})
            await self.send_command("Input.dispatchKeyEvent", {"type": "char", "text": "\r"})
            await self.send_command("Input.dispatchKeyEvent", {"type": "keyUp", "windowsVirtualKeyCode": 13, "nativeVirtualKeyCode": 13, "unmodifiedText": "\r", "text": "\r"})

    async def click(self, selector):
        """Click an element."""
        print(f"Clicking {selector}...")
        return await self.evaluate(f"""
            (function() {{
                const el = document.querySelector('{selector}');
                if (el) {{ el.click(); return true; }}
                return false;
            }})()
        """)

    async def get_page_info(self):
        """Get page title and URL."""
        title = await self.evaluate("document.title")
        url = await self.evaluate("window.location.href")
        return {"title": title, "url": url}

    async def close(self):
        if self.ws:
            await self.ws.close()
