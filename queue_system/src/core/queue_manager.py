import asyncio
import logging
from typing import List, Optional, Dict, Any

from .registry import AgentRegistry
from ..models.task import Task, TaskStatus, TaskPriority
from ..models.agent import Agent, AgentStatus
from ..core.exceptions import TaskAssignmentError, ResourceAllocationError

class DistributedQueueManager:
    """
    Advanced distributed queue management system with sophisticated 
    task routing, resource allocation, and multi-agent coordination.
    """
    
    def __init__(
        self, 
        agent_registry: Optional[AgentRegistry] = None,
        max_concurrent_tasks: int = 100,
        task_timeout: int = 3600  # 1 hour default timeout
    ):
        # Core components
        self.agent_registry = agent_registry or AgentRegistry()
        
        # Task management
        self._task_queue: List[Task] = []
        self._active_tasks: Dict[str, Task] = {}
        
        # Configuration
        self.max_concurrent_tasks = max_concurrent_tasks
        self.task_timeout = task_timeout
        
        # Logging
        self.logger = logging.getLogger('DistributedQueueManager')
        
        # Async management
        self._queue_lock = asyncio.Lock()
        self._task_semaphore = asyncio.Semaphore(max_concurrent_tasks)
    
    async def submit_task(self, task: Task) -> str:
        """
        Submit a task to the distributed queue with advanced routing.
        
        :param task: Task to submit
        :return: Task ID
        """
        async with self._queue_lock:
            # Validate task
            if not task.name or not task.payload:
                raise TaskAssignmentError("Task must have a name and payload")
            
            # Check dependencies
            if task.dependencies:
                await self._validate_dependencies(task)
            
            # Enqueue task
            self._task_queue.append(task)
            
            # Sort queue by priority
            self._task_queue.sort(
                key=lambda t: (t.priority.value, t.created_at), 
                reverse=True
            )
            
            self.logger.info(f"Task submitted: {task.name} (ID: {task.id})")
            
            return task.id
    
    async def _validate_dependencies(self, task: Task):
        """
        Validate task dependencies before submission.
        
        :param task: Task to validate
        :raises TaskAssignmentError: If dependencies are unresolvable
        """
        for dep_id in task.dependencies:
            if dep_id not in self._active_tasks and dep_id not in [t.id for t in self._task_queue]:
                raise TaskAssignmentError(f"Unresolved dependency: {dep_id}")
    
    async def assign_tasks(self):
        """
        Continuous task assignment and routing loop.
        Matches tasks to available agents based on capabilities and resources.
        """
        while True:
            async with self._queue_lock:
                # Break if no tasks
                if not self._task_queue:
                    await asyncio.sleep(5)  # Polling interval
                    continue
                
                # Get next task
                task = self._task_queue[0]
                
                try:
                    # Find suitable agents
                    matching_agents = await self._find_suitable_agents(task)
                    
                    if matching_agents:
                        # Select best agent (first in list due to previous sorting)
                        best_agent = matching_agents[0]
                        
                        # Assign task
                        await self._assign_task_to_agent(task, best_agent)
                        
                        # Remove from queue
                        self._task_queue.pop(0)
                
                except Exception as e:
                    self.logger.error(f"Task assignment error: {e}")
                    # Implement retry or dead-letter queue logic
                    await asyncio.sleep(1)
    
    async def _find_suitable_agents(self, task: Task) -> List[Agent]:
        """
        Find agents capable of handling the task.
        
        :param task: Task to match agents for
        :return: List of suitable agents
        """
        # Extract required capabilities
        required_capabilities = task.payload.get('required_capabilities', [])
        
        # Find agents by capabilities
        matching_agents = await self.agent_registry.find_agents_by_capability(
            required_capabilities, 
            min_match_count=len(required_capabilities)
        )
        
        # Filter agents by resource requirements
        resource_filtered_agents = [
            agent for agent in matching_agents
            if self._check_resource_compatibility(agent, task)
        ]
        
        return resource_filtered_agents
    
    async def _assign_task_to_agent(self, task: Task, agent: Agent):
        """
        Assign a task to a specific agent.
        
        :param task: Task to assign
        :param agent: Agent to assign task to
        """
        # Update task status
        task.update_status(TaskStatus.ASSIGNED)
        task.assigned_agent_id = agent.id
        
        # Update agent status
        await self.agent_registry.update_agent_status(agent.id, AgentStatus.BUSY)
        
        # Track active tasks
        self._active_tasks[task.id] = task
        
        # Schedule task execution
        asyncio.create_task(self._execute_task(task, agent))
    
    async def _execute_task(self, task: Task, agent: Agent):
        """
        Execute a task on a specific agent.
        
        :param task: Task to execute
        :param agent: Agent executing the task
        """
        try:
            # Update task status
            task.update_status(TaskStatus.IN_PROGRESS)
            
            # Simulated task execution (replace with actual execution mechanism)
            # In a real system, this would involve sending the task to the agent
            result = await self._simulate_task_execution(task)
            
            # Update task result
            task.result = result
            task.update_status(TaskStatus.COMPLETED)
        
        except Exception as e:
            # Handle task failure
            self.logger.error(f"Task {task.id} failed: {e}")
            task.update_status(TaskStatus.FAILED)
            
            # Retry logic
            if task.can_retry():
                task.increment_retry()
                await self.submit_task(task)
        
        finally:
            # Reset agent status
            await self.agent_registry.update_agent_status(agent.id, AgentStatus.IDLE)
            
            # Remove from active tasks
            del self._active_tasks[task.id]
    
    async def _simulate_task_execution(self, task: Task) -> Dict[str, Any]:
        """
        Simulate task execution with configurable complexity.
        
        :param task: Task to simulate
        :return: Simulated task result
        """
        # Simulated processing time based on task priority
        processing_time = {
            TaskPriority.LOW: 1,
            TaskPriority.MEDIUM: 3,
            TaskPriority.HIGH: 5,
            TaskPriority.CRITICAL: 10
        }.get(task.priority, 3)
        
        await asyncio.sleep(processing_time)
        
        return {
            'status': 'success',
            'processing_time': processing_time,
            'payload': task.payload
        }
    
    def _check_resource_compatibility(self, agent: Agent, task: Task) -> bool:
        """
        Check if an agent can handle a task's resource requirements.
        
        :param agent: Agent to check
        :param task: Task with resource requirements
        :return: Boolean indicating compatibility
        """
        resource_reqs = task.resource_requirements
        
        # Implement resource compatibility checks
        if resource_reqs.get('cpu_cores', 0) > agent.resource_profile.cpu_cores:
            return False
        
        if resource_reqs.get('memory_gb', 0) > agent.resource_profile.memory_gb:
            return False
        
        if resource_reqs.get('gpu_count', 0) > agent.resource_profile.gpu_count:
            return False
        
        return True
    
    async def get_task_status(self, task_id: str) -> Optional[TaskStatus]:
        """
        Retrieve the status of a task.
        
        :param task_id: ID of the task
        :return: Task status or None
        """
        # Check active tasks
        if task_id in self._active_tasks:
            return self._active_tasks[task_id].status
        
        # Check queued tasks
        for task in self._task_queue:
            if task.id == task_id:
                return task.status
        
        return None
    
    async def start(self):
        """
        Start the queue management system.
        """
        self.logger.info("Starting Distributed Queue Manager")
        
        # Start task assignment loop
        assignment_task = asyncio.create_task(self.assign_tasks())
        
        # Optional: Add monitoring or additional startup tasks
        
        await assignment_task