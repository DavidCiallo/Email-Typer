# CFRS-Email

## 项目介绍
本项目旨在使用 Postfix 实现一个自定义邮箱集成服务。支持邮件接收，多邮箱管理，转发策略设置，以及实现发信服务。

本项目为全栈应用，前端基于 [React](https://react.dev/) [HeroUI](https://heroicons.com/) ，后端基于 [Express](https://expressjs.com/)，使用[TypeScript](https://www.typescriptlang.org/) 进行开发，推荐使用 [Bun](https://bun.sh/)。

## 技术栈

- 前端：React + HeroUI
- 后端：Express
- 运行环境：Bun (nodejs)

## 快速开始

### 克隆项目

```bash
git clone https://github.com/DcolorWei/CFRS-Email
cd CFRS-Email
```

### 安装依赖

```bash
npm install -g bun
bun install
```

### 编辑环境变量

新建.env文件，内容可参考.env.example；或执行
```bash
cp .env.example .env
```
但开发环境与部署环境不同，部署仅需单个端口，HTTP只需指定唯一变量SERVER_HTTP_PORT即可

### 启动开发环境

####
```bash
npm run all
```

#### 单独启用前端

```bash
npm run dev
```

#### 单独启用后端

```bash
npm run serve
```

## 目录结构

```
.
├── client/      # 前端代码（React + HeroUI + TypeScript）
├── server/      # 后端代码（Express + TypeScript）
├── shared/      # 共享代码（TypeScript）
├── README.md
```

## 构建与部署
```bash
npm run build
```
将在 dist 目录下生成前端静态打包文件，可部署到任何静态文件服务器中；同时生成bundle.mjs文件，可部署到任何支持Node.js的服务器中。

## 数据与备份

邮件索引（`data/email.jsonl`）只存元数据；**正文保存在 `eml/` 归档目录**（邮件详情按需从对应 eml 文件读取），附件在 `data/attachments/`。备份 / 迁移时请把 `data/` 与 `eml/` 一起带走；「导出数据」生成的 JSON 不含正文，导入后需配合原有 `eml/` 目录才能查看正文。

## Push API（外部邮件投递）

外部系统凭「推送/收信 API Key」把邮件投递进来（`EMAIL_RECEIVE_API_KEY`）。该 key 可在「设置页 → 服务器 → 推送/收信 API Key」管理，留空则回退到 `.env` 中的 `EMAIL_RECEIVE_API_KEY`；未配置时推送会被拒绝（401）。支持跨域，适合脚本 / 浏览器自动化桥接受限邮箱：

```bash
# 结构化推送（服务端代为合成 RFC822 邮件）
curl -X POST http://localhost:3300/api/email/push \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"time": 1730000000000, "subject": "hi", "html": "<b>hello</b>", \
       "attachments": [{"filename": "a.txt", "base64": "..."}]}'

# 原始邮件透传（脚本已持有完整 .eml / RFC822 时）
curl -X POST "http://localhost:3300/api/email/push?time=1730000000000" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: message/rfc822" \
  --data-binary @mail.eml
```

说明：`time`（毫秒时间戳）**必填**——邮件时间以调用方提供为准，而非入库时刻；透传路径会用它覆盖邮件自身的 `Date` 头（同时修复抓取邮件 Date 缺失/异常的情况），重扫描保持一致。JSON 体亦可用 `raw`（UTF-8 原文）或 `raw_base64` 字段透传原始邮件；带 `message_id` 可实现幂等重试（重复投递返回已存记录并标记 `duplicate`）；响应包含附件入库结果（超过大小上限的附件会列在 `skipped_files`）。默认每 Key 每分钟限 120 次，可在设置页或 `PUSH_RATE_LIMIT_PER_MIN` 调整（0 为不限）。

## 许可证

MIT