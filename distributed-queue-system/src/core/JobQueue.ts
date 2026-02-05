import { v4 as uuidv4 } from 'uuid';
import { Job, JobStatus, JobPriority } from './types';
import { IJobQueue, IAgentRegistry } from './interfaces';

export class JobQueue implements IJobQueue {
  private jobs: Job[] = [];
  private agentRegistry: IAgentRegistry;

  constructor(agentRegistry: IAgentRegistry) {
    this.agentRegistry = agentRegistry;
  }

  async enqueue(job: Job): Promise<void> {
    // Validate and set default values
    const newJob: Job = {
      ...job,
      id: job.id || uuidv4(),
      status: JobStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
      attempts: 0
    };

    // Find suitable agent
    const suitableAgent = await this.agentRegistry.findSuitableAgent(
      job.requiredCapabilities
    );

    if (!suitableAgent) {
      // No suitable agent found, queue for later processing
      this.jobs.push(newJob);
      return;
    }

    // TODO: Implement actual job dispatch logic
    this.jobs.push(newJob);
  }

  async dequeue(agentCapabilities?: string[]): Promise<Job | null> {
    // Priority-based job selection
    const eligibleJobs = this.jobs
      .filter(job => 
        job.status === JobStatus.PENDING && 
        (!agentCapabilities || 
         !job.requiredCapabilities || 
         job.requiredCapabilities.every(cap => 
           agentCapabilities.includes(cap)
         ))
      )
      .sort((a, b) => b.priority - a.priority);

    return eligibleJobs.length > 0 ? eligibleJobs[0] : null;
  }

  async getNextJob(
    priority?: JobPriority, 
    capabilities?: string[]
  ): Promise<Job | null> {
    const jobs = this.jobs
      .filter(job => 
        job.status === JobStatus.PENDING &&
        (!priority || job.priority >= priority) &&
        (!capabilities || 
         !job.requiredCapabilities || 
         job.requiredCapabilities.every(cap => 
           capabilities.includes(cap)
         ))
      )
      .sort((a, b) => b.priority - a.priority);

    return jobs.length > 0 ? jobs[0] : null;
  }
}