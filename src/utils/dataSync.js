import { db } from '../db/database';

const TABLE_NAMES = [
  'cattle', 'breeding', 'pregnancyChecks', 'heat', 'calving',
  'miscarriage', 'treatment', 'shipment', 'sales', 'disposal',
  'records', 'movement'
];

/**
 * 全データをJSON形式でエクスポート（ダウンロード）
 */
export async function exportAllData() {
  const data = {};
  for (const name of TABLE_NAMES) {
    data[name] = await db[name].toArray();
  }
  data._exportDate = new Date().toISOString();
  data._version = '1.0';

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  a.href = url;
  a.download = `cattle_backup_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { tableCount: TABLE_NAMES.length, exportDate: data._exportDate };
}

/**
 * JSONファイルからデータをインポート（上書き）
 */
export async function importAllData(file) {
  const text = await file.text();
  const data = JSON.parse(text);

  if (!data._version) {
    throw new Error('このファイルはバックアップファイルではありません');
  }

  // 全テーブルをクリアしてからインポート
  for (const name of TABLE_NAMES) {
    if (data[name] && Array.isArray(data[name])) {
      await db[name].clear();
      // idフィールドを保持したままインポート
      await db[name].bulkPut(data[name]);
    }
  }

  return {
    importDate: data._exportDate,
    tables: TABLE_NAMES.filter(n => data[n] && data[n].length > 0)
      .map(n => `${n}: ${data[n].length}件`),
  };
}
