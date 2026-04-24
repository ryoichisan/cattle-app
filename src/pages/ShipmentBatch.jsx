import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/database';

const DESTS = ['子牛市場', '成牛市場', '屠場', 'スモール市場', 'その他'];

function emptyRow() {
  return {
    cattleId: '',
    date: '',
    destination: '子牛市場',
    weight: '',
    cost: '',
    buyer: '',
    memo: '',
  };
}

export default function ShipmentBatch() {
  const navigate = useNavigate();
  const [cattleList, setCattleList] = useState([]);
  const [rows, setRows] = useState([emptyRow(), emptyRow(), emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const all = await db.cattle.toArray();
    const shipments = await db.shipment.toArray();
    const deaths = await db.death.toArray();
    const disposals = await db.disposal.toArray();
    const shippedIds = new Set(shipments.map(s => s.cattleId));
    const deadIds = new Set(deaths.map(d => d.cattleId));
    const disposedIds = new Set(disposals.map(d => d.cattleId));
    // 死亡・除籍は除外、出荷済みは除外
    const filtered = all.filter(c =>
      !deadIds.has(c.id) && !disposedIds.has(c.id) && !shippedIds.has(c.id)
    );
    filtered.sort((a, b) => {
      const aNum = parseInt((a.earTag || '').match(/\d+/)?.[0] || '0');
      const bNum = parseInt((b.earTag || '').match(/\d+/)?.[0] || '0');
      return aNum - bNum;
    });
    setCattleList(filtered);
  }

  function updateRow(idx, field, value) {
    setRows(rs => rs.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  function addRow() {
    setRows(rs => [...rs, emptyRow()]);
  }

  function removeRow(idx) {
    setRows(rs => rs.filter((_, i) => i !== idx));
  }

  function formatCurrency(v) {
    const n = String(v).replace(/[^\d]/g, '');
    if (!n) return '';
    return Number(n).toLocaleString();
  }

  async function saveAll() {
    const valid = rows.filter(r => r.cattleId && r.date);
    if (valid.length === 0) {
      setMsg({ type: 'error', text: '個体と出荷日を入力した行がありません。' });
      return;
    }
    setSaving(true);
    try {
      for (const r of valid) {
        await db.shipment.add({
          cattleId: Number(r.cattleId),
          date: r.date,
          destination: r.destination,
          weight: r.weight,
          cost: r.cost.replace(/,/g, ''),
          buyer: r.buyer,
          memo: r.memo,
          worker: '',
        });
      }
      setMsg({ type: 'success', text: `${valid.length}件の出荷記録を保存しました。` });
      setRows([emptyRow(), emptyRow(), emptyRow()]);
      await load();
    } catch (e) {
      setMsg({ type: 'error', text: '保存エラー: ' + e.message });
    }
    setSaving(false);
  }

  return (
    <div>
      <header className="app-header">
        <div className="app-header-row">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button className="back-btn" onClick={() => navigate(-1)}>&larr;</button>
            <h1>出荷 一括入力</h1>
          </div>
        </div>
      </header>

      <div className="card" style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
        家畜市場の伝票を見ながら、上から順に入力してください。<br />
        空の行はそのまま残して大丈夫です（個体と日付を入れた行だけ保存されます）。
      </div>

      {rows.map((r, idx) => (
        <div key={idx} className="card" style={{ marginTop: 8, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 14 }}>#{idx + 1}</strong>
            <button
              type="button"
              onClick={() => removeRow(idx)}
              style={{ background: 'transparent', border: 'none', color: '#D32F2F', cursor: 'pointer', fontSize: 13 }}
            >
              ✕ 削除
            </button>
          </div>

          <div className="form-group" style={{ marginBottom: 8 }}>
            <label>個体 *</label>
            <select value={r.cattleId} onChange={e => updateRow(idx, 'cattleId', e.target.value)}>
              <option value="">選択してください</option>
              {cattleList.map(c => (
                <option key={c.id} value={c.id}>
                  {c.earTag} {c.name && `(${c.name})`}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>出荷日 *</label>
              <input type="date" value={r.date} onChange={e => updateRow(idx, 'date', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>出荷先</label>
              <select value={r.destination} onChange={e => updateRow(idx, 'destination', e.target.value)}>
                {DESTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>体重(kg)</label>
              <input type="number" value={r.weight} onChange={e => updateRow(idx, 'weight', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>金額(¥)</label>
              <input
                type="text"
                inputMode="numeric"
                value={r.cost}
                onChange={e => updateRow(idx, 'cost', formatCurrency(e.target.value))}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 8 }}>
            <label>購買者</label>
            <input type="text" value={r.buyer} onChange={e => updateRow(idx, 'buyer', e.target.value)} />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>メモ</label>
            <input type="text" value={r.memo} onChange={e => updateRow(idx, 'memo', e.target.value)} />
          </div>
        </div>
      ))}

      <button
        className="btn btn-outline btn-block"
        onClick={addRow}
        style={{ marginTop: 12 }}
      >
        ＋ 行を追加
      </button>

      <button
        className="btn btn-primary btn-block"
        onClick={saveAll}
        disabled={saving}
        style={{ marginTop: 12, fontSize: 16 }}
      >
        {saving ? '保存中...' : 'すべて保存'}
      </button>

      {msg && (
        <div style={{
          marginTop: 12, padding: 12, borderRadius: 8,
          background: msg.type === 'success' ? '#E8F5E9' : '#FFEBEE', fontSize: 14
        }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
