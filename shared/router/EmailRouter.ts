import { EmailImpl } from "../impl";
import { BaseRequest, BaseRouterInstance } from "../lib/decorator";

export class EmailRouterInstance extends BaseRouterInstance {
    base = "/api";
    prefix = "/email";
    router = [
        {
            name: "queryEmailList",
            path: "/list",
            method: "get",
            handler: Function,
        },
        {
            name: "requestSendMail",
            path: "/send",
            method: "post",
            handler: Function,
        },
    ];

    queryEmailList: (query: EmailListQuery, callback?: Function) => Promise<EmailListResponse>;
    requestSendMail: (query: EmailSenderBody, callback?: Function) => Promise<EmailSenderResponse>;

    constructor(
        inject: Function,
        functions?: {
            queryEmailList: (query: EmailListQuery) => Promise<EmailListResponse>;
            requestSendMail: (query: EmailSenderBody) => Promise<EmailSenderResponse>;
        },
    ) {
        super();
        inject(this, functions);
    }
}

export interface EmailListQuery extends BaseRequest {
    page: number;
}

export interface EmailListResponse {
    list: EmailImpl[];
    total: number;
}

export interface EmailSenderBody extends BaseRequest {
    name?: string;
    from?: string;
    to: string;
    subject: string;
    html: string;
}

export interface EmailSenderResponse {
    success: boolean;
}

export interface EmailOtpQuery extends BaseRequest {
    email: string;
}

export interface EmailUrlQuery extends BaseRequest {
    email: string;
    keyword: string;
}
