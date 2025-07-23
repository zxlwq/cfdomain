export interface Domain {
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

export const onRequest = async (context: any) => {
  const { request, env } = context;
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json' }
    });
  }
  try {
    const { domains } = await request.json();
    const botToken = env.TG_BOT_TOKEN;
    const chatId = env.TG_USER_ID;
    if (!botToken || !chatId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Telegram配置未设置，请在环境变量中配置TG_BOT_TOKEN和TG_USER_ID'
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }
    const expiringDomains = domains.filter((domain: Domain) => isExpiringSoon(domain.expireDate, 15));
    if (expiringDomains.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: '没有即将到期的域名'
      }), {
        headers: { 'content-type': 'application/json' }
      });
    }
    let message = '⚠️ <b>域名到期提醒</b>\n\n';
    message += `以下域名将在15天内到期：\n\n`;
    expiringDomains.forEach((domain: Domain) => {
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
      return new Response(JSON.stringify({
        success: false,
        error: errorMessage
      }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }
    const telegramResult = await telegramResponse.json();
    return new Response(JSON.stringify({
      success: true,
      message: `成功发送通知，${expiringDomains.length}个域名即将到期`,
      telegramResult
    }), {
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}; 
