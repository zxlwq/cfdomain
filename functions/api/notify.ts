export interface Domain {
  domain: string;
  status: string;
  registrar: string;
  register_date: string;
  expire_date: string;
}

export interface NotificationSettings {
  warningDays: string;
  notificationEnabled: string;
  notificationInterval: string;
  notificationMethod: string;
}

function getDaysUntilExpiry(expire_date: string): number {
  const today = new Date();
  const expiry = new Date(expire_date);
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function isExpiringSoon(expire_date: string, days: number = 15): boolean {
  const daysLeft = getDaysUntilExpiry(expire_date);
  return daysLeft <= days && daysLeft > 0;
}

// 微信Server酱推送
async function sendWeChatNotify(title: string, content: string, sendKey: string) {
  const res = await fetch(`https://sctapi.ftqq.com/${sendKey}.send`, {
    method: 'POST',
    body: new URLSearchParams({ title, desp: content })
  });
  return res.json();
}
// QQ Qmsg酱推送
async function sendQQNotify(content: string, key: string, qq: string) {
  const res = await fetch(`https://qmsg.zendee.cn/send/${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ msg: content, qq })
  });
  return res.json();
}

// 邮件通知（MailChannels）
async function sendMailNotify(subject: string, content: string, mailTo: string) {
  // MailChannels API（Cloudflare Pages Functions原生支持）
  const mailData = {
    personalizations: [{ to: [{ email: mailTo }] }],
    from: { email: 'noreply@yourdomain.com', name: '域名到期提醒' },
    subject,
    content: [{ type: 'text/plain', value: content }]
  };
  const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(mailData)
  });
  return res.json();
}

export const onRequest = async (context: any) => {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  if (method === 'GET') {
    // 查询通知设置
    try {
      const { results } = await env.DB.prepare(
        'SELECT warning_days as warningDays, notification_enabled as notificationEnabled, notification_interval as notificationInterval, notification_method as notificationMethod FROM notification_settings LIMIT 1'
      ).all();
      if (results.length === 0) {
        return new Response(JSON.stringify({ success: true, settings: null }), {
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ success: true, settings: results[0] }), {
        headers: { 'content-type': 'application/json' }
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ success: false, error: e.message }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }
  }

  if (method === 'POST') {
    try {
      const body = await request.json();
      // 保存通知设置
      if (body.settings) {
        const s = body.settings as NotificationSettings;
        if (!s.warningDays || !s.notificationEnabled || !s.notificationInterval || !s.notificationMethod) {
          return new Response(JSON.stringify({ success: false, error: '参数不完整' }), {
            status: 400,
            headers: { 'content-type': 'application/json' }
          });
        }
        await env.DB.exec('DELETE FROM notification_settings');
        await env.DB.prepare(
          'INSERT INTO notification_settings (warning_days, notification_enabled, notification_interval, notification_method) VALUES (?, ?, ?, ?)'
        ).bind(s.warningDays, s.notificationEnabled, s.notificationInterval, s.notificationMethod).run();
        return new Response(JSON.stringify({ success: true, message: '设置已保存' }), {
      headers: { 'content-type': 'application/json' }
    });
  }
      // 多方式通知分发
      if (body.domains) {
        // 查询通知设置，决定分发方式
        let notifyMethods: string[] = [];
        try {
          const { results } = await env.DB.prepare(
            'SELECT notification_method FROM notification_settings LIMIT 1'
          ).all();
          if (results.length > 0 && results[0].notification_method) {
            const val = results[0].notification_method;
            if (Array.isArray(val)) notifyMethods = val;
            else if (typeof val === 'string') notifyMethods = JSON.parse(val);
          }
        } catch {}
        if (!Array.isArray(notifyMethods) || notifyMethods.length === 0) notifyMethods = ['telegram'];
        const expiringDomains = body.domains.filter((domain: Domain) => isExpiringSoon(domain.expire_date, 15));
        if (expiringDomains.length === 0) {
          return new Response(JSON.stringify({ success: true, message: '没有即将到期的域名' }), { headers: { 'content-type': 'application/json' } });
        }
        let results: any[] = [];
        let errors: any[] = [];
        for (const method of notifyMethods) {
          try {
            if (method === 'telegram') {
              // Telegram 通知逻辑
              const botToken = env.TG_BOT_TOKEN;
              const chatId = env.TG_USER_ID;
              if (!botToken || !chatId) throw new Error('Telegram配置未设置');
              let message = '⚠️ <b>域名到期提醒</b>\n\n';
              message += `以下域名将在15天内到期：\n\n`;
              expiringDomains.forEach((domain: Domain) => {
                const daysLeft = getDaysUntilExpiry(domain.expire_date);
                message += ` <b>${domain.domain}</b>\n`;
                message += `   注册商：${domain.registrar}\n`;
                message += `   到期时间：${domain.expire_date}\n`;
                message += `   剩余天数：${daysLeft}天\n\n`;
              });
              message += `请及时续费以避免域名过期！`;
              const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
              });
              if (!telegramResponse.ok) throw new Error('Telegram API请求失败');
              results.push({ method: 'telegram', ok: true });
            } else if (method === 'wechat') {
              const sendKey = env.WECHAT_SENDKEY;
              if (!sendKey) throw new Error('未配置微信SendKey');
              let content = '以下域名将在15天内到期：\n\n';
              expiringDomains.forEach((domain: Domain) => {
                const daysLeft = getDaysUntilExpiry(domain.expire_date);
                content += `域名: ${domain.domain}\n注册商: ${domain.registrar}\n到期时间: ${domain.expire_date}\n剩余天数: ${daysLeft}天\n\n`;
              });
              content += '请及时续费以避免域名过期！';
              await sendWeChatNotify('域名到期提醒', content, sendKey);
              results.push({ method: 'wechat', ok: true });
            } else if (method === 'qq') {
              const key = env.QMSG_KEY;
              const qq = env.QMSG_QQ;
              if (!key || !qq) throw new Error('未配置Qmsg酱 key 或 QQ号');
              let content = '以下域名将在15天内到期：\n\n';
              expiringDomains.forEach((domain: Domain) => {
                const daysLeft = getDaysUntilExpiry(domain.expire_date);
                content += `域名: ${domain.domain}\n注册商: ${domain.registrar}\n到期时间: ${domain.expire_date}\n剩余天数: ${daysLeft}天\n\n`;
              });
              content += '请及时续费以避免域名过期！';
              await sendQQNotify(content, key, qq);
              results.push({ method: 'qq', ok: true });
            } else if (method === 'email') {
              const mailTo = env.MAIL_TO;
              if (!mailTo) throw new Error('未配置收件人邮箱MAIL_TO');
              let content = '以下域名将在15天内到期：\n\n';
              expiringDomains.forEach((domain: Domain) => {
                const daysLeft = getDaysUntilExpiry(domain.expire_date);
                content += `域名: ${domain.domain}\n注册商: ${domain.registrar}\n到期时间: ${domain.expire_date}\n剩余天数: ${daysLeft}天\n\n`;
              });
              content += '请及时续费以避免域名过期！';
              await sendMailNotify('域名到期提醒', content, mailTo);
              results.push({ method: 'email', ok: true });
            } else {
              errors.push({ method, error: '不支持的通知方式' });
            }
          } catch (err: any) {
            errors.push({ method, error: err.message || err });
          }
        }
        return new Response(JSON.stringify({ success: errors.length === 0, results, errors }), { headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ success: false, error: '参数错误' }), {
        status: 400,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
    }
  }
}; 
