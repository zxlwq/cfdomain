import { Hono } from 'hono';
import type { Context } from 'hono';

type Env = {
  TG_BOT_TOKEN: string;
  TG_USER_ID: string;
};

interface Domain {
  domain: string;
  status: string;
  registrar: string;
  registerDate: string;
  expireDate: string;
}

function getDaysUntilExpiry(expireDate: string): number {
  const today = new Date();
  const expiry = new Date(expireDate);
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function isExpiringSoon(expireDate: string, days: number = 15): boolean {
  const daysLeft = getDaysUntilExpiry(expireDate);
  return daysLeft <= days && daysLeft > 0;
}

const app = new Hono<{ Bindings: Env }>();

app.post('/', async (c: Context<{ Bindings: Env }>) => {
  const { domains } = await c.req.json<{ domains: Domain[] }>();
  const botToken = c.env.TG_BOT_TOKEN;
  const chatId = c.env.TG_USER_ID;
  if (!botToken || !chatId) {
    return c.json({
      success: false,
      error: 'Telegram配置未设置，请在环境变量中配置TG_BOT_TOKEN和TG_USER_ID'
    }, 500);
  }
  const expiringDomains = domains.filter(domain => isExpiringSoon(domain.expireDate, 15));
  if (expiringDomains.length === 0) {
    return c.json({
      success: true,
      message: '没有即将到期的域名'
    });
  }
  let message = '⚠️ <b>域名到期提醒</b>\n\n';
  message += `以下域名将在15天内到期：\n\n`;
  expiringDomains.forEach(domain => {
    const daysLeft = getDaysUntilExpiry(domain.expireDate);
    message += ` <b>${domain.domain}</b>\n`;
    message += `   注册商：${domain.registrar}\n`;
    message += `   到期时间：${domain.expireDate}\n`;
    message += `   剩余天数：${daysLeft}天\n\n`;
  });
  message += `请及时续费以避免域名过期！`;
  const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    })
  });
  if (!telegramResponse.ok) {
    const errorText = await telegramResponse.text();
    let errorMessage = 'Telegram API请求失败';
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = `Telegram API错误: ${errorData.description || '未知错误'}`;
    } catch {
      errorMessage = `Telegram API错误: ${telegramResponse.status} ${telegramResponse.statusText}`;
    }
    return c.json({
      success: false,
      error: errorMessage
    }, 500);
  }
  const telegramResult = await telegramResponse.json();
  return c.json({
    success: true,
    message: `成功发送通知，${expiringDomains.length}个域名即将到期`,
    telegramResult
  });
});

export default app; 
