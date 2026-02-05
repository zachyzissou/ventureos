import asyncio
from typing import Dict, List, Optional
from ..models.agent import Agent
from ..models.task import Task
from ..core.exceptions import AgentRegistrationError, TaskAssignmentError

class AgentRegistry:
    """
    Advanced agent registration and management system.
    Provides capabilities for dynamic agent tracking and discovery.
    """
    
    def __init__(self):
        self._agents: Dict[str, Agent] = {}
        self._capability_index: Dict[str, List[str]] = {}
        self._lock = asyncio.Lock()
    
    async def register_agent(self, agent: Agent) -> str:
        """
        Register a new agent with comprehensive validation.
        
        :param agent: Agent to register
        :return: Registered agent ID
        :raises AgentRegistrationError: If registration fails
        """
        async with self._lock:
            # Validate agent
            if not agent.name:
                raise AgentRegistrationError("Agent must have a name")
            
            # Check for existing agent
            if agent.id in self._agents:
                raise AgentRegistrationError(f"Agent {agent.id} already registered")
            
            # Index capabilities
            for capability in agent.capabilities + agent.specializations:
                if capability not in self._capability_index:
                    self._capability_index[capability] = []
                self._capability_index[capability].append(agent.id)
            
            # Store agent
            self._agents[agent.id] = agent
            
            return agent.id
    
    async def unregister_agent(self, agent_id: str):
        """
        Unregister an agent and clean up indices.
        
        :param agent_id: ID of agent to unregister
        """
        async with self._lock:
            if agent_id not in self._agents:
                return
            
            agent = self._agents[agent_id]
            
            # Remove capability indices
            for capability in agent.capabilities + agent.specializations:
                if capability in self._capability_index:
                    self._capability_index[capability] = [
                        aid for aid in self._capability_index[capability] if aid != agent_id
                    ]
            
            # Remove agent
            del self._agents[agent_id]
    
    async def get_agent(self, agent_id: str) -> Optional[Agent]:
        """
        Retrieve an agent by ID.
        
        :param agent_id: ID of the agent
        :return: Agent instance or None
        """
        return self._agents.get(agent_id)
    
    async def find_agents_by_capability(
        self, 
        capabilities: List[str], 
        min_match_count: int = 1
    ) -> List[Agent]:
        """
        Find agents matching specified capabilities.
        
        :param capabilities: List of required capabilities
        :param min_match_count: Minimum number of capabilities to match
        :return: List of matching agents
        """
        matching_agents = []
        
        for agent_id, agent in self._agents.items():
            # Count capability matches
            matched_capabilities = sum(
                1 for cap in capabilities 
                if cap in agent.capabilities or cap in agent.specializations
            )
            
            if matched_capabilities >= min_match_count and agent.is_available():
                matching_agents.append(agent)
        
        # Sort by capability match count (descending)
        return sorted(
            matching_agents, 
            key=lambda a: sum(
                1 for cap in capabilities 
                if cap in a.capabilities or cap in a.specializations
            ), 
            reverse=True
        )
    
    async def update_agent_status(self, agent_id: str, status):
        """
        Update an agent's status.
        
        :param agent_id: ID of the agent
        :param status: New status
        """
        async with self._lock:
            if agent_id in self._agents:
                self._agents[agent_id].status = status
    
    def get_all_agents(self) -> List[Agent]:
        """
        Retrieve all registered agents.
        
        :return: List of all agents
        """
        return list(self._agents.values())
    
    def get_agent_count(self) -> int:
        """
        Get total number of registered agents.
        
        :return: Number of agents
        """
        return len(self._agents)