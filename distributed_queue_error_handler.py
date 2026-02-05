import logging
import time
import random
from enum import Enum
from typing import Callable, Any, Optional
import functools

class CircuitState(Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"

class DistributedQueueErrorHandler:
    def __init__(
        self, 
        max_failures: int = 5, 
        reset_timeout: float = 60.0, 
        retry_backoff_base: float = 2.0,
        max_retries: int = 3
    ):
        """
        Initialize the Distributed Queue Error Handler
        
        :param max_failures: Number of failures before circuit opens
        :param reset_timeout: Time to wait before trying to close circuit
        :param retry_backoff_base: Base for exponential backoff
        :param max_retries: Maximum number of retry attempts
        """
        # Logging setup
        self.logger = logging.getLogger('DistributedQueueErrorHandler')
        self.logger.setLevel(logging.INFO)
        
        # Circuit breaker configuration
        self.max_failures = max_failures
        self.reset_timeout = reset_timeout
        self.retry_backoff_base = retry_backoff_base
        self.max_retries = max_retries
        
        # Circuit state tracking
        self.current_state = CircuitState.CLOSED
        self.failure_count = 0
        self.last_failure_time = 0
        self.last_attempt_time = 0

    def circuit_breaker(self, func: Callable) -> Callable:
        """
        Decorator to implement circuit breaker pattern
        
        :param func: Function to wrap with circuit breaker
        :return: Wrapped function with circuit breaking logic
        """
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            current_time = time.time()
            
            # Check circuit state
            if self.current_state == CircuitState.OPEN:
                # Check if reset timeout has passed
                if current_time - self.last_failure_time < self.reset_timeout:
                    self.logger.warning(f"Circuit is OPEN. Rejecting call to {func.__name__}")
                    raise CircuitBreakerOpenError("Circuit is open. Request rejected.")
                
                # Transition to HALF_OPEN after reset timeout
                self.current_state = CircuitState.HALF_OPEN
                self.logger.info("Circuit transitioned to HALF_OPEN")
            
            try:
                # Attempt to execute the function with retry mechanism
                result = self.retry_with_backoff(func, *args, **kwargs)
                
                # Reset failure tracking on success
                if self.current_state == CircuitState.HALF_OPEN:
                    self.current_state = CircuitState.CLOSED
                    self.failure_count = 0
                
                return result
            
            except Exception as e:
                self._handle_failure(e, func.__name__)
                raise
        
        return wrapper
    
    def retry_with_backoff(self, func: Callable, *args, **kwargs) -> Any:
        """
        Implement retry mechanism with exponential backoff
        
        :param func: Function to retry
        :param args: Positional arguments for the function
        :param kwargs: Keyword arguments for the function
        :return: Result of the function
        """
        last_exception = None
        for attempt in range(self.max_retries + 1):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                last_exception = e
                
                # Log retry attempt
                self.logger.warning(
                    f"Attempt {attempt + 1}/{self.max_retries + 1} failed: {str(e)}"
                )
                
                # Exponential backoff
                if attempt < self.max_retries:
                    backoff_time = self.retry_backoff_base ** attempt
                    self.logger.info(f"Retrying in {backoff_time} seconds")
                    time.sleep(backoff_time)
        
        # If all retries fail
        self.logger.error(f"All retry attempts failed. Last error: {last_exception}")
        raise last_exception

    def _handle_failure(self, exception: Exception, func_name: str):
        """
        Handle circuit breaker state and failure tracking
        
        :param exception: Exception that occurred
        :param func_name: Name of the function that failed
        """
        current_time = time.time()
        
        # Increment failure count
        self.failure_count += 1
        self.last_failure_time = current_time
        
        # Log the failure
        self.logger.error(
            f"Failure in {func_name}: {str(exception)} "
            f"(Failure count: {self.failure_count})"
        )
        
        # Check if circuit should open
        if self.failure_count >= self.max_failures:
            self.current_state = CircuitState.OPEN
            self.logger.critical(
                f"Circuit OPENED after {self.failure_count} consecutive failures"
            )

class CircuitBreakerOpenError(Exception):
    """Exception raised when circuit breaker is open"""
    pass

# Example usage and demonstration
def main():
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    # Create error handler
    error_handler = DistributedQueueErrorHandler(
        max_failures=3,
        reset_timeout=10.0,
        retry_backoff_base=2.0,
        max_retries=2
    )

    # Example function with potential failures
    @error_handler.circuit_breaker
    def unreliable_task(should_fail: bool = False):
        if should_fail:
            raise ValueError("Simulated task failure")
        return "Task completed successfully"

    # Demonstration of error handling
    try:
        # Simulate multiple failures
        for _ in range(5):
            try:
                result = unreliable_task(should_fail=True)
            except Exception as e:
                print(f"Caught exception: {e}")
        
        # Demonstrate circuit reopening
        time.sleep(11)  # Wait for reset timeout
        result = unreliable_task(should_fail=False)
        print(f"Successful result: {result}")

    except Exception as e:
        print(f"Final error: {e}")

if __name__ == "__main__":
    main()