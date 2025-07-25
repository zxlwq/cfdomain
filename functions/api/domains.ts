export interface Domain {
  id?: number;
  domain: string;
  status: string;
  registrar: string;
  register_date: string;
  expire_date: string;
  renewUrl?: string;
}

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
  if (!domain.register_date || isNaN(Date.parse(domain.register_date))) {
    errors.push('注册日期格式无效');
  }
  if (!domain.expire_date || isNaN(Date.parse(domain.expire_date))) {
    errors.push('到期日期格式无效');
  }
  return {
    valid: errors.length === 0,
    errors
  };
}

export const onRequest = async (context: any) => {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  if (method === 'GET') {
    try {
      const { results } = await env.DB.prepare(
        'SELECT id, domain, status, registrar, register_date, expire_date, renewUrl FROM domains ORDER BY id DESC'
      ).all();
      return new Response(JSON.stringify({ success: true, domains: results }), {
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
      if (!Array.isArray(body.domains)) {
        return new Response(JSON.stringify({ success: false, error: '数据格式错误' }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        });
      }
      const validationResults = body.domains.map((domain: Domain) => ({
        domain,
        validation: validateDomain(domain)
      }));
      const invalidDomains = validationResults.filter((result: any) => !result.validation.valid);
      if (invalidDomains.length > 0) {
        return new Response(JSON.stringify({
          success: false,
          error: '数据校验失败',
          details: invalidDomains.map((item: any) => ({
            domain: item.domain.domain,
            errors: item.validation.errors
          }))
        }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        });
      }
      await env.DB.exec('DELETE FROM domains');
      for (const d of body.domains) {
        await env.DB.prepare(
          'INSERT INTO domains (domain, status, registrar, register_date, expire_date, renewUrl) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(d.domain, d.status, d.registrar, d.register_date, d.expire_date, d.renewUrl || null).run();
      }
      return new Response(JSON.stringify({ success: true, message: '数据保存成功' }), {
        headers: { 'content-type': 'application/json' }
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ success: false, error: e.message }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }
  }

  if (method === 'DELETE') {
    try {
      const body = await request.json();
      if (!body.domain) {
        return new Response(JSON.stringify({ success: false, error: '缺少参数' }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        });
      }
      await env.DB.prepare('DELETE FROM domains WHERE domain = ?').bind(body.domain).run();
      return new Response(JSON.stringify({ success: true, message: '删除成功' }), {
        headers: { 'content-type': 'application/json' }
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ success: false, error: e.message }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ success: false, error: 'Method Not Allowed' }), {
    status: 405,
    headers: { 'content-type': 'application/json' }
  });
}; 
