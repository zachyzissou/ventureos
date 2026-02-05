import asyncio
import uuid
import json
import aioredis
import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict, field

class QueueSystemError(Exception):
    """Base exception for queue system errors."""
    pass

@dataclass
class Agent:
    """Represents a dynamically registered agent in the system."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ''
    capabilities: List[str] = field(default_factory=list)
    status: str = 'idle'
    last_heartbeat: float = 0
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class Task:
    """Represents a task in the distributed queue."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ''
    priority: int = 0
    status: str = 'pending'
    assigned_agent: Optional[str] = None
    payload: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=asyncio.get_event_loop().time)

class DistributedQueueManager:
    """
    Advanced distributed queue management system with:
    - Dynamic agent registration
    - Scalable task distribution
    - Persistence via Redis
    - Multi-agent coordination
    """
    
    def __init__(self, redis_url: str = 'redis://localhost'):
        self.redis_pool = None
        self.redis_url = redis_url
        self.agents: Dict[str, Agent] = {}
        self.task_queue: List[Task] = []
        self.logger = logging.getLogger('DistributedQueueManager')
        logging.basicConfig(level=logging.INFO)

    async def initialize(self):
        """Initialize Redis connection and setup."""
        try:
            self.redis_pool = await aioredis.create_redis_pool(self.redis_url)
            self.logger.info("Redis connection established")
        except Exception as e:
            self.logger.error(f"Failed to connect to Redis: {e}")
            raise QueueSystemError("Redis connection failed")

    async def register_agent(self, agent: Agent) -> str:
        """
        Dynamically register an agent with unique capabilities.
        
        :param agent: Agent to register
        :return: Agent ID
        """
        # Validate agent registration
        if not agent.name or not agent.capabilities:
            raise QueueSystemError("Agent must have a name and capabilities")
        
        # Store agent in Redis for persistence
        agent_key = f"agent:{agent.id}"
        await self.redis_pool.hmset_dict(
            agent_key, 
            asdict(agent)
        )
        
        # Set expiration to handle agent lifecycle
        await self.redis_pool.expire(agent_key, 3600)  # 1-hour TTL
        
        self.agents[agent.id] = agent
        self.logger.info(f"Registered agent: {agent.name} (ID: {agent.id})")
        return agent.id

    async def submit_task(self, task: Task) -> str:
        """
        Submit a task to the distributed queue with advanced routing.
        
        :param task: Task to submit
        :return: Task ID
        """
        # Persist task in Redis
        task_key = f"task:{task.id}"
        await self.redis_pool.hmset_dict(
            task_key, 
            asdict(task)
        )
        
        # Priority-based task queuing
        self.task_queue.append(task)
        self.task_queue.sort(key=lambda t: t.priority, reverse=True)
        
        self.logger.info(f"Task submitted: {task.name} (ID: {task.id})")
        return task.id

    async def assign_task(self) -> Optional[Task]:
        """
        Advanced task assignment with capability matching.
        
        :return: Assigned task or None
        """
        if not self.task_queue:
            return None
        
        # Find first unassigned task
        for task in self.task_queue:
            if task.status == 'pending':
                # Find best-matching agent
                best_agent = self._find_best_agent(task)
                
                if best_agent:
                    task.assigned_agent = best_agent.id
                    task.status = 'in_progress'
                    
                    # Update task in Redis
                    task_key = f"task:{task.id}"
                    await self.redis_pool.hmset_dict(
                        task_key, 
                        asdict(task)
                    )
                    
                    self.logger.info(f"Task {task.name} assigned to {best_agent.name}")
                    return task
        
        return None

    def _find_best_agent(self, task: Task) -> Optional[Agent]:
        """
        Find the most suitable agent for a task based on capabilities.
        
        :param task: Task to match
        :return: Best matching agent
        """
        matching_agents = [
            agent for agent in self.agents.values() 
            if agent.status == 'idle' and 
               any(cap in agent.capabilities for cap in task.payload.get('required_capabilities', []))
        ]
        
        return max(matching_agents, key=lambda a: len(a.capabilities), default=None)

    async def close(self):
        """Gracefully close Redis connection."""
        if self.redis_pool:
            self.redis_pool.close()
            await self.redis_pool.wait_closed()
            self.logger.info("Redis connection closed")

# Example usage and demonstration
async def main():
    queue_manager = DistributedQueueManager()
    await queue_manager.initialize()

    # Register agents with different capabilities
    data_agent = Agent(
        name='DataProcessingAgent', 
        capabilities=['data_processing', 'analytics']
    )
    ml_agent = Agent(
        name='MachineLearningAgent', 
        capabilities=['machine_learning', 'training']
    )

    data_agent_id = await queue_manager.register_agent(data_agent)
    ml_agent_id = await queue_manager.register_agent(ml_agent)

    # Submit tasks
    data_task = Task(
        name='Process Customer Data',
        priority=5,
        payload={
            'required_capabilities': ['data_processing'],
            'data': {'customer_id': 123, 'action': 'analyze'}
        }
    )

    ml_task = Task(
        name='Train ML Model',
        priority=8,
        payload={
            'required_capabilities': ['machine_learning'],
            'model_config': {'type': 'neural_network'}
        }
    )

    await queue_manager.submit_task(data_task)
    await queue_manager.submit_task(ml_task)

    # Simulate task assignment
    assigned_task1 = await queue_manager.assign_task()
    assigned_task2 = await queue_manager.assign_task()

    print("Assigned Tasks:")
    print(assigned_task1)
    print(assigned_task2)

    await queue_manager.close()

if __name__ == '__main__':
    asyncio.run(main())