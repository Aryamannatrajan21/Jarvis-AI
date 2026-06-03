"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalBus = exports.MessageBus = void 0;
class MessageBus {
    static instance;
    listeners = new Map();
    constructor() { }
    static getInstance() {
        if (!MessageBus.instance) {
            MessageBus.instance = new MessageBus();
        }
        return MessageBus.instance;
    }
    /**
     * Subscribe to messages on a specific topic or a wildcard.
     */
    subscribe(topic, listener) {
        if (!this.listeners.has(topic)) {
            this.listeners.set(topic, new Set());
        }
        this.listeners.get(topic).add(listener);
        // Return an unsubscribe function
        return () => {
            const topicListeners = this.listeners.get(topic);
            if (topicListeners) {
                topicListeners.delete(listener);
                if (topicListeners.size === 0) {
                    this.listeners.delete(topic);
                }
            }
        };
    }
    /**
     * Publish a message envelope.
     */
    async publish(envelope) {
        const topicsToTrigger = [envelope.topic, '*'];
        // Support wildcard hierarchies if needed, e.g., "agent.*"
        const topicParts = envelope.topic.split('.');
        if (topicParts.length > 1) {
            topicsToTrigger.push(`${topicParts[0]}.*`);
        }
        const promises = [];
        for (const topic of topicsToTrigger) {
            const topicListeners = this.listeners.get(topic);
            if (topicListeners) {
                for (const listener of topicListeners) {
                    try {
                        promises.push(listener(envelope));
                    }
                    catch (error) {
                        console.error(`Error in message listener for topic ${topic}:`, error);
                    }
                }
            }
        }
        await Promise.all(promises);
    }
}
exports.MessageBus = MessageBus;
exports.globalBus = MessageBus.getInstance();
//# sourceMappingURL=bus.js.map