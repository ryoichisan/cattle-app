import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import { generateAlerts } from '../utils/alerts';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ total: 0, pregnant: 0, open: 0, postpartum: 0 });
  const [alerts, setAlerts] = useState([]);
  const [shipped, setShipped] = useState({ calf: [], adult: [], slaughter: [], other: [] });
  const [showShipped, setShowShipped] = useState(false);
  const [shippedTab, setShippedTab] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const allCattle = await db.cattle.toArray();
      const cattleMap = {};
      allCattle.forEach(c => { cattleMap[c.id] = c; });
      const breedingCows = allCattle.filter(c => c.type === '繁殖雌牛' || c.type === '' || !c.type);
      const breedings = await db.breeding.toArray();
      const pregnancyChecks = await db.pregnancyChecks.toArray();
      const calvings = await db.calving.toArray();
      const disposals = await db.disposal.toArray();
      const shipments = await db.shipment.toArray();
      const sales = await db.sales.toArray();

      // Build sets of removed cattle
      const disposedIds = new Set(disposals.map(d => d.cattleId));
      const shippedIds = new Set(shipments.map(s => s.cattleId));
      const removedIds = new Set([...disposedIds, ...shippedIds]);

      const activeCows = breedingCows.filter(c => !removedIds.has(c.id));

      // Build shipped cattle list by category
      const shippedCattle = { calf: [], adult: [], slaughter: [], other: [] };
      for (const s of shipments) {
        const cow = cattleMap[s.cattleId];
        if (!cow) continue;
        const sale = sales.find(sl => sl.cattleId === s.cattleId);
        const entry = {
          ...s,
          earTag: cow.earTag,
          name: cow.name,
          totalAmount: sale ? sale.totalAmount : '',
          salesType: sale ? sale.salesType : '',
        };
        const dest = (s.destination || '').toLowerCase();
        if (dest.includes('仔牛') || dest.includes('子牛')) {
          shippedCattle.calf.push(entry);
        } else if (dest.includes('成牛')) {
          shippedCattle.adult.push(entry);
        } else if (dest.includes('屠場') || dest.includes('と場') || dest.includes('カミチク') || (sale && sale.salesType === '経産牛')) {
          shippedCattle.slaughter.push(entry);
        } else {
          shippedCattle.other.push(entry);
        }
      }
      setShipped(shippedCattle);

      // Calculate stats
      let pregnant = 0, bred = 0, postpartum = 0;
      for (const cow of activeCows) {
        const cowBreedings = breedings.filter(b => b.cattleId === cow.id).sort((a, b) => new Date(b.date) - new Date(a.date));
        const cowPCs = pregnancyChecks.filter(p => p.cattleId === cow.id).sort((a, b) => new Date(b.date) - new Date(a.date));
        const cowCalvings = calvings.filter(c => c.cattleId === cow.id).sort((a, b) => new Date(b.date) - new Date(a.date));

        const latestBreeding = cowBreedings[0];
        const latestPC = cowPCs[0];

        if (latestPC && latestBreeding && new Date(latestPC.date) >= new Date(latestBreeding.date) && latestPC.result === '受胎') {
          pregnant++;
        } else if (latestBreeding) {
          const latestCalving = cowCalvings[0];
          if (!latestCalving || new Date(latestBreeding.date) > new Date(latestCalving.date)) {
            bred++;
          }
        }
      }
      postpartum = activeCows.length - pregnant - bred;

      setStats({
        total: activeCows.length,
        pregnant,
        bred,
        open: postpartum,
      });

      const alertList = generateAlerts(activeCows, breedings, pregnancyChecks, calvings);
      setAlerts(alertList);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  const alertCategories = [
    { type: 'pregnancy_check', icon: '\u{1F50D}', label: '妊娠鑑定', color: '#9C27B0' },
    { type: 'estrus', icon: '\u{1F525}', label: '発情周期', color: '#D32F2F' },
    { type: 'calving_due', icon: '\u{1F476}', label: '分娩予定', color: '#2E7D32' },
    { type: 'sex_determination', icon: '\u{1F52C}', label: '雌雄判別', color: '#F57C00' },
    { type: 'post_calving', icon: '\u{1F489}', label: '分娩後経過（種付開始可能）', color: '#1976D2' },
    { type: 'long_open', icon: '\u{26A0}', label: '長期不受胎牛', color: '#616161' },
  ];

  if (loading) {
    return <div className="empty-state">読み込み中...</div>;
  }

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-number">{stats.total}</div>
          <div className="stat-label">繁殖牛頭数</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#2E7D32' }}>{stats.pregnant}</div>
          <div className="stat-label">受胎中</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#1565C0' }}>{stats.bred}</div>
          <div className="stat-label">授精済(鑑定待)</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#E65100' }}>{stats.open}</div>
          <div className="stat-label">空胎/分娩後</div>
        </div>
      </div>

      {alerts.length === 0 && stats.total === 0 ? (
        <div className="card">
          <div className="card-header">&#x1F514; アラート</div>
          <div className="empty-state">
            <div className="empty-icon">&#x2705;</div>
            <div>現在アラートはありません</div>
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={() => navigate('/settings')}>
                データをインポート
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-header">&#x1F514; アラート</div>
          {alertCategories.map(cat => {
            const catAlerts = alerts.filter(a => a.type === cat.type);
            if (catAlerts.length === 0) return null;
            return (
              <div className="alert-row" key={cat.type}>
                <div className="alert-row-label" style={{ color: cat.color }}>
                  <span>{cat.icon}</span> {cat.label}
                </div>
                <div className="alert-chips">
                  {catAlerts.map((alert, i) => {
                    const daysMatch = alert.message.match(/(\d+)日/);
                    const days = daysMatch ? daysMatch[1] + '日' : '';
                    return (
                      <span
                        key={i}
                        className={`alert-chip ${alert.priority}`}
                        onClick={() => navigate(`/cattle/${alert.cattleId}`)}
                        title={alert.message}
                      >
                        {alert.earTag}{alert.name && ` ${alert.name}`}
                        {days && <span className="alert-chip-days">{days}</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setShowShipped(!showShipped)}>
          &#x1F69A; 出荷済み ({shipped.calf.length + shipped.adult.length + shipped.slaughter.length + shipped.other.length}頭)
          <span style={{ marginLeft: 'auto', fontSize: 14 }}>{showShipped ? '▲' : '▼'}</span>
        </div>
        {showShipped && (
          <div>
            <div className="tabs">
              {[
                ['all', `全て(${shipped.calf.length + shipped.adult.length + shipped.slaughter.length + shipped.other.length})`],
                ['calf', `子牛市場(${shipped.calf.length})`],
                ['adult', `成牛市場(${shipped.adult.length})`],
                ['slaughter', `屠場(${shipped.slaughter.length})`],
                ['other', `その他(${shipped.other.length})`],
              ].map(([key, label]) => (
                <button key={key} className={shippedTab === key ? 'active' : ''} onClick={() => setShippedTab(key)}>
                  {label}
                </button>
              ))}
            </div>
            {(() => {
              const list = shippedTab === 'all'
                ? [...shipped.calf, ...shipped.adult, ...shipped.slaughter, ...shipped.other]
                : shipped[shippedTab];
              if (list.length === 0) return <div className="empty-state">該当する牛はいません</div>;
              return list.sort((a, b) => new Date(b.date) - new Date(a.date)).map((s, i) => (
                <div key={i} className="cattle-item" onClick={() => navigate(`/cattle/${s.cattleId}`)}>
                  <div className="cattle-avatar" style={{ background: '#9E9E9E' }}>
                    {(s.earTag || '?').slice(-3)}
                  </div>
                  <div className="cattle-info">
                    <div className="cattle-ear-tag">{s.earTag} {s.name && <span style={{ fontWeight: 400, fontSize: 13 }}>({s.name})</span>}</div>
                    <div className="cattle-sub">
                      {s.date} / {s.destination || '出荷先不明'}
                      {s.weight && ` / ${s.weight}kg`}
                      {s.totalAmount && ` / ${Number(s.totalAmount).toLocaleString()}円`}
                    </div>
                  </div>
                  <span className="cattle-status" style={{ background: '#EEEEEE', color: '#616161' }}>出荷済</span>
                </div>
              ));
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
