import unittest
import threading
import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
import sys
import os

# Add the parent directory to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from queue_system.queue import (
    ThreadSafeQueue, 
    QueuePriority, 
    QueueFullError, 
    EmptyQueueError
)

class TestThreadSafeQueue(unittest.TestCase):
    def setUp(self):
        """Set up a new queue for each test."""
        self.queue = ThreadSafeQueue(max_size=10)
        logging.basicConfig(level=logging.INFO)
    
    def test_basic_enqueue_dequeue(self):
        """Test basic enqueue and dequeue operations."""
        self.queue.enqueue(42)
        self.assertEqual(self.queue.size(), 1)
        
        item = self.queue.dequeue()
        self.assertEqual(item, 42)
        self.assertTrue(self.queue.is_empty())
    
    def test_priority_ordering(self):
        """Test that items are dequeued based on priority."""
        self.queue.enqueue(1, QueuePriority.LOW)
        self.queue.enqueue(2, QueuePriority.HIGH)
        self.queue.enqueue(3, QueuePriority.MEDIUM)
        
        # Should dequeue in priority order: HIGH, MEDIUM, LOW
        self.assertEqual(self.queue.dequeue(), 2)
        self.assertEqual(self.queue.dequeue(), 3)
        self.assertEqual(self.queue.dequeue(), 1)
    
    def test_queue_full_error(self):
        """Test that QueueFullError is raised when queue reaches max size."""
        # Fill the queue
        for i in range(10):
            self.queue.enqueue(i)
        
        # Try to add one more item should raise QueueFullError
        with self.assertRaises(QueueFullError):
            self.queue.enqueue(10)
    
    def test_empty_queue_error(self):
        """Test that EmptyQueueError is raised when dequeuing from empty queue."""
        with self.assertRaises(EmptyQueueError):
            self.queue.dequeue(timeout=0.1)
    
    def test_concurrent_enqueue(self):
        """Test concurrent enqueue operations."""
        def enqueue_worker(item, priority):
            self.queue.enqueue(item, priority)
            return item
        
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [
                executor.submit(enqueue_worker, i, QueuePriority.MEDIUM) 
                for i in range(10)
            ]
            
            # Wait for all tasks to complete
            for future in as_completed(futures):
                future.result()
        
        self.assertEqual(self.queue.size(), 10)
    
    def test_concurrent_dequeue(self):
        """Test concurrent dequeue operations."""
        # First, enqueue some items
        for i in range(10):
            self.queue.enqueue(i)
        
        def dequeue_worker():
            return self.queue.dequeue()
        
        results = []
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [
                executor.submit(dequeue_worker) 
                for _ in range(10)
            ]
            
            # Collect results
            for future in as_completed(futures):
                results.append(future.result())
        
        # Verify all items were dequeued
        self.assertEqual(len(results), 10)
        self.assertTrue(self.queue.is_empty())
    
    def test_clear_method(self):
        """Test the clear method."""
        # Add some items
        for i in range(5):
            self.queue.enqueue(i)
        
        self.assertEqual(self.queue.size(), 5)
        
        # Clear the queue
        self.queue.clear()
        
        self.assertTrue(self.queue.is_empty())
    
    def test_performance_benchmark(self):
        """Basic performance benchmark."""
        start_time = time.time()
        
        # Enqueue 1000 items
        for i in range(1000):
            self.queue.enqueue(i)
        
        # Dequeue 1000 items
        for _ in range(1000):
            self.queue.dequeue()
        
        end_time = time.time()
        
        # Print performance metrics
        print(f"\nPerformance Test:")
        print(f"Time taken for 1000 enqueue + dequeue operations: {end_time - start_time:.4f} seconds")
        
        # Simple assertion to catch major performance regressions
        self.assertLess(end_time - start_time, 2.0, "Performance test took too long")

def run_tests():
    """Run the test suite and return detailed results."""
    test_suite = unittest.TestLoader().loadTestsFromTestCase(TestThreadSafeQueue)
    test_result = unittest.TextTestRunner(verbosity=2).run(test_suite)
    
    # Generate a detailed report
    report = {
        "total_tests": test_result.testsRun,
        "failures": len(test_result.failures),
        "errors": len(test_result.errors),
        "skipped": len(test_result.skipped),
        "was_successful": test_result.wasSuccessful()
    }
    
    return report

if __name__ == '__main__':
    # Run tests and print detailed report
    test_report = run_tests()
    print("\n--- Test Suite Summary ---")
    for key, value in test_report.items():
        print(f"{key}: {value}")
    
    # Exit with non-zero status if tests failed
    sys.exit(0 if test_report['was_successful'] else 1)