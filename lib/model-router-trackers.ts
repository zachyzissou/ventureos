import type { PerformanceRecord, QuotaState } from './model-router';

export class QuotaTracker {
  private quotas: Map<string, QuotaState> = new Map();

  /** Set quota state for a key (e.g., 'global', 'openai', 'anthropic'). */
  setQuota(key: string, quota: QuotaState): void {
    this.quotas.set(key, { ...quota });
  }

  /** Get current quota state. */
  getQuota(key: string): QuotaState | undefined {
    const quota = this.quotas.get(key);
    return quota ? { ...quota } : undefined;
  }

  /** Get usage percentage (0-1). Returns 0 if no quota is set. */
  getUsagePercent(key: string): number {
    const q = this.quotas.get(key);
    if (!q || q.total <= 0) return 0;
    return Math.min(1, q.used / q.total);
  }

  /** Check if quota exceeds threshold. */
  isOverThreshold(key: string, threshold: number): boolean {
    return this.getUsagePercent(key) >= threshold;
  }

  /** Record usage. */
  recordUsage(key: string, amount: number): void {
    const q = this.quotas.get(key);
    if (q) {
      q.used = Math.min(q.total, q.used + amount);
    }
  }

  /** Check if quota is exhausted (100%). */
  isExhausted(key: string): boolean {
    const q = this.quotas.get(key);
    if (!q) return false;
    return q.used >= q.total;
  }

  /** Reset usage for a key. */
  resetUsage(key: string): void {
    const q = this.quotas.get(key);
    if (q) q.used = 0;
  }

  /** Get all quota keys. */
  getKeys(): string[] {
    return Array.from(this.quotas.keys());
  }

  /** Export all quota states. */
  export(): Record<string, QuotaState> {
    const result: Record<string, QuotaState> = {};
    for (const [k, v] of this.quotas) result[k] = { ...v };
    return result;
  }

  /** Import quota states. */
  import(data: Record<string, QuotaState>): void {
    this.quotas.clear();
    for (const [k, v] of Object.entries(data)) {
      this.quotas.set(k, { ...v });
    }
  }
}

export class PerformanceTracker {
  private records: Map<string, PerformanceRecord> = new Map();
  private readonly now: () => Date;

  constructor(now?: () => Date) {
    this.now = now ?? (() => new Date());
  }

  /** Generate composite key. */
  private key(modelId: string, taskType: string): string {
    return `${modelId}::${taskType}`;
  }

  /** Record a completion. Updates running averages. */
  recordCompletion(
    modelId: string,
    taskType: string,
    latencyMs: number,
    success: boolean,
    qualityScore: number
  ): void {
    const k = this.key(modelId, taskType);
    const existing = this.records.get(k);

    if (!existing) {
      this.records.set(k, {
        modelId,
        taskType,
        sampleCount: 1,
        avgLatencyMs: latencyMs,
        successRate: success ? 1 : 0,
        avgQualityScore: qualityScore,
        updatedAt: this.now().toISOString(),
      });
      return;
    }

    // Exponential moving average with α = 2/(n+2), capped at n=100
    // The +2 ensures α < 1 even for the first update, providing smooth blending
    const n = Math.min(existing.sampleCount, 100);
    const alpha = 2 / (n + 2);

    existing.avgLatencyMs = existing.avgLatencyMs * (1 - alpha) + latencyMs * alpha;
    existing.successRate = existing.successRate * (1 - alpha) + (success ? 1 : 0) * alpha;
    existing.avgQualityScore = existing.avgQualityScore * (1 - alpha) + qualityScore * alpha;
    existing.sampleCount += 1;
    existing.updatedAt = this.now().toISOString();
  }

  /** Get performance record. */
  getRecord(modelId: string, taskType: string): PerformanceRecord | undefined {
    return this.records.get(this.key(modelId, taskType));
  }

  /** Compute a performance score (0-1) for a model+taskType. */
  getPerformanceScore(modelId: string, taskType: string): number {
    const record = this.records.get(this.key(modelId, taskType));
    if (!record || record.sampleCount < 3) return 0.5; // Neutral score for insufficient data

    // Weighted combination: quality 50%, success 35%, latency 15%
    const latencyScore = Math.max(0, 1 - record.avgLatencyMs / 30_000); // 30s = 0 score
    return record.avgQualityScore * 0.5 + record.successRate * 0.35 + latencyScore * 0.15;
  }

  /** Get all records. */
  getAll(): PerformanceRecord[] {
    return Array.from(this.records.values());
  }

  /** Get best model for a task type. */
  getBestModel(taskType: string, candidates: string[]): string | undefined {
    let bestId: string | undefined;
    let bestScore = -1;

    for (const id of candidates) {
      const score = this.getPerformanceScore(id, taskType);
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }

    return bestId;
  }

  /** Export all records. */
  export(): PerformanceRecord[] {
    return this.getAll();
  }

  /** Import records. */
  import(records: PerformanceRecord[]): void {
    this.records.clear();
    for (const r of records) {
      this.records.set(this.key(r.modelId, r.taskType), { ...r });
    }
  }

  /** Clear all records. */
  clear(): void {
    this.records.clear();
  }
}
