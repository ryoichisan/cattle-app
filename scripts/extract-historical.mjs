/**
 * 2022〜2024年 豊肥子牛市場 過去PDFデータ一括抽出スクリプト
 * 各月のPDFをダウンロードしClaudeで価格・体重を抽出してmarket-data.jsonに追記します
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, '../public/market-data.json');
const BASE_URL = 'https://www.zennoh.or.jp';

// 2022〜2024年 子牛市場速報PDFリスト（年月 → URLパス）
const HISTORICAL_PDFS = {
  '2022-01': '/ot/farming/livestockinfo/ssi/%E2%98%85r04_01_1.pdf',
  '2022-02': '/ot/farming/livestockinfo/ssi/r04_02_1.pdf',
  '2022-03': '/ot/farming/livestockinfo/ssi/2203_%E5%AD%90%E7%89%9B.pdf',
  '2022-04': '/ot/farming/livestockinfo/ssi/2204_%E5%AD%90%E7%89%9B.pdf',
  '2022-05': '/ot/farming/livestockinfo/ssi/2205_%E5%AD%90%E7%89%9B.pdf',
  '2022-06': '/ot/farming/livestockinfo/ssi/20220612%E5%AD%90%E7%89%9B%E5%B8%82%E5%A0%B4%E9%80%9F%E5%A0%B1.pdf',
  '2022-07': '/ot/farming/livestockinfo/ssi/2207_%E5%AD%90%E7%89%9B.pdf',
  '2022-08': '/ot/farming/livestockinfo/ssi/2208_%E5%AD%90%E7%89%9B.pdf',
  '2022-09': '/ot/farming/livestockinfo/ssi/%E2%98%86%E5%B8%82%E5%A0%B4%E9%80%9F%E5%A0%B1%E4%BB%A4%E5%92%8C4%E5%B9%B4%E5%AD%90%E7%89%9B9%E6%9C%88.pdf',
  '2022-10': '/ot/farming/livestockinfo/ssi/2210_%E5%AD%90%E7%89%9B.pdf',
  '2022-11': '/ot/farming/livestockinfo/ssi/2211_%E5%AD%90%E7%89%9B.pdf',
  '2022-12': '/ot/farming/livestockinfo/ssi/2212_%E5%AD%90%E7%89%9B.pdf',
  '2023-01': '/ot/farming/livestockinfo/ssi/2301_%E5%AD%90%E7%89%9B.pdf',
  '2023-02': '/ot/farming/livestockinfo/ssi/2302_%E5%AD%90%E7%89%9B.pdf',
  '2023-03': '/ot/farming/livestockinfo/ssi/2303_%E5%AD%90%E7%89%9B.pdf',
  '2023-04': '/ot/farming/livestockinfo/ssi/%E2%98%86%E5%B8%82%E5%A0%B4%E9%80%9F%E5%A0%B1%E4%BB%A4%E5%92%8C5%E5%B9%B44%E6%9C%88.pdf',
  '2023-05': '/ot/farming/livestockinfo/ssi/%E2%98%86%E5%B8%82%E5%A0%B4%E9%80%9F%E5%A0%B1%E4%BB%A4%E5%92%8C5%E5%B9%B45%E6%9C%88.pdf',
  '2023-06': '/ot/farming/livestockinfo/ssi/%E2%98%86%E5%B8%82%E5%A0%B4%E9%80%9F%E5%A0%B1%E4%BB%A4%E5%92%8C5%E5%B9%B46%E6%9C%88.pdf',
  '2023-07': '/ot/farming/livestockinfo/ssi/%E2%98%86%E5%B8%82%E5%A0%B4%E9%80%9F%E5%A0%B1%E4%BB%A4%E5%92%8C5%E5%B9%B47%E6%9C%88.pdf',
  '2023-08': '/ot/farming/livestockinfo/ssi/%E2%98%86%E5%B8%82%E5%A0%B4%E9%80%9F%E5%A0%B1%E4%BB%A4%E5%92%8C5%E5%B9%B48%E6%9C%88.pdf',
  '2023-09': '/ot/farming/livestockinfo/ssi/%E2%98%86%E5%B8%82%E5%A0%B4%E9%80%9F%E5%A0%B1%E4%BB%A4%E5%92%8C5%E5%B9%B409.pdf',
  '2023-10': '/ot/farming/livestockinfo/ssi/%E2%98%86%E5%B8%82%E5%A0%B4%E9%80%9F%E5%A0%B1%E4%BB%A4%E5%92%8C5%E5%B9%B410%E6%9C%88.pdf',
  '2023-11': '/ot/farming/livestockinfo/ssi/%E2%98%86%E5%B8%82%E5%A0%B4%E9%80%9F%E5%A0%B1%E4%BB%A4%E5%92%8C5%E5%B9%B411%E6%9C%88.pdf',
  '2023-12': '/ot/farming/livestockinfo/ssi/%E2%98%86%E5%B8%82%E5%A0%B4%E9%80%9F%E5%A0%B1%E4%BB%A4%E5%92%8C5%E5%B9%B412%E6%9C%88.pdf',
  '2024-01': '/ot/farming/livestockinfo/ssi/%E2%98%86%E5%B8%82%E5%A0%B4%E9%80%9F%E5%A0%B1%E4%BB%A4%E5%92%8C6%E5%B9%B41%E6%9C%88.pdf',
  '2024-02': '/ot/farming/livestockinfo/ssi/%E2%98%86%E5%B8%82%E5%A0%B4%E9%80%9F%E5%A0%B1%E4%BB%A4%E5%92%8C6%E5%B9%B42%E6%9C%88.pdf',
  '2024-03': '/ot/farming/livestockinfo/ssi/%E2%98%86%E5%B8%82%E5%A0%B4%E9%80%9F%E5%A0%B1%E4%BB%A4%E5%92%8C6%E5%B9%B4202403.pdf',
  '2024-04': '/ot/farming/livestockinfo/ssi/%E5%AD%90%E7%89%9B%E5%B8%82%E5%A0%B44%E6%9C%88%EF%BC%91%EF%BC%96.pdf',
  '2024-05': '/ot/farming/livestockinfo/ssi/%E5%AD%90%E7%89%9B%E5%B8%82%E5%A0%B4%E9%80%9F%E5%A0%B1%E4%BA%94%E6%9C%88%E5%AD%90%E7%89%9B.pdf',
  '2024-06': '/ot/farming/livestockinfo/ssi/%E5%AD%90%E7%89%9B%E5%B8%82%E5%A0%B4%E9%80%9F%E5%A0%B1%E4%BB%A4%E5%92%8C6%E5%B9%B46%E6%9C%88%E5%AD%90%E7%89%9B%E5%B8%82%E5%A0%B4.pdf',
  '2024-07': '/ot/farming/livestockinfo/ssi/%E5%AD%90%E7%89%9B%E5%B8%82%E5%A0%B47%E6%9C%88.pdf',
  '2024-08': '/ot/farming/livestockinfo/ssi/8%E6%9C%88%E5%B8%82%E6%B3%81.pdf',
  '2024-09': '/ot/farming/livestockinfo/ssi/%E5%AD%90%E7%89%9B%E5%B8%82%E5%A0%B4%E9%80%9F%E5%A0%B1202409.pdf',
  '2024-10': '/ot/farming/livestockinfo/ssi/%E5%AD%90%E7%89%9B%E5%B8%82%E5%A0%B4%E9%80%9F%E5%A0%B120241012.pdf',
  '2024-11': '/ot/farming/livestockinfo/ssi/%E5%AD%90%E7%89%9B%E5%B8%82%E5%A0%B4%E9%80%9F%E5%A0%B120241113.pdf',
  '2024-12': '/ot/farming/livestockinfo/ssi/%E5%AD%90%E7%89%9B%E5%B8%82%E5%A0%B4%E9%80%9F%E5%A0%B120241213.pdf',
};

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

async function extractFromPdf(pdfUrl, monthKey, client) {
  console.log(`  📥 ダウンロード中: ${pdfUrl}`);
  const res = await fetch(pdfUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; market-updater)' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const base64 = buf.toString('base64');

  const [year, month] = monthKey.split('-').map(Number);

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 }
        },
        {
          type: 'text',
          text: `このJA全農おおいた市場速報PDF（${year}年${month}月分）から豊肥子牛市場の「今回成績」のみを抽出してください。
前回成績・前年同期成績・玖珠子牛市場のデータは使わないでください。

豊肥子牛市場 今回成績から:
- 雌の「取引頭数」「平均価格(円)」「平均体重(kg)」
- 去（去勢）の「取引頭数」「平均価格(円)」「平均体重(kg)」
- 計の「取引頭数」「平均価格(円)」「平均体重(kg)」

JSONのみ返してください:
{"female":{"count":180,"price":500000,"weight":280},"castrated":{"count":220,"price":620000,"weight":305},"total":{"count":400,"price":568000,"weight":294}}`
        }
      ]
    }]
  });

  const text = message.content[0].text.trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('JSONが見つかりません: ' + text.substring(0, 100));

  const d = JSON.parse(jsonMatch[0]);
  return {
    f: { n: d.female.count,    p: d.female.price,    w: d.female.weight },
    c: { n: d.castrated.count, p: d.castrated.price, w: d.castrated.weight },
    t: { n: d.total.count,     p: d.total.price,     w: d.total.weight }
  };
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY が設定されていません');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  const data = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));

  const entries = Object.entries(HISTORICAL_PDFS).sort(([a], [b]) => a.localeCompare(b));
  let added = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`\n🐄 過去データ一括抽出開始（${entries.length}ヶ月分）\n`);

  for (const [monthKey, path] of entries) {
    // 既存データはスキップ（ただし体重データがない場合は上書き）
    const existing = data.monthly[monthKey];
    if (existing && existing.f?.w && existing.c?.w && existing.t?.w) {
      console.log(`⏭  ${monthKey} スキップ（体重データ済み）`);
      skipped++;
      continue;
    }

    const url = BASE_URL + path;
    try {
      console.log(`\n📋 ${monthKey} 処理中...`);
      const extracted = await extractFromPdf(url, monthKey, client);
      data.monthly[monthKey] = extracted;
      console.log(`  ✅ ${monthKey}: 雌${extracted.f.w}kg 去${extracted.c.w}kg 計${extracted.t.w}kg`);
      added++;

      // 進捗保存（途中でも安全）
      writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + '\n', 'utf-8');

      // レート制限対策（1秒待機）
      await sleep(1000);
    } catch (err) {
      console.error(`  ❌ ${monthKey} 失敗: ${err.message}`);
      failed++;
      await sleep(2000);
    }
  }

  // 年間平均を再計算（2022〜2024）
  console.log('\n📊 年間平均を再計算中...');
  for (const yr of ['2022', '2023', '2024']) {
    const annual = calcAnnual(data.monthly, yr);
    if (annual && annual.months > 0) {
      const existing = data.annual[yr] || {};
      data.annual[yr] = {
        f: { p: annual.f.p ?? existing.f?.p, w: annual.f.w },
        c: { p: annual.c.p ?? existing.c?.p, w: annual.c.w },
        t: { p: annual.t.p ?? existing.t?.p, w: annual.t.w },
        months: annual.months
      };
      console.log(`  ${yr}: 雌${annual.f.w}kg 去${annual.c.w}kg 計${annual.t.w}kg（${annual.months}ヶ月）`);
    }
  }

  data.lastUpdated = new Date().toISOString().substring(0, 10);
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + '\n', 'utf-8');

  console.log(`\n✨ 完了！ 追加:${added}件 スキップ:${skipped}件 失敗:${failed}件`);
}

main().catch(err => {
  console.error('❌ エラー:', err.message);
  process.exit(1);
});
