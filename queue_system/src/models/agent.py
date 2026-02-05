import uuid
import time
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional
from enum import Enum, auto

class AgentStatus(Enum):
    IDLE = auto()
    BUSY = auto()
    OFFLINE = auto()
    MAINTENANCE = auto()

@dataclass
class ResourceProfile:
    """Represents computational resources of an agent."""
    cpu_cores: int = 0
    memory_gb: float = 0.0
    gpu_count: int = 0
    storage_gb: float = 0.0

@dataclass
class Agent:
    """
    Comprehensive agent representation with advanced metadata and resource tracking.
    """
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ''
    
    # Capabilities and specialization
    capabilities: List[str] = field(default_factory=list)
    specializations: List[str] = field(default_factory=list)
    
    # Status and lifecycle management
    status: AgentStatus = AgentStatus.IDLE
    last_heartbeat: float = field(default_factory=time.time)
    registration_time: float = field(default_factory=time.time)
    
    # Resource management
    resource_profile: ResourceProfile = field(default_factory=ResourceProfile)
    
    # Advanced metadata
    metadata: Dict[str, Any] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)
    
    # Performance and utilization tracking
    total_tasks_processed: int = 0
    current_task_count: int = 0
    
    def is_available(self, task_requirements: Optional[Dict[str, Any]] = None) -> bool:
        """
        Determine if agent is available for task assignment.
        
        :param task_requirements: Optional task-specific requirements
        :return: Boolean indicating agent availability
        """
        # Check basic availability conditions
        if self.status not in [AgentStatus.IDLE, AgentStatus.MAINTENANCE]:
            return False
        
        # Check heartbeat staleness (e.g., consider offline if >5 minutes)
        if time.time() - self.last_heartbeat > 300:
            self.status = AgentStatus.OFFLINE
            return False
        
        # If specific requirements are provided, do capability matching
        if task_requirements:
            # Check capability requirements
            required_capabilities = task_requirements.get('required_capabilities', [])
            if not set(required_capabilities).issubset(set(self.capabilities + self.specializations)):
                return False
            
            # Resource requirement checks
            resource_reqs = task_requirements.get('resource_requirements', {})
            if not self._meets_resource_requirements(resource_reqs):
                return False
        
        return True
    
    def _meets_resource_requirements(self, requirements: Dict[str, Any]) -> bool:
        """
        Check if agent meets specific resource requirements.
        
        :param requirements: Resource requirements dictionary
        :return: Boolean indicating resource sufficiency
        """
        profile = self.resource_profile
        
        # CPU core check
        if requirements.get('cpu_cores', 0) > profile.cpu_cores:
            return False
        
        # Memory check
        if requirements.get('memory_gb', 0.0) > profile.memory_gb:
            return False
        
        # GPU check
        if requirements.get('gpu_count', 0) > profile.gpu_count:
            return False
        
        # Storage check
        if requirements.get('storage_gb', 0.0) > profile.storage_gb:
            return False
        
        return True
    
    def update_heartbeat(self):
        """Update last heartbeat timestamp."""
        self.last_heartbeat = time.time()
    
    def add_capabilities(self, new_capabilities: List[str]):
        """
        Dynamically add new capabilities to the agent.
        
        :param new_capabilities: List of capabilities to add
        """
        self.capabilities.extend(
            [cap for cap in new_capabilities if cap not in self.capabilities]
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Convert agent to a dictionary representation.
        
        :return: Dictionary representation of the agent
        """
        return {
            'id': self.id,
            'name': self.name,
            'capabilities': self.capabilities,
            'specializations': self.specializations,
            'status': self.status.name,
            'last_heartbeat': self.last_heartbeat,
            'registration_time': self.registration_time,
            'resource_profile': {
                'cpu_cores': self.resource_profile.cpu_cores,
                'memory_gb': self.resource_profile.memory_gb,
                'gpu_count': self.resource_profile.gpu_count,
                'storage_gb': self.resource_profile.storage_gb
            },
            'metadata': self.metadata,
            'tags': self.tags,
            'total_tasks_processed': self.total_tasks_processed,
            'current_task_count': self.current_task_count
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Agent':
        """
        Create an Agent instance from a dictionary.
        
        :param data: Dictionary representation of an agent
        :return: Agent instance
        """
        agent = cls(
            id=data.get('id', str(uuid.uuid4())),
            name=data.get('name', ''),
            capabilities=data.get('capabilities', []),
            specializations=data.get('specializations', [])
        )
        
        # Restore status
        status_name = data.get('status', 'IDLE')
        agent.status = AgentStatus[status_name]
        
        # Restore timestamps
        agent.last_heartbeat = data.get('last_heartbeat', time.time())
        agent.registration_time = data.get('registration_time', time.time())
        
        # Restore resource profile
        resource_data = data.get('resource_profile', {})
        agent.resource_profile = ResourceProfile(
            cpu_cores=resource_data.get('cpu_cores', 0),
            memory_gb=resource_data.get('memory_gb', 0.0),
            gpu_count=resource_data.get('gpu_count', 0),
            storage_gb=resource_data.get('storage_gb', 0.0)
        )
        
        # Restore additional metadata
        agent.metadata = data.get('metadata', {})
        agent.tags = data.get('tags', [])
        agent.total_tasks_processed = data.get('total_tasks_processed', 0)
        agent.current_task_count = data.get('current_task_count', 0)
        
        return agent