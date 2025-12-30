import fs from "fs";
import path from "path";
import chokidar from "chokidar";
import { simpleParser } from "mailparser";
import { StrategyEntity } from "../../shared/types/Strategy";
import Repository from "../lib/repository";
import { EmailImpl } from "../../shared/impl";
import { sendEmail } from "./email.send";
const strategyRepository = Repository.instance(StrategyEntity);

import { config } from "dotenv";
import { WebSocketServerService } from "../lib/webscoket";
config();

const patternToWatch = process.env.EMAIL_HOME_PATH || "/home";

chokidar
    .watch(patternToWatch, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true,
        depth: 4,
    })
    .on("add", async (filepath) => {
        const email = await parseEmail(filepath);
        WebSocketServerService.getInstance().triggerEvent("checkNewEmail", true);
        if (!email) return;
        const strategies = (await strategyRepository.find()).filter((s) => email.to.includes(s.email));
        strategies.forEach(async (strategy) => {
            const name = strategy.email.split("@")[0];
            email.html = [
                `<html><body>`,
                `<p>发件人:${email.from.replace(/[\<\>]/g, "")}</p>`,
                `<p>收件人:${email.to.replace(/[\<\>]/g, "")}</p>`,
                `<p>主题:${email.subject}</p>`,
                `<div>${email.text}<div>`,
                `<p>若无法显示内容，可能是转发限制，请前往平台查看</p>`,
                `</body></html>`,
            ]
                .join("")
                .trim();
            sendEmail({
                name,
                to: strategy.forward,
                subject: email.subject,
                html: email.html,
            });
        });
    })
    .on("error", console.error)
    .on("ready", () => {});

export async function getEmailList(): Promise<EmailImpl[]> {
    const inboxSet = new Set((await strategyRepository.find()).map((item) => item.email));
    const emailList: EmailImpl[] = [];
    const inboxArray = Array.from(inboxSet);
    for (const email of inboxArray) {
        const emails = await getMailsByName(email.split("@")[0]);
        emailList.push(...emails);
    }
    emailList.sort((a, b) => Number(a.time) - Number(b.time));
    return emailList;
}

async function parseEmail(filepath: string): Promise<EmailImpl | null> {
    try {
        const content = fs.readFileSync(filepath, "utf8");
        const email = await simpleParser(content);
        if (!email) return null;
        const eid = email.headers.get("message-id") || path.basename(filepath).split(".")[0];
        let from: string;
        let to: string;
        if (!email.headers.get("from")) {
            from = "None";
        } else {
            from = JSON.parse(JSON.stringify(email.headers.get("from"))).text;
        }
        if (!email.headers.get("to")) {
            to = filepath.split("home")[1]?.split("/")[1] || "None";
        } else {
            to = JSON.parse(JSON.stringify(email.headers.get("to"))).text;
        }
        const subject = email.headers.get("subject");
        const time = String(new Date(String(email.headers.get("date"))).getTime());
        const { html, text } = email;
        return { eid, from, to, subject, time, html, text } as EmailImpl;
    } catch {
        return null;
    }
}

async function getMailsByName(name: string): Promise<EmailImpl[]> {
    name = name.toLocaleLowerCase();
    const dir = `${process.env.EMAIL_HOME_PATH || "/home"}/${name}/Maildir/new`;
    if (!fs.existsSync(dir)) {
        return [];
    }
    const files = fs.readdirSync(dir);
    const result = await Promise.all(
        files.map(async (file) => {
            const filePath = `${process.env.EMAIL_HOME_PATH || "/home"}/${name}/Maildir/new/${file}`;
            return await parseEmail(filePath);
        }),
    );
    return result.filter((item) => item !== null);
}
