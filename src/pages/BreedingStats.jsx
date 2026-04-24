import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/database';
import { differenceInDays } from 'date-fns';

// 豊肥子牛市場 年間加重平均価格（フォールバック用）
// female=雌, male=去（去勢）, all=計  ※頭数加重平均
// allWeight/femaleWeight/maleWeight = 平均体重(kg)
// months = 集計月数（12未満は途中経過）
const DEFAULT_MARKET_AVGS = {
  '2022': { all: 657319, female: 594413, male: 700441 },
  '2023': { all: 558366, female: 490893, male: 605165 },
  '2024': { all: 491239, female: 433093, male: 533199 },
  '2025': { all: 632705, female: 565436, male: 683671, allWeight: 299, femaleWeight: 285, maleWeight: 310, months: 12 },
  '2026': { all: 826966, female: 771695, male: 867720, allWeight: 303, femaleWeight: 287, maleWeight: 311, months: 4 },
};

// market-data.json の月別データから年間加重平均を計算する
function calcAnnualFromMonthly(monthly, year) {
  const months = Object.entries(monthly)
    .filter(([k]) => k.startsWith(String(year)))
    .map(([, v]) => v);
  if (months.length === 0) return null;
  const wa = (nk, vk) => {
    let n = 0, s = 0, nw = 0, sw = 0;
    for (const m of months) {
      const d = m[nk]; if (!d) continue;
      n += d.n || 0; s += (d.n || 0) * (d[vk] || 0);
      if (d.w) { nw += d.n || 0; sw += (d.n || 0) * d.w; }
    }
    return { p: n > 0 ? Math.round(s / n) : null, w: nw > 0 ? Math.round(sw / nw) : null };
  };
  return { f: wa('f','p'), c: wa('c','p'), t: wa('t','p'), months: months.length };
}

