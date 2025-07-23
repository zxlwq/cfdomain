import React, { useEffect, useState } from 'react';
import { fetchDomains, saveDomains, deleteDomain, notifyExpiring, Domain } from './api';
import { useRef } from 'react';

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
  const [bgImageUrl, setBgImageUrl] = useState(() => localStorage.getItem('customBgImageUrl') || '');
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
    setForm((prev: Domain) => ({ ...prev, [id]: value }));
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

  const [carouselImages, setCarouselImages] = useState<string[]>([]);
  const carouselIndex = useRef(0);
  const carouselTimer = useRef<NodeJS.Timeout | null>(null);

  // 加载轮播图片列表，修复fetch空内容报错
  useEffect(() => {
    fetch('/image/images.json')
      .then(res => res.text())
      .then(txt => {
        let data: string[] = [];
        try { data = JSON.parse(txt); } catch {}
        if (!Array.isArray(data) || data.length === 0) data = ["background.jpeg"];
        setCarouselImages(data);
      })
      .catch(() => setCarouselImages(["background.jpeg"]));
  }, []);

  // 轮播时长设置
  const [carouselInterval, setCarouselInterval] = useState(() => {
    const val = localStorage.getItem('carouselInterval');
    return val ? Number(val) : 30;
  });

  // 轮播逻辑
  useEffect(() => {
    if (bgImageUrl && bgImageUrl.trim() !== '') {
      // 用户自定义图片，直接显示
    document.body.style.backgroundImage = `url('${bgImageUrl}')`;
      if (carouselTimer.current) clearInterval(carouselTimer.current);
      return;
    }
    // 轮播
    if (carouselImages.length === 0) return;
    function setBg(idx: number) {
      const url = `/image/${carouselImages[idx]}`;
      document.body.style.backgroundImage = `url('${url}')`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundRepeat = 'no-repeat';
    document.body.style.backgroundPosition = 'center center';
    }
    setBg(carouselIndex.current);
    if (carouselTimer.current) clearInterval(carouselTimer.current);
    carouselTimer.current = setInterval(() => {
      carouselIndex.current = (carouselIndex.current + 1) % carouselImages.length;
      setBg(carouselIndex.current);
    }, carouselInterval * 1000); // 轮播间隔可配置
    return () => {
      if (carouselTimer.current) clearInterval(carouselTimer.current);
    };
  }, [bgImageUrl, carouselImages, carouselInterval]);

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
    let list = domains.filter((domain: Domain) =>
      domain.domain.toLowerCase().includes(search.toLowerCase()) ||
      domain.registrar.toLowerCase().includes(search.toLowerCase()) ||
      domain.status.toLowerCase().includes(search.toLowerCase())
    );
    if (sortField) {
      list = [...list].sort((a: Domain, b: Domain) => {
        let valA: any = a[sortField as keyof Domain];
        let valB: any = b[sortField as keyof Domain];
        // 特殊处理到期天数和使用进度
        if (sortField === 'daysLeft') {
          valA = Math.ceil((new Date(a.expireDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
          valB = Math.ceil((new Date(b.expireDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        }
        if (sortField === 'progress') {
          valA = calculateProgress(a.registerDate, a.expireDate);
          valB = calculateProgress(b.registerDate, b.expireDate);
        }
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      // 默认到期自动排序，快到期的排前面
      list = [...list].sort((a: Domain, b: Domain) => new Date(a.expireDate).getTime() - new Date(b.expireDate).getTime());
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
  const active = domains.filter((d: Domain) => d.status === 'active').length;
  const expired = domains.filter((d: Domain) => d.status === 'expired').length;
  const avgProgress = total ? Math.round(domains.reduce((sum: number, d: Domain) => sum + calculateProgress(d.registerDate, d.expireDate), 0) / total) : 0;

  function handleSelectAll(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.checked) {
      setSelectedIndexes(filteredDomains().map((_: Domain, idx: number) => idx));
    } else {
      setSelectedIndexes([]);
    }
  }
  function handleSelectRow(idx: number, checked: boolean) {
    setSelectedIndexes((prev: number[]) => checked ? [...prev, idx] : prev.filter((i: number) => i !== idx));
  }
  async function handleBatchDelete() {
    if (selectedIndexes.length === 0) return alert('请先选择要删除的域名');
    if (!window.confirm('确定要批量删除选中的域名吗？')) return;
    const newDomains = domains.filter((_: Domain, idx: number) => !selectedIndexes.includes(idx));
    await saveDomains(newDomains);
    setSelectedIndexes([]);
    loadDomains();
    setOpMsg('批量删除成功');
  }
  async function handleBatchSetStatus(status: string) {
    if (selectedIndexes.length === 0) return alert('请先选择要操作的域名');
    const newDomains = domains.map((d: Domain, idx: number) => selectedIndexes.includes(idx) ? { ...d, status } : d);
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
    localStorage.setItem('carouselInterval', String(carouselInterval));
    alert('背景图片已保存');
  }
  // 恢复默认背景图片逻辑
  function resetBgImage() {
    setBgImageUrl(''); // 输入框清空
    localStorage.removeItem('customBgImageUrl');
    // 立即切换为默认背景
    document.body.style.backgroundImage = `url('/image/background.jpeg')`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundRepeat = 'no-repeat';
    document.body.style.backgroundPosition = 'center center';
    setOpMsg('已恢复默认背景');
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

  // 导出格式下拉框
  const [exportFormat, setExportFormat] = useState<'csv' | 'json' | 'txt'>('csv');

  // 导出CSV按钮直接下载
  function handleExportClick() {
    exportDomainsToCSV();
  }
  // 导入按钮弹出文件选择框，选中后自动导入
  function handleImportClick() {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }
  // 升级后的CSV导入逻辑，支持更宽松的表头和引号处理，兼容id字段
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) {
      setOpMsg('请先选择文件');
      return;
    }
    const file = e.target.files[0];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'csv' || ext === 'txt') {
      const reader = new FileReader();
      reader.onload = async function(evt) {
        try {
          const text = evt.target?.result as string;
          const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
          if (lines.length < 2) throw new Error('CSV文件内容无效');
          // 处理引号和逗号分隔
          function parseCSVLine(line: string) {
            // 简单处理：去除每个字段前后的引号和空格
            // 支持逗号分隔和引号包裹
            const result: string[] = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') {
                inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
              } else {
                current += char;
              }
            }
            result.push(current.trim());
            return result.map(cell => cell.replace(/^"|"$/g, '').trim());
          }
          const headerRaw = parseCSVLine(lines[0]);
          // 字段名归一化函数
          function norm(s: string) {
            return s.replace(/^"|"$/g, '').replace(/[_\s-]/g, '').toLowerCase();
          }
          // 字段映射表，支持多种写法
          const fieldMap: Record<string, string> = {
            'id': 'id',
            '域名': 'domain', 'domain': 'domain',
            '注册商': 'registrar', 'registrar': 'registrar',
            '注册日期': 'registerDate', 'registrationdate': 'registerDate', 'registerdate': 'registerDate', 'register_date': 'registerDate',
            '过期日期': 'expireDate', 'expirationdate': 'expireDate', 'expiredate': 'expireDate', 'expire_date': 'expireDate',
            '状态': 'status', 'status': 'status',
            '续期链接': 'renewUrl', 'renewurl': 'renewUrl', 'renew_url': 'renewUrl'
          };
          // 归一化后的header
          const headerNorm = headerRaw.map(norm);
          // 找到每个字段在header中的索引
          const colIdx: Partial<Record<'id'|'domain'|'registrar'|'registerDate'|'expireDate'|'status'|'renewUrl', number>> = {};
          headerNorm.forEach((h, idx) => {
            const mapped = fieldMap[h];
            if (mapped && colIdx[mapped as keyof typeof colIdx] === undefined) colIdx[mapped as keyof typeof colIdx] = idx;
          });
          if (colIdx.domain === undefined || colIdx.registrar === undefined || colIdx.registerDate === undefined || colIdx.expireDate === undefined || colIdx.status === undefined) {
            throw new Error('CSV表头需包含：id(可选)、域名/domain，注册商/registrar，注册日期/register_date，过期日期/expire_date，状态/status（支持多种写法）');
          }
          const newDomains = lines.slice(1).map(line => {
            const cols = parseCSVLine(line);
            const obj: any = {
              domain: cols[colIdx.domain!],
              registrar: cols[colIdx.registrar!],
              registerDate: cols[colIdx.registerDate!],
              expireDate: cols[colIdx.expireDate!],
              status: (cols[colIdx.status!] === '正常' || cols[colIdx.status!] === 'active' || cols[colIdx.status!].toLowerCase() === 'active') ? 'active' :
                      (cols[colIdx.status!] === '已过期' || cols[colIdx.status!] === 'expired' || cols[colIdx.status!].toLowerCase() === 'expired') ? 'expired' : 'pending'
            };
            if (colIdx.id !== undefined && cols[colIdx.id!]) {
              const idVal = cols[colIdx.id!];
              obj.id = isNaN(Number(idVal)) ? idVal : Number(idVal);
            }
            if (colIdx.renewUrl !== undefined && cols[colIdx.renewUrl!]) {
              obj.renewUrl = cols[colIdx.renewUrl!];
            }
            return obj;
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
    } else if (ext === 'json') {
      const reader = new FileReader();
      reader.onload = async function(evt) {
        try {
          const data = JSON.parse(evt.target?.result as string);
          if (!Array.isArray(data)) throw new Error('JSON格式错误');
          await saveDomains(data);
          setSelectedIndexes([]);
          loadDomains();
          setOpMsg('导入成功！');
        } catch {
          setOpMsg('JSON格式无效或数据损坏');
        }
      };
      reader.readAsText(file, 'utf-8');
    } else {
      setOpMsg('仅支持csv、json、txt格式');
    }
  }

  // 导出多种格式
  function handleExport(format: 'csv' | 'json' | 'txt') {
    if (!domains || domains.length === 0) {
      setOpMsg('暂无域名数据可导出');
      return;
    }
    if (format === 'csv' || format === 'txt') {
      try {
        const header = ['域名','注册商','注册日期','过期日期','状态'];
        const rows = domains.map((d: Domain) => [
          d.domain,
          d.registrar,
          d.registerDate,
          d.expireDate,
          d.status === 'active' ? '正常' : d.status === 'expired' ? '已过期' : '待激活'
        ]);
        let content = header.join(',') + '\n' + rows.map((r: string[]) => r.join(',')).join('\n');
        const blob = new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8;' : 'text/plain;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `domains.${format}`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setOpMsg('导出成功');
      } catch {
        setOpMsg('导出失败');
      }
    } else if (format === 'json') {
      try {
        const blob = new Blob([JSON.stringify(domains, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'domains.json');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setOpMsg('导出成功');
      } catch {
        setOpMsg('导出失败');
      }
    }
  }

  // 统计卡片样式
  const statNumberStyle = {
    fontSize: '2.6rem',
    color: '#007bff', // 与批量标记为正常按钮一致
    fontWeight: 700,
    margin: 0,
    lineHeight: 1.1
  };

  // 1. 樱花粉按钮样式
  const sakuraBtnStyle = { backgroundColor: '#ffb6c1', borderColor: '#ffb6c1', color: '#fff' };

  // WebDAV上传
  async function uploadToWebDAV() {
    try {
      const url = import.meta.env.VITE_WEBDAV_URL;
      const username = import.meta.env.VITE_WEBDAV_USERNAME;
      const password = import.meta.env.VITE_WEBDAV_PASSWORD;
      if (!url || !username || !password) {
        setOpMsg('请先在Cloudflare Pages环境变量中配置WebDAV信息');
        return;
      }
      const fileUrl = url.replace(/\/$/, '') + '/domain/domains-backup.json';
      const res = await fetch(fileUrl, {
        method: 'PUT',
        headers: {
          'Authorization': 'Basic ' + btoa(username + ':' + password),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(domains, null, 2)
      });
      if (!res.ok) throw new Error('WebDAV上传失败');
      setOpMsg('WebDAV上传成功');
    } catch (e) {
      setOpMsg('WebDAV上传失败: ' + (e.message || e));
    }
  }
  // WebDAV下载
  async function downloadFromWebDAV() {
    try {
      const url = import.meta.env.VITE_WEBDAV_URL;
      const username = import.meta.env.VITE_WEBDAV_USERNAME;
      const password = import.meta.env.VITE_WEBDAV_PASSWORD;
      if (!url || !username || !password) {
        setOpMsg('请先在Cloudflare Pages环境变量中配置WebDAV信息');
        return;
      }
      const fileUrl = url.replace(/\/$/, '') + '/domain/domains-backup.json';
      const res = await fetch(fileUrl, {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + btoa(username + ':' + password)
        }
      });
      if (!res.ok) throw new Error('WebDAV下载失败');
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('WebDAV文件内容无效');
      await saveDomains(data);
      setSelectedIndexes([]);
      loadDomains();
      setOpMsg('WebDAV导入成功！');
    } catch (e) {
      setOpMsg('WebDAV下载失败: ' + (e.message || e));
    }
  }

  return (
    <div className="container">
      <div className="header">
        <h1>域名面板</h1>
        <p>查看域名状态、注册商、注册日期、过期日期和使用进度</p>
        <button className="settings-btn" onClick={() => alert('请在 Cloudflare Pages 环境变量中配置通知参数')}>⚙️</button>
        <button className="settings-btn" onClick={() => setSettingsOpen(true)}>⚙️</button>
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <h3>总域名数</h3>
          <p style={statNumberStyle}>{total}</p>
        </div>
        <div className="stat-card">
          <h3>正常域名</h3>
          <p style={statNumberStyle}>{active}</p>
        </div>
        <div className="stat-card">
          <h3>已过期域名</h3>
          <p style={statNumberStyle}>{expired}</p>
        </div>
        <div className="stat-card">
          <h3>平均使用进度</h3>
          <p style={statNumberStyle}>{avgProgress}%</p>
        </div>
      </div>
      <div className="domain-table" style={{ ...(isMobile ? { fontSize: 12 } : {}), width: '100%', minWidth: 0, margin: '0 auto', overflowX: 'visible' }}>
        <div className="table-header">
          <h2>域名列表</h2>
          <div className="search-box">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索域名..." />
          </div>
        </div>
        <div style={{ margin: '10px 0', display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row', flexWrap: 'wrap' }}>
          {/* 批量操作下拉框，放到域名栏前面 */}
        </div>
        <div className="table-container" style={isMobile ? { maxHeight: 480, position: 'relative' } : { width: '100%' }} onScroll={handleTableScroll}>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span onClick={() => { setSortField('domain'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }} className={`sortable ${getSortClass('domain')}`}>域名</span>
                  </div>
                </th>
                <th onClick={() => { setSortField('registrar'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }} className={`sortable ${getSortClass('registrar')}`}>注册商</th>
                <th onClick={() => { setSortField('status'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }} className={`sortable ${getSortClass('status')}`} style={{ minWidth: 100 }}>状态</th>
                <th onClick={() => { setSortField('registerDate'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }} className={`sortable ${getSortClass('registerDate')}`} style={{ minWidth: 110 }}>注册日期</th>
                <th onClick={() => { setSortField('expireDate'); setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); }} className={`sortable ${getSortClass('expireDate')}`} style={{ minWidth: 110 }}>过期日期</th>
                <th onClick={() => { setSortField('daysLeft'); setSortOrder(sortField === 'daysLeft' && sortOrder === 'asc' ? 'desc' : 'asc'); }} className={`sortable ${getSortClass('daysLeft')}`} style={{ minWidth: 120 }}>到期天数</th>
                {showProgress && <th onClick={() => { setSortField('progress'); setSortOrder(sortField === 'progress' && sortOrder === 'asc' ? 'desc' : 'asc'); }} className={`sortable ${getSortClass('progress')}`} style={{ width: 120 }}>使用进度</th>}
                <th style={{ width: 140, position: 'relative' }}>
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <span>操作</span>
                    <select
                      style={{ height: 28, fontSize: 14, marginLeft: 2 }}
                      onChange={e => {
                        if (e.target.value === 'expired') handleBatchSetStatus('expired');
                        else if (e.target.value === 'active') handleBatchSetStatus('active');
                        else if (e.target.value === 'delete') handleBatchDelete();
                        e.target.value = '';
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>批量操作</option>
                      <option value="expired">批量为已过期</option>
                      <option value="active">批量为正常</option>
                      <option value="delete">批量删除</option>
                    </select>
                  </div>
                </th>
                <th style={{ width: 24, paddingLeft: 0, paddingRight: 0 }}><input type="checkbox" onChange={handleSelectAll} checked={selectedIndexes.length === paged.length && paged.length > 0} /></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={showRegistrar && showProgress ? 11 : 9} className="loading">加载中...</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={showRegistrar && showProgress ? 11 : 9} className="loading">暂无域名数据</td></tr>
              ) : paged.map((domain, index) => {
                const progress = calculateProgress(domain.registerDate, domain.expireDate);
                const progressClass = getProgressClass(progress);
                const checked = selectedIndexes.includes(index + (page - 1) * pageSize);
                const expireDate = new Date(domain.expireDate);
                const daysLeft = Math.ceil((expireDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
                let daysColor = daysLeft <= 7 ? '#dc3545' : daysLeft <= 30 ? '#fd7e14' : '#28a745';
                if (daysColor === '#28a745') daysColor = '#fff';
                return (
                  <tr key={domain.domain} className={editIndex === index ? 'editing-row' : ''} ref={editIndex === index ? editRowRef : undefined}>
                    <td className="domain-name" style={{ color: '#fff', fontWeight: 700 }}>{domain.domain}</td>
                    {showRegistrar && <td className="registrar">{domain.registrar}</td>}
                    <td><span className={`status ${domain.status}`}>{STATUS_LABELS[domain.status]}</span></td>
                    <td className="date">{domain.registerDate}</td>
                    <td className="date">{domain.expireDate}</td>
                    <td style={{ color: daysColor, fontWeight: 600 }}>{daysLeft}天</td>
                    {showProgress && <td>
                      <div className="progress-bar">
                        <div className={`progress-fill ${progressClass}`} style={{ width: progress + '%' }}></div>
                      </div>
                      <span className="progress-text">{progress}%</span>
                    </td>}
                    <td>
                      <div className="action-buttons" style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
                        <button className="btn-edit" style={{ width: 56, height: 40, padding: 0, textAlign: 'center' }} onClick={() => handleEdit(index + (page - 1) * pageSize)}>修改</button>
                        <button className="btn-delete" style={{ width: 56, height: 40, padding: 0, textAlign: 'center' }} onClick={() => handleDelete(index + (page - 1) * pageSize)}>删除</button>
                        <button className="btn-renew" style={{ width: 56, height: 40, padding: 0, textAlign: 'center' }} onClick={() => {
                          if (domain.renewUrl && domain.renewUrl.trim() !== '') {
                            window.open(domain.renewUrl, '_blank');
                          } else {
                            alert(`请联系注册商 ${domain.registrar} 对域名 ${domain.domain} 进行续期操作。`);
                          }
                        }}>续期</button>
                      </div>
                    </td>
                    <td style={{ width: 24, paddingLeft: 0, paddingRight: 0 }}><input type="checkbox" checked={checked} onChange={e => handleSelectRow(index + (page - 1) * pageSize, e.target.checked)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ margin: '10px 0', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }}>
          <span>每页</span>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {[10, 20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
          </select>
          <span>条</span>
          <button className="btn" style={{ ...sakuraBtnStyle }} disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一页</button>
          <span>第 {page} / {totalPages} 页</span>
          <button className="btn" style={{ ...sakuraBtnStyle }} disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>下一页</button>
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
              <div className="form-group">
                <label>轮播时长（秒）</label>
                <input type="number" min={5} max={600} value={carouselInterval} onChange={e => setCarouselInterval(Number(e.target.value))} />
                <small style={{ color: '#666', fontSize: '0.9rem' }}>设置public/image文件夹内图片轮播间隔，建议5-600秒</small>
              </div>
              <div className="modal-buttons">
                <button className="btn btn-primary" onClick={saveBgImage}>保存背景</button>
                <button className="btn btn-secondary" style={{ ...sakuraBtnStyle }} onClick={resetBgImage}>恢复默认</button>
              </div>
              <small style={{ color: '#666', fontSize: '0.9rem' }}>支持jpg/png/webp等图片格式，建议高清大图。</small>
            </div>
            <div className="settings-section">
              <h4>📤 域名数据导入/导出</h4>
              <div className="form-group" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                <label htmlFor="exportFormat" style={{ marginRight: 8 }}>导出格式：</label>
                <select id="exportFormat" value={exportFormat} onChange={e => setExportFormat(e.target.value as 'csv' | 'json' | 'txt')} style={{ minWidth: 90, marginRight: 8 }}>
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                  <option value="txt">TXT</option>
                </select>
                <button className="btn btn-primary" onClick={() => handleExport(exportFormat)} style={{ marginRight: 24 }}>导出域名文件</button>
                <button className="btn btn-secondary" style={{ ...sakuraBtnStyle }} onClick={handleImportClick}>导入域名文件</button>
                <input type="file" ref={fileInputRef} accept=".csv,.json,.txt" style={{ display: 'none' }} onChange={handleFileChange} />
                <button className="btn btn-primary" style={{ marginLeft: 8 }} onClick={uploadToWebDAV}>WebDAV上传</button>
                <button className="btn btn-secondary" style={{ ...sakuraBtnStyle }} onClick={downloadFromWebDAV}>WebDAV下载</button>
              </div>
              <small style={{ color: '#666', fontSize: '0.9rem' }}>支持csv、json、txt格式，导入会覆盖当前所有域名数据。WebDAV参数请在Cloudflare Pages环境变量中配置：VITE_WEBDAV_URL、VITE_WEBDAV_USERNAME、VITE_WEBDAV_PASSWORD。</small>
            </div>
            <div className="modal-buttons">
              <button className="btn btn-secondary" style={{ ...sakuraBtnStyle }} onClick={() => setSettingsOpen(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
