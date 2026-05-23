import { BaseEntity } from "../../lib/default/base.entity";

export interface StrategyEntity extends BaseEntity {
    name: string;           // strategy name
    from_pattern: string;   // sender pattern (glob or regex)
    to_pattern: string;     // recipient pattern
    subject_pattern: string; // subject pattern
    forward_to: string;     // forward target email address
    enabled: number;        // 1 = enabled, 0 = disabled
    account_id: string;     // owner account id
}
