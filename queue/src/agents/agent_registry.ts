
export interface Agent {
    id: string;
    capabilities: string[];
    status: 'active' | 'inactive';
    lastHeartbeat: number;
}

export class AgentRegistry {
    private agents: Map<string, Agent> = new Map();

    registerAgent(agent: Omit<Agent, 'lastHeartbeat'>): string {
        const newAgent: Agent = {
            ...agent,
            lastHeartbeat: Date.now()
        };
        
        this.agents.set(newAgent.id, newAgent);
        return newAgent.id;
    }

    getAgent(agentId: string): Agent | undefined {
        return this.agents.get(agentId);
    }

    updateAgentHeartbeat(agentId: string): void {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.lastHeartbeat = Date.now();
        }
    }

    findAgentsByCapability(capability: string): Agent[] {
        return Array.from(this.agents.values())
            .filter(agent => 
                agent.capabilities.includes(capability) && 
                agent.status === 'active'
            );
    }
}
