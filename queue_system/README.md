# Thread-Safe Priority Queue Management System

## Overview
This is a robust, thread-safe queue implementation with advanced features including:
- Prioritization of queue items
- Concurrent access support
- Error handling
- Performance optimization

## Features
- Generic type support
- Priority-based queueing (LOW, MEDIUM, HIGH)
- Thread-safe operations
- Configurable maximum queue size
- Timeout mechanisms for enqueue and dequeue operations

## Key Components
- `ThreadSafeQueue`: Main queue class
- `QueuePriority`: Enum for defining item priorities
- Custom exceptions: `QueueFullError`, `EmptyQueueError`

## Performance Characteristics
- O(n) insertion for maintaining priority order
- Thread-safe with minimal contention
- Supports concurrent enqueue and dequeue operations

## Usage Example
```python
from queue_system.queue import ThreadSafeQueue, QueuePriority

# Create a queue with default max size of 100
queue = ThreadSafeQueue()

# Enqueue items with different priorities
queue.enqueue(42, QueuePriority.HIGH)
queue.enqueue("low priority", QueuePriority.LOW)

# Dequeue items (highest priority first)
item = queue.dequeue()
```

## Running Tests
```bash
python -m unittest queue_system/test_queue.py
```

## Performance Benchmarks
- Supports 1000 enqueue/dequeue operations under 2 seconds
- Minimal overhead for thread synchronization

## Error Handling
- `QueueFullError`: Raised when queue reaches max capacity
- `EmptyQueueError`: Raised when dequeuing from an empty queue

## Future Improvements
- Advanced scheduling strategies
- Persistent queue storage
- More granular priority levels