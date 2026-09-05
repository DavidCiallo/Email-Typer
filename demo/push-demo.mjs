#!/usr/bin/env node
/**
 * Push API demo — 外部脚本如何把邮件投递进 CFRS-Email。
 *
 * 准备：在「邮箱管理」页新建一个 API 推送型邮箱，复制它的 API Key。
 * 运行：
 *   API_KEY=mk_xxx BASE_URL=http://localhost:3300 node demo/push-demo.mjs
 *   API_KEY=mk_xxx BASE_URL=http://localhost:3300 bun demo/push-demo.mjs
 *
 * 无任何依赖，Node 18+ / Bun / (浏览器 fetch 同理) 均可运行。
 */

const BASE = process.env.BASE_URL || "http://localhost:3300";
const KEY = process.env.API_KEY;
if (!KEY) {
    console.error("缺少 API_KEY 环境变量（邮箱管理 → API 邮箱 → API Key）");
    process.exit(1);
}

// ========== 1. 结构化推送：只有内容，服务端代为合成邮件 ==========

const demoMail = {
    from: "ci@jenkins.local",            // 原发件人，任意域均可
    subject: "构建 #42 通过",
    html: "<h2>Build #42</h2><p>108 tests passed, 0 failed</p>",
    text: "Build #42: 108 tests passed, 0 failed",
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
    "To: whatever@yeah.net",             // 收件人会被服务端替换为邮箱地址，随意填
    "Subject: =?UTF-8?B?" + Buffer.from("来自透传的原始邮件").toString("base64") + "?=",
    "Date: " + new Date().toUTCString(),
    `Message-ID: <demo-raw-${Date.now()}@example.org>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from("这是一封直接透传的完整原始邮件，正文与附件都不会被改动。").toString("base64"),
].join("\r\n") + "\r\n";

res = await fetch(`${BASE}/api/email/push`, {
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
