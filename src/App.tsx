import React, { useEffect, useState, useRef } from 'react';
import {
  fetchDomains,
  saveDomains,
  deleteDomain,
  notifyExpiring,
  Domain,
  fetchNotificationSettingsFromServer,
  saveNotificationSettingsToServer
} from './api';

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
@@ -68,19 +58,13 @@
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
@@ -93,66 +77,61 @@
    setModalOpen(false);
    setEditIndex(-1);
    setForm(defaultDomain);
    loadDomains();
    await loadDomains();
    setOpMsg('保存成功');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      const t = setTimeout(() => setOpMsg(''), 3000);
      return () => clearTimeout(t);
    }
  }, [opMsg]);

  // 全局提示组件，放在最外层，zIndex极高，字体大
  const GlobalOpMsg = opMsg ? (
    <div style={{
      position: 'fixed',
      top: 0,
      top: '50%',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(40,40,40,0.98)',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(40,40,40,0.45)',
      color: '#fff',
      fontSize: 28,
      fontWeight: 700,
      padding: '18px 48px',
      fontSize: 18,
      fontWeight: 600,
      padding: '12px 32px',
      borderRadius: 16,
      zIndex: 99999,
      boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
      pointerEvents: 'none',
      textAlign: 'center',
      letterSpacing: 1.5
      letterSpacing: 1.2,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      minWidth: 180,
      maxWidth: '80vw',
      margin: '0 auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>{opMsg}</div>
  ) : null;

  useEffect(() => {
    loadDomains();
  }, []);

  const [carouselImages, setCarouselImages] = useState<string[]>([]);
  const carouselIndex = useRef(0);
  const carouselTimer = useRef<number | null>(null);

  // 加载轮播图片列表，修复fetch空内容报错
  const carouselTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    fetch('/image/images.json')
      .then(res => res.text())
@@ -164,67 +143,57 @@
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
    }, carouselInterval * 1000);
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
      console.error('加载域名失败:', error); // 新增详细日志
    } finally {
      setLoading(false);
    }
  }

  function checkExpiringDomains(domains: Domain[]) {
    const warningDays = parseInt(localStorage.getItem('notificationWarningDays') || '15', 10);
    const today = new Date();
@@ -239,29 +208,25 @@
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
      deleteDomain(String(domainToDelete.id || 0));
      loadDomains();
      setOpMsg('域名删除成功');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // 5. 数据本地备份与恢复
  function exportDomainsToJSON() {
    try {
      const blob = new Blob([JSON.stringify(domains, null, 2)], { type: 'application/json' });
@@ -290,17 +255,16 @@
        if (!Array.isArray(data)) throw new Error('格式错误');
        await saveDomains(data);
        setSelectedIndexes([]);
        loadDomains();
        await loadDomains();
        setOpMsg('恢复成功！');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {
        setOpMsg('JSON格式无效或数据损坏');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  // 6. 状态筛选与搜索
  function filteredDomains() {
  function filteredDomains(): Domain[] {
    let list = domains.filter((domain: Domain) =>
      domain.domain.toLowerCase().includes(search.toLowerCase()) ||
      domain.registrar.toLowerCase().includes(search.toLowerCase()) ||
@@ -310,7 +274,6 @@
      list = [...list].sort((a: Domain, b: Domain) => {
        let valA: any = a[sortField as keyof Domain];
        let valB: any = b[sortField as keyof Domain];
        // 特殊处理到期天数和使用进度
        if (sortField === 'daysLeft') {
          valA = Math.ceil((new Date(a.expireDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
          valB = Math.ceil((new Date(b.expireDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
@@ -324,25 +287,19 @@
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
@@ -359,29 +316,31 @@
    const newDomains = domains.filter((_: Domain, idx: number) => !selectedIndexes.includes(idx));
    await saveDomains(newDomains);
    setSelectedIndexes([]);
    loadDomains();
    await loadDomains();
    setOpMsg('批量删除成功');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function handleBatchSetStatus(status: string) {
    if (selectedIndexes.length === 0) return alert('请先选择要操作的域名');
    const newDomains = domains.map((d: Domain, idx: number) => selectedIndexes.includes(idx) ? { ...d, status } : d);
    // 2. 修复 status 类型不兼容
    const validStatus = (status: string): 'active' | 'expired' | 'pending' => {
      if (status === 'active' || status === 'expired' || status === 'pending') return status;
      return 'pending';
    };
    const newDomains = domains.map((d: Domain, idx: number) => selectedIndexes.includes(idx) ? { ...d, status: validStatus(status) } : d);
    await saveDomains(newDomains);
    setSelectedIndexes([]);
    loadDomains();
    await loadDomains();
    setOpMsg('批量状态修改成功');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 多选通知方式
  const [notificationMethods, setNotificationMethods] = useState<string[]>([]);

  // 加载通知设置（页面初始化时）
  useEffect(() => {
    fetchNotificationSettingsFromServer().then(data => {
      if (data.success && data.settings) {
        setWarningDays(data.settings.warningDays);
        setNotificationEnabled(data.settings.notificationEnabled);
        setNotificationInterval(data.settings.notificationInterval);
        // 支持字符串或数组
        let methods = data.settings.notificationMethod;
        if (Array.isArray(methods)) setNotificationMethods(methods);
        else if (typeof methods === 'string') {
@@ -390,8 +349,6 @@
      }
    });
  }, []);

  // 保存通知设置（按钮点击时）
  async function saveNotificationSettings() {
    const res = await saveNotificationSettingsToServer({
      warningDays,
@@ -400,7 +357,7 @@
      notificationMethod: JSON.stringify(notificationMethods)
    });
    if (res.success) {
    alert('通知设置已保存');
      alert('通知设置已保存');
    } else {
      alert('保存失败：' + (res.error || '未知错误'));
    }
@@ -410,33 +367,30 @@
    localStorage.setItem('carouselInterval', String(carouselInterval));
    alert('背景图片已保存');
  }
  // 恢复默认背景图片逻辑
  function resetBgImage() {
    setBgImageUrl(''); // 输入框清空
    setBgImageUrl('');
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
      const rows = domains.map((d: Domain) => [
        d.domain,
        d.registrar,
        d.registerDate,
        d.expireDate,
        d.status === 'active' ? '正常' : d.status === 'expired' ? '已过期' : '待激活'
      ]);
      let csvContent = header.join(',') + '\n' + rows.map(r => r.join(',')).join('\n');
      let csvContent = header.join(',') + '\n' + rows.map((r: string[]) => r.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
@@ -450,68 +404,63 @@
      setOpMsg('导出失败');
    }
  }
  function importDomainsFromCSV() {
    if (!fileInputRef.current || !fileInputRef.current.files || fileInputRef.current.files.length === 0) {
      setOpMsg('请先选择CSV文件');
  function handleExport(format: 'csv' | 'json' | 'txt') {
    if (!domains || domains.length === 0) {
      setOpMsg('暂无域名数据可导出');
      return;
    }
    const file = fileInputRef.current.files[0];
    const reader = new FileReader();
    reader.onload = async function(e) {
    if (format === 'csv' || format === 'txt') {
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
    };
    reader.readAsText(file, 'utf-8');
  }

  function getSortClass(field: string) {
    if (sortField === field) return sortOrder === 'asc' ? 'sorted-asc' : 'sorted-desc';
    return '';
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
@@ -526,10 +475,7 @@
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
@@ -548,11 +494,9 @@
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
@@ -562,16 +506,14 @@
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
            throw new Error('CSV表头需包含:id(可选)、域名/domain、注册商/registrar、注册日期/register_date、过期日期/expire_date、状态/status');
          }
          const newDomains = lines.slice(1).map(line => {
            const cols = parseCSVLine(line);
@@ -594,10 +536,12 @@
          });
          await saveDomains(newDomains);
          setSelectedIndexes([]);
          loadDomains();
          await loadDomains();
          setOpMsg('导入成功！');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err: any) {
          setOpMsg(err.message || '导入失败');
          console.error('导入本地CSV/TXT失败:', err); // 新增详细日志
        }
      };
      reader.readAsText(file, 'utf-8');
@@ -609,159 +553,76 @@
          if (!Array.isArray(data)) throw new Error('JSON格式错误');
          await saveDomains(data);
          setSelectedIndexes([]);
          loadDomains();
          await loadDomains();
          setOpMsg('导入成功！');
        } catch {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
          setOpMsg('JSON格式无效或数据损坏');
          console.error('导入本地JSON失败:', err); // 新增详细日志
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

  // WebDAV上传（通过后端API）
  async function uploadToWebDAV() {
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(domains)
      });
      let data;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (data && data.success) {
        setOpMsg('WebDAV上传成功');
      } else {
        setOpMsg('WebDAV上传失败: ' + (data?.error || '未知错误'));
      }
    } catch (e: any) {
      setOpMsg('WebDAV上传失败: ' + (e.message || e));
    }
  }
  // WebDAV下载（通过后端API）
  async function downloadFromWebDAV() {
    try {
      const res = await fetch('/api/backup');
      let data;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (Array.isArray(data)) {
        await saveDomains(data);
        setSelectedIndexes([]);
        loadDomains();
        setOpMsg('WebDAV导入成功！');
      } else {
        setOpMsg('WebDAV下载失败: ' + (data?.error || '未知错误'));
      }
    } catch (e: any) {
      setOpMsg('WebDAV下载失败: ' + (e.message || e));
    }
  function getSortClass(field: string) {
    if (sortField === field) return sortOrder === 'asc' ? 'sorted-asc' : 'sorted-desc';
    return '';
  }

  return (
    <div className="container" style={{ maxWidth: 1300, margin: '0 auto', padding: 20, position: 'relative', zIndex: 1 }}>
      {GlobalOpMsg}
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
          <p style={{ fontSize: '2.6rem', color: '#007bff', fontWeight: 700, margin: 0, lineHeight: 1.1 }}>{total}</p>
        </div>
        <div className="stat-card">
          <h3>正常域名</h3>
          <p style={statNumberStyle}>{active}</p>
          <p style={{ fontSize: '2.6rem', color: '#007bff', fontWeight: 700, margin: 0, lineHeight: 1.1 }}>{active}</p>
        </div>
        <div className="stat-card">
          <h3>已过期域名</h3>
          <p style={statNumberStyle}>{expired}</p>
          <p style={{ fontSize: '2.6rem', color: '#007bff', fontWeight: 700, margin: 0, lineHeight: 1.1 }}>{expired}</p>
        </div>
        <div className="stat-card">
          <h3>平均使用进度</h3>
          <p style={statNumberStyle}>{avgProgress}%</p>
          <p style={{ fontSize: '2.6rem', color: '#007bff', fontWeight: 700, margin: 0, lineHeight: 1.1 }}>{avgProgress}%</p>
        </div>
      </div>
      <div className="domain-table" style={{ ...(isMobile ? { fontSize: 12 } : {}), width: '100%', minWidth: 0, margin: '0 auto', overflowX: 'visible', maxWidth: 1300 }}>
      <div className="domain-table" style={{ width: '100%', minWidth: 0, margin: '0 auto', overflowX: 'visible', maxWidth: 1300 }}>
        <div className="table-header">
          <h2>域名列表</h2>
          <div className="search-box">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索域名..." />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索域名..."
              style={{
                background: 'transparent',
                color: '#fff',
                border: '1px solid #444',
                borderRadius: 10,
                padding: '10px 18px',
                fontSize: 18,
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                transition: 'background 0.2s',
              }}
            />
          </div>
        </div>
        <div style={{ margin: '10px 0', display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row', flexWrap: 'wrap' }}>
          {/* 批量操作下拉框，放到域名栏前面 */}
        </div>
        <div style={{ margin: '10px 0', display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row', flexWrap: 'wrap' }}></div>
        <div className="table-container" style={isMobile ? { maxHeight: 480, position: 'relative' } : { width: '100%' }} onScroll={handleTableScroll}>
          <table style={{ width: '100%' }}>
            <thead>
@@ -847,29 +708,16 @@
            </tbody>
          </table>
        </div>
        <div
          style={{
            margin: '10px 0',
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            maxWidth: 900,
            paddingLeft: 180, // 微调让“第 x / y 页”视觉中心对齐注册日期/过期日期中间
          }}
        >
        <div style={{ margin: '10px 0', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: 900, paddingLeft: 180 }}>
          <span>每页</span>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {[10, 20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
          </select>
          <span>条</span>
          <button className="btn" style={{ ...sakuraBtnStyle }} disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一页</button>
          <button className="btn" style={{ backgroundColor: '#ffb6c1', borderColor: '#ffb6c1', color: '#fff' }} disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一页</button>
          <span style={{ fontWeight: 700, fontSize: 18, minWidth: 120, textAlign: 'center', display: 'inline-block' }}>第 {page} / {totalPages} 页</span>
          <button className="btn" style={{ ...sakuraBtnStyle }} disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>下一页</button>
          <button className="btn" style={{ backgroundColor: '#ffb6c1', borderColor: '#ffb6c1', color: '#fff' }} disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>下一页</button>
        </div>
        {/* 原有opMsg提示已移到全局 */}
      </div>
      <button className="add-domain-btn" onClick={handleAdd}>+</button>
      {modalOpen && (
@@ -881,34 +729,112 @@
            <form onSubmit={handleFormSubmit}>
              <div className="form-group">
                <label htmlFor="domain">域名</label>
                <input id="domain" value={form.domain} onChange={handleFormChange} required />
                <input id="domain" value={form.domain} onChange={handleFormChange} required style={{
                  background: 'rgba(40,40,40,0.35)',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: 10,
                  padding: '10px 18px',
                  fontSize: 18,
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  transition: 'background 0.2s',
                }} />
              </div>
              <div className="form-group">
                <label htmlFor="registrar">注册商</label>
                <input id="registrar" value={form.registrar} onChange={handleFormChange} />
                <input id="registrar" value={form.registrar} onChange={handleFormChange} style={{
                  background: 'rgba(40,40,40,0.35)',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: 10,
                  padding: '10px 18px',
                  fontSize: 18,
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  transition: 'background 0.2s',
                }} />
              </div>
              <div className="form-group">
                <label htmlFor="registerDate">注册日期</label>
                <input type="date" id="registerDate" value={form.registerDate} onChange={handleFormChange} required />
                <input type="date" id="registerDate" value={form.registerDate} onChange={handleFormChange} required style={{
                  background: 'rgba(40,40,40,0.35)',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: 10,
                  padding: '10px 18px',
                  fontSize: 18,
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  transition: 'background 0.2s',
                }} />
              </div>
              <div className="form-group">
                <label htmlFor="expireDate">过期日期</label>
                <input type="date" id="expireDate" value={form.expireDate} onChange={handleFormChange} required />
                <input type="date" id="expireDate" value={form.expireDate} onChange={handleFormChange} required style={{
                  background: 'rgba(40,40,40,0.35)',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: 10,
                  padding: '10px 18px',
                  fontSize: 18,
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  transition: 'background 0.2s',
                }} />
              </div>
              <div className="form-group">
                <label htmlFor="status">状态</label>
                <select id="status" value={form.status} onChange={handleFormChange} required>
                <select id="status" value={form.status} onChange={handleFormChange} required style={{
                  background: 'rgba(40,40,40,0.35)',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: 10,
                  padding: '10px 18px',
                  fontSize: 18,
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  transition: 'background 0.2s',
                }}>
                  <option value="active">正常</option>
                  <option value="expired">已过期</option>
                  <option value="pending">待激活</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="renewUrl">续期链接（可选）</label>
                <input id="renewUrl" value={form.renewUrl || ''} onChange={handleFormChange} placeholder="https://..." />
                <input id="renewUrl" value={form.renewUrl || ''} onChange={handleFormChange} placeholder="https://..." style={{
                  background: 'rgba(40,40,40,0.35)',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: 10,
                  padding: '10px 18px',
                  fontSize: 18,
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  transition: 'background 0.2s',
                }} />
              </div>
              <div className="modal-buttons">
                <button type="button" className="btn btn-secondary" style={{ ...sakuraBtnStyle }} onClick={() => setModalOpen(false)}>取消</button>
                <button type="button" className="btn btn-secondary" style={{ backgroundColor: '#ffb6c1', borderColor: '#ffb6c1', color: '#fff' }} onClick={() => setModalOpen(false)}>取消</button>
                <button type="submit" className="btn btn-primary">保存</button>
              </div>
            </form>
@@ -950,20 +876,59 @@
              <h4>📅 通知设置</h4>
              <div className="form-group">
                <label>提前通知天数</label>
                <input type="number" min={1} max={365} value={warningDays} onChange={e => setWarningDays(e.target.value)} />
                <input type="number" min={1} max={365} value={warningDays} onChange={e => setWarningDays(e.target.value)} style={{
                  background: 'rgba(40,40,40,0.35)',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: 10,
                  padding: '10px 18px',
                  fontSize: 18,
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  transition: 'background 0.2s',
                }} />
                <small style={{ color: '#666', fontSize: '0.9rem' }}>设置域名到期前多少天开始通知（1-365天）</small>
              </div>
              <div className="form-group">
                <label>启用自动通知</label>
                <select value={notificationEnabled} onChange={e => setNotificationEnabled(e.target.value)}>
                <select value={notificationEnabled} onChange={e => setNotificationEnabled(e.target.value)} style={{
                  background: 'rgba(40,40,40,0.35)',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: 10,
                  padding: '10px 18px',
                  fontSize: 18,
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  transition: 'background 0.2s',
                }}>
                  <option value="true">启用</option>
                  <option value="false">禁用</option>
                </select>
                <small style={{ color: '#666', fontSize: '0.9rem' }}>是否自动发送域名到期通知</small>
              </div>
              <div className="form-group">
                <label>通知频率</label>
                <select value={notificationInterval} onChange={e => setNotificationInterval(e.target.value)}>
                <select value={notificationInterval} onChange={e => setNotificationInterval(e.target.value)} style={{
                  background: 'rgba(40,40,40,0.35)',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: 10,
                  padding: '10px 18px',
                  fontSize: 18,
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  transition: 'background 0.2s',
                }}>
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                  <option value="once">仅一次</option>
@@ -1016,13 +981,24 @@
                              : prev.filter(m => m !== method)
                          );
                        }}
                        style={{ marginRight: 8, accentColor: notificationMethods.includes(method) ? '#fff' : '#bbb', width: 18, height: 18 }}
                        style={{
                          marginRight: 8,
                          accentColor: notificationMethods.includes(method) ? '#fff' : '#bbb',
                          width: 18,
                          height: 18,
                          background: 'rgba(40,40,40,0.35)',
                          border: '1px solid #444',
                          borderRadius: 6,
                          backdropFilter: 'blur(8px)',
                          WebkitBackdropFilter: 'blur(8px)',
                          transition: 'background 0.2s',
                        }}
                      />
                      {method === 'wechat' ? '微信' : method === 'qq' ? 'QQ' : method === 'email' ? '邮件' : 'Telegram'}
                    </label>
                  ))}
                </div>
                <small style={{ color: '#666', fontSize: '0.9rem' }}>可多选，通知会同时发送到所有勾选方式</small>
                <small style={{ color: '#666', fontSize: '0.9rem' }}>可多选、支持邮件、Telegram、微信（Server酱）、QQ（Qmsg酱）、等多种通知方式</small>
              </div>
              <div className="modal-buttons">
                <button className="btn btn-primary" onClick={saveNotificationSettings}>保存设置</button>
@@ -1032,44 +1008,133 @@
              <h4>🖼️ 更换背景图片</h4>
              <div className="form-group">
                <label>背景图片URL</label>
                <input type="url" value={bgImageUrl} onChange={e => setBgImageUrl(e.target.value)} placeholder="https://example.com/bg.jpg" />
                <input type="url" value={bgImageUrl} onChange={e => setBgImageUrl(e.target.value)} placeholder="https://example.com/bg.jpg" style={{
                  background: 'rgba(40,40,40,0.35)',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: 10,
                  padding: '10px 18px',
                  fontSize: 18,
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  transition: 'background 0.2s',
                }} />
              </div>
              <div className="form-group">
                <label>轮播时长（秒）</label>
                <input type="number" min={5} max={600} value={carouselInterval} onChange={e => setCarouselInterval(Number(e.target.value))} />
                <small style={{ color: '#666', fontSize: '0.9rem' }}>设置public/image文件夹内图片轮播间隔，建议5-600秒</small>
                <input type="number" min={5} max={600} value={carouselInterval} onChange={e => setCarouselInterval(Number(e.target.value))} style={{
                  background: 'rgba(40,40,40,0.35)',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: 10,
                  padding: '10px 18px',
                  fontSize: 18,
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  transition: 'background 0.2s',
                }} />
                <small style={{ color: '#666', fontSize: '0.9rem' }}>设置 public/image 文件夹内图片轮播间隔，建议5-600秒</small>
              </div>
              <div className="modal-buttons">
                <button className="btn btn-primary" onClick={saveBgImage}>保存背景</button>
                <button className="btn btn-secondary" style={{ ...sakuraBtnStyle }} onClick={resetBgImage}>恢复默认</button>
                <button className="btn btn-secondary" style={{ backgroundColor: '#ffb6c1', borderColor: '#ffb6c1', color: '#fff' }} onClick={resetBgImage}>恢复默认</button>
              </div>
              <small style={{ color: '#666', fontSize: '0.9rem' }}>支持jpg/png/webp等图片格式，建议高清大图。</small>
            </div>
            <div className="settings-section">
              <h4>📤 域名数据导入/导出</h4>
              <div className="form-group" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                <label htmlFor="exportFormat" style={{ marginRight: 8 }}>导出格式：</label>
                <select id="exportFormat" value={exportFormat} onChange={e => setExportFormat(e.target.value as 'csv' | 'json' | 'txt')} style={{ minWidth: 90, marginRight: 8 }}>
                <select id="exportFormat" value={exportFormat} onChange={e => setExportFormat(e.target.value as 'csv' | 'json' | 'txt')} style={{
                  background: 'rgba(40,40,40,0.35)',
                  color: '#fff',
                  border: '1px solid #444',
                  borderRadius: 10,
                  padding: '10px 18px',
                  fontSize: 18,
                  outline: 'none',
                  minWidth: 90,
                  marginRight: 8,
                  boxSizing: 'border-box',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  transition: 'background 0.2s',
                }}>
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                  <option value="txt">TXT</option>
                </select>
                <button className="btn btn-primary" onClick={() => handleExport(exportFormat)} style={{ marginRight: 24 }}>导出域名文件</button>
                <button className="btn btn-secondary" style={{ ...sakuraBtnStyle }} onClick={handleImportClick}>导入域名文件</button>
                <button className="btn btn-secondary" style={{ backgroundColor: '#ffb6c1', borderColor: '#ffb6c1', color: '#fff' }} onClick={handleImportClick}>导入域名文件</button>
                <input type="file" ref={fileInputRef} accept=".csv,.json,.txt" style={{ display: 'none' }} onChange={handleFileChange} />
                <button className="btn btn-primary" style={{ marginLeft: 8 }} onClick={uploadToWebDAV}>WebDAV上传</button>
                <button className="btn btn-secondary" style={{ ...sakuraBtnStyle }} onClick={downloadFromWebDAV}>WebDAV下载</button>
              </div>
              <small style={{ color: '#666', fontSize: '0.9rem' }}>支持csv、json、txt格式，导入会覆盖当前所有域名数据。WebDAV参数请在Cloudflare Pages环境变量中配置：VITE_WEBDAV_URL、VITE_WEBDAV_USERNAME、VITE_WEBDAV_PASSWORD。</small>
              <small style={{ color: '#666', fontSize: '0.9rem' }}>支持csv、json、txt格式，导入会覆盖当前所有域名数据</small>
            </div>
            <div className="settings-section">
              <h4>☁️ WebDAV备份/恢复</h4>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '8px 0' }}>
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    setOpMsg('正在备份...');
                    try {
                      const res = await fetch('/api/backup', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(domains)
                      });
                      let data;
                      try { data = await res.json(); } catch { data = null; }
                      if (data && data.success) {
                        setOpMsg('WebDAV上传成功');
                      } else {
                        setOpMsg('WebDAV上传失败: ' + (data?.error || '未知错误'));
                      }
                    } catch (e: any) {
                      setOpMsg('WebDAV上传失败: ' + (e.message || e));
                    }
                  }}
                >WebDAV备份</button>
                <button
                  className="btn btn-secondary"
                  style={{ backgroundColor: '#ffb6c1', borderColor: '#ffb6c1', color: '#fff' }}
                  onClick={async () => {
                    setOpMsg('正在恢复...');
                    try {
                      const res = await fetch('/api/backup');
                      let data;
                      try { data = await res.json(); } catch { data = null; }
                      if (Array.isArray(data)) {
                        await saveDomains(data);
                        setSelectedIndexes([]);
                        loadDomains();
                        setOpMsg('WebDAV导入成功！');
                      } else {
                        setOpMsg('WebDAV下载失败: ' + (data?.error || '未知错误'));
                      }
                    } catch (e: any) {
                      setOpMsg('WebDAV下载失败: ' + (e.message || e));
                    }
                  }}
                >WebDAV恢复</button>
              </div>
              <small style={{ color: '#666', fontSize: '0.9rem' }}>
              </small>
            </div>
            <div className="modal-buttons">
              <button className="btn btn-secondary" style={{ ...sakuraBtnStyle }} onClick={() => setSettingsOpen(false)}>关闭</button>
              <button className="btn btn-secondary" style={{ backgroundColor: '#ffb6c1', borderColor: '#ffb6c1', color: '#fff' }} onClick={() => setSettingsOpen(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
};

export default App;
export default App; 
