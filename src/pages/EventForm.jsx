import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../db/database';

const EVENT_CONFIG = {
  breeding: {
    title: '種付記録',
    fields: [
      { name: 'date', label: '日付', type: 'date', required: true },
      { name: 'method', label: '種付方法', type: 'select', options: ['人工授精', '本交', '受精卵移植'] },
      { name: 'bullName', label: '種雄牛名', type: 'text' },
      { name: 'time', label: '種付時刻', type: 'time' },
      { name: 'position', label: '授精位置', type: 'text' },
      { name: 'memo', label: 'メモ', type: 'textarea' },
      { name: 'worker', label: '作業者', type: 'text' },
    ],
    table: 'breeding',
  },
  heat: {
    title: '発情記録',
    fields: [
      { name: 'date', label: '日付', type: 'date', required: true },
      { name: 'signs', label: '発情兆候', type: 'select', options: ['', 'スタンディング', '乗駕行動', '粘液排出', '外陰部充血・腫脹', 'その他'] },
      { name: 'etPlan', label: '受精卵移植予定', type: 'select', options: [['false', 'いいえ'], ['true', 'はい']] },
      { name: 'memo', label: 'メモ（子宮・卵巣の状況等）', type: 'textarea' },
      { name: 'worker', label: '作業者', type: 'text' },
    ],
    table: 'heat',
  },
  pregnancyCheck: {
    title: '妊娠鑑定',
    fields: [
      { name: 'date', label: '日付', type: 'date', required: true },
      { name: 'result', label: '受胎状況', type: 'select', options: ['受胎', '空胎', '不明'], required: true },
      { name: 'sexDetermination', label: '雌雄判別', type: 'select', options: ['雄♂', '雌♀', '不明'] },
      { name: 'memo', label: 'メモ', type: 'textarea' },
      { name: 'worker', label: '作業者', type: 'text' },
    ],
    table: 'pregnancyChecks',
  },
  calving: {
    title: '分娩記録',
    fields: [
      { name: 'date', label: '分娩日', type: 'date', required: true },
      { name: 'category', label: '分類', type: 'select', options: ['出産', '死産'] },
      { name: 'difficulty', label: '分娩難易', type: 'select', options: ['自然分娩', '軽度介助', '重度介助', '帝王切開'] },
      { name: 'time', label: '分娩時刻', type: 'time' },
      { name: 'calfEarTag', label: '子牛耳標', type: 'text' },
      { name: 'calfSex', label: '子牛性別', type: 'select', options: ['オス', 'メス'] },
      { name: 'calfType', label: 'タイプ', type: 'select', options: ['肉用牛', '繁殖雌牛', '乳用種'] },
      { name: 'calfBreed', label: '子牛品種', type: 'select', options: ['黒毛和種', 'その他'] },
      { name: 'calfWeight', label: '子牛体重(kg)', type: 'number' },
      { name: 'calfMemo', label: '子牛メモ', type: 'textarea' },
      { name: 'memo', label: 'メモ', type: 'textarea' },
      { name: 'worker', label: '作業者', type: 'text' },
    ],
    table: 'calving',
  },
  treatment: {
    title: '治療記録',
    fields: [
      { name: 'date', label: '日付', type: 'date', required: true },
      { name: 'diseaseName', label: '疾病名', type: 'text' },
      { name: 'bodyTemp', label: '体温', type: 'text' },
      { name: 'category', label: '治療区分', type: 'select', options: ['治療', '繁殖治療', '予防', 'ワクチン'] },
      { name: 'status', label: 'ステータス', type: 'select', options: ['', '開始', '経過', '完了', '要注意'] },
      { name: 'medicine', label: '投薬名', type: 'text' },
      { name: 'quantity', label: '数量', type: 'text' },
      { name: 'adminRoute', label: '投薬区分', type: 'select', options: ['', '筋肉注射', '皮下注射', '静脈注射', '子宮内投与', '経口投与', '外用'] },
      { name: 'memo', label: 'メモ', type: 'textarea' },
      { name: 'worker', label: '作業者', type: 'text' },
    ],
    table: 'treatment',
  },
  record: {
    title: '記録',
    fields: [
      { name: 'date', label: '日付', type: 'date', required: true },
      { name: 'weight', label: '体重(kg)', type: 'number' },
      { name: 'bcs', label: 'BCS', type: 'text' },
      { name: 'memo', label: 'メモ', type: 'textarea' },
      { name: 'worker', label: '作業者', type: 'text' },
    ],
    table: 'records',
  },
  death: {
    title: '死亡記録',
    fields: [
      { name: 'date', label: '死亡日', type: 'date', required: true },
      { name: 'ageAtDeath', label: '死亡日齢', type: 'computedAge' },
      { name: 'reason', label: '死亡理由', type: 'textarea' },
    ],
    table: 'death',
  },
  shipment: {
    title: '出荷記録',
    fields: [
      { name: 'date', label: '出荷日', type: 'date', required: true },
      { name: 'destination', label: '出荷先', type: 'select', options: ['子牛市場', '成牛市場', '屠場', 'スモール市場', 'その他'] },
      { name: 'ageAtShipment', label: '出荷時日齢', type: 'computedAge' },
      { name: 'weight', label: '体重(kg)', type: 'number' },
      { name: 'cost', label: '金額', type: 'currency' },
      { name: 'buyer', label: '購買者', type: 'text' },
      { name: 'memo', label: 'メモ', type: 'textarea' },
      { name: 'worker', label: '作業者', type: 'text' },
    ],
    table: 'shipment',
  },
  registration: {
    title: '個体登録',
    fields: [
      { name: 'earTag', label: '名前（耳標番号）', type: 'text', required: true },
      { name: 'individualId', label: '個体識別番号', type: 'text' },
      { name: 'sex', label: '性別', type: 'select', options: ['メス', 'オス'] },
      { name: 'birthDate', label: '出生日', type: 'date' },
      { name: 'birthWeight', label: '出生体重', type: 'text' },
      { name: 'father', label: '父牛', type: 'text' },
      { name: 'motherName', label: '母牛', type: 'text' },
      { name: 'motherFather', label: '母の父牛', type: 'text' },
      { name: 'grandmotherFather', label: '祖母の父牛', type: 'text' },
      { name: 'calfType', label: 'タイプ', type: 'select', options: ['肉用牛', '繁殖雌牛', '乳用種'] },
      { name: 'birthMemo', label: '出生メモ', type: 'textarea' },
      { name: 'memo', label: 'メモ', type: 'textarea' },
    ],
    table: 'cattle',
    isRegistration: true,
  },
};

