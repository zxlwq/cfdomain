// Cloudflare Pages Functions: 域名面板 D1 数据库 WebDAV 备份/恢复API
// 环境变量：WEBDAV_URL, WEBDAV_USER, WEBDAV_PASS, DB
export const onRequest: PagesFunction<{
  WEBDAV_URL: string;
  WEBDAV_USER: string;
  WEBDAV_PASS: string;
  DB: D1Database;
}> = async (context) => {
  const { request, env } = context;
  const webdavFolder = env.WEBDAV_URL;
  const username = env.WEBDAV_USER;
  const password = env.WEBDAV_PASS;
  const db = env.DB;
  const fileUrl = (webdavFolder.endsWith('/') ? webdavFolder : webdavFolder + '/') + 'domain/domains-backup.json';
  // 统一编码，防止特殊字符导致认证失败
  const auth = 'Basic ' + btoa(unescape(encodeURIComponent(username + ':' + password)));

  if (request.method === 'POST') {
    // 查询 domains 表所有内容，导出为 JSON 数组
    try {
      const { results } = await db.prepare('SELECT * FROM domains').all();
      if (!Array.isArray(results) || results.length === 0) {
        return new Response(JSON.stringify({ success: false, error: '没有可导出的域名数据' }), { status: 404 });
      }
      // 上传到 WebDAV
      console.log('WebDAV PUT Authorization:', auth);
      const res = await fetch(fileUrl, {
        method: 'PUT',
        headers: {
          'Authorization': auth,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(results, null, 2)
      });
      if (!res.ok) {
        const err = await res.text();
        console.error('WebDAV上传失败:', res.status, err);
        return new Response(JSON.stringify({ success: false, error: err || 'WebDAV上传失败', status: res.status }), { status: 500 });
      }
      return new Response(JSON.stringify({ success: true, url: fileUrl }), { status: 200 });
    } catch (e: any) {
      console.error('导出 WebDAV 备份时发生错误:', e);
      return new Response(JSON.stringify({ success: false, error: e?.message || String(e) }), { status: 500 });
    }
  } else if (request.method === 'GET') {
    // 从 WebDAV 下载 domains-backup.json 并返回
    try {
      const res = await fetch(fileUrl, {
        method: 'GET',
        headers: {
          'Authorization': auth
        }
      });
      console.log('WebDAV GET Authorization:', auth);
      if (!res.ok) {
        const err = await res.text();
        console.error('WebDAV下载失败:', res.status, err);
        return new Response(JSON.stringify({ success: false, error: err || 'WebDAV下载失败' }), { status: 500 });
      }
      const data = await res.text();
      // 尝试解析为JSON数组，否则返回错误
      let arr;
      try {
        arr = JSON.parse(data);
      } catch (e) {
        console.error('WebDAV文件内容不是有效JSON:', data, e);
        return new Response(JSON.stringify({ success: false, error: 'WebDAV文件内容不是有效JSON' }), { status: 500 });
      }
      if (!Array.isArray(arr)) {
        console.error('WebDAV文件内容不是数组:', arr);
        return new Response(JSON.stringify({ success: false, error: 'WebDAV文件内容不是数组' }), { status: 500 });
      }
      return new Response(JSON.stringify(arr), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e: any) {
      console.error('恢复 WebDAV 备份时发生错误:', e);
      return new Response(JSON.stringify({ success: false, error: e?.message || String(e) }), { status: 500 });
    }
  } else {
    return new Response(JSON.stringify({ success: false, error: 'Method Not Allowed' }), { status: 405 });
  }
}; 
