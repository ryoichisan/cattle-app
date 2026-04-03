import { useState } from 'react';
import { db } from '../db/database';
import { importAllCSVFiles } from '../utils/csvImport';
import { exportAllData, importAllData } from '../utils/dataSync';

export default function Settings() {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [counts, setCounts] = useState(null);
  const [syncMsg, setSyncMsg] = useState(null);

  async function handleImport(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await importAllCSVFiles(Array.from(files));
      setResult(res);
      await loadCounts();
    } catch (err) {
      setResult({ success: 0, errors: [err.message] });
    }
    setImporting(false);
  }

  async function loadCounts() {
    setCounts({
      cattle: await db.cattle.count(),
      breeding: await db.breeding.count(),
      pregnancyChecks: await db.pregnancyChecks.count(),
      heat: await db.heat.count(),
      calving: await db.calving.count(),
      treatment: await db.treatment.count(),
      shipment: await db.shipment.count(),
    });
  }

  async function handleClearData() {
    if (!confirm('全てのデータを削除しますか？この操作は元に戻せません。')) return;
    await db.delete();
    await db.open();
    setCounts(null);
    setResult(null);
    alert('データを削除しました。');
  }

  useState(() => { loadCounts(); }, []);

  return (
    <div>
      <div className="card">
        <div className="card-header">&#x1F4C1; CSVデータインポート</div>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
          ファームノートからエクスポートしたCSVファイル（Shift-JIS）をまとめて選択してください。
          ZIPファイルの場合は解凍してからCSVファイルを選択してください。
        </p>
        <label className="btn btn-primary btn-block" style={{ position: 'relative' }}>
          {importing ? 'インポート中...' : 'CSVファイルを選択'}
          <input
            type="file"
            accept=".csv"
            multiple
            onChange={handleImport}
            style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', top: 0, left: 0, cursor: 'pointer' }}
            disabled={importing}
          />
        </label>

        {result && (
          <div style={{ marginTop: 12, padding: 12, background: result.errors.length > 0 ? '#FFF3E0' : '#E8F5E9', borderRadius: 8 }}>
            <div style={{ fontWeight: 600 }}>
              {result.success}個のファイルをインポートしました
            </div>
            {result.errors.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 13, color: 'var(--danger)' }}>
                エラー:
                {result.errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
          </div>
        )}
      </div>

      {counts && (
        <div className="card">
          <div className="card-header">&#x1F4CA; データ件数</div>
          {[
            ['牛個体', counts.cattle],
            ['種付記録', counts.breeding],
            ['妊娠鑑定', counts.pregnancyChecks],
            ['発情記録', counts.heat],
            ['分娩記録', counts.calving],
            ['治療記録', counts.treatment],
            ['出荷記録', counts.shipment],
          ].map(([label, count]) => (
            <div key={label} className="detail-row">
              <span className="detail-label">{label}</span>
              <span className="detail-value">{count} 件</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-header">&#x1F504; データの書き出し・読み込み</div>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
          パソコンとスマホでデータを共有できます。<br />
          ① 片方の端末で「データを書き出す」<br />
          ② もう片方の端末で「データを読み込む」
        </p>
        <button
          className="btn btn-primary btn-block"
          style={{ marginBottom: 8 }}
          onClick={async () => {
            try {
              const res = await exportAllData();
              setSyncMsg({ type: 'success', text: 'データを書き出しました。ダウンロードされたファイルをもう一方の端末に送ってください。' });
            } catch (e) {
              setSyncMsg({ type: 'error', text: 'エラー: ' + e.message });
            }
          }}
        >
          &#x1F4E4; データを書き出す（バックアップ）
        </button>
        <label className="btn btn-outline btn-block" style={{ position: 'relative' }}>
          &#x1F4E5; データを読み込む（復元）
          <input
            type="file"
            accept=".json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (!confirm('現在のデータは上書きされます。よろしいですか？')) return;
              try {
                const res = await importAllData(file);
                setSyncMsg({ type: 'success', text: `データを読み込みました（元の書き出し日: ${new Date(res.importDate).toLocaleString('ja-JP')}）` });
                await loadCounts();
              } catch (e) {
                setSyncMsg({ type: 'error', text: 'エラー: ' + e.message });
              }
              e.target.value = '';
            }}
            style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', top: 0, left: 0, cursor: 'pointer' }}
          />
        </label>
        {syncMsg && (
          <div style={{ marginTop: 12, padding: 12, background: syncMsg.type === 'success' ? '#E8F5E9' : '#FFF3E0', borderRadius: 8, fontSize: 14 }}>
            {syncMsg.text}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">&#x26A0; データ管理</div>
        <button className="btn btn-danger btn-block" onClick={handleClearData}>
          全データを削除
        </button>
      </div>

      <div className="card">
        <div className="card-header">&#x2139; このアプリについて</div>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          黒毛和牛繁殖管理アプリ v1.0<br />
          データはブラウザ内（IndexedDB）に保存されます。<br />
          ブラウザのデータを消去すると、アプリのデータも消去されますのでご注意ください。
        </p>
      </div>
    </div>
  );
}
