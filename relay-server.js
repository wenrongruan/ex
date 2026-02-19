#!/usr/bin/env node
/**
 * CDPilot CDP 中继服务器 (Relay Server)
 *
 * 在 Chrome 扩展 (/extension) 与 MCP 客户端 (/client) 之间双向转发消息。
 * 同时提供 HTTP HEAD / GET 预检端点，供客户端探测服务器是否在线。
 *
 * 启动方式:  node relay-server.js [--port 18792] [--token YOUR_TOKEN]
 */

const http = require('http');
const { WebSocketServer } = require('ws');

// ── 解析命令行参数 ──
function parseArgs() {
  const args = process.argv.slice(2);
  let port = 18792;
  let token = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--token' && args[i + 1]) {
      token = args[i + 1];
      i++;
    }
  }
  return { port, token };
}

const { port, token } = parseArgs();

// ── 状态 ──

/** @type {Set<import('ws').WebSocket>} */
const extensionClients = new Set();
/** @type {Set<import('ws').WebSocket>} */
const apiClients = new Set();

// ── HTTP 服务器 (预检 + 升级) ──

const server = http.createServer((req, res) => {
  // 预检端点：HEAD / GET /
  if (req.method === 'HEAD' || req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    if (req.method === 'GET') {
      res.end('CDPilot Relay Server is running.\n');
    } else {
      res.end();
    }
    return;
  }
  res.writeHead(404);
  res.end();
});

// ── WebSocket 服务器 ──

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '/', `http://${request.headers.host}`);
  const pathname = url.pathname;

  // Token 验证
  if (token) {
    const clientToken = url.searchParams.get('token') || '';
    if (clientToken !== token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
  }

  if (pathname === '/extension') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      onExtensionConnected(ws);
    });
  } else if (pathname === '/client') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      onClientConnected(ws);
    });
  } else {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  }
});

// ── 扩展连接处理 ──

function onExtensionConnected(ws) {
  extensionClients.add(ws);
  log(`Extension connected (total: ${extensionClients.size})`);

  ws.on('message', (data) => {
    const text = String(data);

    // 尝试解析以检查 ping/pong
    try {
      const msg = JSON.parse(text);
      if (msg.method === 'ping') {
        ws.send(JSON.stringify({ method: 'pong' }));
        return;
      }
      if (msg.method === 'pong') {
        // 扩展对我们 ping 的回复，忽略
        return;
      }
    } catch {
      // 非 JSON，直接转发
    }

    // 将扩展的消息转发给所有 API 客户端
    for (const client of apiClients) {
      if (client.readyState === 1 /* OPEN */) {
        client.send(text);
      }
    }
  });

  ws.on('close', () => {
    extensionClients.delete(ws);
    log(`Extension disconnected (total: ${extensionClients.size})`);
  });

  ws.on('error', (err) => {
    log(`Extension error: ${err.message}`);
    extensionClients.delete(ws);
  });
}

// ── API/MCP 客户端连接处理 ──

function onClientConnected(ws) {
  apiClients.add(ws);
  log(`Client connected (total: ${apiClients.size})`);

  // 通知所有已连接的扩展：有新的 Python 客户端接入
  // 扩展收到后会重新广播所有已附加标签页，解决 Python 错过历史事件的问题
  for (const ext of extensionClients) {
    if (ext.readyState === 1 /* OPEN */) {
      ext.send(JSON.stringify({ method: 'clientConnected' }));
    }
  }

  ws.on('message', (data) => {
    const text = String(data);

    // 检查 ping/pong
    try {
      const msg = JSON.parse(text);
      if (msg.method === 'ping') {
        ws.send(JSON.stringify({ method: 'pong' }));
        return;
      }
      if (msg.method === 'pong') {
        return;
      }
    } catch {
      // 非 JSON，直接转发
    }

    // 将客户端的命令转发给所有扩展
    for (const ext of extensionClients) {
      if (ext.readyState === 1 /* OPEN */) {
        ext.send(text);
      }
    }
  });

  ws.on('close', () => {
    apiClients.delete(ws);
    log(`Client disconnected (total: ${apiClients.size})`);
  });

  ws.on('error', (err) => {
    log(`Client error: ${err.message}`);
    apiClients.delete(ws);
  });
}

// ── 工具函数 ──

function log(msg) {
  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}] ${msg}`);
}

// ── 启动 ──

server.listen(port, '127.0.0.1', () => {
  log(`CDPilot Relay Server started on http://127.0.0.1:${port}`);
  log(`  Extension endpoint: ws://127.0.0.1:${port}/extension`);
  log(`  Client endpoint:    ws://127.0.0.1:${port}/client`);
  if (token) {
    log(`  Token auth: ENABLED`);
  }
});
