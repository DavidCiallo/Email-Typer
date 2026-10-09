import { BaseEntity } from "../../lib/default/base.entity";

export interface StrategyEntity extends BaseEntity {
    name: string;           // strategy name
    from_pattern: string;   // sender pattern (glob or regex)
    to_pattern: string;     // recipient pattern
    subject_pattern: string; // subject pattern
    forward_to: string;     // forward target email address (action = "send")
    action: string;         // "send" (forward the mail) | "webhook" (GET the url)
    webhook_url: string;    // callback url (action = "webhook")
    enabled: number;        // 1 = enabled, 0 = disabled
    account_id: string;     // owner account id
    scope?: string;         // "persistent" (default) | "temp"
    grant_id?: string;      // temp strategies: owning mailbox grant; "" for persistent
}
