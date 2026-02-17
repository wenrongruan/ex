import { EventEmitter } from 'events';
export interface CDPEvent {
    sessionId: string;
    method: string;
    params: Record<string, unknown>;
}
export declare class RelayClient extends EventEmitter {
    private ws;
    private nextId;
    private pending;
    private reconnectTimer;
    private reconnectDelay;
    private autoReconnect;
    private heartbeatInterval;
    private lastPongTime;
    private _connected;
    private static readonly MAX_RECONNECT_DELAY;
    private static readonly HEARTBEAT_INTERVAL;
    private static readonly HEARTBEAT_TIMEOUT;
    get connected(): boolean;
    connect(): Promise<void>;
    sendCommand(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<unknown>;
    disconnect(): void;
    private handleMessage;
    private onDisconnected;
    private scheduleReconnect;
    private startHeartbeat;
    private stopHeartbeat;
}
