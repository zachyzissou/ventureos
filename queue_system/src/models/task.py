import uuid
import time
from dataclasses import dataclass, field
from typing import Dict, Any, Optional
from enum import Enum, auto

class TaskPriority(Enum):
    LOW = 1
    MEDIUM = 5
    HIGH = 10
    CRITICAL = 20

class TaskStatus(Enum):
    PENDING = auto()
    QUEUED = auto()
    ASSIGNED = auto()
    IN_PROGRESS = auto()
    COMPLETED = auto()
    FAILED = auto()
    CANCELLED = auto()

@dataclass
class Task:
    """
    Advanced task representation with comprehensive tracking and metadata.
    """
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ''
    
    # Task classification and routing
    type: str = ''
    group: Optional[str] = None
    
    # Priority and scheduling
    priority: TaskPriority = TaskPriority.MEDIUM
    status: TaskStatus = TaskStatus.PENDING
    
    # Temporal metadata
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    
    # Execution context
    payload: Dict[str, Any] = field(default_factory=dict)
    result: Optional[Dict[str, Any]] = None
    
    # Agent assignment
    assigned_agent_id: Optional[str] = None
    
    # Advanced task properties
    dependencies: list = field(default_factory=list)
    retry_count: int = 0
    max_retries: int = 3
    
    # Resource requirements
    resource_requirements: Dict[str, Any] = field(default_factory=dict)
    
    # Tracking and metadata
    tags: list = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def update_status(self, new_status: TaskStatus):
        """
        Update task status with timestamp tracking.
        
        :param new_status: New status for the task
        """
        self.status = new_status
        self.updated_at = time.time()
        
        # Track specific status transitions
        if new_status == TaskStatus.IN_PROGRESS:
            self.started_at = time.time()
        elif new_status == TaskStatus.COMPLETED:
            self.completed_at = time.time()
    
    def can_retry(self) -> bool:
        """
        Determine if task can be retried.
        
        :return: Boolean indicating retry eligibility
        """
        return (self.retry_count < self.max_retries and 
                self.status in [TaskStatus.FAILED, TaskStatus.CANCELLED])
    
    def increment_retry(self):
        """Increment retry counter and reset status."""
        self.retry_count += 1
        self.status = TaskStatus.PENDING
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convert task to dictionary representation.
        
        :return: Dictionary representation of the task
        """
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type,
            'group': self.group,
            'priority': self.priority.name,
            'status': self.status.name,
            'created_at': self.created_at,
            'updated_at': self.updated_at,
            'started_at': self.started_at,
            'completed_at': self.completed_at,
            'payload': self.payload,
            'result': self.result,
            'assigned_agent_id': self.assigned_agent_id,
            'dependencies': self.dependencies,
            'retry_count': self.retry_count,
            'max_retries': self.max_retries,
            'resource_requirements': self.resource_requirements,
            'tags': self.tags,
            'metadata': self.metadata
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Task':
        """
        Create a Task instance from a dictionary.
        
        :param data: Dictionary representation of a task
        :return: Task instance
        """
        task = cls(
            id=data.get('id', str(uuid.uuid4())),
            name=data.get('name', ''),
            type=data.get('type', ''),
            group=data.get('group')
        )
        
        # Restore priority
        priority_name = data.get('priority', 'MEDIUM')
        task.priority = TaskPriority[priority_name]
        
        # Restore status
        status_name = data.get('status', 'PENDING')
        task.status = TaskStatus[status_name]
        
        # Restore timestamps
        task.created_at = data.get('created_at', time.time())
        task.updated_at = data.get('updated_at', time.time())
        task.started_at = data.get('started_at')
        task.completed_at = data.get('completed_at')
        
        # Restore other attributes
        task.payload = data.get('payload', {})
        task.result = data.get('result')
        task.assigned_agent_id = data.get('assigned_agent_id')
        task.dependencies = data.get('dependencies', [])
        task.retry_count = data.get('retry_count', 0)
        task.max_retries = data.get('max_retries', 3)
        task.resource_requirements = data.get('resource_requirements', {})
        task.tags = data.get('tags', [])
        task.metadata = data.get('metadata', {})
        
        return task