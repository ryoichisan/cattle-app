import { useEffect } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { db } from './db/database'
import { applyExcelData } from './utils/importExcelData'
import { CALF_TYPES } from './utils/calfTypes'
import { pullAll, installAutoSync } from './utils/sync'
import Dashboard from './pages/Dashboard'
import CattleList from './pages/CattleList'
import CattleDetail from './pages/CattleDetail'
import EventForm from './pages/EventForm'
import Settings from './pages/Settings'
import BreedingStats from './pages/BreedingStats'
import ShipmentBatch from './pages/ShipmentBatch'

// 出生日・出生体重が空の個体を、分娩記録の子牛情報から自動補完
async function fillCalfBirthDates() {
  const calvings = await db.calving.toArray();
  const calvingByNum = {};
  for (const cv of calvings) {
    const num = (cv.calfEarTag || '').match(/\d+/)?.[0];
    if (num) calvingByNum[num] = cv;
  }
  const allCattle = await db.cattle.toArray();
  for (const cattle of allCattle) {
    const tagNum = (cattle.earTag || '').match(/\d+/)?.[0];
    if (!tagNum) continue;
    const match = calvingByNum[tagNum];
    if (!match) continue;
    const update = {};
    if (!cattle.birthDate && match.date) update.birthDate = match.date;
    if (!cattle.birthWeight && match.calfWeight) update.birthWeight = match.calfWeight;
    if (!cattle.birthMemo && match.calfMemo) update.birthMemo = match.calfMemo;
    if (Object.keys(update).length) await db.cattle.update(cattle.id, update);
  }
}

// 分娩記録から子牛の個体を自動作成（番号部分でマッチ、重複防止）
function tagNumber(t) {
  return (t || '').match(/\d+/)?.[0] || '';
}
async function createCalfCattleFromCalvings() {
  const calvings = await db.calving.toArray();
  const allCattle = await db.cattle.toArray();
  // 既存の重複を削除（同じ番号で type=子牛 の追加分を消す）
  const numToCattle = {};
  for (const c of allCattle) {
    const num = tagNumber(c.earTag);
    if (!num) continue;
    if (!numToCattle[num]) {
      numToCattle[num] = c;
    } else {
      // 子牛タイプの方を削除
      const existing = numToCattle[num];
      const dup = c;
      const toRemove = (dup.type === '子牛') ? dup : (existing.type === '子牛' ? existing : dup);
      await db.cattle.delete(toRemove.id);
      if (toRemove === existing) numToCattle[num] = dup;
    }
  }
  for (const cv of calvings) {
    const tag = (cv.calfEarTag || '').trim();
    if (!tag) continue;
    const num = tagNumber(tag);
    if (!num) continue;
    if (numToCattle[num]) continue;
    if ((cv.category || '').includes('死産') || (cv.category || '').includes('流産')) continue;
    const dam = await db.cattle.get(cv.cattleId);
    const id = await db.cattle.add({
      earTag: tag,
      individualId: cv.calfIndividualId || '',
      name: cv.calfName || '',
      type: '子牛',
      sex: cv.calfSex || '',
      breed: cv.calfBreed || '',
      birthDate: cv.date || '',
      birthWeight: cv.calfWeight || '',
      motherName: dam ? (dam.earTag || '') : '',
      status: 'active',
    });
    numToCattle[num] = { id, earTag: tag, type: '子牛' };
  }
}

// 子牛の父牛を、母牛の種付記録から自動補完（分娩日より前で最も近い種付）
async function fillCalfFathers() {
  const calvings = await db.calving.toArray();
  const breedings = await db.breeding.toArray();
  const allCattle = await db.cattle.toArray();
  const numToCattle = {};
  for (const c of allCattle) {
    const num = (c.earTag || '').match(/\d+/)?.[0];
    if (num) numToCattle[num] = c;
  }
  for (const cv of calvings) {
    const num = (cv.calfEarTag || '').match(/\d+/)?.[0];
    if (!num) continue;
    const calf = numToCattle[num];
    if (!calf || calf.father) continue;
    if (!cv.date) continue;
    const calvingTime = new Date(cv.date).getTime();
    // 母牛の種付記録で、分娩日以前・最も近いもの（180〜310日前を優先）
    const damBreedings = breedings
      .filter(b => b.cattleId === cv.cattleId && b.date && b.bullName)
      .map(b => ({ ...b, diff: calvingTime - new Date(b.date).getTime() }))
      .filter(b => b.diff > 0)
      .sort((a, b) => {
        const aOk = a.diff >= 180 * 86400000 && a.diff <= 310 * 86400000;
        const bOk = b.diff >= 180 * 86400000 && b.diff <= 310 * 86400000;
        if (aOk && !bOk) return -1;
        if (!aOk && bOk) return 1;
        return a.diff - b.diff;
      });
    const match = damBreedings[0];
    if (match) await db.cattle.update(calf.id, { father: match.bullName });
  }
}

