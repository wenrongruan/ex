import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { config } from './config.js';
export class RelayClient extends EventEmitter {
    ws = null;
    nextId = 1;
    pending = new Map();
    reconnectTimer = null;
    reconnectDelay = 1000;
    autoReconnect = true;
    heartbeatInterval = null;
    lastPongTime = 0;
    _connected = false;
    static MAX_RECONNECT_DELAY = 30000;
    static HEARTBEAT_INTERVAL = 15000;
    static HEARTBEAT_TIMEOUT = 10000;
    get connected() {
        return this._connected;
    }
    async connect() {
        if (this._connected)
            return;
        const { relayHost, relayPort, relayEndpoint, relayToken } = config;
        const httpBase = `http://${relayHost}:${relayPort}`;
        // Preflight check
        try {
            const resp = await fetch(`${httpBase}/`, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
            if (!resp.ok && resp.status !== 404) {
                // Some servers may 404 on HEAD /, that's fine
            }
        }
        catch {
            throw new Error(`Relay server not reachable at ${httpBase}`);
        }
        let wsUrl = `ws://${relayHost}:${relayPort}${relayEndpoint}`;
        if (relayToken) {
            wsUrl += `?token=${encodeURIComponent(relayToken)}`;
        }
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(wsUrl);
            const timeout = setTimeout(() => {
                ws.terminate();
                reject(new Error('WebSocket connect timeout'));
            }, 5000);
            ws.on('open', () => {
                clearTimeout(timeout);
                this.ws = ws;
                this._connected = true;
                this.reconnectDelay = 1000;
                this.startHeartbeat();
                this.emit('connected');
                resolve();
            });
            ws.on('message', (data) => {
                this.handleMessage(String(data));
            });
            ws.on('close', () => {
                clearTimeout(timeout);
                if (!this._connected) {
                    reject(new Error('WebSocket closed before open'));
                    return;
                }
                this.onDisconnected('closed');
            });
            ws.on('error', (err) => {
                clearTimeout(timeout);
                if (!this._connected) {
                    reject(new Error(`WebSocket error: ${err.message}`));
                    return;
                }
                this.onDisconnected('error');
            });
        });
    }
    async sendCommand(method, params, sessionId) {
        if (!this.ws || !this._connected) {
            throw new Error('Not connected to relay server');
        }
        const id = this.nextId++;
        const command = {
            id,
            method: 'forwardCDPCommand',
            params: {
                method,
                params,
                ...(sessionId ? { sessionId } : {}),
            },
        };
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            try {
                this.ws.send(JSON.stringify(command));
            }
            catch (err) {
                this.pending.delete(id);
                reject(err instanceof Error ? err : new Error(String(err)));
            }
            // Timeout for individual commands
            setTimeout(() => {
                const p = this.pending.get(id);
                if (p) {
                    this.pending.delete(id);
                    p.reject(new Error(`Command ${method} timed out (30s)`));
                }
            }, 30000);
        });
    }
    disconnect() {
        this.autoReconnect = false;
        this.stopHeartbeat();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this._connected = false;
    }
    handleMessage(text) {
        let msg;
        try {
            msg = JSON.parse(text);
        }
        catch {
            return;
        }
        // Handle ping
        if (msg.method === 'ping') {
            try {
                this.ws?.send(JSON.stringify({ method: 'pong' }));
            }
            catch { /* ignore */ }
            return;
        }
        // Handle pong (heartbeat response)
        if (msg.method === 'pong') {
            this.lastPongTime = Date.now();
            return;
        }
        // Handle command response
        if (typeof msg.id === 'number' && (msg.result !== undefined || msg.error !== undefined)) {
            const p = this.pending.get(msg.id);
            if (!p)
                return;
            this.pending.delete(msg.id);
            if (msg.error) {
                p.reject(new Error(String(msg.error)));
            }
            else {
                p.resolve(msg.result);
            }
            return;
        }
        // Handle CDP events forwarded from extension
        if (msg.method === 'forwardCDPEvent' && msg.params) {
            const params = msg.params;
            this.emit('cdpEvent', {
                sessionId: params.sessionId,
                method: params.method,
                params: params.params,
            });
        }
    }
    onDisconnected(reason) {
        this._connected = false;
        this.stopHeartbeat();
        this.ws = null;
        // Reject all pending
        for (const [id, p] of this.pending.entries()) {
            this.pending.delete(id);
            p.reject(new Error(`Relay disconnected (${reason})`));
        }
        this.emit('disconnected', reason);
        if (this.autoReconnect) {
            this.scheduleReconnect();
        }
    }
    scheduleReconnect() {
        if (this.reconnectTimer)
            return;
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            try {
                await this.connect();
            }
            catch {
                this.reconnectDelay = Math.min(this.reconnectDelay * 2, RelayClient.MAX_RECONNECT_DELAY);
                if (this.autoReconnect) {
                    this.scheduleReconnect();
                }
            }
        }, this.reconnectDelay);
    }
    startHeartbeat() {
        this.stopHeartbeat();
        this.lastPongTime = Date.now();
        this.heartbeatInterval = setInterval(() => {
            if (!this.ws || !this._connected) {
                this.stopHeartbeat();
                return;
            }
            if (Date.now() - this.lastPongTime > RelayClient.HEARTBEAT_INTERVAL + RelayClient.HEARTBEAT_TIMEOUT) {
                this.stopHeartbeat();
                this.ws?.terminate();
                return;
            }
            try {
                this.ws.send(JSON.stringify({ method: 'ping' }));
            }
            catch { /* ignore */ }
        }, RelayClient.HEARTBEAT_INTERVAL);
    }
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
}
//# sourceMappingURL=relay-client.js.map