import { Hono } from 'hono';
import type { Context } from 'hono';

type Env = {
  DB: D1Database;
};

interface Domain {
  id?: number;
  domain: string;
  status: string;
  registrar: string;
  registerDate: string;
  expireDate: string;
}

const app = new Hono<{ Bindings: Env }>();

// 校验域名数据
function validateDomain(domain: Domain): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!domain.domain || domain.domain.trim() === '') {
    errors.push('域名不能为空');
  }
  if (!domain.status || !['active', 'expired', 'pending'].includes(domain.status)) {
    errors.push('状态必须是 active、expired 或 pending');
  }
  if (!domain.registrar || domain.registrar.trim() === '') {
    errors.push('注册商不能为空');
  }
  if (!domain.registerDate || isNaN(Date.parse(domain.registerDate))) {
    errors.push('注册日期格式无效');
  }
  if (!domain.expireDate || isNaN(Date.parse(domain.expireDate))) {
    errors.push('到期日期格式无效');
  }
  return {
    valid: errors.length === 0,
    errors
  };
}

// GET: 获取所有域名
app.get('/', async (c: Context<{ Bindings: Env }>) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, domain, status, registrar, register_date as registerDate, expire_date as expireDate FROM domains ORDER BY id DESC'
  ).all();
  return c.json({ success: true, domains: results });
});

// POST: 批量保存域名（全量覆盖）
app.post('/', async (c: Context<{ Bindings: Env }>) => {
  const body = await c.req.json<{ domains: Domain[] }>();
  if (!Array.isArray(body.domains)) {
    return c.json({ success: false, error: '数据格式错误' }, 400);
  }
  // 校验所有域名
  const validationResults = body.domains.map(domain => ({
    domain,
    validation: validateDomain(domain)
  }));
  const invalidDomains = validationResults.filter(result => !result.validation.valid);
  if (invalidDomains.length > 0) {
    return c.json({
      success: false,
      error: '数据校验失败',
      details: invalidDomains.map(item => ({
        domain: item.domain.domain,
        errors: item.validation.errors
      }))
    }, 400);
  }
  // 全量覆盖：先清空再插入
  await c.env.DB.exec('DELETE FROM domains');
  for (const d of body.domains) {
    await c.env.DB.prepare(
      'INSERT INTO domains (domain, status, registrar, register_date, expire_date) VALUES (?, ?, ?, ?, ?)'
    ).bind(d.domain, d.status, d.registrar, d.registerDate, d.expireDate).run();
  }
  return c.json({ success: true, message: '数据保存成功' });
});

// DELETE: 删除单个域名
app.delete('/', async (c: Context<{ Bindings: Env }>) => {
  const body = await c.req.json<{ domain: string }>();
  if (!body.domain) {
    return c.json({ success: false, error: '缺少参数' }, 400);
  }
  await c.env.DB.prepare('DELETE FROM domains WHERE domain = ?').bind(body.domain).run();
  return c.json({ success: true, message: '删除成功' });
});

export default app; 
