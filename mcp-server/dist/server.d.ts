import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RelayClient } from './relay-client.js';
export declare function createServer(): {
    server: McpServer;
    relay: RelayClient;
};
