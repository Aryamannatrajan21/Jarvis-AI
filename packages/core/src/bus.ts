import { MessageEnvelope } from './types.js';

export type MessageListener = (message: MessageEnvelope) => void | Promise<void>;

export class MessageBus {
  private static instance: MessageBus;
  private listeners: Map<string, Set<MessageListener>> = new Map();

  private constructor() {}

  public static getInstance(): MessageBus {
    if (!MessageBus.instance) {
      MessageBus.instance = new MessageBus();
    }
    return MessageBus.instance;
  }

  /**
   * Subscribe to messages on a specific topic or a wildcard.
   */
  public subscribe(topic: string, listener: MessageListener): () => void {
    if (!this.listeners.has(topic)) {
      this.listeners.set(topic, new Set());
    }
    this.listeners.get(topic)!.add(listener);

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
  public async publish(envelope: MessageEnvelope): Promise<void> {
    const topicsToTrigger = [envelope.topic, '*'];
    
    // Support wildcard hierarchies if needed, e.g., "agent.*"
    const topicParts = envelope.topic.split('.');
    if (topicParts.length > 1) {
      topicsToTrigger.push(`${topicParts[0]}.*`);
    }

    const promises: Array<Promise<void> | void> = [];

    for (const topic of topicsToTrigger) {
      const topicListeners = this.listeners.get(topic);
      if (topicListeners) {
        for (const listener of topicListeners) {
          try {
            promises.push(listener(envelope));
          } catch (error) {
            console.error(`Error in message listener for topic ${topic}:`, error);
          }
        }
      }
    }

    await Promise.all(promises);
  }
}
export const globalBus = MessageBus.getInstance();
