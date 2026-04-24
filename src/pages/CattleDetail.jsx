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

    const [breedings, pcs, heats, calvings, treatments, shipments, records, miscarriages, deaths] = await Promise.all([
      db.breeding.where('cattleId').equals(cattleId).toArray(),
      db.pregnancyChecks.where('cattleId').equals(cattleId).toArray(),
      db.heat.where('cattleId').equals(cattleId).toArray(),
      db.calving.where('cattleId').equals(cattleId).toArray(),
      db.treatment.where('cattleId').equals(cattleId).toArray(),
      db.shipment.where('cattleId').equals(cattleId).toArray(),
      db.records.where('cattleId').equals(cattleId).toArray(),
      db.miscarriage.where('cattleId').equals(cattleId).toArray(),
      db.death.where('cattleId').equals(cattleId).toArray(),
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
    breedings.forEach(b => events.push({ date: b.date, type: 'breeding', eventType: 'breeding', recordId: b.id, dot: 'dot-breeding', title: `種付: ${b.bullName || b.method}`, detail: b.memo }));
    pcs.forEach(p => events.push({ date: p.date, type: 'pregnancy', eventType: 'pregnancyCheck', recordId: p.id, dot: 'dot-pregnancy', title: `妊娠鑑定: ${p.result}`, detail: p.memo }));
    heats.forEach(h => events.push({ date: h.date, type: 'heat', eventType: 'heat', recordId: h.id, dot: 'dot-heat', title: `発情 ${h.signs || ''}`, detail: h.memo }));
    calvings.forEach(c => events.push({ date: c.date, type: 'calving', eventType: 'calving', recordId: c.id, dot: 'dot-calving', title: `分娩: ${c.calfSex || ''} ${c.calfWeight ? c.calfWeight + 'kg' : ''}`, detail: c.memo }));
    treatments.forEach(t => events.push({ date: t.date, type: 'treatment', eventType: 'treatment', recordId: t.id, dot: 'dot-treatment', title: `治療: ${t.medicine || t.diseaseName || ''}`, detail: t.memo }));
    shipments.forEach(s => events.push({ date: s.date, type: 'shipment', eventType: 'shipment', recordId: s.id, dot: 'dot-shipment', title: `出荷: ${s.destination || ''}`, detail: s.memo }));
    records.forEach(r => events.push({ date: r.date, type: 'record', eventType: 'record', recordId: r.id, dot: 'dot-record', title: `記録 ${r.weight ? r.weight + 'kg' : ''} ${r.bcs ? 'BCS:' + r.bcs : ''}`, detail: r.memo }));
    miscarriages.forEach(m => events.push({ date: m.date, type: 'miscarriage', eventType: 'miscarriage', recordId: m.id, dot: 'dot-treatment', title: `流産 ${m.category || ''}`, detail: m.memo }));
    deaths.forEach(d => events.push({ date: d.date, type: 'death', eventType: 'death', recordId: d.id, dot: 'dot-treatment', title: `死亡 ${d.reason || ''}`, detail: d.memo }));

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
    { icon: '\u{1F69A}', label: '出荷', type: 'shipment' },
    { icon: '\u{271D}', label: '死亡', type: 'death' },
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
              ['名前', cow.earTag, true],
              ['個体識別番号', cow.individualId, true],
              ['出生日', cow.birthDate, true],
              ['出生体重', cow.birthWeight, true],
              ['母牛', cow.motherName, true],
              ['父牛', cow.father, true],
              ['母の父牛', cow.motherFather, true],
              ['祖母の父牛', cow.grandmotherFather, true],
              ['タイプ', cow.calfType, true],
              ['出生メモ', cow.birthMemo, true],
              ['メモ', cow.memo, true],
            ].map(([label, value]) => (
              <div key={label} className="detail-row">
                <span className="detail-label">{label}</span>
                <span className="detail-value">{value || '—'}</span>
              </div>
            ))}
          </div>
          <button
            className="btn btn-outline btn-block btn-sm"
            style={{ marginTop: 12 }}
            onClick={() => navigate(`/event/registration/${cow.id}/edit/${cow.id}`)}
          >
            &#x270F; 基本情報を編集
          </button>
        </div>
      )}

      {tab === 'timeline' && (
        <div className="card">
          {timeline.length === 0 ? (
            <div className="empty-state">履歴がありません</div>
          ) : (
            timeline.map((ev, i) => (
              <div
                key={i}
                className="timeline-item"
                style={{ cursor: ev.recordId ? 'pointer' : 'default' }}
                onClick={() => {
                  if (ev.recordId && ev.eventType) {
                    navigate(`/event/${ev.eventType}/${cow.id}/edit/${ev.recordId}`);
                  }
                }}
              >
                <div className={`timeline-dot ${ev.dot}`} />
                <div style={{ flex: 1 }}>
                  <div className="timeline-date">{ev.date}</div>
                  <div className="timeline-content">{ev.title}</div>
                  {ev.detail && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{ev.detail}</div>}
                </div>
                {ev.recordId && (
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', alignSelf: 'center' }}>&#x270F;</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
