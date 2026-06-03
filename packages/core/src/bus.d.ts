import { MessageEnvelope } from './types.js';
export type MessageListener = (message: MessageEnvelope) => void | Promise<void>;
export declare class MessageBus {
    private static instance;
    private listeners;
    private constructor();
    static getInstance(): MessageBus;
    /**
     * Subscribe to messages on a specific topic or a wildcard.
     */
    subscribe(topic: string, listener: MessageListener): () => void;
    /**
     * Publish a message envelope.
     */
    publish(envelope: MessageEnvelope): Promise<void>;
}
export declare const globalBus: MessageBus;
//# sourceMappingURL=bus.d.ts.map