import { BaseEntity } from "../../lib/default/base.entity";

export interface ThirdpartyEntity extends BaseEntity {
    email: string;        // email address
    password: string;     // password
    login_site: string;   // login site (default: email domain suffix)
    link_email: string;   // associated email
    remark: string;       // notes
}
