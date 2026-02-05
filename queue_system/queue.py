from typing import Generic, TypeVar, List, Optional
from dataclasses import dataclass, field
from enum import Enum, auto
import time
import threading
from concurrent.futures import ThreadPoolExecutor
import logging

T = TypeVar('T')

class QueuePriority(Enum):
    LOW = auto()
    MEDIUM = auto()
    HIGH = auto()

class QueueFullError(Exception):
    """Raised when the queue reaches its maximum capacity."""
    pass

class EmptyQueueError(Exception):
    """Raised when attempting to dequeue from an empty queue."""
    pass

@dataclass
class QueueItem(Generic[T]):
    """Represents an item in the queue with priority and metadata."""
    data: T
    priority: QueuePriority = QueuePriority.MEDIUM
    timestamp: float = field(default_factory=time.time)

class ThreadSafeQueue(Generic[T]):
    """A thread-safe, priority-based queue with advanced features."""
    
    def __init__(self, max_size: int = 100):
        """
        Initialize the queue with a maximum size.
        
        :param max_size: Maximum number of items the queue can hold
        """
        self._queue: List[QueueItem[T]] = []
        self._max_size = max_size
        self._lock = threading.Lock()
        self._not_full = threading.Condition(self._lock)
        self._not_empty = threading.Condition(self._lock)
        self._logger = logging.getLogger(self.__class__.__name__)
    
    def enqueue(self, item: T, priority: QueuePriority = QueuePriority.MEDIUM) -> None:
        """
        Add an item to the queue with optional priority.
        
        :param item: Item to be added
        :param priority: Priority of the item
        :raises QueueFullError: If the queue is at maximum capacity
        """
        with self._lock:
            # Wait if the queue is full
            while len(self._queue) >= self._max_size:
                try:
                    self._not_full.wait(timeout=5.0)
                except threading.TimeoutError:
                    self._logger.error("Queue is full. Enqueue operation timed out.")
                    raise QueueFullError("Queue is full. Cannot add more items.")
            
            queue_item = QueueItem(data=item, priority=priority)
            
            # Insert based on priority (higher priority items go first)
            insert_index = 0
            for i, existing_item in enumerate(self._queue):
                if existing_item.priority.value < priority.value:
                    insert_index = i
                    break
                insert_index = i + 1
            
            self._queue.insert(insert_index, queue_item)
            self._logger.info(f"Enqueued item with priority {priority}")
            
            # Notify any waiting threads
            self._not_empty.notify()
    
    def dequeue(self, timeout: Optional[float] = None) -> T:
        """
        Remove and return the highest priority item from the queue.
        
        :param timeout: Optional timeout for waiting
        :return: The dequeued item
        :raises EmptyQueueError: If the queue is empty after waiting
        """
        with self._lock:
            # Wait if the queue is empty
            start_time = time.time()
            while len(self._queue) == 0:
                if timeout is not None:
                    wait_time = timeout - (time.time() - start_time)
                    if wait_time <= 0:
                        self._logger.warning("Dequeue timed out. Queue is empty.")
                        raise EmptyQueueError("Queue is empty. No items to dequeue.")
                    self._not_empty.wait(timeout=wait_time)
                else:
                    self._not_empty.wait()
            
            # Remove and return the first (highest priority) item
            item = self._queue.pop(0)
            self._logger.info(f"Dequeued item with priority {item.priority}")
            
            # Notify any waiting threads
            self._not_full.notify()
            
            return item.data
    
    def size(self) -> int:
        """
        Get the current size of the queue.
        
        :return: Number of items in the queue
        """
        with self._lock:
            return len(self._queue)
    
    def is_empty(self) -> bool:
        """
        Check if the queue is empty.
        
        :return: True if queue is empty, False otherwise
        """
        with self._lock:
            return len(self._queue) == 0
    
    def clear(self) -> None:
        """
        Clear all items from the queue.
        """
        with self._lock:
            self._queue.clear()
            self._not_full.notify_all()