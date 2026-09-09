# CFRS-Email

## 项目介绍
本项目旨在使用 Postfix 实现一个自定义邮箱集成服务。支持邮件接收，多邮箱管理，转发策略设置，以及实现发信服务。

本项目为全栈应用，前端基于 [React](https://react.dev/) [HeroUI](https://heroicons.com/) ，后端基于 [Go](https://go.dev/)（SQLite 存储，纯 Go 无 CGo），前端使用 [TypeScript](https://www.typescriptlang.org/)，构建工具推荐 [Bun](https://bun.sh/)。

## 技术栈

- 前端：React + HeroUI
- 后端：Go + SQLite（`server/`）
- 前端构建：Bun + rsbuild

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

后端需要 Go 1.23+（[golang.org](https://go.dev/dl/)），依赖在首次构建时自动拉取。

### 编辑环境变量

新建.env文件，内容可参考.env.example；或执行
```bash
cp .env.example .env
```
SECRET 用于登录 token 与凭据加密，更换后旧 token / IMAP 凭据失效。

### 启动开发环境

#### 前端 + 后端

终端 1（后端，默认 3300 端口）：
```bash
npm run serve
```

终端 2（前端 dev server）：
```bash
npm run dev
```

#### 目录结构

```
.
├── client/      # 前端代码（React + HeroUI + TypeScript）
├── server/      # 后端代码（Go + SQLite）
├── shared/      # 前后端共享的类型与工具（TypeScript）
├── README.md
```

## 构建与部署

```bash
npm run build          # 前端 → dist/
cd server && go build -o cfrs-email .   # 后端单二进制
```

Go 二进制同时托管 `dist/` 静态资源与 `/api`，单进程单端口即可部署（需与 `dist/`、`data/`、`eml/` 同目录运行，或用 `DATA_DIR` / `DIST_DIR` 指定）。Docker 部署直接 `docker compose up -d --build`（多阶段构建：bun 打包前端 + Go 编译后端）。

## 数据与备份

邮件索引存放在 SQLite（`data/cfrs.db`，首次启动自动从旧版 `data/*.jsonl` 导入，JSONL 保留作备份）；**正文保存在 `eml/` 归档目录**（邮件详情按需从对应 eml 文件读取），附件在 `data/attachments/`。备份 / 迁移时请把 `data/`（含 `cfrs.db*`）与 `eml/` 一起带走；「导出数据」生成的 JSON 不含正文，导入后需配合原有 `eml/` 目录才能查看正文。

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