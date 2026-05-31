export type JobEvent =
  | {
      kind: 'cell';
      jobId: string;
      lat: number;
      lng: number;
      radiusM: number;
      status: 'ok' | 'failed' | 'rate_limited' | 'cache_hit';
      resultsCount: number;
      overflow: boolean;
    }
  | {
      kind: 'progress';
      jobId: string;
      done: number;
      total: number;
      costUsd: number;
    }
  | {
      kind: 'status';
      jobId: string;
      status:
        | 'pending'
        | 'running'
        | 'paused'
        | 'completed'
        | 'cancelled'
        | 'failed';
    };

export const jobEventsChannel = (jobId: string): string => `job:${jobId}:events`;
