import { BaseEntity } from "../../lib/default/base.entity";

export interface SafetyEntity extends BaseEntity {
    type: string;       // "blacklist" | "whitelist" | "sensitive_word"
    value: string;      // sender address / keyword pattern
    note: string;       // optional note
}
