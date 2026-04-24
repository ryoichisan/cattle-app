import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/database';

export default function CattleList() {
  const navigate = useNavigate();
  const [cattle, setCattle] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [statusMap, setStatusMap] = useState({});
  const [sortInfoMap, setSortInfoMap] = useState({});
  const [calfIds, setCalfIds] = useState(new Set());
  const [damIds, setDamIds] = useState(new Set());

  useEffect(() => { loadCattle(); }, []);

  async function loadCattle() {
    const allCattle = await db.cattle.toArray();
    const breedings = await db.breeding.toArray();
    const pcs = await db.pregnancyChecks.toArray();
    const calvings = await db.calving.toArray();
    const disposals = await db.disposal.toArray();
    const shipments = await db.shipment.toArray();
    const deaths = await db.death.toArray();
    const disposedIds = new Set(disposals.map(d => d.cattleId));
    const shippedIds = new Set(shipments.map(s => s.cattleId));
    const deadIds = new Set(deaths.map(d => d.cattleId));

    // 子牛判定: 分娩記録の calfEarTag に一致する個体は子牛
    const calfTagSet = new Set();
    for (const c of calvings) {
      const t = (c.calfEarTag || '').trim();
      if (t) calfTagSet.add(t);
    }
    // 繁殖雌牛になった個体（自身の種付や分娩記録がある）は子牛から除外
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
      // タイプが肉用牛 → 必ず子牛扱い
      const isMeat = cow.calfType === '肉用牛';
      if (!isCalf && !isMeat) continue;
      // 自身が種付・分娩されている = 繁殖雌牛として育っている
      if (bredCattleIds.has(cow.id) || damCattleIds.has(cow.id)) continue;
      // タイプが繁殖雌牛 → 子牛から除外
      if (cow.calfType === '繁殖雌牛') continue;
      calfIdSet.add(cow.id);
    }
    setCalfIds(calfIdSet);
    setDamIds(damCattleIds);

    const sMap = {};
    const siMap = {};
    for (const cow of allCattle) {
      if (deadIds.has(cow.id)) { sMap[cow.id] = 'dead'; continue; }
      if (shippedIds.has(cow.id)) { sMap[cow.id] = 'shipped'; continue; }
      if (disposedIds.has(cow.id)) { sMap[cow.id] = 'disposed'; continue; }
      const cowBreedings = breedings.filter(b => b.cattleId === cow.id).sort((a, b) => new Date(b.date) - new Date(a.date));
      const cowPCs = pcs.filter(p => p.cattleId === cow.id).sort((a, b) => new Date(b.date) - new Date(a.date));
      const cowCalvings = calvings.filter(c => c.cattleId === cow.id).sort((a, b) => new Date(b.date) - new Date(a.date));
      const lb = cowBreedings[0];
      const lp = cowPCs[0];
      const lc = cowCalvings[0];

      // 受胎判定されていても、その後に分娩していれば受胎ではない
      const isPregnant = lp && lb
        && new Date(lp.date) >= new Date(lb.date)
        && lp.result === '受胎'
        && (!lc || new Date(lb.date) > new Date(lc.date));

      // 最新授精後に妊娠鑑定で空胎確認されているか
      const isKuutaiConfirmed = lb && lp
        && new Date(lp.date) >= new Date(lb.date)
        && lp.result !== '受胎'
        && (!lc || new Date(lb.date) > new Date(lc.date));

      if (isPregnant) {
        sMap[cow.id] = 'pregnant';
        const dueDate = new Date(lb.date);
        dueDate.setDate(dueDate.getDate() + 285);
        siMap[cow.id] = { dueDate, breedingDate: new Date(lb.date) };
      } else if (isKuutaiConfirmed) {
        // 授精済みだが空胎鑑定済み → 空胎
        sMap[cow.id] = 'open';
        siMap[cow.id] = { calvingDate: lc ? new Date(lc.date) : null };
      } else if (lb && (!lc || new Date(lb.date) > new Date(lc.date))) {
        sMap[cow.id] = 'bred';
        siMap[cow.id] = { breedingDate: new Date(lb.date) };
      } else if (lc) {
        sMap[cow.id] = 'open';
        siMap[cow.id] = { calvingDate: new Date(lc.date) };
      } else {
        // 分娩未経験 = 未経産
        sMap[cow.id] = 'heifer';
        siMap[cow.id] = {};
      }
    }
    setStatusMap(sMap);
    setSortInfoMap(siMap);
    setCattle(allCattle);
  }

  const today = new Date();

  // 様々な日付形式に対応するパース関数
  function parseDate(str) {
    if (!str) return null;
    // "2020-05-10" or "2020/05/10" or "2020/5/10"
    const m = str.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    // そのまま試す
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  const sorted = [...cattle].sort((a, b) => {
    // フィルターごとの並び替え
    const siA = sortInfoMap[a.id] || {};
    const siB = sortInfoMap[b.id] || {};

    if (filter === 'pregnant') {
      // 分娩予定日が近い順（早い日付が上）
      const dA = siA.dueDate ? siA.dueDate.getTime() : Infinity;
      const dB = siB.dueDate ? siB.dueDate.getTime() : Infinity;
      return dA - dB;
    }
    if (filter === 'bred') {
      // 授精日からの経過日数が多い順（古い日付が上）
      const dA = siA.breedingDate ? siA.breedingDate.getTime() : Infinity;
      const dB = siB.breedingDate ? siB.breedingDate.getTime() : Infinity;
      return dA - dB;
    }
    if (filter === 'open') {
      // 分娩日からの経過日数が多い順（古い日付が上）
      const dA = siA.calvingDate ? siA.calvingDate.getTime() : Infinity;
      const dB = siB.calvingDate ? siB.calvingDate.getTime() : Infinity;
      return dA - dB;
    }

    // デフォルト（飼養中など）: 生年月日が古い順、なければ耳標番号の小さい順
    const dateA = parseDate(a.birthDate);
    const dateB = parseDate(b.birthDate);
    if (dateA && dateB) return dateA.getTime() - dateB.getTime();
    if (dateA && !dateB) return -1;
    if (!dateA && dateB) return 1;
    const numA = parseInt((a.earTag || '').match(/^\d+/)?.[0]) || 0;
    const numB = parseInt((b.earTag || '').match(/^\d+/)?.[0]) || 0;
    return numA - numB;
  });

  const filtered = sorted.filter(c => {
    const status = statusMap[c.id];
    const isCalf = calfIds.has(c.id);
    // 繁殖雌牛タブ: 子牛・出荷済・除籍を除外
    if (filter === 'all') {
      if (isCalf) return false;
      if (status === 'disposed' || status === 'shipped' || status === 'dead') return false;
    }
    if (filter === 'pregnant' && (status !== 'pregnant' || isCalf)) return false;
    if (filter === 'bred' && (status !== 'bred' || isCalf)) return false;
    if (filter === 'open' && (status !== 'open' || isCalf)) return false;
    if (filter === 'heifer') {
      // 未経産: タイプ=繁殖雌牛、分娩経験なし、出荷/除籍/死亡を除外
      if (c.calfType !== '繁殖雌牛') return false;
      if (damIds.has(c.id)) return false;
      if (status === 'shipped' || status === 'disposed' || status === 'dead') return false;
    }
    if (filter === 'calf') {
      if (!isCalf) return false;
      if (status === 'shipped' || status === 'disposed' || status === 'dead') return false;
    }
    if (filter === 'disposed' && status !== 'disposed') return false;
    if (filter === 'dead' && status !== 'dead') return false;
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
    heifer: { text: '未経産', cls: 'status-open' },
    shipped: { text: '出荷済', cls: '' },
    disposed: { text: '除籍', cls: '' },
    dead: { text: '死亡', cls: '' },
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
        {[['all', '繁殖雌牛'], ['pregnant', '受胎'], ['bred', '授精済'], ['open', '空胎'], ['heifer', '未経産'], ['calf', '子牛'], ['dead', '死亡'], ['disposed', '除籍']].map(([key, label]) => (
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
            const si = sortInfoMap[cow.id] || {};
            const status = statusMap[cow.id];
            // 日数情報を生成
            let daysInfo = '';
            if (status === 'pregnant' && si.dueDate) {
              const daysLeft = Math.ceil((si.dueDate - today) / (1000 * 60 * 60 * 24));
              const m = si.dueDate.getMonth() + 1;
              const d = si.dueDate.getDate();
              daysInfo = daysLeft > 0 ? `予定日 ${m}/${d}（あと${daysLeft}日）` : `予定日超過${Math.abs(daysLeft)}日`;
            } else if (status === 'bred' && si.breedingDate) {
              const days = Math.floor((today - si.breedingDate) / (1000 * 60 * 60 * 24));
              daysInfo = `授精後${days}日`;
            } else if (status === 'open' && si.calvingDate) {
              const days = Math.floor((today - si.calvingDate) / (1000 * 60 * 60 * 24));
              daysInfo = `分娩後${days}日`;
            }
            return (
              <div key={cow.id} className="cattle-item" onClick={() => navigate(`/cattle/${cow.id}`)}>
                <div className="cattle-avatar">
                  {(cow.earTag || '?').slice(-3)}
                </div>
                <div className="cattle-info">
                  <div className="cattle-ear-tag">{cow.earTag} {cow.name && <span style={{ fontWeight: 400, fontSize: 13 }}>({cow.name})</span>}</div>
                  <div className="cattle-sub">
                    {daysInfo || (cow.individualId && `ID: ${cow.individualId}`) || ''}
                    {!daysInfo && cow.father && ` / 父: ${cow.father}`}
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
