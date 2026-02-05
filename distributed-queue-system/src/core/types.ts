import { z } from 'zod';

// Job Priority Enum
export enum JobPriority {
  LOW = 1,
  MEDIUM = 5,
  HIGH = 10,
  CRITICAL = 20
}

// Job Status Enum
export enum JobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  RETRY = 'RETRY'
}

// Agent Registration Schema
export const AgentSchema = z.object({
  id: z.string().uuid(),
  capabilities: z.array(z.string()),
  maxConcurrentJobs: z.number().int().min(1),
  currentLoad: z.number().int().min(0),
  lastHeartbeat: z.date()
});
export type Agent = z.infer<typeof AgentSchema>;

// Job Schema
export const JobSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  data: z.any(),
  priority: z.nativeEnum(JobPriority),
  status: z.nativeEnum(JobStatus),
  createdAt: z.date(),
  updatedAt: z.date(),
  attempts: z.number().int().min(0),
  maxAttempts: z.number().int().min(1).default(3),
  requiredCapabilities: z.array(z.string()).optional()
});
export type Job = z.infer<typeof JobSchema>;

// Job Result Schema
export const JobResultSchema = z.object({
  jobId: z.string().uuid(),
  status: z.nativeEnum(JobStatus),
  result: z.any().optional(),
  error: z.string().optional()
});
export type JobResult = z.infer<typeof JobResultSchema>;