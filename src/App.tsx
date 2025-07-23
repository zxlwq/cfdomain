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

interface Domain {
  id?: number;
  domain: string;
  status: string;
  registrar: string;
  registerDate: string;
  expireDate: string;
  renewUrl?: string;
}

const defaultDomain: Domain = {
  domain: '',
  status: 'active',
  registrar: '',
  registerDate: '',
  expireDate: '',
  renewUrl: '',
};

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [expireModal, setExpireModal] = useState(false);
  const [expiringDomains, setExpiringDomains] = useState<Domain[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [warningDays, setWarningDays] = useState(() => localStorage.getItem('notificationWarningDays') || '15');
  const [notificationEnabled, setNotificationEnabled] = useState(() => localStorage.getItem('notificationEnabled') || 'true');
  const [notificationInterval, setNotificationInterval] = useState(() => localStorage.getItem('notificationInterval') || 'daily');
  const [bgImageUrl, setBgImageUrl] = useState(() => localStorage.getItem('customBgImageUrl') || '/image/logo.png');
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [dontRemindToday, setDontRemindToday] = useState(false);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'expired' | 'pending'>('all');
  const editRowRef = React.useRef<HTMLTableRowElement>(null);

  // 编辑相关状态
  const [editIndex, setEditIndex] = useState<number>(-1);
  const [form, setForm] = useState<Domain>(defaultDomain);
  const [modalOpen, setModalOpen] = useState(false);

  // 表单变更处理函数
  function handleFormChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { id, value } = e.target;
    setForm(prev => ({ ...prev, [id]: value }));
  }

  // 表单提交处理函数
  async function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    let newDomains = [...domains];
    if (editIndex >= 0) {
      newDomains[editIndex] = form;
    } else {
      newDomains.push(form);
    }
    await saveDomains(newDomains);
    setModalOpen(false);
    setEditIndex(-1);
    setForm(defaultDomain);
    loadDomains();
    setOpMsg('保存成功');
  }

  // 夜间模式
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  useEffect(() => {
    document.body.style.backgroundColor = darkMode ? '#181818' : '';
    document.body.className = darkMode ? 'dark' : '';
    localStorage.setItem('darkMode', darkMode ? 'true' : 'false');
  }, [darkMode]);

  // 自定义列显示
  const [showRegistrar, setShowRegistrar] = useState(true);
  const [showProgress, setShowProgress] = useState(true);

  // 分页
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const pagedDomains = (list: Domain[]) => list.slice((page - 1) * pageSize, page * pageSize);

  // 虚拟滚动（简易）
  const [scrollTop, setScrollTop] = useState(0);
  const rowHeight = 48;
  const visibleCount = Math.ceil(window.innerHeight / rowHeight);
  function handleTableScroll(e: React.UIEvent<HTMLDivElement>) {
    setScrollTop(e.currentTarget.scrollTop);
  }

  // 操作提示
  const [opMsg, setOpMsg] = useState('');
  useEffect(() => {
    if (opMsg) {
      const t = setTimeout(() => setOpMsg(''), 2000);
      return () => clearTimeout(t);
    }
  }, [opMsg]);

  useEffect(() => {
    loadDomains();
  }, []);

  useEffect(() => {
    document.body.style.backgroundImage = `url('${bgImageUrl}')`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundRepeat = 'no-repeat';
    document.body.style.backgroundPosition = 'center center';
  }, [bgImageUrl]);

  useEffect(() => {
    const remindedFlag = localStorage.getItem('dontRemindToday');
    setDontRemindToday(remindedFlag === todayStr);
  }, [todayStr]);

  function handleCloseExpireModal(dontRemind: boolean) {
    setExpireModal(false);
    if (dontRemind) {
      localStorage.setItem('dontRemindToday', todayStr);
      setDontRemindToday(true);
    }
  }

  async function loadDomains() {
    setLoading(true);
    try {
      const data = await fetchDomains();
      setDomains(data);
    } catch (error) {
      console.error('Failed to fetch domains:', error);
      setOpMsg('加载域名失败');
    } finally {
      setLoading(false);
    }
  }

  function checkExpiringDomains(domains: Domain[]) {
    const warningDays = parseInt(localStorage.getItem('notificationWarningDays') || '15', 10);
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

  function handleAdd() {
    setEditIndex(-1);
    setForm(defaultDomain);
    setModalOpen(true);
  }

  function handleEdit(index: number) {
    setEditIndex(index);
    setForm(domains[index]);
    setModalOpen(true);
  }

  function handleDelete(index: number) {
    const domainToDelete = domains[index];
    if (window.confirm(`确定要删除域名 "${domainToDelete.domain}" 吗？`)) {
      deleteDomain(domainToDelete.id || 0);
      loadDomains();
      setOpMsg('域名删除成功');
    }
  }

  // 5. 数据本地备份与恢复
  function exportDomainsToJSON() {
    try {
      const blob = new Blob([JSON.stringify(domains, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'domains-backup.json');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setOpMsg('备份成功');
    } catch {
      setOpMsg('备份失败');
    }
  }
  function importDomainsFromJSON(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) {
      setOpMsg('请先选择JSON文件');
      return;
    }
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async function(evt) {
      try {
        const data = JSON.parse(evt.target?.result as string);
        if (!Array.isArray(data)) throw new Error('格式错误');
        await saveDomains(data);
        setSelectedIndexes([]);
        loadDomains();
        setOpMsg('恢复成功！');
      } catch {
        setOpMsg('JSON格式无效或数据损坏');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  // 6. 状态筛选与搜索
  function filteredDomains() {
    let list = domains.filter(domain =>
      domain.domain.toLowerCase().includes(search.toLowerCase()) ||
      domain.registrar.toLowerCase().includes(search.toLowerCase()) ||
      domain.status.toLowerCase().includes(search.toLowerCase())
    );
    if (sortField) {
      list = [...list].sort((a, b) => {
        const valA = a[sortField as keyof Domain];
        const valB = b[sortField as keyof Domain];
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      // 默认到期自动排序，快到期的排前面
      list = [...list].sort((a, b) => new Date(a.expireDate).getTime() - new Date(b.expireDate).getTime());
    }
    return list;
  }

  // 7. 域名编辑体验优化
  useEffect(() => {
    if (editIndex >= 0 && editRowRef.current) {
      editRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [editIndex]);

  // 统计
  const total = domains.length;
  const active = domains.filter(d => d.status === 'active').length;
  const expired = domains.filter(d => d.status === 'expired').length;
  const avgProgress = total ? Math.round(domains.reduce((sum, d) => sum + calculateProgress(d.registerDate, d.expireDate), 0) / total) : 0;

  function handleSelectAll(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.checked) {
      setSelectedIndexes(filteredDomains().map((_, idx) => idx));
    } else {
      setSelectedIndexes([]);
    }
  }
  function handleSelectRow(idx: number, checked: boolean) {
    setSelectedIndexes(prev => checked ? [...prev, idx] : prev.filter(i => i !== idx));
  }
  async function handleBatchDelete() {
    if (selectedIndexes.length === 0) return alert('请先选择要删除的域名');
    if (!window.confirm('确定要批量删除选中的域名吗？')) return;
    const newDomains = domains.filter((_, idx) => !selectedIndexes.includes(idx));
    await saveDomains(newDomains);
    setSelectedIndexes([]);
    loadDomains();
    setOpMsg('批量删除成功');
  }
  async function handleBatchSetStatus(status: string) {
    if (selectedIndexes.length === 0) return alert('请先选择要操作的域名');
    const newDomains = domains.map((d, idx) => selectedIndexes.includes(idx) ? { ...d, status } : d);
    await saveDomains(newDomains);
    setSelectedIndexes([]);
    loadDomains();
    setOpMsg('批量状态修改成功');
  }

  function saveNotificationSettings() {
    localStorage.setItem('notificationWarningDays', warningDays);
    localStorage.setItem('notificationEnabled', notificationEnabled);
    localStorage.setItem('notificationInterval', notificationInterval);
    alert('通知设置已保存');
  }
  function saveBgImage() {
    localStorage.setItem('customBgImageUrl', bgImageUrl);
    alert('背景图片已保存');
  }
  function resetBgImage() {
    setBgImageUrl('/image/logo.png');
    localStorage.removeItem('customBgImageUrl');
    alert('已恢复默认背景');
  }

  function exportDomainsToCSV() {
    if (!domains || domains.length === 0) {
      setOpMsg('暂无域名数据可导出');
      return;
    }
    try {
      const header = ['域名','注册商','注册日期','过期日期','状态'];
      const rows = domains.map(d => [
        d.domain,
        d.registrar,
        d.registerDate,
        d.expireDate,
        d.status === 'active' ? '正常' : d.status === 'expired' ? '已过期' : '待激活'
      ]);
      let csvContent = header.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'domains.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setOpMsg('导出成功');
    } catch {
      setOpMsg('导出失败');
    }
  }
  function importDomainsFromCSV() {
    if (!fileInputRef.current || !fileInputRef.current.files || fileInputRef.current.files.length === 0) {
      setOpMsg('请先选择CSV文件');
      return;
    }
    const file = fileInputRef.current.files[0];
    const reader = new FileReader();
    reader.onload = async function(e) {
      try {
        const text = e.target?.result as string;
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) throw new Error('CSV文件内容无效');
        const header = lines[0].split(',');
        const expectedHeader = ['域名','注册商','注册日期','过期日期','状态'];
        if (header.join(',') !== expectedHeader.join(',')) throw new Error('CSV表头格式不正确');
        const newDomains = lines.slice(1).map(line => {
          const cols = line.split(',');
          return {
            domain: cols[0],
            registrar: cols[1],
            registerDate: cols[2],
            expireDate: cols[3],
            status: (cols[4] === '正常') ? 'active' : (cols[4] === '已过期' ? 'expired' : 'pending')
          };
        });
        await saveDomains(newDomains);
        setSelectedIndexes([]);
        loadDomains();
        setOpMsg('导入成功！');
      } catch (err: any) {
        setOpMsg(err.message || '导入失败');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  function getSortClass(field: string) {
    if (sortField === field) return sortOrder === 'asc' ? 'sorted-asc' : 'sorted-desc';
    return '';
  }

  const isMobile = window.innerWidth <= 768;

  // 分页数据
  const paged = pagedDomains(filteredDomains());
  const totalPages = Math.ceil(filteredDomains().length / pageSize);

  return (
    <div className={darkMode ? 'container dark' : 'container'}>
      <div className="header">
        <h1>域名面板</h1>
        <p>查看域名状态、注册商、注册日期、过期日期和使用进度</p>
        <button className="settings-btn" onClick={() => alert('请在 Cloudflare Pages 环境变量中配置通知参数')}>⚙️</button>
        <button className="settings-btn" onClick={() => setSettingsOpen(true)}>⚙️</button>
        <button className="btn" style={{ marginLeft: 10 }} onClick={() => setDarkMode(d => !d)}>{darkMode ? '☀️ 日间' : '🌙 夜间'}</button>
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <h3>总域名数</h3>
          <p>{total}</p>
        </div>
        <div className="stat-card">
          <h3>正常域名</h3>
          <p>{active}</p>
        </div>
        <div className="stat-card">
          <h3>已过期域名</h3>
          <p>{expired}</p>
        </div>
        <div className="stat-card">
          <h3>平均使用进度</h3>
          <p>{avgProgress}%</p>
        </div>
      </div>
      <div className="domain-table" style={isMobile ? { fontSize: 12 } : {}}>
        <div className="table-header">
          <h2>域名列表</h2>
          <div className="search-box">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索域名..." />
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className={`btn ${filterStatus === 'all' ? 'btn-primary' : ''}`} onClick={() => setFilterStatus('all')}>全部</button>
            <button className={`btn ${filterStatus === 'active' ? 'btn-primary' : ''}`} onClick={() => setFilterStatus('active')}>正常</button>
            <button className={`btn ${filterStatus === 'expired' ? 'btn-primary' : ''}`} onClick={() => setFilterStatus('expired')}>已过期</button>
            <button className={`btn ${filterStatus === 'pending' ? 'btn-primary' : ''}`} onClick={() => setFilterStatus('pending')}>待激活</button>
          </div>
        </div>
        <div style={{ margin: '10px 0', display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row', flexWrap: 'wrap' }}>
          <button className="btn btn-danger" style={isMobile ? { width: '100%' } : {}} onClick={handleBatchDelete}>批量删除</button>
          <button className="btn btn-secondary" style={isMobile ? { width: '100%' } : {}} onClick={() => handleBatchSetStatus('expired')}>批量标记为已过期</button>
          <button className="btn btn-primary" style={isMobile ? { width: '100%' } : {}} onClick={() => handleBatchSetStatus('active')}>批量标记为正常</button>
        </div>
        <div className="table-container" style={isMobile ? { overflowX: 'auto', maxHeight: 480, position: 'relative' } : {}} onScroll={handleTableScroll}>
          <table style={isMobile ? { minWidth: 700 } : {}}>
            <thead>
              <tr>
                <th></th>
                <th onClick={() => { setSortField('domain'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }} className={`sortable ${getSortClass('domain')}`}>域名</th>
                <th onClick={() => { setSortField('status'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }} className={`sortable ${getSortClass('status')}`}>状态</th>
                <th onClick={() => { setSortField('registrar'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }} className={`sortable ${getSortClass('registrar')}`}>注册商</th>
                <th onClick={() => { setSortField('registerDate'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }} className={`sortable ${getSortClass('registerDate')}`}>注册日期</th>
                <th onClick={() => { setSortField('expireDate'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }} className={`sortable ${getSortClass('expireDate')}`}>过期日期</th>
                {showProgress && <th style={{ width: 120 }}>使用进度</th>}
                <th style={{ width: 140 }}>操作</th>
                <th style={{ width: 36 }}><input type="checkbox" onChange={handleSelectAll} checked={selectedIndexes.length === paged.length && paged.length > 0} /></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={showRegistrar && showProgress ? 9 : 7} className="loading">加载中...</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={showRegistrar && showProgress ? 9 : 7} className="loading">暂无域名数据</td></tr>
              ) : paged.map((domain, index) => {
                const progress = calculateProgress(domain.registerDate, domain.expireDate);
                const progressClass = getProgressClass(progress);
                const checked = selectedIndexes.includes(index + (page - 1) * pageSize);
                const expireDate = new Date(domain.expireDate);
                const daysLeft = Math.ceil((expireDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
                let daysColor = daysLeft <= 7 ? '#dc3545' : daysLeft <= 30 ? '#fd7e14' : '#28a745';
                return (
                  <tr key={domain.domain} className={editIndex === index ? 'editing-row' : ''} ref={editIndex === index ? editRowRef : undefined}>
                    <td><input type="checkbox" checked={checked} onChange={e => handleSelectRow(index + (page - 1) * pageSize, e.target.checked)} /></td>
                    <td className="domain-name">{domain.domain}</td>
                    {showRegistrar && <td className="registrar">{domain.registrar}</td>}
                    <td><span className={`status ${domain.status}`}>{STATUS_LABELS[domain.status]}</span></td>
                    <td className="date">{domain.registerDate}</td>
                    <td className="date">{domain.expireDate} <span style={{ color: daysColor, fontWeight: 600, marginLeft: 4 }}>{daysLeft}天</span></td>
                    {showProgress && <td>
                      <div className="progress-bar">
                        <div className={`progress-fill ${progressClass}`} style={{ width: progress + '%' }}></div>
                      </div>
                      <span className="progress-text">{progress}%</span>
                    </td>}
                    <td>
                      <div className="action-buttons">
                        <button className="btn-edit" onClick={() => handleEdit(index + (page - 1) * pageSize)}>修改</button>
                        <button className="btn-delete" onClick={() => handleDelete(index + (page - 1) * pageSize)}>删除</button>
                        <button className="btn-renew" onClick={() => {
                          if (domain.renewUrl && domain.renewUrl.trim() !== '') {
                            window.open(domain.renewUrl, '_blank');
                          } else {
                            alert(`请联系注册商 ${domain.registrar} 对域名 ${domain.domain} 进行续期操作。`);
                          }
                        }}>续期</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ margin: '10px 0', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>每页</span>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {[10, 20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
          </select>
          <span>条</span>
          <button className="btn" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一页</button>
          <span>第 {page} / {totalPages} 页</span>
          <button className="btn" disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>下一页</button>
          <label style={{ marginLeft: 16 }}><input type="checkbox" checked={showRegistrar} onChange={e => setShowRegistrar(e.target.checked)} />显示注册商</label>
          <label style={{ marginLeft: 8 }}><input type="checkbox" checked={showProgress} onChange={e => setShowProgress(e.target.checked)} />显示进度</label>
        </div>
        {opMsg && <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: '#333', color: '#fff', padding: '8px 24px', borderRadius: 8, zIndex: 9999 }}>{opMsg}</div>}
      </div>
      <button className="add-domain-btn" onClick={handleAdd}>+</button>
      {modalOpen && (
        <div className="modal" style={{ display: 'block' }} onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="modal-content" style={isMobile ? { width: '98%', padding: 10 } : {}}>
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
                <input id="registrar" value={form.registrar} onChange={handleFormChange} />
              </div>
              <div className="form-group">
                <label htmlFor="registerDate">注册日期</label>
                <input type="date" id="registerDate" value={form.registerDate} onChange={handleFormChange} required />
              </div>
              <div className="form-group">
                <label htmlFor="expireDate">过期日期</label>
                <input type="date" id="expireDate" value={form.expireDate} onChange={handleFormChange} required />
              </div>
              <div className="form-group">
                <label htmlFor="status">状态</label>
                <select id="status" value={form.status} onChange={handleFormChange} required>
                  <option value="active">正常</option>
                  <option value="expired">已过期</option>
                  <option value="pending">待激活</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="renewUrl">续期链接（可选）</label>
                <input id="renewUrl" value={form.renewUrl || ''} onChange={handleFormChange} placeholder="https://..." />
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
          <div className="modal-content" style={isMobile ? { width: '98%', padding: 10 } : {}}>
            <div className="modal-header">
              <h3>⚠️ 域名到期提醒</h3>
            </div>
            <div className="modal-body">
              <p>以下域名即将到期，请及时处理：</p>
              {expiringDomains.map(domain => (
                <div key={domain.domain} style={{ marginBottom: 10, padding: 10, background: '#f8f9fa', borderRadius: 8 }}>
                  <p><strong>域名:</strong> {domain.domain}</p>
                  <p><strong>注册商:</strong> {domain.registrar}</p>
                  <p><strong>过期日期:</strong> {domain.expireDate}</p>
                  <p><strong>剩余天数:</strong> <span style={{ color: '#dc3545', fontWeight: 600 }}>{Math.ceil((new Date(domain.expireDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))}天</span></p>
                </div>
              ))}
            </div>
            <div className="modal-buttons">
              <button className="btn btn-primary" onClick={() => setExpireModal(false)}>我知道了</button>
              <button className="btn btn-primary" onClick={() => handleCloseExpireModal(false)}>我知道了</button>
              <button className="btn btn-secondary" onClick={() => handleCloseExpireModal(true)}>今日不再弹出</button>
            </div>
          </div>
        </div>
      )}
      {settingsOpen && (
        <div className="modal" style={{ display: 'block' }} onClick={e => { if (e.target === e.currentTarget) setSettingsOpen(false); }}>
          <div className="modal-content" style={isMobile ? { width: '98%', padding: 10 } : {}}>
            <div className="modal-header">
              <h3>⚙️ 系统设置</h3>
            </div>
            <div className="settings-section">
              <h4>📅 通知设置</h4>
              <div className="form-group">
                <label>提前通知天数</label>
                <input type="number" min={1} max={365} value={warningDays} onChange={e => setWarningDays(e.target.value)} />
                <small style={{ color: '#666', fontSize: '0.9rem' }}>设置域名到期前多少天开始通知（1-365天）</small>
              </div>
              <div className="form-group">
                <label>启用自动通知</label>
                <select value={notificationEnabled} onChange={e => setNotificationEnabled(e.target.value)}>
                  <option value="true">启用</option>
                  <option value="false">禁用</option>
                </select>
                <small style={{ color: '#666', fontSize: '0.9rem' }}>是否自动发送域名到期通知</small>
              </div>
              <div className="form-group">
                <label>通知频率</label>
                <select value={notificationInterval} onChange={e => setNotificationInterval(e.target.value)}>
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                  <option value="once">仅一次</option>
                </select>
                <small style={{ color: '#666', fontSize: '0.9rem' }}>设置通知发送的频率</small>
              </div>
              <div className="modal-buttons">
                <button className="btn btn-primary" onClick={saveNotificationSettings}>保存设置</button>
              </div>
            </div>
            <div className="settings-section">
              <h4>🖼️ 更换背景图片</h4>
              <div className="form-group">
                <label>背景图片URL</label>
                <input type="url" value={bgImageUrl} onChange={e => setBgImageUrl(e.target.value)} placeholder="https://example.com/bg.jpg" />
              </div>
              <div className="modal-buttons">
                <button className="btn btn-primary" onClick={saveBgImage}>保存背景</button>
                <button className="btn btn-secondary" onClick={resetBgImage}>恢复默认</button>
              </div>
              <small style={{ color: '#666', fontSize: '0.9rem' }}>支持jpg/png/webp等图片格式，建议高清大图。</small>
            </div>
            <div className="settings-section">
              <h4>📤 数据导入/导出</h4>
              <div className="form-group">
                <button className="btn btn-primary" onClick={exportDomainsToCSV}>导出域名文件（CSV）</button>
                <button className="btn btn-secondary" onClick={exportDomainsToJSON} style={{ marginLeft: 8 }}>备份为JSON</button>
              </div>
              <div className="form-group" style={{ marginTop: 10 }}>
                <input type="file" ref={fileInputRef} accept=".csv" style={{ display: 'inline-block' }} />
                <button className="btn btn-primary" onClick={importDomainsFromCSV}>导入域名文件（CSV）</button>
              </div>
              <div className="form-group" style={{ marginTop: 10 }}>
                <input type="file" accept="application/json" onChange={importDomainsFromJSON} style={{ display: 'inline-block' }} />
                <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>恢复JSON备份</span>
              </div>
              <small style={{ color: '#666', fontSize: '0.9rem' }}>导出可将当前域名数据保存为CSV或JSON文件，导入/恢复会覆盖当前所有域名数据。</small>
            </div>
            <div className="modal-buttons">
              <button className="btn btn-secondary" onClick={() => setSettingsOpen(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
