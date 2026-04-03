import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import { format, addDays, differenceInDays } from 'date-fns';

export default function CattleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [cow, setCow] = useState(null);
  const [tab, setTab] = useState('info');
  const [timeline, setTimeline] = useState([]);
  const [reproStatus, setReproStatus] = useState(null);

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    const cattleId = Number(id);
    const c = await db.cattle.get(cattleId);
    if (!c) return;
    setCow(c);

    const [breedings, pcs, heats, calvings, treatments, shipments, records, miscarriages] = await Promise.all([
      db.breeding.where('cattleId').equals(cattleId).toArray(),
      db.pregnancyChecks.where('cattleId').equals(cattleId).toArray(),
      db.heat.where('cattleId').equals(cattleId).toArray(),
      db.calving.where('cattleId').equals(cattleId).toArray(),
      db.treatment.where('cattleId').equals(cattleId).toArray(),
      db.shipment.where('cattleId').equals(cattleId).toArray(),
      db.records.where('cattleId').equals(cattleId).toArray(),
      db.miscarriage.where('cattleId').equals(cattleId).toArray(),
    ]);

    // Reproduction status
    const sortedBreedings = [...breedings].sort((a, b) => new Date(b.date) - new Date(a.date));
    const sortedPCs = [...pcs].sort((a, b) => new Date(b.date) - new Date(a.date));
    const sortedCalvings = [...calvings].sort((a, b) => new Date(b.date) - new Date(a.date));
    const lb = sortedBreedings[0];
    const lp = sortedPCs[0];
    const lc = sortedCalvings[0];

    if (lp && lb && new Date(lp.date) >= new Date(lb.date) && lp.result === '受胎') {
      const dueDate = addDays(new Date(lb.date), 285);
      const daysLeft = differenceInDays(dueDate, new Date());
      setReproStatus({
        status: '受胎中',
        detail: `分娩予定日: ${format(dueDate, 'yyyy/M/d')} (あと${daysLeft}日)`,
        cls: 'status-pregnant',
      });
    } else if (lb && (!lc || new Date(lb.date) > new Date(lc.date))) {
      const days = differenceInDays(new Date(), new Date(lb.date));
      setReproStatus({
        status: '授精済（鑑定待ち）',
        detail: `最終授精: ${lb.date} (${days}日前) / ${lb.bullName}`,
        cls: 'status-bred',
      });
    } else if (lc) {
      const days = differenceInDays(new Date(), new Date(lc.date));
      setReproStatus({
        status: '分娩後',
        detail: `最終分娩: ${lc.date} (${days}日前)`,
        cls: 'status-postpartum',
      });
    } else {
      setReproStatus({ status: '空胎', detail: '', cls: 'status-open' });
    }

    // Build timeline
    const events = [];
    breedings.forEach(b => events.push({ date: b.date, type: 'breeding', dot: 'dot-breeding', title: `種付: ${b.bullName || b.method}`, detail: b.memo }));
    pcs.forEach(p => events.push({ date: p.date, type: 'pregnancy', dot: 'dot-pregnancy', title: `妊娠鑑定: ${p.result}`, detail: p.memo }));
    heats.forEach(h => events.push({ date: h.date, type: 'heat', dot: 'dot-heat', title: `発情 ${h.signs || ''}`, detail: h.memo }));
    calvings.forEach(c => events.push({ date: c.date, type: 'calving', dot: 'dot-calving', title: `分娩: ${c.calfSex || ''} ${c.calfWeight ? c.calfWeight + 'kg' : ''}`, detail: c.memo }));
    treatments.forEach(t => events.push({ date: t.date, type: 'treatment', dot: 'dot-treatment', title: `治療: ${t.medicine || t.diseaseName || ''}`, detail: t.memo }));
    shipments.forEach(s => events.push({ date: s.date, type: 'shipment', dot: 'dot-shipment', title: `出荷: ${s.destination || ''}`, detail: s.memo }));
    records.forEach(r => events.push({ date: r.date, type: 'record', dot: 'dot-record', title: `記録 ${r.weight ? r.weight + 'kg' : ''} ${r.bcs ? 'BCS:' + r.bcs : ''}`, detail: r.memo }));
    miscarriages.forEach(m => events.push({ date: m.date, type: 'miscarriage', dot: 'dot-treatment', title: `流産 ${m.category || ''}`, detail: m.memo }));

    events.sort((a, b) => new Date(b.date) - new Date(a.date));
    setTimeline(events);
  }

  if (!cow) return <div className="empty-state">読み込み中...</div>;

  const actions = [
    { icon: '\u{1F525}', label: '発情', type: 'heat' },
    { icon: '\u{1F489}', label: '種付', type: 'breeding' },
    { icon: '\u{1F50D}', label: '妊娠鑑定', type: 'pregnancyCheck' },
    { icon: '\u{1F476}', label: '分娩', type: 'calving' },
    { icon: '\u{1F48A}', label: '治療', type: 'treatment' },
    { icon: '\u{1F4DD}', label: '記録', type: 'record' },
  ];

  return (
    <div>
      <header className="app-header">
        <div className="app-header-row">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button className="back-btn" onClick={() => navigate(-1)}>&larr;</button>
            <h1>{cow.earTag} {cow.name && `(${cow.name})`}</h1>
          </div>
        </div>
      </header>

      {reproStatus && (
        <div className="card" style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`cattle-status ${reproStatus.cls}`} style={{ fontSize: 14, padding: '4px 12px' }}>
              {reproStatus.status}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{reproStatus.detail}</span>
          </div>
        </div>
      )}

      <div className="action-grid">
        {actions.map(a => (
          <button key={a.type} className="action-btn" onClick={() => navigate(`/event/${a.type}/${cow.id}`)}>
            <span className="action-icon">{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>

      <div className="tabs">
        {[['info', '基本情報'], ['timeline', '履歴']].map(([key, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="card">
          <div className="detail-section">
            {[
              ['耳標', cow.earTag],
              ['個体識別番号', cow.individualId],
              ['名前', cow.name],
              ['品種', cow.breed],
              ['毛色', cow.color],
              ['性別', cow.sex],
              ['出生日', cow.birthDate],
              ['出生地', cow.birthPlace],
              ['出生時体重', cow.birthWeight ? cow.birthWeight + ' kg' : ''],
              ['父牛', cow.father],
              ['母の父牛', cow.motherFather],
              ['祖母の父牛', cow.grandmotherFather],
              ['導入元', cow.importSource],
              ['導入価格', cow.importPrice ? `${Number(cow.importPrice).toLocaleString()} 円` : ''],
              ['メモ', cow.memo],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label} className="detail-row">
                <span className="detail-label">{label}</span>
                <span className="detail-value">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'timeline' && (
        <div className="card">
          {timeline.length === 0 ? (
            <div className="empty-state">履歴がありません</div>
          ) : (
            timeline.map((ev, i) => (
              <div key={i} className="timeline-item">
                <div className={`timeline-dot ${ev.dot}`} />
                <div>
                  <div className="timeline-date">{ev.date}</div>
                  <div className="timeline-content">{ev.title}</div>
                  {ev.detail && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{ev.detail}</div>}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
