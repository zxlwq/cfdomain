import React, { useEffect, useState } from 'react';
import { fetchDomains, saveDomains, deleteDomain, notifyExpiring, Domain } from './api';

const STATUS_LABELS: Record<string, string> = {
  active: '正常',
  expired: '已过期',
  pending: '待激活',
};

function calculateProgress(registerDate: string, expireDate: string) {
  const start = new Date(registerDate).getTime();
  const end = new Date(expireDate).getTime();
  const now = Date.now();
  if (now < start) return 0;
  if (now > end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
}

function getProgressClass(progress: number) {
  if (progress >= 80) return 'danger';
  if (progress >= 60) return 'warning';
  return '';
}

const defaultDomain: Domain = {
  domain: '',
  status: 'active',
  registrar: '',
  registerDate: '',
  expireDate: '',
};

const App: React.FC = () => {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number>(-1);
  const [form, setForm] = useState<Domain>(defaultDomain);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [expireModal, setExpireModal] = useState(false);
  const [expiringDomains, setExpiringDomains] = useState<Domain[]>([]);

  useEffect(() => {
    loadDomains();
  }, []);

  async function loadDomains() {
    setLoading(true);
    try {
      const data = await fetchDomains();
      setDomains(data);
      checkExpiringDomains(data);
    } catch {
      setDomains([]);
    }
    setLoading(false);
  }

  function checkExpiringDomains(domains: Domain[]) {
    const warningDays = 15;
    const today = new Date();
    const warningDate = new Date(today.getTime() + warningDays * 24 * 60 * 60 * 1000);
    const expiring = domains.filter(domain => {
      const expireDate = new Date(domain.expireDate);
      return expireDate <= warningDate && expireDate >= today;
    });
    setExpiringDomains(expiring);
    if (expiring.length > 0) {
      setExpireModal(true);
      notifyExpiring(expiring);
    }
  }

  function handleEdit(index: number) {
    setEditIndex(index);
    setForm(domains[index]);
    setModalOpen(true);
  }

  function handleDelete(index: number) {
    if (!window.confirm('确定要删除该域名吗？')) return;
    const domain = domains[index];
    deleteDomain(domain.domain).then(() => {
      loadDomains();
    });
  }

  function handleAdd() {
    setEditIndex(-1);
    setForm(defaultDomain);
    setModalOpen(true);
  }

  function handleFormChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm({ ...form, [e.target.id]: e.target.value });
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    let newDomains = [...domains];
    if (editIndex >= 0) {
      newDomains[editIndex] = form;
    } else {
      newDomains.push(form);
    }
    await saveDomains(newDomains);
    setModalOpen(false);
    loadDomains();
  }

  function filteredDomains() {
    let list = domains.filter(domain =>
      domain.domain.toLowerCase().includes(search.toLowerCase()) ||
      domain.registrar.toLowerCase().includes(search.toLowerCase()) ||
      domain.status.toLowerCase().includes(search.toLowerCase())
    );
    if (sortField) {
      list = [...list].sort((a, b) => {
        let valA: any = a[sortField as keyof Domain];
        let valB: any = b[sortField as keyof Domain];
        if (sortField === 'registerDate' || sortField === 'expireDate') {
          valA = new Date(valA).getTime();
          valB = new Date(valB).getTime();
        } else {
          valA = (valA || '').toString().toLowerCase();
          valB = (valB || '').toString().toLowerCase();
        }
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return list;
  }

  // 统计
  const total = domains.length;
  const active = domains.filter(d => d.status === 'active').length;
  const expired = domains.filter(d => d.status === 'expired').length;
  const avgProgress = total ? Math.round(domains.reduce((sum, d) => sum + calculateProgress(d.registerDate, d.expireDate), 0) / total) : 0;

  return (
    <div className="container">
      <div className="header">
        <h1>域名面板</h1>
        <p>查看域名状态、注册商、注册日期、过期日期和使用进度</p>
        <button className="settings-btn" onClick={() => alert('请在 Cloudflare Pages 环境变量中配置通知参数')}>⚙️</button>
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-number">{total}</div>
          <div className="stat-label">总域名数</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{active}</div>
          <div className="stat-label">正常域名</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{expired}</div>
          <div className="stat-label">已过期域名</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{avgProgress}%</div>
          <div className="stat-label">平均使用进度</div>
        </div>
      </div>
      {expiringDomains.length > 0 && (
        <div className="expiring-domains" style={{ marginBottom: 20 }}>
          <h4 style={{ color: '#856404' }}>⚠️ 即将到期的域名</h4>
          {expiringDomains.map(domain => {
            const expireDate = new Date(domain.expireDate);
            const daysLeft = Math.ceil((expireDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
            return (
              <div className="expiring-domain" key={domain.domain}>
                <div className="domain-info">
                  <div className="domain-name">{domain.domain}</div>
                  <div>注册商：{domain.registrar} | 到期：{domain.expireDate}</div>
                </div>
                <div className="days-left">{daysLeft}天后到期</div>
              </div>
            );
          })}
        </div>
      )}
      <div className="domain-table">
        <div className="table-header">
          <h2>域名列表</h2>
          <div className="search-box">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索域名..." />
          </div>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th></th>
                <th onClick={() => { setSortField('domain'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }} className="sortable">域名</th>
                <th onClick={() => { setSortField('status'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }} className="sortable">状态</th>
                <th onClick={() => { setSortField('registrar'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }} className="sortable">注册商</th>
                <th onClick={() => { setSortField('registerDate'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }} className="sortable">注册日期</th>
                <th onClick={() => { setSortField('expireDate'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }} className="sortable">过期日期</th>
                <th>使用进度</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="loading">加载中...</td></tr>
              ) : filteredDomains().length === 0 ? (
                <tr><td colSpan={8} className="loading">暂无域名数据</td></tr>
              ) : filteredDomains().map((domain, index) => {
                const progress = calculateProgress(domain.registerDate, domain.expireDate);
                const progressClass = getProgressClass(progress);
                return (
                  <tr key={domain.domain}>
                    <td></td>
                    <td className="domain-name">{domain.domain}</td>
                    <td><span className={`status ${domain.status}`}>{STATUS_LABELS[domain.status]}</span></td>
                    <td className="registrar">{domain.registrar}</td>
                    <td className="date">{domain.registerDate}</td>
                    <td className="date">{domain.expireDate}</td>
                    <td>
                      <div className="progress-bar">
                        <div className={`progress-fill ${progressClass}`} style={{ width: progress + '%' }}></div>
                      </div>
                      <span className="progress-text">{progress}%</span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button className="btn-edit" onClick={() => handleEdit(index)}>修改</button>
                        <button className="btn-delete" onClick={() => handleDelete(index)}>删除</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <button className="add-domain-btn" onClick={handleAdd}>+</button>
      {modalOpen && (
        <div className="modal" style={{ display: 'block' }} onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editIndex >= 0 ? '编辑域名' : '添加新域名'}</h3>
            </div>
            <form onSubmit={handleFormSubmit}>
              <div className="form-group">
                <label htmlFor="domain">域名</label>
                <input id="domain" value={form.domain} onChange={handleFormChange} required />
              </div>
              <div className="form-group">
                <label htmlFor="registrar">注册商</label>
                <input id="registrar" value={form.registrar} onChange={handleFormChange} required />
              </div>
              <div className="form-group">
                <label htmlFor="registerDate">注册日期</label>
                <input id="registerDate" type="date" value={form.registerDate} onChange={handleFormChange} required />
              </div>
              <div className="form-group">
                <label htmlFor="expireDate">过期日期</label>
                <input id="expireDate" type="date" value={form.expireDate} onChange={handleFormChange} required />
              </div>
              <div className="form-group">
                <label htmlFor="status">状态</label>
                <select id="status" value={form.status} onChange={handleFormChange} required>
                  <option value="active">正常</option>
                  <option value="expired">已过期</option>
                  <option value="pending">待激活</option>
                </select>
              </div>
              <div className="modal-buttons">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>取消</button>
                <button type="submit" className="btn btn-primary">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {expireModal && (
        <div className="modal" style={{ display: 'block' }} onClick={e => { if (e.target === e.currentTarget) setExpireModal(false); }}>
          <div className="modal-content">
            <div className="modal-header">
              <h3>⚠️ 域名到期提醒</h3>
            </div>
            <div style={{ margin: '20px 0' }}>
              {expiringDomains.map(domain => {
                const expireDate = new Date(domain.expireDate);
                const daysLeft = Math.ceil((expireDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
                return (
                  <div key={domain.domain} style={{ marginBottom: 10 }}>
                    <b>{domain.domain}</b>（{daysLeft}天后到期）<br />注册商：{domain.registrar}，到期日：{domain.expireDate}
                  </div>
                );
              })}
            </div>
            <div className="modal-buttons">
              <button className="btn btn-primary" onClick={() => setExpireModal(false)}>我知道了</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App; 