export default function EventForm() {
  const { type, cattleId, recordId } = useParams();
  const navigate = useNavigate();
  const config = EVENT_CONFIG[type];
  const [form, setForm] = useState({});
  const [cattle, setCattle] = useState(null);
  const [cattleList, setCattleList] = useState([]);
  const [selectedCattleId, setSelectedCattleId] = useState(cattleId ? Number(cattleId) : '');
  const [saving, setSaving] = useState(false);
  const isEdit = !!recordId;

  useEffect(() => {
    if (!config) return;

    if (isEdit) {
      // 編集モード: 既存データを読み込む
      db[config.table].get(Number(recordId)).then(async record => {
        if (record) {
          const data = { ...record };
          if (data.twins !== undefined) data.twins = String(data.twins);
          if (data.etPlan !== undefined) data.etPlan = String(data.etPlan);
          // 出荷の金額が空なら sales.totalAmount から補完
          if (type === 'shipment' && !data.cost && data.cattleId) {
            const sale = await db.sales.where('cattleId').equals(data.cattleId).first();
            if (sale && sale.totalAmount) data.cost = String(sale.totalAmount);
          }
          setForm(data);
        }
      });
    } else {
      // 新規モード: デフォルト値
      const defaults = {};
      config.fields.forEach(f => {
        if (f.type === 'date') defaults[f.name] = new Date().toISOString().split('T')[0];
        else defaults[f.name] = '';
      });
      setForm(defaults);
    }

    if (!config.isRegistration) {
      db.cattle.toArray().then(list => {
        setCattleList(list.filter(c => c.type === '繁殖雌牛' || c.type === ''));
      });
    }

    if (cattleId) {
      db.cattle.get(Number(cattleId)).then(c => setCattle(c));
    }
  }, [type, cattleId, recordId]);

  if (!config) return <div>不明なイベントタイプです</div>;

  function handleChange(name, value) {
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (config.isRegistration) {
        if (isEdit) {
          await db.cattle.update(Number(recordId), { ...form });
          navigate(`/cattle/${recordId}`, { replace: true });
        } else {
          const id = await db.cattle.add({ ...form, status: 'active' });
          navigate(`/cattle/${id}`, { replace: true });
        }
      } else {
        const targetId = selectedCattleId || Number(cattleId);
        if (!targetId) { alert('牛を選択してください'); setSaving(false); return; }
        const data = { ...form, cattleId: targetId };
        if (data.twins !== undefined) data.twins = data.twins === 'true';
        if (data.etPlan !== undefined) data.etPlan = data.etPlan === 'true';

        if (isEdit) {
          await db[config.table].update(Number(recordId), data);
        } else {
          await db[config.table].add(data);
        }
        // 分娩記録: 出産の場合は子牛を個体として追加、死産/流産の場合は追加しない
        if (type === 'calving' && data.calfEarTag) {
          const cat = data.category || '';
          if (!cat.includes('死産') && !cat.includes('流産')) {
            const tag = data.calfEarTag.trim();
            const tagNum = tag.match(/\d+/)?.[0];
            const allCattle = await db.cattle.toArray();
            const exists = allCattle.find(c => {
              const n = (c.earTag || '').match(/\d+/)?.[0];
              return n && n === tagNum;
            });
            const dam = await db.cattle.get(targetId);
            const payload = {
              earTag: tag,
              individualId: data.calfIndividualId || '',
              name: data.calfName || '',
              type: '子牛',
              sex: data.calfSex || '',
              breed: data.calfBreed || '',
              calfType: data.calfType || '',
              birthDate: data.date || '',
              birthWeight: data.calfWeight || '',
              birthMemo: data.calfMemo || '',
              motherName: dam ? (dam.earTag || '') : '',
              status: 'active',
            };
            if (exists) {
              const upd = {};
              for (const [k, v] of Object.entries(payload)) {
                if (v && !exists[k]) upd[k] = v;
              }
              // タイプは編集を尊重しつつ、空なら設定
              if (data.calfType && !exists.calfType) upd.calfType = data.calfType;
              if (Object.keys(upd).length) await db.cattle.update(exists.id, upd);
            } else {
              await db.cattle.add(payload);
            }
          }
        }
        navigate(cattleId ? `/cattle/${cattleId}` : '/', { replace: true });
      }
    } catch (err) {
      alert('保存に失敗しました: ' + err.message);
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm('この記録を削除しますか？この操作は元に戻せません。')) return;
    try {
      await db[config.table].delete(Number(recordId));
      navigate(cattleId ? `/cattle/${cattleId}` : '/', { replace: true });
    } catch (err) {
      alert('削除に失敗しました: ' + err.message);
    }
  }

  return (
    <div>
      <header className="app-header">
        <div className="app-header-row">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <button className="back-btn" onClick={() => navigate(-1)}>&larr;</button>
            <h1>{isEdit ? `${config.title}の修正` : config.title}</h1>
          </div>
        </div>
      </header>

      {cattle && (
        <div className="card" style={{ marginTop: 8 }}>
          対象: <strong>{cattle.earTag}</strong> {cattle.name && `(${cattle.name})`}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ marginTop: 12 }}>
        {!config.isRegistration && !cattleId && (
          <div className="form-group">
            <label>対象牛 *</label>
            <select
              value={selectedCattleId}
              onChange={e => setSelectedCattleId(Number(e.target.value))}
              required
            >
              <option value="">選択してください</option>
              {cattleList.map(c => (
                <option key={c.id} value={c.id}>{c.earTag} {c.name && `(${c.name})`}</option>
              ))}
            </select>
          </div>
        )}

        {config.fields.map(field => (
          <div key={field.name} className="form-group">
            <label>{field.label} {field.required && '*'}</label>
            {field.type === 'textarea' ? (
              <textarea
                value={form[field.name] || ''}
                onChange={e => handleChange(field.name, e.target.value)}
                placeholder={field.label}
              />
            ) : field.type === 'select' ? (
              <select
                value={form[field.name] || ''}
                onChange={e => handleChange(field.name, e.target.value)}
                required={field.required}
              >
                <option value="">選択してください</option>
                {field.options.map(opt => {
                  const [val, label] = Array.isArray(opt) ? opt : [opt, opt];
                  return <option key={val} value={val}>{label}</option>;
                })}
                {(() => {
                  const cur = form[field.name];
                  if (!cur) return null;
                  const vals = field.options.map(o => Array.isArray(o) ? o[0] : o);
                  if (vals.includes(cur)) return null;
                  return <option key={cur} value={cur}>{cur}</option>;
                })()}
              </select>
            ) : field.type === 'computedAge' ? (
              <input
                type="text"
                readOnly
                value={(() => {
                  if (!cattle?.birthDate || !form.date) return '';
                  const b = new Date(cattle.birthDate);
                  const d = new Date(form.date);
                  if (isNaN(b) || isNaN(d)) return '';
                  const days = Math.floor((d - b) / 86400000);
                  return days >= 0 ? `${days}日` : '';
                })()}
                placeholder="出生日から自動計算"
              />
            ) : field.type === 'currency' ? (
              <input
                type="text"
                inputMode="numeric"
                value={(() => {
                  const v = form[field.name];
                  if (v === '' || v === null || v === undefined) return '';
                  const num = String(v).replace(/[^\d]/g, '');
                  if (!num) return '';
                  return '¥' + Number(num).toLocaleString('ja-JP');
                })()}
                onChange={e => {
                  const digits = e.target.value.replace(/[^\d]/g, '');
                  handleChange(field.name, digits);
                }}
                placeholder={field.label}
              />
            ) : (
              <input
                type={field.type}
                value={form[field.name] || ''}
                onChange={e => handleChange(field.name, e.target.value)}
                required={field.required}
                placeholder={field.label}
              />
            )}
          </div>
        ))}

        <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
          {saving ? '保存中...' : (isEdit ? '修正を保存' : '保存')}
        </button>

        {isEdit && (
          <button
            type="button"
            className="btn btn-danger btn-block"
            style={{ marginTop: 8 }}
            onClick={handleDelete}
          >
            この記録を削除
          </button>
        )}
      </form>
    </div>
  );
}
