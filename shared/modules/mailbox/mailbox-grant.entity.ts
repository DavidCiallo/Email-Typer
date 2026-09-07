import { BaseEntity } from "../../lib/default/base.entity";

/**
 * A temporary mailbox access grant ("tauth"): lets a link holder act as the
 * mailbox owner for a limited window. The window also bounds visibility —
 * mail and send records from before start_time are never exposed.
 * The raw token only lives in the generated link; storage keeps a sha256.
 */
export interface MailboxGrantEntity extends BaseEntity {
    mailbox_id: string;     // granted mailbox
    address: string;        // denormalized mailbox address
    token_hash: string;     // sha256 hex of the tauth token
    start_time: number;     // visibility window start (ms)
    end_time: number;       // expiry (ms)
    note: string;
}
