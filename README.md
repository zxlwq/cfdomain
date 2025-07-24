# 域名展示面板（Cloudflare Pages+D1 版）

一个现代化的域名管理与展示面板，支持域名状态监控、到期提醒（支持 Telegram、微信、QQ、邮件多方式）、可视化展示，适合个人和团队自部署。

## 🚀 快速部署

### 1. 推送代码到 GitHub
Fork该项目到你的 GitHub 仓库

### 2. Cloudflare Pages 部署
1. 进入 [Cloudflare Pages](https://dash.cloudflare.com/?to=/:account/pages)，点击"创建项目"
2. 连接你的 GitHub 仓库
3. 构建设置：
   - 构建命令：`npm run build`
   - 构建输出目录：`dist`
   - Node.js 版本：20

### 3. 配置 D1 数据库
1. 在 Cloudflare 控制台创建 D1 数据库，命名为 `domain_panel`
2. 在 Pages 项目设置中绑定 D1 数据库，绑定名为 `DB`
3. 在 D1 控制台执行以下 SQL 初始化表结构：

```sql
CREATE TABLE IF NOT EXISTS domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  status TEXT NOT NULL,
  registrar TEXT NOT NULL,
  register_date TEXT NOT NULL,
  expire_date TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_domains_domain ON domains(domain);
CREATE INDEX IF NOT EXISTS idx_domains_status ON domains(status);
CREATE INDEX IF NOT EXISTS idx_domains_expire_date ON domains(expire_date);

CREATE TABLE IF NOT EXISTS notification_settings (
  warning_days TEXT,
  notification_enabled TEXT,
  notification_interval TEXT,
  notification_method TEXT -- 存储为JSON字符串，如 '["wechat","qq","email"]'
);
```

### 4. 设置环境变量（支持多方式通知）
在 Cloudflare Pages 项目设置中添加环境变量：
- `TG_BOT_TOKEN`：你的 Telegram Bot Token（如需 Telegram 通知）
- `TG_USER_ID`：你的 Telegram 用户 ID（如需 Telegram 通知）
- `WECHAT_SENDKEY`：Server酱 SendKey（如需微信通知，https://sct.ftqq.com/）
- `QMSG_KEY`：Qmsg酱 key（如需QQ通知，https://qmsg.zendee.cn/）
- `QMSG_QQ`：你的QQ号（如需QQ通知）
- `MAIL_TO`：收件人邮箱（如需邮件通知，推荐使用常用邮箱）

> 可多选通知方式，前端设置后，后端会自动推送到所有勾选方式。

### 5. 前端多选通知方式
- 在系统设置-通知设置中，可多选“微信/QQ/邮件/Telegram”任意组合，保存后到期提醒会同时推送到所有勾选渠道。
- 如需关闭某种通知，取消勾选即可。

### 6. 部署完成
点击"保存并部署"，等待部署完成后即可访问你的域名面板。

---

## 常见问题
- **微信/QQ/邮件通知收不到？**
  - 请检查环境变量配置是否正确，SendKey/Key/邮箱等是否有效。
  - 邮件通知默认使用 MailChannels（Cloudflare Pages Functions 原生支持），如需自定义SMTP可自行扩展。
- **如何自定义通知内容？**
  - 可修改 `functions/api/notify.ts` 内各推送方式的内容模板。
- **如何扩展更多通知方式？**
  - 在 `notify.ts` 中添加新分支，按需调用第三方API。

---

如有问题欢迎提issue或联系作者。
