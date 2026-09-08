#!/usr/bin/env node
/**
 * Push API demo — 外部脚本如何把邮件投递进 CFRS-Email。
 *
 * 准备：服务端 .env 里的 EMAIL_RECEIVE_API_KEY（Push API 主 Key）。
 * 运行：
 *   API_KEY=xxx PUSH_TO=you@example.com BASE_URL=http://localhost:3300 node demo/push-demo.mjs
 *   API_KEY=xxx PUSH_TO=you@example.com BASE_URL=http://localhost:3300 bun demo/push-demo.mjs
 *
 * 无任何依赖，Node 18+ / Bun / (浏览器 fetch 同理) 均可运行。
 */

const BASE = process.env.BASE_URL || "http://localhost:3300";
const KEY = process.env.API_KEY || process.env.EMAIL_RECEIVE_API_KEY;
const TO = process.env.PUSH_TO;
if (!KEY || !TO) {
    console.error("缺少 API_KEY（=EMAIL_RECEIVE_API_KEY）或 PUSH_TO（收件地址）环境变量");
    process.exit(1);
}

// ========== 1. 结构化推送：只有内容，服务端代为合成邮件 ==========

const demoMail = {
    to: TO,
    from: "ci@jenkins.local",            // 原发件人，任意域均可
    subject: "构建 #42 通过",
    html: "<h2>Build #42</h2><p>108 tests passed, 0 failed</p>",
    text: "Build #42: 108 tests passed, 0 failed",
    time: Date.now(),                    // 必填：邮件时间（毫秒时间戳），入库时间以它为准
    message_id: `<demo-${Date.now()}@jenkins>`,  // 幂等键：重试时保持不变即可去重
    attachments: [{
        filename: "result.json",
        contentType: "application/json",
        base64: Buffer.from(JSON.stringify({ pass: 108, fail: 0 })).toString("base64"),
    }],
};

let res = await fetch(`${BASE}/api/email/push`, {
    method: "POST",
    headers: { "x-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify(demoMail),
});
console.log("1) 结构化推送:", JSON.stringify(await res.json()));

// ========== 2. 原始邮件透传：手里已有完整 RFC822（如 IMAP 拉取）直接投递 ==========

const raw = [
    "From: Alice <alice@example.org>",
    "To: whatever@yeah.net",             // 收件人以邮件头为准；?to 缺省时也按它做归属
    "Subject: =?UTF-8?B?" + Buffer.from("来自透传的原始邮件").toString("base64") + "?=",
    "Date: " + new Date(Date.now() - 3600_000).toUTCString(),  // 会被子 time 参数覆盖
    `Message-ID: <demo-raw-${Date.now()}@example.org>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from("这是一封直接透传的完整原始邮件，正文与附件都不会被改动。").toString("base64"),
].join("\r\n") + "\r\n";

// message/rfc822 纯二进制体没有 JSON 字段可带 time —— 走 URL 查询参数，
// 服务端会用它覆盖邮件里的 Date 头（修复抓取邮件 Date 缺失/异常的情况）。
res = await fetch(`${BASE}/api/email/push?time=${Date.now()}`, {
    method: "POST",
    headers: { "x-api-key": KEY, "Content-Type": "message/rfc822" },
    body: raw,
});
console.log("2) 原始透传:  ", JSON.stringify(await res.json()));

// ========== 3. 网络重试场景：同一 message_id 再发一次，幂等返回已存记录 ==========

res = await fetch(`${BASE}/api/email/push`, {
    method: "POST",
    headers: { "x-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify(demoMail),
});
console.log("3) 重复投递:  ", JSON.stringify(await res.json()));
