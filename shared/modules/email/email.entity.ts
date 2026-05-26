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
}
