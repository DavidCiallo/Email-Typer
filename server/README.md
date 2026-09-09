# CFRS-Email Go 服务端

Bun/TypeScript 服务端的 Go 移植版，目标是把常驻内存从 225–355 MB（Bun）
降到 ~20 MB，适配小内存 VPS。

## 与 TS 版的兼容性

- **API 完全兼容**：全部路由为 `POST /api/<module>/<action>`，响应封装一致
  （成功 `200 {"success":true,"data":…}`，失败 `400 {"success":false,"message":…,"data":null}`），
  前端无需任何改动（`dist/` 静态资源由本服务直接托管，SPA 回退、`.mjs`/`..` 403 与 WS `/ws` 行为一致）。
- **token 加密复刻**：AES-256-CBC，key=SHA256(SECRET)、iv=SHA256("cfrs-iv-"+SECRET)[:16]、
  nonce 后缀 + 字符串反转；旧 token / 注册验证链接 / 邮箱凭据在 Go 版下继续有效。
- **存储**：`data/*.jsonl` 首次启动时整体导入 SQLite（`data/cfrs.db`，WAL 模式），
  JSONL 文件保留作备份，导入幂等（meta 标记）。列 `from_addr`/`to_addr` 对应实体的 `from`/`to`。
- **索引/正文分离**：`emails` 表只存元数据 + `eml` 归档路径，正文按需从 maildir 归档读取；
  列表接口直接携带入库时提取的验证码（`codes`）与 `has_code`/`has_links` 标记。
- **maildir 监听**：以 5 秒周期扫描替代 chokidar，只处理 `*/new/` 下未索引的文件，
  已索引路径常驻内存（启动时预热），行为与 TS 版 watcher 一致。
- **IMAP**：`mailbox/sync`、`mailbox/test` 返回「暂不支持」（两台真实邮箱均为 api 类型，未受影响）。

## 构建与运行

```
cd server
go build -o cfrs-email .
./cfrs-email          # 读取仓库根目录 .env，默认端口 SERVER_PORT=3300
```

环境变量与 TS 版共用（SECRET、SERVER_PORT、EMAIL_RECEIVE_API_KEY、ADMIN_* 等），
`DATA_DIR`、`DIST_DIR` 可覆盖数据与静态资源目录。

## 部署注意

- 首次启动自动执行 JSONL → SQLite 迁移（约一秒/千封级别），之后启动直接读库。
- 备份仍需 `data/` 与 `eml/` 一起拷贝；`data/cfrs.db`（含 -wal/-shm）是新的索引主体。
- 与 TS 版**不要同时**对同一数据目录运行，避免两边同时 ingest 造成重复。