// 子牛の calfType を CSV から補完（空の場合のみ、ユーザー編集を尊重）
async function applyCalfTypes() {
  const calvings = await db.calving.toArray();
  for (const cv of calvings) {
    if (cv.calfType) continue;
    const num = (cv.calfEarTag || '').match(/\d+/)?.[0];
    if (!num) continue;
    const t = CALF_TYPES[num];
    if (!t) continue;
    await db.calving.update(cv.id, { calfType: t });
  }
  const allCattle = await db.cattle.toArray();
  for (const c of allCattle) {
    if (c.calfType) continue;
    const num = (c.earTag || '').match(/\d+/)?.[0];
    if (!num) continue;
    const t = CALF_TYPES[num];
    if (!t) continue;
    await db.cattle.update(c.id, { calfType: t });
  }
}

async function applyDataFixes() {
  // 1264, 1268: 繁殖除外 → 成牛市場出荷に変更
  const fixes = [
    { earTags: ['1264(81.0)', '1264'], dest: '成牛市場', date: '2024-06-27' },
    { earTags: ['1268(80.5)', '1268'], dest: '成牛市場', date: '2024-05-19' },
  ];
  for (const fix of fixes) {
    for (const tag of fix.earTags) {
      const cattle = await db.cattle.where('earTag').equals(tag).first();
      if (!cattle) continue;
      const existing = await db.shipment.where('cattleId').equals(cattle.id).first();
      if (!existing) {
        await db.shipment.add({
          cattleId: cattle.id, date: fix.date, destination: fix.dest,
          weight: '', cost: '', memo: '', worker: '',
        });
      }
      break;
    }
  }
}

function App() {
  const location = useLocation()

  useEffect(() => { (async () => {
    // クラウドから最新データを取得（端末間同期）
    try { await pullAll(); } catch (e) { console.warn('sync pull skipped', e); }
    // これ以降の書き込みは自動でクラウドへ送信
    installAutoSync();
    await applyDataFixes();
    await applyExcelData();
    await fillCalfBirthDates();
    await createCalfCattleFromCalvings();
    await applyCalfTypes();
    await fillCalfFathers();
  })(); }, [])
  const isDetail = location.pathname.startsWith('/cattle/')
  const isForm = location.pathname.startsWith('/event')

  return (
    <>
      {!isDetail && !isForm && (
        <header className="app-header fujinote-header">
          <svg className="fujinote-scene" viewBox="0 0 400 110" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="fnSky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fff4e0" />
                <stop offset="60%" stopColor="#f4f8e4" />
                <stop offset="100%" stopColor="#e6f2cf" />
              </linearGradient>
              <clipPath id="fnHillClip">
                <path d="M0,85 Q100,55 200,78 T400,72 L400,110 L0,110 Z" />
              </clipPath>
            </defs>
            <rect width="400" height="110" fill="url(#fnSky)" />
            {/* sunrise behind hill */}
            <circle cx="330" cy="82" r="26" fill="#ffc078" opacity="0.45" />
            <circle cx="330" cy="82" r="20" fill="#ffb04a" />
            {/* hills */}
            <path d="M0,85 Q100,55 200,78 T400,72 L400,110 L0,110 Z" fill="#d9f0b8" />
            <path d="M0,95 Q120,72 240,90 T400,88 L400,110 L0,110 Z" fill="#a8e56c" />
          </svg>
          <div className="app-header-row fujinote-title-row">
            <h1 className="fujinote-title">FUJINOTE</h1>
          </div>
        </header>
      )}

      <main className="main-content container">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cattle" element={<CattleList />} />
          <Route path="/cattle/:id" element={<CattleDetail />} />
          <Route path="/event/:type" element={<EventForm />} />
          <Route path="/event/:type/:cattleId" element={<EventForm />} />
          <Route path="/event/:type/:cattleId/edit/:recordId" element={<EventForm />} />
          <Route path="/stats" element={<BreedingStats />} />
          <Route path="/shipment-batch" element={<ShipmentBatch />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      {!isForm && (
        <nav className="bottom-nav">
          <NavLink to="/" end>
            <span className="nav-icon">&#x1F3E0;</span>
            ホーム
          </NavLink>
          <NavLink to="/cattle">
            <span className="nav-icon">&#x1F404;</span>
            牛一覧
          </NavLink>
          <NavLink to="/event/breeding">
            <span className="nav-icon">&#x2795;</span>
            記録
          </NavLink>
          <NavLink to="/stats">
            <span className="nav-icon">&#x1F4CA;</span>
            成績
          </NavLink>
          <NavLink to="/settings">
            <span className="nav-icon">&#x2699;</span>
            設定
          </NavLink>
        </nav>
      )}
    </>
  )
}

export default App
