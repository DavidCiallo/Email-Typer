import { BaseEntity } from "../../lib/default/base.entity";

/**
 * A scheduled maintenance task. The server sweeps every 30s and fires a task
 * once its scheduled minute has passed since `last_run_at`, so a restart
 * neither skips nor repeats a run.
 */
export interface AutoTaskEntity extends BaseEntity {
    name: string;
    enabled: number;          // 1 = active, 0 = paused
    kind: string;             // "daily" | "weekly" | "monthly"
    time_of_day: string;      // local "HH:mm"
    weekdays: string[];       // ["MO","TU",...] — weekly only
    month_day: number;        // 1-31 — monthly only
    time_zone: string;        // IANA, e.g. "Asia/Shanghai"
    action: string;           // "archive" | "archive_report"
    params: Record<string, any>;
    last_run_at: number | null;
    last_status: string;      // "" | "running" | "ok" | "failed"
    last_message: string;
}
