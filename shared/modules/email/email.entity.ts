import { BaseEntity } from "../../lib/default/base.entity";

export interface EmailEntity extends BaseEntity {
    eid: string;           // email unique id from the mail system
    from: string;          // sender address
    to: string;            // recipient address
    subject: string;       // email subject
    html: string;          // html content
    text: string;          // plain text content
    time: number;          // email sent time (timestamp)
    account_id: string;    // associated account id (recipient)
    blocked?: number;      // 1 = intercepted by safety rules (stored but not forwarded)
    blocked_by?: string;   // rule type that caught it: "blacklist" | "sensitive_word" | ""
    block_rule?: string;   // matched rule value
}
