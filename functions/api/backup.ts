export const onRequest: PagesFunction<{
  WEBDAV_URL: string;
  WEBDAV_USER: string;
  WEBDAV_PASS: string;
}> = async (context) => {
  const { request, env } = context;
  const webdavFolder = env.WEBDAV_URL;
  const username = env.WEBDAV_USER;
  const password = env.WEBDAV_PASS;
  const fileUrl = (webdavFolder.endsWith('/') ? webdavFolder : webdavFolder + '/') + 'domain/domains-backup.json';

  if (request.method === 'POST') {
    // 上传（保存）
    try {
      const data = await request.json();
      if (!Array.isArray(data)) {
        return new Response(JSON.stringify({ success: false, error: '数据格式错误' }), { status: 400 });
      }
      const res = await fetch(fileUrl, {
        method: 'PUT',
        headers: {
          'Authorization': 'Basic ' + btoa(username + ':' + password),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data, null, 2)
      });
      if (!res.ok) {
        const err = await res.text();
        return new Response(JSON.stringify({ success: false, error: err }), { status: 500 });
      }
      return new Response(JSON.stringify({ success: true, url: fileUrl }), { status: 200 });
    } catch (e: any) {
      return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
    }
  } else if (request.method === 'GET') {
    // 下载（恢复）
    try {
      const res = await fetch(fileUrl, {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + btoa(username + ':' + password)
        }
      });
      if (!res.ok) {
        const err = await res.text();
        return new Response(JSON.stringify({ success: false, error: err }), { status: 500 });
      }
      const data = await res.text();
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
    }
  } else {
    return new Response('Method Not Allowed', { status: 405 });
  }
}; 
