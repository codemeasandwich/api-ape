// Type definitions for api-ape
// Project: https://github.com/codemeasandwich/api-ape

import { Application } from 'express'
import { WebSocket } from 'ws'
import { IncomingMessage } from 'http'

// =============================================================================
// SERVER TYPES
// =============================================================================

/**
 * Controller context available as `this` inside controller functions
 */
export interface ControllerContext {
    /** Send to ALL connected clients */
    broadcast(type: string, data: any): void
    /** Send to all clients EXCEPT the caller */
    broadcastOthers(type: string, data: any): void
    /** Get count of connected clients */
    online(): number
    /** Get array of connected hostIds */
    getClients(): string[]
    /** Unique ID of the calling client */
    hostId: string
    /** Original HTTP request */
    req: IncomingMessage
    /** WebSocket instance */
    socket: WebSocket
    /** Parsed user-agent info */
    agent: {
        browser: { name?: string; version?: string }
        os: { name?: string; version?: string }
        device: { type?: string; vendor?: string; model?: string }
    }
    /** Custom embedded values from onConnent */
    [key: string]: any
}

/**
 * Controller function type
 */
export type ControllerFunction<T = any, R = any> = (
    this: ControllerContext,
    data: T
) => R | Promise<R>

/**
 * Send function provided to onConnent
 */
export type SendFunction = {
    (type: string, data: any): void
    toString(): string
}

/**
 * After hook returned from onReceive/onSend
 */
export type AfterHook = (err: Error | null, result: any) => void

/**
 * Connection lifecycle hooks returned from onConnent
 */
export interface ConnectionHandlers {
    /** Values to embed into controller context */
    embed?: Record<string, any>
    /** Called before processing incoming message, return after hook */
    onReceive?: (queryId: string, data: any, type: string) => AfterHook | void
    /** Called before sending message, return after hook */
    onSend?: (data: any, type: string) => AfterHook | void
    /** Called on error */
    onError?: (errorString: string) => void
    /** Called when client disconnects */
    onDisconnent?: () => void
}

/**
 * onConnent callback signature
 */
export type OnConnectCallback = (
    socket: WebSocket,
    req: IncomingMessage,
    send: SendFunction
) => ConnectionHandlers | void

/**
 * Server options for ape()
 */
export interface ApeServerOptions {
    /** Directory containing controller files */
    where: string
    /** Connection lifecycle hook */
    onConnent?: OnConnectCallback
}

/**
 * Initialize api-ape on an Express app
 */
declare function ape(app: Application, options: ApeServerOptions): void

export default ape

// =============================================================================
// CLIENT TYPES
// =============================================================================

/**
 * Message received from server
 */
export interface ReceivedMessage<T = any> {
    err?: Error | string
    type: string
    data: T
}

/**
 * Message handler callback
 */
export type MessageHandler<T = any> = (message: ReceivedMessage<T>) => void

/**
 * Proxy-based sender - any property access creates a callable path
 * Example: sender.users.list() calls type="/users/list"
 */
export interface ApeSender {
    [key: string]: ApeSender & (<T = any, R = any>(data?: T) => Promise<R>)
}

/**
 * Set receiver for specific message type or all messages
 */
export type SetOnReceiver = {
    (type: string, handler: MessageHandler): void
    (handler: MessageHandler): void
}

/**
 * Connected client interface
 */
export interface ApeClient {
    sender: ApeSender
    setOnReciver: SetOnReceiver
}

/**
 * Configuration options for client
 */
export interface ApeClientConfig {
    /** WebSocket port */
    port?: number
    /** WebSocket host */
    host?: string
}

/**
 * Connect socket function with configuration methods
 */
export interface ConnectSocket {
    (): ApeClient
    /** Configure connection options */
    configure(options: ApeClientConfig): void
    /** Enable auto-reconnection on disconnect */
    autoReconnect(): void
}

/**
 * Client module default export
 */
declare const connectSocket: ConnectSocket

export { connectSocket }

// =============================================================================
// BROADCAST MODULE
// =============================================================================

export declare const broadcast: (type: string, data: any) => void
export declare const online: () => number
export declare const getClients: () => string[]