export default function BreedingStats() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('individual');
  const [cowStats, setCowStats] = useState([]);
  const [yearlyStats, setYearlyStats] = useState([]);
  const [salesStats, setSalesStats] = useState([]);
  const [salesDest, setSalesDest] = useState('子牛市場');
  const [marketAvgs, setMarketAvgs] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('toyohi_market_avgs') || 'null');
      // デフォルト値をベースに、手動で入力済みの実際の値だけ上書きする
      const result = { ...DEFAULT_MARKET_AVGS };
      if (saved && typeof saved === 'object') {
        Object.entries(saved).forEach(([yr, v]) => {
          if (v && (v.all || v.female || v.male)) {
            result[yr] = v;
          }
        });
      }
      return result;
    } catch { return DEFAULT_MARKET_AVGS; }
  });
  const [editingMarket, setEditingMarket] = useState(false);
  const [marketInput, setMarketInput] = useState({});
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('earTag');
  const [sortAsc, setSortAsc] = useState(true);
  const [costInputs, setCostInputs] = useState({});
  const [savingCost, setSavingCost] = useState({});
  const [lossStats, setLossStats] = useState([]);

  useEffect(() => { loadStats(); }, []);
  useEffect(() => { if (!loading) { loadSalesStats(salesDest); loadLossStats(); } }, [salesDest, loading]);

  // market-data.json を取得して市場平均を更新（体重データ含む）
  useEffect(() => {
    fetch(`/market-data.json?t=${Date.now()}`)
      .then(r => r.json())
      .then(data => {
        const avgs = { ...DEFAULT_MARKET_AVGS };
        // annual セクション（2022〜2024の固定データ）を適用
        for (const [yr, d] of Object.entries(data.annual || {})) {
          avgs[yr] = {
            female: d.f?.p || null, male: d.c?.p || null, all: d.t?.p || null,
            femaleWeight: d.f?.w || null, maleWeight: d.c?.w || null, allWeight: d.t?.w || null,
            months: d.months || 12,
          };
        }
        // monthly セクションから年間平均を計算（2025以降）
        const years = [...new Set(Object.keys(data.monthly || {}).map(k => k.substring(0,4)))];
        for (const yr of years) {
          const calc = calcAnnualFromMonthly(data.monthly, yr);
          if (!calc) continue;
          avgs[yr] = {
            female: calc.f.p, male: calc.c.p, all: calc.t.p,
            femaleWeight: calc.f.w, maleWeight: calc.c.w, allWeight: calc.t.w,
            months: calc.months,
          };
        }
        // localStorage の手動入力値（価格のみ）で上書き
        try {
          const saved = JSON.parse(localStorage.getItem('toyohi_market_avgs') || 'null');
          if (saved) {
            for (const [yr, v] of Object.entries(saved)) {
              if (v && (v.all || v.female || v.male)) {
                avgs[yr] = { ...(avgs[yr] || {}), ...v };
              }
            }
          }
        } catch {}
        setMarketAvgs(avgs);
      })
      .catch(() => {}); // エラー時はデフォルト値を維持
  }, []);

  async function loadStats() {
    try {
      const allCattle = await db.cattle.toArray();
      const breedings = await db.breeding.toArray();
      const pcs = await db.pregnancyChecks.toArray();
      const calvings = await db.calving.toArray();
      const shipments = await db.shipment.toArray();
      const deaths = await db.death.toArray();
      const disposals = await db.disposal.toArray();

      // 除外ID
      const removedIds = new Set([
        ...shipments.map(s => s.cattleId),
        ...deaths.map(d => d.cattleId),
        ...disposals.map(d => d.cattleId),
      ]);

      // 子牛を除外（分娩記録の子牛タグに一致 or calfType=肉用牛）
      const calfTagNums = new Set();
      for (const c of calvings) {
        const num = (c.calfEarTag || '').match(/\d+/)?.[0];
        if (num) calfTagNums.add(num);
      }
      const breedingCattle = allCattle.filter(cow => {
        const num = (cow.earTag || '').match(/\d+/)?.[0];
        if (!num) return false;
        if (cow.calfType === '肉用牛') return false;
        // 繁殖雌牛のみ（分娩や種付の経験がある、またはcalfType=繁殖雌牛）
        const hasBreeding = breedings.some(b => b.cattleId === cow.id);
        const hasCalving = calvings.some(c => c.cattleId === cow.id);
        if (cow.calfType === '繁殖雌牛') return true;
        if (hasBreeding || hasCalving) return true;
        return false;
      });

      // === 個体別成績 ===
      const individualStats = [];
      for (const cow of breedingCattle) {
        const cowBreedings = breedings
          .filter(b => b.cattleId === cow.id)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        const cowPCs = pcs
          .filter(p => p.cattleId === cow.id)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        const cowCalvings = calvings
          .filter(c => c.cattleId === cow.id)
          .sort((a, b) => new Date(a.date) - new Date(b.date));

        // 授精回数
        const totalBreedings = cowBreedings.length;

        // 受胎回数（受胎と鑑定された回数）
        let conceptions = 0;
        for (const pc of cowPCs) {
          if (pc.result === '受胎') conceptions++;
        }

        // 受胎率
        const conceptionRate = totalBreedings > 0 ? Math.round((conceptions / totalBreedings) * 100) : null;

        // 平均授精回数（受胎までに何回授精したか）
        let totalAIPerConception = 0;
        let conceptionCount = 0;
        for (const pc of cowPCs) {
          if (pc.result !== '受胎') continue;
          const pcDate = new Date(pc.date);
          // この受胎に関連する授精を探す（受胎鑑定前の授精群）
          const prevConception = cowPCs
            .filter(p => p.result === '受胎' && new Date(p.date) < pcDate)
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
          const prevCalving = cowCalvings
            .filter(c => new Date(c.date) < pcDate)
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
          const afterDate = prevCalving ? new Date(prevCalving.date) :
                           prevConception ? new Date(prevConception.date) : null;
          const aiCount = cowBreedings.filter(b => {
            const bd = new Date(b.date);
            return bd <= pcDate && (!afterDate || bd > afterDate);
          }).length;
          if (aiCount > 0) {
            totalAIPerConception += aiCount;
            conceptionCount++;
          }
        }
        const avgAIPerConception = conceptionCount > 0 ? (totalAIPerConception / conceptionCount).toFixed(1) : null;

        // 空胎日数（分娩から次の受胎授精日まで）
        const openDaysList = [];
        for (let i = 0; i < cowCalvings.length; i++) {
          const calvingDate = new Date(cowCalvings[i].date);
          // この分娩後の最初の受胎
          const nextConceptionPC = cowPCs
            .filter(p => p.result === '受胎' && new Date(p.date) > calvingDate)
            .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
          if (nextConceptionPC) {
            // 受胎に対応する授精日を探す
            const conceptionBreeding = cowBreedings
              .filter(b => new Date(b.date) > calvingDate && new Date(b.date) <= new Date(nextConceptionPC.date))
              .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            if (conceptionBreeding) {
              const days = differenceInDays(new Date(conceptionBreeding.date), calvingDate);
              if (days > 0) openDaysList.push(days);
            }
          }
        }
        const avgOpenDays = openDaysList.length > 0 ? Math.round(openDaysList.reduce((a, b) => a + b, 0) / openDaysList.length) : null;

        // 分娩間隔
        const calvingIntervals = [];
        for (let i = 1; i < cowCalvings.length; i++) {
          const days = differenceInDays(new Date(cowCalvings[i].date), new Date(cowCalvings[i - 1].date));
          if (days > 0) calvingIntervals.push(days);
        }
        const avgCalvingInterval = calvingIntervals.length > 0 ? Math.round(calvingIntervals.reduce((a, b) => a + b, 0) / calvingIntervals.length) : null;

        // 在胎期間（受胎授精日から分娩日まで）
        const gestationList = [];
        for (const cv of cowCalvings) {
          const calvingDate = new Date(cv.date);
          // 分娩前の最後の受胎鑑定
          const matchPC = cowPCs
            .filter(p => p.result === '受胎' && new Date(p.date) < calvingDate)
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
          if (matchPC) {
            // その受胎鑑定前の直近授精
            const matchBreeding = cowBreedings
              .filter(b => new Date(b.date) <= new Date(matchPC.date))
              .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            if (matchBreeding) {
              const days = differenceInDays(calvingDate, new Date(matchBreeding.date));
              if (days > 100 && days < 400) gestationList.push(days);
            }
          }
        }
        const avgGestation = gestationList.length > 0 ? Math.round(gestationList.reduce((a, b) => a + b, 0) / gestationList.length) : null;

        // 子牛の平均出生体重
        const calfWeights = cowCalvings
          .map(c => parseFloat(c.calfWeight))
          .filter(w => !isNaN(w) && w > 0);
        const avgCalfWeight = calfWeights.length > 0 ? (calfWeights.reduce((a, b) => a + b, 0) / calfWeights.length).toFixed(1) : null;

        // 産子数
        const calfCount = cowCalvings.filter(c => {
          const cat = c.category || '';
          return !cat.includes('死産') && !cat.includes('流産');
        }).length;

        const isRemoved = removedIds.has(cow.id);

        individualStats.push({
          id: cow.id,
          earTag: cow.earTag,
          name: cow.name || '',
          isRemoved,
          totalBreedings,
          conceptions,
          conceptionRate,
          avgAIPerConception,
          avgOpenDays,
          avgCalvingInterval,
          avgGestation,
          avgCalfWeight,
          calfCount,
        });
      }
      setCowStats(individualStats);

      // === 年度別成績 ===
      const years = new Set();
      breedings.forEach(b => { if (b.date) years.add(new Date(b.date).getFullYear()); });
      calvings.forEach(c => { if (c.date) years.add(new Date(c.date).getFullYear()); });
      const sortedYears = [...years].sort((a, b) => b - a);

      const yearlyData = [];
      for (const year of sortedYears) {
        const yearBreedings = breedings.filter(b => b.date && new Date(b.date).getFullYear() === year);
        const yearPCs = pcs.filter(p => p.date && new Date(p.date).getFullYear() === year);
        const yearCalvings = calvings.filter(c => c.date && new Date(c.date).getFullYear() === year);

        const totalAI = yearBreedings.length;
        const yearConceptions = yearPCs.filter(p => p.result === '受胎').length;
        const yearConceptionRate = totalAI > 0 ? Math.round((yearConceptions / totalAI) * 100) : null;
        const yearCalvingCount = yearCalvings.filter(c => {
          const cat = c.category || '';
          return !cat.includes('死産') && !cat.includes('流産');
        }).length;

        // 平均空胎日数（その年に受胎した牛）
        const yearOpenDays = [];
        for (const pc of yearPCs) {
          if (pc.result !== '受胎') continue;
          const pcDate = new Date(pc.date);
          const cowCalvingsBefore = calvings
            .filter(c => c.cattleId === pc.cattleId && new Date(c.date) < pcDate)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
          if (cowCalvingsBefore.length === 0) continue;
          const lastCalving = cowCalvingsBefore[0];
          const cowBreedingsBefore = breedings
            .filter(b => b.cattleId === pc.cattleId && new Date(b.date) > new Date(lastCalving.date) && new Date(b.date) <= pcDate)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
          if (cowBreedingsBefore.length > 0) {
            const days = differenceInDays(new Date(cowBreedingsBefore[0].date), new Date(lastCalving.date));
            if (days > 0) yearOpenDays.push(days);
          }
        }
        const avgYearOpenDays = yearOpenDays.length > 0 ? Math.round(yearOpenDays.reduce((a, b) => a + b, 0) / yearOpenDays.length) : null;

        // 平均分娩間隔（その年に分娩した牛の前回分娩との差）
        const yearIntervals = [];
        for (const cv of yearCalvings) {
          const prevCalving = calvings
            .filter(c => c.cattleId === cv.cattleId && new Date(c.date) < new Date(cv.date))
            .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
          if (prevCalving) {
            const days = differenceInDays(new Date(cv.date), new Date(prevCalving.date));
            if (days > 0) yearIntervals.push(days);
          }
        }
        const avgYearInterval = yearIntervals.length > 0 ? Math.round(yearIntervals.reduce((a, b) => a + b, 0) / yearIntervals.length) : null;

        // 平均出生体重
        const yearWeights = yearCalvings
          .map(c => parseFloat(c.calfWeight))
          .filter(w => !isNaN(w) && w > 0);
        const avgYearWeight = yearWeights.length > 0 ? (yearWeights.reduce((a, b) => a + b, 0) / yearWeights.length).toFixed(1) : null;

        yearlyData.push({
          year,
          totalAI,
          conceptions: yearConceptions,
          conceptionRate: yearConceptionRate,
          calvingCount: yearCalvingCount,
          avgOpenDays: avgYearOpenDays,
          avgCalvingInterval: avgYearInterval,
          avgCalfWeight: avgYearWeight,
        });
      }
      setYearlyStats(yearlyData);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function loadSalesStats(destFilter) {
    const shipments = await db.shipment.toArray();
    const allCattle = await db.cattle.toArray();
    const cattleMap = {};
    allCattle.forEach(c => { cattleMap[c.id] = c; });

    // 出荷先フィルター
    const filtered = shipments.filter(s => {
      const dest = s.destination || '';
      if (destFilter === '全て') return true;
      if (destFilter === '子牛市場') return dest.includes('子牛') || dest.includes('仔牛');
      if (destFilter === 'スモール市場') return dest.includes('スモール');
      if (destFilter === '成牛市場') return dest.includes('成牛');
      if (destFilter === '屠場') return dest.includes('屠場') || dest.includes('と場');
      return dest === destFilter;
    });

    // 年ごとにグループ化
    const byYear = {};
    for (const s of filtered) {
      if (!s.date) continue;
      const year = new Date(s.date).getFullYear();
      if (!byYear[year]) byYear[year] = [];
      const cow = cattleMap[s.cattleId];
      const weight = parseFloat(s.weight) || null;
      const rawCost = s.cost;
      const cost = (() => {
        if (rawCost === null || rawCost === undefined || rawCost === '') return null;
        const n = parseFloat(String(rawCost).replace(/[^\d.]/g, ''));
        return isNaN(n) || n === 0 ? null : n;
      })();
      const birthDate = cow?.birthDate ? new Date(cow.birthDate) : null;
      const shipDate = new Date(s.date);
      const ageAtShip = birthDate ? differenceInDays(shipDate, birthDate) : null;
      const dg = (weight && ageAtShip && ageAtShip > 0) ? Math.round((weight / ageAtShip) * 1000) / 1000 : null;
      // 性別の正規化
      const rawSex = cow?.sex || '';
      let sex = rawSex.includes('メス') || rawSex.includes('雌') || rawSex === 'F' ? '雌'
              : rawSex.includes('オス') || rawSex.includes('雄') || rawSex === 'M' ? '雄' : null;
      // 性別未登録の場合の自動判定（登録済み性別を優先）
      if (sex === null) {
        const earTag = cow?.earTag || '';
        if (/^[ぁ-ん]/.test(earTag)) {
          // ひらがな始まり（なみ、りん等）→ 雌
          sex = '雌';
        } else if (/^[\u4e00-\u9fff]/.test(earTag)) {
          // 漢字始まり（太郎3、知恵姫等）→ 雄
          sex = '雄';
        } else {
          // 耳標の桁数で判定（3桁=雄、4桁=雌）
          const tagNum = earTag.match(/^\d+/)?.[0] || '';
          if (tagNum.length === 3) sex = '雄';
          else if (tagNum.length === 4) sex = '雌';
        }
      }
      byYear[year].push({ weight, cost, ageAtShip, dg, sex, earTag: cow?.earTag || '不明', date: s.date, destination: s.destination || '', rawCost, shipmentId: s.id });
    }

    function calcGroup(items) {
      const weights = items.map(i => i.weight).filter(v => v !== null);
      const costs = items.map(i => i.cost).filter(v => v !== null);
      const dgs = items.map(i => i.dg).filter(v => v !== null);
      const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
      const sum = arr => arr.length ? arr.reduce((a, b) => a + b, 0) : null;
      return {
        count: items.length,
        totalCost: sum(costs),
        avgCost: avg(costs),
        avgWeight: avg(weights),
        avgDg: dgs.length ? Math.round(dgs.reduce((a, b) => a + b, 0) / dgs.length * 1000) / 1000 : null,
      };
    }

    const result = Object.entries(byYear)
      .sort(([a], [b]) => b - a)
      .map(([year, items]) => ({
        year: Number(year),
        all: calcGroup(items),
        female: calcGroup(items.filter(i => i.sex === '雌')),
        male: calcGroup(items.filter(i => i.sex === '雄')),
        noCost: items.filter(i => i.cost === null).map(i => ({ earTag: i.earTag, date: i.date, destination: i.destination, rawCost: i.rawCost, shipmentId: i.shipmentId })),
        noSex: items.filter(i => i.sex === null).map(i => ({ earTag: i.earTag, date: i.date, destination: i.destination })),
      }));
    setSalesStats(result);
  }

  async function loadLossStats() {
    const calvings = await db.calving.toArray();
    const deaths = await db.death.toArray();
    const allCattle = await db.cattle.toArray();
    const cattleMap = {};
    allCattle.forEach(c => { cattleMap[c.id] = c; });

    // 死産・流産リスト
    const stillbirths = calvings.filter(c => {
      const cat = c.category || '';
      return cat.includes('死産') || cat.includes('流産');
    }).map(c => {
      const mother = cattleMap[c.cattleId];
      return {
        date: c.date,
        year: c.date ? new Date(c.date).getFullYear() : null,
        motherTag: mother?.earTag || '不明',
        calfTag: c.calfEarTag || '—',
        category: c.category || '死産',
        type: 'stillbirth',
      };
    });

    // 300日以内に死亡した子牛
    const earlyDeaths = [];
    for (const d of deaths) {
      const cow = cattleMap[d.cattleId];
      if (!cow || !cow.birthDate || !d.date) continue;
      const age = differenceInDays(new Date(d.date), new Date(cow.birthDate));
      if (age > 300) continue;
      earlyDeaths.push({
        date: d.date,
        year: new Date(d.date).getFullYear(),
        calfTag: cow.earTag || '不明',
        age,
        cause: d.cause || d.memo || '—',
        type: 'death',
      });
    }

    // 年度別にまとめる
    const years = new Set([
      ...stillbirths.map(s => s.year),
      ...earlyDeaths.map(d => d.year),
    ]);
    const result = [...years].filter(Boolean).sort((a, b) => b - a).map(year => ({
      year,
      stillbirths: stillbirths.filter(s => s.year === year),
      earlyDeaths: earlyDeaths.filter(d => d.year === year),
    }));
    setLossStats(result);
  }

  async function saveCost(shipmentId) {
    const raw = (costInputs[shipmentId] || '').replace(/[^\d]/g, '');
    if (!raw) { alert('金額を入力してください'); return; }
    setSavingCost(s => ({ ...s, [shipmentId]: true }));
    await db.shipment.update(shipmentId, { cost: raw });
    setSavingCost(s => ({ ...s, [shipmentId]: false }));
    loadSalesStats(salesDest);
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === 'earTag');
    }
  }

  const activeCowStats = cowStats.filter(c => !c.isRemoved);
  const removedCowStats = cowStats.filter(c => c.isRemoved);
  const currentList = tab === 'individual' ? activeCowStats : tab === 'removed' ? removedCowStats : [];
  const sortedCowStats = [...currentList].sort((a, b) => {
    let va = a[sortKey], vb = b[sortKey];
    // 数値文字列("28.5"等)は数値に変換
    if (typeof va === 'string' && !isNaN(va)) va = parseFloat(va);
    if (typeof vb === 'string' && !isNaN(vb)) vb = parseFloat(vb);
    if (va === null || va === undefined) va = sortAsc ? Infinity : -Infinity;
    if (vb === null || vb === undefined) vb = sortAsc ? Infinity : -Infinity;
    if (sortKey === 'earTag') {
      const na = parseInt((a.earTag || '').match(/\d+/)?.[0] || '0');
      const nb = parseInt((b.earTag || '').match(/\d+/)?.[0] || '0');
      return sortAsc ? na - nb : nb - na;
    }
    return sortAsc ? va - vb : vb - va;
  });

  const val = (v, unit = '') => v !== null && v !== undefined ? `${v}${unit}` : '—';
  // 耳標表示：先頭が数字なら番号のみ、名前タグ（なみ等）はそのまま表示
  const tagLabel = (earTag) => {
    const num = (earTag || '').match(/^\d+/)?.[0];
    if (num) return num + '番';
    return (earTag || '').replace(/\(.*\)/, '').trim();
  };

  if (loading) return <div className="empty-state">読み込み中...</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <button className="btn" onClick={() => navigate(-1)} style={{ marginRight: 8, padding: '4px 12px' }}>← 戻る</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>📊 繁殖成績</h2>
      </div>

      <div className="tabs" style={{ marginBottom: 12 }}>
        <button className={tab === 'individual' ? 'active' : ''} onClick={() => setTab('individual')}>個体別</button>
        <button className={tab === 'yearly' ? 'active' : ''} onClick={() => setTab('yearly')}>年度別</button>
        <button className={tab === 'removed' ? 'active' : ''} onClick={() => setTab('removed')}>個体別（出荷済み）</button>
        <button className={tab === 'sales' ? 'active' : ''} onClick={() => setTab('sales')}>販売成績</button>
        <button className={tab === 'loss' ? 'active' : ''} onClick={() => setTab('loss')}>損耗記録</button>
      </div>

      {(tab === 'individual' || tab === 'removed') && (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
            <thead>
              <tr style={{ background: '#f5f5f5', position: 'sticky', top: 0 }}>
                {[
                  ['earTag', '個体'],
                  ['totalBreedings', '授精数'],
                  ['conceptions', '受胎数'],
                  ['conceptionRate', '受胎率'],
                  ['avgAIPerConception', '平均授精回数'],
                  ['avgOpenDays', '空胎日数'],
                  ['avgCalvingInterval', '分娩間隔'],
                  ['avgGestation', '在胎期間'],
                  ['avgCalfWeight', '子牛体重'],
                  ['calfCount', '産子数'],
                ].map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    style={{
                      padding: '10px 6px', textAlign: key === 'earTag' ? 'left' : 'center',
                      cursor: 'pointer', whiteSpace: 'nowrap', borderBottom: '2px solid #ddd',
                      background: sortKey === key ? '#e8f5e9' : undefined,
                    }}
                  >
                    {label}{sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedCowStats.map(cow => (
                <tr
                  key={cow.id}
                  onClick={() => navigate(`/cattle/${cow.id}`)}
                  style={{ cursor: 'pointer', borderBottom: '1px solid #eee' }}
                >
                  <td style={{ padding: '8px 6px', fontWeight: 600 }}>
                    {(cow.earTag || '').match(/\d+/)?.[0] || cow.earTag}
                    {cow.name && <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 4 }}>{cow.name}</span>}
                  </td>
                  <td style={{ textAlign: 'center', padding: '8px 4px' }}>{val(cow.totalBreedings, '回')}</td>
                  <td style={{ textAlign: 'center', padding: '8px 4px' }}>{val(cow.conceptions, '回')}</td>
                  <td style={{ textAlign: 'center', padding: '8px 4px', color: cow.conceptionRate !== null && cow.conceptionRate < 50 ? '#D32F2F' : '#2E7D32', fontWeight: 600 }}>
                    {val(cow.conceptionRate, '%')}
                  </td>
                  <td style={{ textAlign: 'center', padding: '8px 4px' }}>{val(cow.avgAIPerConception, '回')}</td>
                  <td style={{ textAlign: 'center', padding: '8px 4px' }}>{val(cow.avgOpenDays, '日')}</td>
                  <td style={{ textAlign: 'center', padding: '8px 4px' }}>{val(cow.avgCalvingInterval, '日')}</td>
                  <td style={{ textAlign: 'center', padding: '8px 4px' }}>{val(cow.avgGestation, '日')}</td>
                  <td style={{ textAlign: 'center', padding: '8px 4px' }}>{val(cow.avgCalfWeight, 'kg')}</td>
                  <td style={{ textAlign: 'center', padding: '8px 4px' }}>{val(cow.calfCount, '頭')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {cowStats.length === 0 && <div className="empty-state">繁殖データがありません</div>}
        </div>
      )}

      {tab === 'yearly' && (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                {['年', '授精回数', '受胎数', '受胎率', '分娩頭数', '平均空胎日数', '平均分娩間隔', '平均出生体重'].map(label => (
                  <th key={label} style={{ padding: '10px 6px', textAlign: label === '年' ? 'left' : 'center', whiteSpace: 'nowrap', borderBottom: '2px solid #ddd' }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {yearlyStats.map(y => (
                <tr key={y.year} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px 6px', fontWeight: 600 }}>{y.year}年</td>
                  <td style={{ textAlign: 'center', padding: '8px 4px' }}>{val(y.totalAI, '回')}</td>
                  <td style={{ textAlign: 'center', padding: '8px 4px' }}>{val(y.conceptions, '回')}</td>
                  <td style={{ textAlign: 'center', padding: '8px 4px', color: y.conceptionRate !== null && y.conceptionRate < 50 ? '#D32F2F' : '#2E7D32', fontWeight: 600 }}>
                    {val(y.conceptionRate, '%')}
                  </td>
                  <td style={{ textAlign: 'center', padding: '8px 4px' }}>{val(y.calvingCount, '頭')}</td>
                  <td style={{ textAlign: 'center', padding: '8px 4px' }}>{val(y.avgOpenDays, '日')}</td>
                  <td style={{ textAlign: 'center', padding: '8px 4px' }}>{val(y.avgCalvingInterval, '日')}</td>
                  <td style={{ textAlign: 'center', padding: '8px 4px' }}>{val(y.avgCalfWeight, 'kg')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {yearlyStats.length === 0 && <div className="empty-state">データがありません</div>}
        </div>
      )}
      {tab === 'sales' && (
        <div>
          {/* 出荷先フィルター */}
          <div className="card" style={{ padding: '10px 12px', marginBottom: 8 }}>
            <label style={{ fontSize: 13, marginRight: 8 }}>出荷先：</label>
            <select value={salesDest} onChange={e => setSalesDest(e.target.value)} style={{ fontSize: 13 }}>
              {['子牛市場', 'スモール市場', '成牛市場', '屠場', '全て'].map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* 豊肥子牛市場平均入力（子牛市場のみ表示） */}
          {salesDest === '子牛市場' && (
            <div className="card" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>🏪 豊肥子牛市場 年間平均価格を入力</span>
                <button className="btn btn-outline" style={{ fontSize: 12, padding: '3px 10px' }}
                  onClick={() => {
                    if (!editingMarket) {
                      const init = {};
                      salesStats.forEach(y => {
                        init[y.year] = {
                          all: marketAvgs[y.year]?.all || '',
                          female: marketAvgs[y.year]?.female || '',
                          male: marketAvgs[y.year]?.male || '',
                        };
                      });
                      setMarketInput(init);
                    } else {
                      const updated = { ...marketAvgs };
                      Object.entries(marketInput).forEach(([yr, v]) => {
                        updated[yr] = {
                          all: v.all ? Number(String(v.all).replace(/,/g, '')) : null,
                          female: v.female ? Number(String(v.female).replace(/,/g, '')) : null,
                          male: v.male ? Number(String(v.male).replace(/,/g, '')) : null,
                        };
                      });
                      setMarketAvgs(updated);
                      localStorage.setItem('toyohi_market_avgs', JSON.stringify(updated));
                    }
                    setEditingMarket(!editingMarket);
                  }}
                >
                  {editingMarket ? '保存' : '編集'}
                </button>
              </div>
              {editingMarket && (
                <div style={{ marginTop: 10, overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5' }}>
                        <th style={{ padding: '6px 4px', textAlign: 'left' }}>年</th>
                        <th style={{ padding: '6px 4px', textAlign: 'center' }}>全体平均(円)</th>
                        <th style={{ padding: '6px 4px', textAlign: 'center', color: '#E91E63' }}>雌平均(円)</th>
                        <th style={{ padding: '6px 4px', textAlign: 'center', color: '#1976D2' }}>去平均(円)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesStats.map(y => (
                        <tr key={y.year} style={{ borderBottom: '1px solid #eee' }}>
                          <td style={{ padding: '6px 4px', fontWeight: 600 }}>{y.year}年</td>
                          {['all', 'female', 'male'].map(k => (
                            <td key={k} style={{ padding: '4px' }}>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={marketInput[y.year]?.[k] || ''}
                                onChange={e => {
                                  const digits = e.target.value.replace(/[^\d]/g, '');
                                  const fmt = digits ? Number(digits).toLocaleString('ja-JP') : '';
                                  setMarketInput(prev => ({ ...prev, [y.year]: { ...prev[y.year], [k]: fmt } }));
                                }}
                                style={{ width: '100%', textAlign: 'center', padding: '4px', border: '1px solid #ddd', borderRadius: 4, fontSize: 13 }}
                                placeholder="例: 980,000"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                    ※ <a href="https://www.zennoh.or.jp/ot/farming/livestockinfo/news.html" target="_blank" rel="noopener noreferrer">JA全農おおいた 家畜市場速報</a> を参照して入力してください。
                  </p>
                </div>
              )}
            </div>
          )}

          {salesStats.length === 0 ? (
            <div className="empty-state">データがありません</div>
          ) : salesStats.map(y => {
            const unknown = y.all.count - y.female.count - y.male.count;
            const fmt = (v, unit) => (v !== null && v !== undefined) ? `${v}${unit}` : '—';
            const fmtCost = v => v ? `¥${Math.round(v).toLocaleString()}` : '—';
            const mkt = salesDest === '子牛市場' ? (marketAvgs[y.year] || {}) : {};
            const pct = (farm, market) => {
              if (!farm || !market) return null;
              return Math.round((farm / market) * 100);
            };
            const pctStr = (farm, market) => {
              const p = pct(farm, market);
              if (p === null) return '';
              return `（${p}%）`;
            };
            const pctColor = (farm, market) => {
              const p = pct(farm, market);
              if (p === null) return '#555';
              return p >= 100 ? '#2E7D32' : '#D32F2F';
            };
            return (
              <div key={y.year} className="card" style={{ marginBottom: 12 }}>
                {/* 年度ヘッダー */}
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10, borderBottom: '2px solid #a8e56c', paddingBottom: 6 }}>
                  {y.year}年
                  <span style={{ fontWeight: 400, fontSize: 13, marginLeft: 8, color: 'var(--text-secondary)' }}>
                    出荷 {y.all.count}頭（雌{y.female.count}頭 / 去{y.male.count}頭{unknown > 0 ? ` / 性別不明${unknown}頭` : ''}）
                  </span>
                </div>

                {/* 販売金額合計 */}
                <div style={{ background: '#f0fae0', borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>販売金額合計</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#2E7D32' }}>
                    {fmtCost(y.all.totalCost)}
                  </span>
                </div>

                {/* 詳細テーブル */}
                <div style={{ overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5' }}>
                        <th style={{ padding: '8px 6px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '2px solid #ddd' }}>項目</th>
                        <th style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '2px solid #ddd' }}>全体</th>
                        <th style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '2px solid #ddd', color: '#E91E63' }}>雌</th>
                        <th style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '2px solid #ddd', color: '#1976D2' }}>去</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '9px 6px', fontSize: 12 }}>出荷頭数</td>
                        <td style={{ padding: '9px 6px', textAlign: 'center', fontWeight: 600 }}>{y.all.count}頭</td>
                        <td style={{ padding: '9px 6px', textAlign: 'center', fontWeight: 600, color: '#E91E63' }}>{y.female.count}頭</td>
                        <td style={{ padding: '9px 6px', textAlign: 'center', fontWeight: 600, color: '#1976D2' }}>{y.male.count}頭</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '9px 6px', fontSize: 12 }}>自牧場 平均販売金額</td>
                        <td style={{ padding: '9px 6px', textAlign: 'center', fontWeight: 600 }}>{fmtCost(y.all.avgCost)}</td>
                        <td style={{ padding: '9px 6px', textAlign: 'center', fontWeight: 600, color: '#E91E63' }}>{fmtCost(y.female.avgCost)}</td>
                        <td style={{ padding: '9px 6px', textAlign: 'center', fontWeight: 600, color: '#1976D2' }}>{fmtCost(y.male.avgCost)}</td>
                      </tr>
                      {salesDest === '子牛市場' && (
                        <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                          <td style={{ padding: '9px 6px', fontSize: 12 }}>豊肥子牛市場平均<br/><span style={{ fontSize: 10, color: '#888' }}>（カッコ内は自牧場比率）</span></td>
                          <td style={{ padding: '9px 6px', textAlign: 'center' }}>
                            {mkt.all ? <>{fmtCost(mkt.all)}<br/><span style={{ fontWeight: 700, color: pctColor(y.all.avgCost, mkt.all) }}>{pctStr(y.all.avgCost, mkt.all)}</span></> : '—'}
                          </td>
                          <td style={{ padding: '9px 6px', textAlign: 'center', color: '#E91E63' }}>
                            {mkt.female ? <>{fmtCost(mkt.female)}<br/><span style={{ fontWeight: 700, color: pctColor(y.female.avgCost, mkt.female) }}>{pctStr(y.female.avgCost, mkt.female)}</span></> : '—'}
                          </td>
                          <td style={{ padding: '9px 6px', textAlign: 'center', color: '#1976D2' }}>
                            {mkt.male ? <>{fmtCost(mkt.male)}<br/><span style={{ fontWeight: 700, color: pctColor(y.male.avgCost, mkt.male) }}>{pctStr(y.male.avgCost, mkt.male)}</span></> : '—'}
                          </td>
                        </tr>
                      )}
                      <tr style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '9px 6px', fontSize: 12 }}>自牧場 平均体重</td>
                        <td style={{ padding: '9px 6px', textAlign: 'center' }}>{fmt(y.all.avgWeight, 'kg')}</td>
                        <td style={{ padding: '9px 6px', textAlign: 'center', color: '#E91E63' }}>{fmt(y.female.avgWeight, 'kg')}</td>
                        <td style={{ padding: '9px 6px', textAlign: 'center', color: '#1976D2' }}>{fmt(y.male.avgWeight, 'kg')}</td>
                      </tr>
                      {salesDest === '子牛市場' && (mkt.allWeight || mkt.femaleWeight || mkt.maleWeight) && (
                        <tr style={{ borderBottom: '1px solid #eee', background: '#fafafa' }}>
                          <td style={{ padding: '9px 6px', fontSize: 12 }}>豊肥市場 平均体重
                            {mkt.months && mkt.months < 12 && <span style={{ fontSize: 10, color: '#888' }}><br/>（{mkt.months}ヶ月平均）</span>}
                          </td>
                          <td style={{ padding: '9px 6px', textAlign: 'center' }}>
                            {mkt.allWeight ? <>{mkt.allWeight}kg<br/><span style={{ fontWeight: 700, color: pctColor(y.all.avgWeight, mkt.allWeight) }}>{pctStr(y.all.avgWeight, mkt.allWeight)}</span></> : '—'}
                          </td>
                          <td style={{ padding: '9px 6px', textAlign: 'center', color: '#E91E63' }}>
                            {mkt.femaleWeight ? <>{mkt.femaleWeight}kg<br/><span style={{ fontWeight: 700, color: pctColor(y.female.avgWeight, mkt.femaleWeight) }}>{pctStr(y.female.avgWeight, mkt.femaleWeight)}</span></> : '—'}
                          </td>
                          <td style={{ padding: '9px 6px', textAlign: 'center', color: '#1976D2' }}>
                            {mkt.maleWeight ? <>{mkt.maleWeight}kg<br/><span style={{ fontWeight: 700, color: pctColor(y.male.avgWeight, mkt.maleWeight) }}>{pctStr(y.male.avgWeight, mkt.maleWeight)}</span></> : '—'}
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td style={{ padding: '9px 6px', fontSize: 12 }}>平均DG</td>
                        <td style={{ padding: '9px 6px', textAlign: 'center' }}>{fmt(y.all.avgDg, 'kg/日')}</td>
                        <td style={{ padding: '9px 6px', textAlign: 'center', color: '#E91E63' }}>{fmt(y.female.avgDg, 'kg/日')}</td>
                        <td style={{ padding: '9px 6px', textAlign: 'center', color: '#1976D2' }}>{fmt(y.male.avgDg, 'kg/日')}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 性別不明一覧 */}
                {y.noSex && y.noSex.length > 0 && (
                  <div style={{ marginTop: 10, background: '#e3f2fd', borderRadius: 8, padding: '8px 12px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1565C0', marginBottom: 6 }}>
                      ℹ️ 性別が判定できない個体（{y.noSex.length}頭）
                    </div>
                    {y.noSex.map((item, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#555', padding: '3px 0', borderBottom: '1px solid #bbdefb' }}>
                        耳標：「{item.earTag}」　{item.date}　{item.destination}
                      </div>
                    ))}
                  </div>
                )}

                {/* 金額未入力一覧 */}
                {y.noCost.length > 0 && (
                  <div style={{ marginTop: 10, background: '#fff8e1', borderRadius: 8, padding: '8px 12px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#F57F17', marginBottom: 8 }}>
                      ⚠️ 販売金額が未入力の個体（{y.noCost.length}頭）― ここから直接入力できます
                    </div>
                    {y.noCost.map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid #fce4a0', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 48 }}>
                          {tagLabel(item.earTag)}
                        </span>
                        <span style={{ fontSize: 12, color: '#888' }}>{item.date}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="金額を入力"
                          value={costInputs[item.shipmentId] || ''}
                          onChange={e => {
                            const digits = e.target.value.replace(/[^\d]/g, '');
                            const formatted = digits ? Number(digits).toLocaleString('ja-JP') : '';
                            setCostInputs(s => ({ ...s, [item.shipmentId]: formatted }));
                          }}
                          style={{ flex: 1, minWidth: 120, padding: '5px 8px', border: '1px solid #f0c040', borderRadius: 6, fontSize: 14 }}
                        />
                        <button
                          onClick={() => saveCost(item.shipmentId)}
                          disabled={savingCost[item.shipmentId]}
                          style={{ padding: '5px 14px', background: '#2E7D32', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
                        >
                          {savingCost[item.shipmentId] ? '保存中' : '保存'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'loss' && (
        <div>
          {lossStats.length === 0 ? (
            <div className="empty-state">データがありません</div>
          ) : lossStats.map(y => (
            <div key={y.year} className="card" style={{ marginBottom: 12 }}>
              {/* 年度ヘッダー */}
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10, borderBottom: '2px solid #ffb74d', paddingBottom: 6 }}>
                {y.year}年
                <span style={{ fontWeight: 400, fontSize: 13, marginLeft: 8, color: 'var(--text-secondary)' }}>
                  死産・流産 {y.stillbirths.length}件　／　早期死亡（300日以内） {y.earlyDeaths.length}頭
                </span>
              </div>

              {/* 死産・流産 */}
              {y.stillbirths.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#E65100', marginBottom: 6 }}>🔴 死産・流産</div>
                  <div style={{ overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#fff3e0' }}>
                          <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #ffe0b2' }}>日付</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #ffe0b2' }}>母牛</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #ffe0b2' }}>子牛耳標</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #ffe0b2' }}>区分</th>
                        </tr>
                      </thead>
                      <tbody>
                        {y.stillbirths.map((s, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                            <td style={{ padding: '7px 8px' }}>{s.date}</td>
                            <td style={{ padding: '7px 8px', fontWeight: 600 }}>{tagLabel(s.motherTag)}</td>
                            <td style={{ padding: '7px 8px' }}>{s.calfTag}</td>
                            <td style={{ padding: '7px 8px', color: '#E65100' }}>{s.category}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 早期死亡 */}
              {y.earlyDeaths.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#B71C1C', marginBottom: 6 }}>💀 早期死亡（300日以内）</div>
                  <div style={{ overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#ffebee' }}>
                          <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #ffcdd2' }}>死亡日</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #ffcdd2' }}>個体</th>
                          <th style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #ffcdd2' }}>死亡日齢</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #ffcdd2' }}>原因・メモ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {y.earlyDeaths.map((d, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                            <td style={{ padding: '7px 8px' }}>{d.date}</td>
                            <td style={{ padding: '7px 8px', fontWeight: 600 }}>{tagLabel(d.calfTag)}</td>
                            <td style={{ padding: '7px 8px', textAlign: 'center' }}>{d.age}日</td>
                            <td style={{ padding: '7px 8px', color: '#555' }}>{d.cause}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {y.stillbirths.length === 0 && y.earlyDeaths.length === 0 && (
                <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>該当データなし</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
