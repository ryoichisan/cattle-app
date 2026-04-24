import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import { generateAlerts } from '../utils/alerts';

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ total: 0, pregnant: 0, open: 0, postpartum: 0 });
  const [alerts, setAlerts] = useState([]);
  const [shipped, setShipped] = useState({ calf: [], adult: [], small: [], slaughter: [], other: [] });
  const [showShipped, setShowShipped] = useState(() => sessionStorage.getItem('dash_showShipped') === '1');
  const [shippedTab, setShippedTab] = useState(() => sessionStorage.getItem('dash_shippedTab') || 'all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  // 出荷済みが展開状態で戻ってきたら、その位置にスクロール
  useEffect(() => {
    if (!loading && showShipped) {
      const el = document.getElementById('shipped-section');
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'auto', block: 'start' }), 100);
    }
  }, [loading]);

  async function loadData() {
    try {
      const allCattle = await db.cattle.toArray();
      const cattleMap = {};
      allCattle.forEach(c => { cattleMap[c.id] = c; });
      const breedings = await db.breeding.toArray();
      const pregnancyChecks = await db.pregnancyChecks.toArray();
      const calvings = await db.calving.toArray();
      const disposals = await db.disposal.toArray();
      const shipments = await db.shipment.toArray();
      const sales = await db.sales.toArray();
      const deaths = await db.death.toArray();

      // Build sets of removed cattle
      const disposedIds = new Set(disposals.map(d => d.cattleId));
      const shippedIds = new Set(shipments.map(s => s.cattleId));
      const deadIds = new Set(deaths.map(d => d.cattleId));
      const removedIds = new Set([...disposedIds, ...shippedIds, ...deadIds]);

      // 子牛判定（CattleListと同ロジック）
      const calfTagSet = new Set();
      for (const c of calvings) {
        const t = (c.calfEarTag || '').trim();
        if (t) calfTagSet.add(t);
      }
      const bredCattleIds = new Set(breedings.map(b => b.cattleId));
      const damCattleIds = new Set(calvings.map(c => c.cattleId));
      const calfIdSet = new Set();
      for (const cow of allCattle) {
        const tag = (cow.earTag || '').trim();
        if (!tag) continue;
        let isCalf = false;
        if (calfTagSet.has(tag)) isCalf = true;
        else {
          const num = tag.match(/^\d+/)?.[0];
          if (num && [...calfTagSet].some(t => t.match(/^\d+/)?.[0] === num)) isCalf = true;
        }
        const isMeat = cow.calfType === '肉用牛';
        if (!isCalf && !isMeat) continue;
        if (bredCattleIds.has(cow.id) || damCattleIds.has(cow.id)) continue;
        if (cow.calfType === '繁殖雌牛') continue;
        calfIdSet.add(cow.id);
      }

      const activeCows = allCattle.filter(c => !removedIds.has(c.id) && !calfIdSet.has(c.id));

      // Build shipped cattle list by category
      const shippedCattle = { calf: [], adult: [], small: [], slaughter: [], other: [] };
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
        const dest = s.destination || '';
        if (dest.includes('仔牛') || dest.includes('子牛')) {
          shippedCattle.calf.push(entry);
        } else if (dest.includes('成牛')) {
          shippedCattle.adult.push(entry);
        } else if (dest.includes('スモール')) {
          shippedCattle.small.push(entry);
        } else if (dest.includes('屠場') || dest.includes('と場') || dest.includes('カミチク') || (sale && sale.salesType === '経産牛')) {
          shippedCattle.slaughter.push(entry);
        } else {
          shippedCattle.other.push(entry);
        }
      }
      setShipped(shippedCattle);

      // Calculate stats (CattleListと同ロジック)
      let pregnant = 0, bred = 0, postpartum = 0;
      for (const cow of activeCows) {
        const cowBreedings = breedings.filter(b => b.cattleId === cow.id).sort((a, b) => new Date(b.date) - new Date(a.date));
        const cowPCs = pregnancyChecks.filter(p => p.cattleId === cow.id).sort((a, b) => new Date(b.date) - new Date(a.date));
        const cowCalvings = calvings.filter(c => c.cattleId === cow.id).sort((a, b) => new Date(b.date) - new Date(a.date));
        const lb = cowBreedings[0];
        const lp = cowPCs[0];
        const lc = cowCalvings[0];
        const isPregnant = lp && lb
          && new Date(lp.date) >= new Date(lb.date)
          && lp.result === '受胎'
          && (!lc || new Date(lb.date) > new Date(lc.date));
        const isKuutaiConfirmed = lb && lp
          && new Date(lp.date) >= new Date(lb.date)
          && lp.result !== '受胎'
          && (!lc || new Date(lb.date) > new Date(lc.date));
        if (isPregnant) pregnant++;
        else if (isKuutaiConfirmed) postpartum++; // 空胎鑑定済み → 空胎にカウント
        else if (lb && (!lc || new Date(lb.date) > new Date(lc.date))) bred++;
        else if (lc) postpartum++;
        // 未経産（lcもlbもない or 分娩経験なし）はカウントしない
      }

      setStats({
        total: activeCows.length,
        pregnant,
        bred,
        open: postpartum,
      });

      const heats = await db.heat.toArray();
      const alertList = generateAlerts(activeCows, breedings, pregnancyChecks, calvings, heats);
      setAlerts(alertList);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  const alertCategories = [
    { type: 'estrus', icon: '\u{1F525}', label: '発情周期', color: '#D32F2F' },
    { type: 'next_estrus', icon: '\u{1F514}', label: '次回発情予定', color: '#E91E63' },
    { type: 'pregnancy_check', icon: '\u{1F50D}', label: '妊娠鑑定', color: '#9C27B0' },
    { type: 'sex_determination', icon: '\u{1F52C}', label: '雌雄判別', color: '#F57C00' },
    { type: 'calving_due', icon: '\u{1F476}', label: '分娩予定', color: '#2E7D32' },
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
                    // 分娩予定は [−5日] [+3日] 形式を使う
                    const bracketMatch = alert.message.match(/\[(.+?)\]/);
                    const daysMatch = alert.message.match(/(\d+)日/);
                    const days = bracketMatch ? bracketMatch[1] : (daysMatch ? daysMatch[1] + '日' : '');
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

      <div className="card" id="shipped-section">
        <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => { const v = !showShipped; setShowShipped(v); sessionStorage.setItem('dash_showShipped', v ? '1' : '0'); }}>
          &#x1F69A; 出荷済み ({shipped.calf.length + shipped.adult.length + shipped.small.length + shipped.slaughter.length + shipped.other.length}頭)
          <span style={{ marginLeft: 'auto', fontSize: 14 }}>{showShipped ? '▲' : '▼'}</span>
        </div>
        {showShipped && (
          <div>
            <div className="tabs">
              {[
                ['all', `全て(${shipped.calf.length + shipped.adult.length + shipped.small.length + shipped.slaughter.length + shipped.other.length})`],
                ['calf', `子牛市場(${shipped.calf.length})`],
                ['adult', `成牛市場(${shipped.adult.length})`],
                ['small', `スモール市場(${shipped.small.length})`],
                ['slaughter', `屠場(${shipped.slaughter.length})`],
                ['other', `その他(${shipped.other.length})`],
              ].map(([key, label]) => (
                <button key={key} className={shippedTab === key ? 'active' : ''} onClick={() => { setShippedTab(key); sessionStorage.setItem('dash_shippedTab', key); }}>
                  {label}
                </button>
              ))}
            </div>
            {(() => {
              const list = shippedTab === 'all'
                ? [...shipped.calf, ...shipped.adult, ...shipped.small, ...shipped.slaughter, ...shipped.other]
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
                      {s.buyer && ` / ${s.buyer}`}
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
