import { EmailImpl } from "../../shared/impl";
import {
    EmailListQuery,
    EmailListResponse,
    EmailRouterInstance,
    EmailSenderBody,
    EmailSenderResponse,
} from "../../shared/router/EmailRouter";
import { inject } from "../lib/inject";
import { verifytoken } from "../service/auth.service";
import { sendEmail } from "../service/email.send";
import { getEmailList } from "../service/email.service";

async function queryEmailList(query: EmailListQuery): Promise<EmailListResponse> {
    if (!query.auth || !query.page) {
        return { list: [], total: 0 };
    }
    const email = verifytoken(query.auth);
    if (!email) {
        return { list: [], total: 0 };
    }
    const list: Array<EmailImpl> = [];
    list.push(...(await getEmailList()));
    list.reverse();
    const result: EmailListResponse = {
        list: list.slice((query.page - 1) * 10, query.page * 10),
        total: list.length,
    };
    return result;
}

async function requestSendMail(body: EmailSenderBody): Promise<EmailSenderResponse> {
    const success = await sendEmail(body);
    return { success };
}

async function checkNewEmail(query: {}): Promise<boolean> {
    return false;
}

export const emailController = new EmailRouterInstance(inject, { queryEmailList, requestSendMail });
