import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/database';

export default function CattleList() {
  const navigate = useNavigate();
  const [cattle, setCattle] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [statusMap, setStatusMap] = useState({});

  useEffect(() => { loadCattle(); }, []);

  async function loadCattle() {
    const allCattle = await db.cattle.toArray();
    const breedings = await db.breeding.toArray();
    const pcs = await db.pregnancyChecks.toArray();
    const calvings = await db.calving.toArray();
    const disposals = await db.disposal.toArray();
    const shipments = await db.shipment.toArray();
    const disposedIds = new Set(disposals.map(d => d.cattleId));
    const shippedIds = new Set(shipments.map(s => s.cattleId));

    const sMap = {};
    for (const cow of allCattle) {
      if (shippedIds.has(cow.id)) { sMap[cow.id] = 'shipped'; continue; }
      if (disposedIds.has(cow.id)) { sMap[cow.id] = 'disposed'; continue; }
      const cowBreedings = breedings.filter(b => b.cattleId === cow.id).sort((a, b) => new Date(b.date) - new Date(a.date));
      const cowPCs = pcs.filter(p => p.cattleId === cow.id).sort((a, b) => new Date(b.date) - new Date(a.date));
      const lb = cowBreedings[0];
      const lp = cowPCs[0];
      if (lp && lb && new Date(lp.date) >= new Date(lb.date) && lp.result === '受胎') {
        sMap[cow.id] = 'pregnant';
      } else if (lb) {
        const cowCalvings = calvings.filter(c => c.cattleId === cow.id).sort((a, b) => new Date(b.date) - new Date(a.date));
        if (!cowCalvings[0] || new Date(lb.date) > new Date(cowCalvings[0].date)) {
          sMap[cow.id] = 'bred';
        } else { sMap[cow.id] = 'open'; }
      } else { sMap[cow.id] = 'open'; }
    }
    setStatusMap(sMap);
    setCattle(allCattle.filter(c => c.type === '繁殖雌牛' || c.type === ''));
  }

  const sorted = [...cattle].sort((a, b) => {
    // ちよを一番上に
    if (a.name === 'ちよ') return -1;
    if (b.name === 'ちよ') return 1;
    // 耳標番号の数字部分で昇順ソート
    const numA = parseInt((a.earTag || '').match(/^\d+/)?.[0]) || 0;
    const numB = parseInt((b.earTag || '').match(/^\d+/)?.[0]) || 0;
    return numA - numB;
  });

  const filtered = sorted.filter(c => {
    const status = statusMap[c.id];
    if (filter === 'all' && (status === 'disposed' || status === 'shipped')) return false;
    if (filter === 'pregnant' && status !== 'pregnant') return false;
    if (filter === 'open' && status !== 'open' && status !== 'bred') return false;
    if (filter === 'shipped' && status !== 'shipped') return false;
    if (filter === 'disposed' && status !== 'disposed') return false;
    if (search) {
      const q = search.toLowerCase();
      return (c.earTag || '').toLowerCase().includes(q)
        || (c.name || '').toLowerCase().includes(q)
        || (c.individualId || '').includes(q);
    }
    return true;
  });

  const statusLabel = {
    pregnant: { text: '受胎', cls: 'status-pregnant' },
    bred: { text: '授精済', cls: 'status-bred' },
    open: { text: '空胎', cls: 'status-open' },
    shipped: { text: '出荷済', cls: '' },
    disposed: { text: '除籍', cls: '' },
  };

  return (
    <div>
      <input
        className="search-box"
        placeholder="耳標・名前で検索..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div className="tabs">
        {[['all', '飼養中'], ['pregnant', '受胎'], ['open', '空胎'], ['shipped', '出荷済'], ['disposed', '除籍']].map(([key, label]) => (
          <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>
      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">&#x1F404;</div>
            <div>牛が見つかりません</div>
          </div>
        ) : (
          filtered.map(cow => {
            const s = statusLabel[statusMap[cow.id]] || { text: '', cls: '' };
            return (
              <div key={cow.id} className="cattle-item" onClick={() => navigate(`/cattle/${cow.id}`)}>
                <div className="cattle-avatar">
                  {(cow.earTag || '?').slice(-3)}
                </div>
                <div className="cattle-info">
                  <div className="cattle-ear-tag">{cow.earTag} {cow.name && <span style={{ fontWeight: 400, fontSize: 13 }}>({cow.name})</span>}</div>
                  <div className="cattle-sub">
                    {cow.individualId && `ID: ${cow.individualId}`}
                    {cow.father && ` / 父: ${cow.father}`}
                  </div>
                </div>
                {s.text && <span className={`cattle-status ${s.cls}`}>{s.text}</span>}
              </div>
            );
          })
        )}
      </div>

      <button className="fab" onClick={() => navigate('/event/registration')}>+</button>
    </div>
  );
}
