import { doc, getDoc, setDoc } from 'firebase/firestore';
import { fdb, FARM_ID } from '../db/firebase';
import { db } from '../db/database';

const TABLES = [
  'cattle', 'breeding', 'pregnancyChecks', 'heat', 'calving',
  'miscarriage', 'treatment', 'shipment', 'sales', 'disposal',
  'records', 'movement', 'death',
];

let pushTimer = null;
let isPulling = false;

// すべてのデータをクラウドへアップロード
export async function pushAll() {
  const payload = {};
  for (const t of TABLES) {
    try { payload[t] = await db[t].toArray(); } catch { payload[t] = []; }
  }
  payload.updatedAt = Date.now();
  await setDoc(doc(fdb, 'farms', FARM_ID), payload);
  localStorage.setItem('lastSyncAt', String(payload.updatedAt));
  return payload.updatedAt;
}

// クラウドから取得してローカルを置き換え
export async function pullAll() {
  isPulling = true;
  try {
    const snap = await getDoc(doc(fdb, 'farms', FARM_ID));
    if (!snap.exists()) return null;
    const data = snap.data();
    for (const t of TABLES) {
      if (!Array.isArray(data[t])) continue;
      await db[t].clear();
      if (data[t].length > 0) await db[t].bulkPut(data[t]);
    }
    localStorage.setItem('lastSyncAt', String(data.updatedAt || Date.now()));
    return data.updatedAt;
  } finally {
    isPulling = false;
  }
}

// 書き込みがあると自動で（少し待ってから）クラウドへ送る
export function schedulePush() {
  if (isPulling) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushAll().catch(e => console.error('sync push failed', e));
  }, 2000);
}

// Dexie の書き込みフックに登録
export function installAutoSync() {
  for (const t of TABLES) {
    try {
      db[t].hook('creating', () => { schedulePush(); });
      db[t].hook('updating', () => { schedulePush(); });
      db[t].hook('deleting', () => { schedulePush(); });
    } catch (e) {
      // テーブルが無い場合などは無視
    }
  }
}
