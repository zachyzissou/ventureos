export class PriorityQueue<T> {
  private queue: Array<{
    item: T;
    priority: number;
    insertionOrder: number;
  }> = [];

  private maxSize: number;
  private insertionCounter = 0;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  async enqueue(item: T, priority: number): Promise<void> {
    if (this.queue.length >= this.maxSize) {
      throw new Error('Queue is full');
    }

    this.queue.push({
      item,
      priority,
      insertionOrder: this.insertionCounter++
    });

    // Sort by priority (lower number = higher priority) and insertion order
    this.queue.sort((a, b) => 
      a.priority !== b.priority 
        ? a.priority - b.priority 
        : a.insertionOrder - b.insertionOrder
    );
  }

  async dequeue(): Promise<T | null> {
    return this.queue.shift()?.item ?? null;
  }

  getSize(): number {
    return this.queue.length;
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  peek(): T | null {
    return this.queue[0]?.item ?? null;
  }

  clear(): void {
    this.queue = [];
    this.insertionCounter = 0;
  }
}