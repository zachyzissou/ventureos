class QueueSystemException(Exception):
    """Base exception for queue system errors."""
    pass

class AgentRegistrationError(QueueSystemException):
    """Raised when agent registration fails."""
    pass

class TaskAssignmentError(QueueSystemException):
    """Raised when task assignment encounters issues."""
    pass

class ResourceAllocationError(QueueSystemException):
    """Raised when resource allocation fails."""
    pass

class PersistenceError(QueueSystemException):
    """Raised when data persistence operations fail."""
    pass