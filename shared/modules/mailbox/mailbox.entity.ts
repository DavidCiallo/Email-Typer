import { BaseEntity } from "../../lib/default/base.entity";

/**
 * A mailbox is the unified "mail source" abstraction:
 * - catchall: a local-domain address that exists as soon as mail arrives for it (or is declared up front)
 * - api:      an address that external systems push structured mail into via its api_key
 * - imap:     an external mailbox (NetEase/QQ/...) synced over IMAP with an auth code
 */
export interface MailboxEntity extends BaseEntity {
    name: string;            // display name
    type: string;            // "catchall" | "api" | "imap"
    address: string;         // full email address (the push target / external account)
    domain: string;          // denormalized domain part for filtering
    local_part: string;
    provider: string;        // imap preset key ("163" | "126" | "qq" | "outlook" | "custom"), "" otherwise
    imap_host: string;
    imap_port: number;
    imap_tls: number;        // 1 = implicit TLS (993), 0 = plaintext/STARTTLS-less (dev only)
    sync_interval: number;   // poll interval in seconds; 0 = use global default
    credential: string;      // aes(JSON {user, password}) — imap only, never returned to the client
    status: string;          // "active" | "disabled" | "error"
    forward_enabled: number; // 1 = imported mail (api/imap) also matches forward strategies; 0 = store only
    sync_error: string;      // last sync failure message
    last_sync_time: number | null;
    last_uid: number;        // highest IMAP UID already imported
    uidvalidity: number;     // IMAP UIDVALIDITY of the remote INBOX
    note: string;
}
