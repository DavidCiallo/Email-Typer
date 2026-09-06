import { BaseEntity } from "../../lib/default/base.entity";

/**
 * One outbound mail attempt from the send page.
 * - channel "resend":  the from domain has a Resend key — sent immediately
 * - channel "external": no Resend key for that domain — left as a task for an
 *   outside script (e.g. the mailbox's own SMTP), which reports back via
 *   the status update endpoint
 */
export interface SendLogEntity extends BaseEntity {
    from: string;
    to: string;
    subject: string;
    html: string;
    /** "pending" | "sent" | "failed" */
    status: string;
    /** "resend" | "external" */
    channel: string;
    /** failure reason when status = failed */
    error: string;
}
