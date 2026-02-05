import asyncio
import logging

from src.core.queue_manager import DistributedQueueManager
from src.core.registry import AgentRegistry
from src.models.agent import Agent, ResourceProfile, AgentStatus
from src.models.task import Task, TaskPriority, TaskStatus

async def main():
    # Configure logging
    logging.basicConfig(
        level=logging.INFO, 
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    logger = logging.getLogger('QueueSystemDemo')

    # Create agent registry
    agent_registry = AgentRegistry()

    # Create queue manager
    queue_manager = DistributedQueueManager(
        agent_registry=agent_registry,
        max_concurrent_tasks=10
    )

    # Create sample agents with different capabilities
    data_agent = Agent(
        name='DataProcessingAgent',
        capabilities=['data_processing', 'analytics'],
        resource_profile=ResourceProfile(
            cpu_cores=4,
            memory_gb=16,
            gpu_count=1
        )
    )

    ml_agent = Agent(
        name='MachineLearningAgent',
        capabilities=['machine_learning', 'training', 'deep_learning'],
        resource_profile=ResourceProfile(
            cpu_cores=8,
            memory_gb=32,
            gpu_count=2
        )
    )

    # Register agents
    await agent_registry.register_agent(data_agent)
    await agent_registry.register_agent(ml_agent)

    # Create sample tasks
    data_task = Task(
        name='Process Customer Data',
        priority=TaskPriority.HIGH,
        payload={
            'required_capabilities': ['data_processing'],
            'data': {'customer_id': 123, 'action': 'analyze'}
        },
        resource_requirements={
            'cpu_cores': 2,
            'memory_gb': 8
        }
    )

    ml_task = Task(
        name='Train Neural Network',
        priority=TaskPriority.CRITICAL,
        payload={
            'required_capabilities': ['machine_learning', 'deep_learning'],
            'model_config': {'type': 'neural_network', 'layers': 5}
        },
        resource_requirements={
            'cpu_cores': 6,
            'memory_gb': 24,
            'gpu_count': 1
        }
    )

    # Submit tasks
    await queue_manager.submit_task(data_task)
    await queue_manager.submit_task(ml_task)

    # Start queue management
    await queue_manager.start()

if __name__ == '__main__':
    asyncio.run(main())