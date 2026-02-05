import { Job, JobResult, Agent, JobPriority } from './types';

// Job Queue Interface
export interface IJobQueue {
  enqueue(job: Job): Promise<void>;
  dequeue(agentCapabilities?: string[]): Promise<Job | null>;
  getNextJob(priority?: JobPriority, capabilities?: string[]): Promise<Job | null>;
}

// Agent Registry Interface
export interface IAgentRegistry {
  register(agent: Agent): Promise<void>;
  unregister(agentId: string): Promise<void>;
  updateHeartbeat(agentId: string): Promise<void>;
  findSuitableAgent(requiredCapabilities?: string[]): Promise<Agent | null>;
  getAllAgents(): Promise<Agent[]>;
}

// Job Dispatcher Interface
export interface IJobDispatcher {
  dispatch(job: Job): Promise<void>;
  processJob(job: Job, agentId: string): Promise<JobResult>;
  handleJobCompletion(result: JobResult): Promise<void>;
  handleJobFailure(job: Job, error: Error): Promise<void>;
}

// Fault Tolerance Interface
export interface IFaultTolerance {
  trackJobAttempt(job: Job): Promise<void>;
  shouldRetry(job: Job): boolean;
  handleAgentFailure(agentId: string): Promise<void>;
}

// Logging and Monitoring Interface
export interface IMonitoringService {
  logJobStatus(job: Job, status: string): Promise<void>;
  trackSystemMetrics(): Promise<void>;
  raiseAlert(message: string, severity: 'low' | 'medium' | 'high'): Promise<void>;
}

// Configuration Interface
export interface IConfigurationManager {
  getConfig<T>(key: string, defaultValue?: T): T;
  updateConfig<T>(key: string, value: T): void;
}