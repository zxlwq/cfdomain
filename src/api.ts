export interface Domain {
  id?: number;
  domain: string;
  status: string;
  registrar: string;
  registerDate: string;
  expireDate: string;
}

export async function fetchDomains(): Promise<Domain[]> {
  const res = await fetch('/functions/domains');
  const data = await res.json();
  if (data.success) return data.domains;
  throw new Error(data.error || '获取域名失败');
}

export async function saveDomains(domains: Domain[]): Promise<void> {
  const res = await fetch('/functions/domains', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domains })
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || '保存失败');
}

export async function deleteDomain(domain: string): Promise<void> {
  const res = await fetch('/functions/domains', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain })
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || '删除失败');
}

export async function notifyExpiring(domains: Domain[]): Promise<void> {
  await fetch('/functions/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domains })
  });
} 
