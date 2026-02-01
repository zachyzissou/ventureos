
import { Agent } from '../agents/agent_registry';
import { Job } from '../core/queue-manager';

export class JobRouter {
    private agents: Agent[] = [];

    registerAgent(agent: Agent): void {
        this.agents.push(agent);
    }

    selectAgent<T>(job: Job<T>): Agent | null {
        // Advanced agent selection strategy
        const compatibleAgents = this.agents.filter(agent => 
            agent.capabilities.includes(job.requiredCapability) &&
            agent.status === 'active'
        );

        if (compatibleAgents.length === 0) return null;

        // Select agent with least recent job
        return compatibleAgents.reduce((prev, curr) => 
            (prev.lastJobTime || 0) < (curr.lastJobTime || 0) ? prev : curr
        );
    }

    routeJob<T>(job: Job<T>): void {
        const selectedAgent = this.selectAgent(job);
        if (!selectedAgent) {
            throw new Error('No suitable agent found for job');
        }

        // In real implementation, would dispatch to agent
        selectedAgent.lastJobTime = Date.now();
    }
}
