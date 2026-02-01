import { PriorityQueue } from './priority-queue';
import { Agent } from '../agents/agent-registry';
import { JobRouter } from '../routing/job-router';

export enum JobPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface Job<T = any> {
  id: string;
  priority: JobPriority;
  payload: T;
  createdAt: number;
  attempts: number;
  maxAttempts?: number;
}

export class QueueManager<T> {
  private queue: PriorityQueue<Job<T>>;
  private jobRouter: JobRouter;
  private agents: Map<string, Agent>;

  constructor(options: {
    maxQueueSize?: number;
    defaultMaxAttempts?: number;
  } = {}) {
    const { 
      maxQueueSize = 1000, 
      defaultMaxAttempts = 3 
    } = options;

    this.queue = new PriorityQueue<Job<T>>(maxQueueSize);
    this.jobRouter = new JobRouter();
    this.agents = new Map();
  }

  async enqueue(job: Omit<Job<T>, 'id' | 'createdAt' | 'attempts'>): Promise<string> {
    const fullJob: Job<T> = {
      id: this.generateJobId(),
      createdAt: Date.now(),
      attempts: 0,
      ...job
    };

    // Find optimal agent for job
    const selectedAgent = await this.jobRouter.selectAgent(fullJob);

    if (!selectedAgent) {
      throw new Error('No suitable agent available for job');
    }

    await this.queue.enqueue(fullJob, this.getPriorityWeight(fullJob.priority));
    return fullJob.id;
  }

  async processNextJob(): Promise<Job<T> | null> {
    const job = await this.queue.dequeue();
    
    if (!job) return null;

    try {
      const agent = this.jobRouter.getAgentForJob(job);
      
      if (!agent) {
        // Requeue job if no agent available
        await this.queue.enqueue(job, this.getPriorityWeight(job.priority));
        return null;
      }

      // Execute job
      await agent.executeJob(job);

      return job;
    } catch (error) {
      // Handle job failure
      return this.handleJobFailure(job, error);
    }
  }

  private handleJobFailure(job: Job<T>, error: any): Job<T> | null {
    job.attempts++;

    if (job.attempts >= (job.maxAttempts ?? 3)) {
      // Move to dead-letter queue or log
      this.logFailedJob(job, error);
      return null;
    }

    // Requeue with potential backoff
    this.queue.enqueue(job, this.getPriorityWeight(job.priority));
    return job;
  }

  private getPriorityWeight(priority: JobPriority): number {
    const weights = {
      [JobPriority.LOW]: 3,
      [JobPriority.MEDIUM]: 2,
      [JobPriority.HIGH]: 1,
      [JobPriority.CRITICAL]: 0
    };
    return weights[priority];
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private logFailedJob(job: Job<T>, error: any) {
    console.error(`Job ${job.id} failed after ${job.attempts} attempts:`, error);
    // In production, would send to dead-letter queue or logging service
  }
}