/**
 * 豊肥子牛市場データ自動更新スクリプト
 * JA全農おおいたのウェブページから最新PDFを取得し、
 * Claude AIでデータを抽出してmarket-data.jsonを更新します。
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, '../public/market-data.json');
const NEWS_URL = 'https://www.zennoh.or.jp/ot/farming/livestockinfo/news.html';
const BASE_URL = 'https://www.zennoh.or.jp';

// PDFページを取得して最新のPDFリンクを探す
async function findLatestPdfUrl() {
  console.log('📄 JA全農おおいたのページを取得中...');
  const res = await fetch(NEWS_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; market-updater)' }
  });
  if (!res.ok) throw new Error(`ページ取得失敗: HTTP ${res.status}`);
  const html = await res.text();

  // ssi/フォルダのPDFリンクを全て抽出
  const matches = [...html.matchAll(/href="([^"]*ssi\/[^"]*\.pdf)"/gi)];
  const urls = matches.map(m => {
    const u = m[1];
    return u.startsWith('http') ? u : `${BASE_URL}${u}`;
  });

  if (urls.length === 0) throw new Error('PDFリンクが見つかりませんでした');

  console.log(`🔗 ${urls.length}件のPDFリンクを検出。最新: ${urls[0]}`);
  return urls[0];
}

// PDFをダウンロードしてClaudeで豊肥子牛市場データを抽出
async function extractMarketData(pdfUrl) {
  console.log(`📥 PDFをダウンロード中: ${pdfUrl}`);
  const pdfRes = await fetch(pdfUrl);
  if (!pdfRes.ok) throw new Error(`PDF取得失敗: HTTP ${pdfRes.status}`);
  const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
  const base64 = pdfBuffer.toString('base64');

  console.log('🤖 Claudeでデータを抽出中...');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 }
        },
        {
          type: 'text',
          text: `このJA全農おおいた市場速報PDFから豊肥子牛市場の「今回成績」（今月分）を抽出してください。

1. PDFヘッダーの日付（例：令和8年4月12日）からyearとmonthを取得
2. 豊肥子牛市場の今回取引結果（メインの表）から雌・去・計の「取引頭数」「平均価格」「平均体重」を取得
3. 前回成績や玖珠子牛市場のデータは使わないでください

JSONのみを返してください（説明文不要）:
{"year":2026,"month":4,"female":{"count":182,"price":844371,"weight":290},"castrated":{"count":210,"price":956660,"weight":316},"total":{"count":393,"price":904206,"weight":304}}`
        }
      ]
    }]
  });

  const text = message.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('JSONが見つかりません: ' + text.substring(0, 200));

  const data = JSON.parse(jsonMatch[0]);
  console.log(`✅ 抽出完了: ${data.year}年${data.month}月`);
  return data;
}

// 月次データから年間加重平均を計算
function calcAnnual(monthly, year) {
  const months = Object.entries(monthly)
    .filter(([k]) => k.startsWith(String(year)))
    .map(([, v]) => v);
  if (months.length === 0) return null;

  const wa = (arr, nk, vk) => {
    let n = 0, s = 0, nw = 0, sw = 0;
    for (const m of arr) {
      const d = m[nk];
      if (!d) continue;
      n += d.n || 0;
      s += (d.n || 0) * (d[vk] || 0);
      if (d.w) { nw += d.n || 0; sw += (d.n || 0) * d.w; }
    }
    return {
      p: n > 0 ? Math.round(s / n) : null,
      w: nw > 0 ? Math.round(sw / nw) : null
    };
  };

  return {
    f: wa(months, 'f', 'p'),
    c: wa(months, 'c', 'p'),
    t: wa(months, 't', 'p'),
    months: months.length
  };
}

async function main() {
  // 現在のデータを読み込む
  const current = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));

  // 最新PDFのURLを取得
  const pdfUrl = await findLatestPdfUrl();

  // データを抽出
  const newData = await extractMarketData(pdfUrl);

  // 月キーを作成（例: "2026-04"）
  const monthKey = `${newData.year}-${String(newData.month).padStart(2, '0')}`;

  // 既存データのチェック
  if (current.monthly[monthKey]) {
    console.log(`ℹ️  ${monthKey} のデータは既に存在します。スキップします。`);
    return;
  }

  // 月次データを追加
  current.monthly[monthKey] = {
    f: { n: newData.female.count,   p: newData.female.price,   w: newData.female.weight },
    c: { n: newData.castrated.count, p: newData.castrated.price, w: newData.castrated.weight },
    t: { n: newData.total.count,    p: newData.total.price,    w: newData.total.weight }
  };

  // 当該年の年間平均を再計算して annual に反映
  const yr = String(newData.year);
  const annual = calcAnnual(current.monthly, yr);
  if (annual) {
    current.annual[yr] = {
      f: annual.f,
      c: annual.c,
      t: annual.t,
      months: annual.months
    };
  }

  current.lastUpdated = new Date().toISOString().substring(0, 10);

  // JSONを保存
  writeFileSync(DATA_FILE, JSON.stringify(current, null, 2) + '\n', 'utf-8');
  console.log(`💾 market-data.json を更新しました（${monthKey} 追加）`);
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});
