import { BaseEntity } from "../../lib/default/base.entity";

/**
 * 安全事件：既是审计日志，也是熔断锁状态的唯一真值来源。
 * 锁状态不额外存变量，避免「事件表」和「锁标记」两处不一致。
 */
export interface SecurityEventEntity extends BaseEntity {
    kind: string;        // forward_burst | forward_lock | forward_unlock | ruleset_trust
    severity: string;    // warn | lock | trust
    email_id: string;    // 触发的那封邮件
    hit_count: number;   // 命中的策略条数（去重前），决定告警等级
    send_count: number;  // 实际外发次数（去重后），用于成本核算
    detail: string;      // JSON：命中的策略快照
    status: string;      // open | acked
    acked_by: string;    // 解锁人 account_id
    acked_at: number;
}

/** 解锁界面里逐条审查的策略，附带系统算出的高风险线索。 */
export interface SecurityReviewItem {
    id: string;
    name: string;
    action: string;
    from_pattern: string;
    to_pattern: string;
    subject_pattern: string;
    forward_to: string;
    webhook_url: string;
    account_id: string;
    create_time: number;
    hints: string[];
    risk: "" | "medium" | "high";
}
