export const QUEUE_ORCHESTRATOR = 'scrape-orchestrator';
export const QUEUE_CELLS = 'scrape-cells';

export const JOB_ORCHESTRATE = 'orchestrate';
export const JOB_SCRAPE_CELL = 'scrape-cell';

export interface OrchestratorJobData {
  jobId: string;
}

export interface CellJobData {
  jobId: string;
  lat: number;
  lng: number;
  radiusM: number;
  /** quadtree depth — 0 for initial grid cells, +1 per split level */
  depth: number;
}
