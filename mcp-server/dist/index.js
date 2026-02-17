#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import { config } from './config.js';
import http from 'node:http';
const isHttpMode = process.argv.includes('--http');
async function main() {
    const { server, relay } = createServer();
    if (isHttpMode) {
        // HTTP mode for remote clients (ChatGPT, etc.)
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined, // stateless mode
        });
        const httpServer = http.createServer(async (req, res) => {
            // CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }
            // Route /mcp to the transport
            if (req.url === '/mcp') {
                await transport.handleRequest(req, res);
            }
            else {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Not found. Use /mcp endpoint.' }));
            }
        });
        await server.connect(transport);
        httpServer.listen(config.httpPort, () => {
            console.error(`CDPilot MCP Server (HTTP) listening on http://127.0.0.1:${config.httpPort}/mcp`);
        });
        process.on('SIGINT', () => {
            relay.disconnect();
            httpServer.close();
            process.exit(0);
        });
    }
    else {
        // stdio mode for local clients (Claude Desktop, etc.)
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error('CDPilot MCP Server (stdio) started.');
        process.on('SIGINT', () => {
            relay.disconnect();
            process.exit(0);
        });
    }
}
main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map