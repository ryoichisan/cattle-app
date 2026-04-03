import { db } from '../db/database';

async function readFileAsText(file) {
  // Try Shift-JIS (CP932) first, then fall back to UTF-8
  const buffer = await file.arrayBuffer();
  try {
    const decoder = new TextDecoder('shift-jis');
    const text = decoder.decode(buffer);
    // If it contains Japanese characters, it's likely Shift-JIS
    if (/[\u3000-\u9FFF]/.test(text)) return text;
  } catch (e) { /* fallback */ }
  return new TextDecoder('utf-8').decode(buffer);
}

function parseCSV(text) {
  // Split into logical rows handling quoted fields with newlines
  const rows = splitCSVRows(text);
  if (rows.length === 0) return [];
  const headers = parseCSVLine(rows[0]);
  return rows.slice(1).map(row => {
    const values = parseCSVLine(row);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  });
}

function splitCSVRows(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '""'; i++; }
      else { inQuotes = !inQuotes; }
      current += c;
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (current.trim() && current.trim().startsWith('"')) {
        rows.push(current);
      }
      current = '';
    } else {
      current += c;
    }
  }
  if (current.trim() && current.trim().startsWith('"')) {
    rows.push(current);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (c === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else if (c !== '\r') {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function cleanWeight(w) {
  if (!w) return '';
  return w.replace(/\s*kg/i, '').trim();
}

function cleanPrice(p) {
  if (!p) return '';
  return p.replace(/[,\s円]/g, '').trim();
}

export async function importAllCSVFiles(files) {
  const results = { success: 0, errors: [] };
  const fileMap = {};

  for (const file of files) {
    const text = await readFileAsText(file);
    // Try to detect the file type from headers
    const firstDataLine = text.split('\n').find(l => l.startsWith('"'));
    if (!firstDataLine) continue;
    fileMap[file.name] = { text, headers: firstDataLine };
  }

  // Process each file based on header content
  for (const [name, { text }] of Object.entries(fileMap)) {
    try {
      const rows = parseCSV(text);
      if (rows.length === 0) continue;
      const headers = Object.keys(rows[0]);
      const headerStr = headers.join(',');

      if (headerStr.includes('タイプ') && headerStr.includes('品種') && headerStr.includes('父牛')) {
        await importCattle(rows);
        results.success++;
      } else if (headerStr.includes('種付方法') || headerStr.includes('種雄牛名')) {
        await importBreeding(rows);
        results.success++;
      } else if (headerStr.includes('受胎状況')) {
        await importPregnancyChecks(rows);
        results.success++;
      } else if (headerStr.includes('発情兆候')) {
        await importHeat(rows);
        results.success++;
      } else if (headerStr.includes('分娩難易') || headerStr.includes('分類') && headerStr.includes('子牛発見時刻')) {
        await importCalving(rows);
        results.success++;
      } else if (headerStr.includes('流産分類')) {
        await importMiscarriage(rows);
        results.success++;
      } else if (headerStr.includes('疾病名') || headerStr.includes('投薬名')) {
        await importTreatment(rows);
        results.success++;
      } else if (headerStr.includes('出荷先') && headerStr.includes('出荷時体重')) {
        await importShipment(rows);
        results.success++;
      } else if (headerStr.includes('販売種別') || headerStr.includes('枝肉総重量')) {
        await importSales(rows);
        results.success++;
      } else if (headerStr.includes('廃用理由')) {
        await importDisposal(rows);
        results.success++;
      } else if (headerStr.includes('体重') && headerStr.includes('BCS') && !headerStr.includes('出荷')) {
        await importRecords(rows);
        results.success++;
      } else if (headerStr.includes('移動先牛群')) {
        await importMovement(rows);
        results.success++;
      }
    } catch (e) {
      results.errors.push(`${name}: ${e.message}`);
    }
  }
  return results;
}

async function getOrCreateCattle(earTag, individualId) {
  if (!earTag) return null;
  let cattle = await db.cattle.where('earTag').equals(earTag).first();
  if (!cattle) {
    const id = await db.cattle.add({
      earTag,
      individualId: individualId || '',
      name: '',
      type: '',
      sex: '',
      breed: '',
      birthDate: '',
      status: 'active',
    });
    cattle = await db.cattle.get(id);
  }
  return cattle;
}

async function importCattle(rows) {
  for (const row of rows) {
    const earTag = row['耳標'];
    if (!earTag) continue;
    let cattle = await db.cattle.where('earTag').equals(earTag).first();
    const data = {
      earTag,
      individualId: row['個体識別番号'] || '',
      name: row['名前'] || '',
      type: row['タイプ'] || '',
      sex: row['性別'] || '',
      breed: row['品種'] || '',
      color: row['毛色'] || '',
      birthDate: row['出生日'] || '',
      birthPlace: row['出生地'] || '',
      birthWeight: cleanWeight(row['出生時体重']),
      father: row['父牛'] || '',
      motherFather: row['母の父牛'] || '',
      grandmotherFather: row['祖母の父牛'] || '',
      mother: row['母牛'] || '',
      motherIndividualId: row['母牛の個体識別番号'] || '',
      registrationNo: row['登記番号'] || '',
      memo: row['個体メモ'] || row['メモ'] || '',
      importSource: row['導入元'] || '',
      importWeight: cleanWeight(row['導入時体重']),
      importPrice: cleanPrice(row['導入価格']),
      importParity: row['導入時産次'] || '',
      isET: row['受精卵移植産子'] === 'Y',
      status: 'active',
    };
    if (cattle) {
      await db.cattle.update(cattle.id, data);
    } else {
      await db.cattle.add(data);
    }
  }
}

async function importBreeding(rows) {
  for (const row of rows) {
    const cattle = await getOrCreateCattle(row['耳標'], row['個体識別番号']);
    if (!cattle) continue;
    await db.breeding.add({
      cattleId: cattle.id,
      date: row['活動日'] || '',
      method: row['種付方法'] || '',
      bullName: row['種雄牛名'] || '',
      time: row['種付時刻'] || '',
      position: row['授精位置'] || '',
      semenCertNo: row['精液証明証番号'] || '',
      category: row['区分'] || '',
      breedingType: row['受精種類'] || '',
      memo: row['メモ'] || '',
      worker: row['作業者'] || '',
    });
  }
}

async function importPregnancyChecks(rows) {
  for (const row of rows) {
    const cattle = await getOrCreateCattle(row['耳標'], row['個体識別番号']);
    if (!cattle) continue;
    await db.pregnancyChecks.add({
      cattleId: cattle.id,
      date: row['活動日'] || '',
      result: row['受胎状況'] || '',
      twins: row['双子'] === 'Y',
      memo: row['メモ'] || '',
      worker: row['作業者'] || '',
    });
  }
}

async function importHeat(rows) {
  for (const row of rows) {
    const cattle = await getOrCreateCattle(row['耳標'], row['個体識別番号']);
    if (!cattle) continue;
    await db.heat.add({
      cattleId: cattle.id,
      date: row['活動日'] || '',
      signs: row['発情兆候'] || '',
      etPlan: row['受精卵移植予定'] === 'Y',
      memo: row['メモ'] || '',
      worker: row['作業者'] || '',
    });
  }
}

async function importCalving(rows) {
  for (const row of rows) {
    const cattle = await getOrCreateCattle(row['耳標'], row['個体識別番号']);
    if (!cattle) continue;
    await db.calving.add({
      cattleId: cattle.id,
      date: row['活動日'] || '',
      category: row['分類'] || '',
      difficulty: row['分娩難易'] || '',
      time: row['分娩時刻'] || '',
      discoveryTime: row['子牛発見時刻'] || '',
      calfIndividualId: row['個体識別番号'] !== row['個体識別番号'] ? '' : (row['自家耳標番号'] || ''),
      calfEarTag: row['自家耳標番号'] || '',
      calfName: row['名前'] || '',
      calfType: row['タイプ'] || '',
      calfColor: row['毛色'] || '',
      calfSex: row['性別'] || '',
      calfBreed: row['品種'] || '',
      calfWeight: cleanWeight(row['出生時体重']),
      calfMemo: row['出生メモ'] || '',
      memo: row['メモ'] || '',
      worker: row['作業者'] || '',
    });
  }
}

async function importMiscarriage(rows) {
  for (const row of rows) {
    const cattle = await getOrCreateCattle(row['耳標'], row['個体識別番号']);
    if (!cattle) continue;
    await db.miscarriage.add({
      cattleId: cattle.id,
      date: row['活動日'] || '',
      category: row['流産分類'] || '',
      memo: row['メモ'] || '',
      worker: row['作業者'] || '',
    });
  }
}

async function importTreatment(rows) {
  for (const row of rows) {
    const cattle = await getOrCreateCattle(row['耳標'], row['個体識別番号']);
    if (!cattle) continue;
    await db.treatment.add({
      cattleId: cattle.id,
      date: row['活動日'] || '',
      diseaseName: row['疾病名'] || '',
      bodyTemp: row['体温'] || '',
      category: row['治療区分'] || '',
      status: row['ステータス'] || '',
      medicine: row['投薬名'] || '',
      quantity: row['数量'] || '',
      adminRoute: row['投薬区分'] || '',
      unitCost: row['単価'] || '',
      memo: row['メモ'] || '',
      worker: row['作業者'] || '',
    });
  }
}

async function importShipment(rows) {
  for (const row of rows) {
    const cattle = await getOrCreateCattle(row['耳標'], row['個体識別番号']);
    if (!cattle) continue;
    await db.shipment.add({
      cattleId: cattle.id,
      date: row['活動日'] || '',
      destination: row['出荷先'] || '',
      weight: cleanWeight(row['出荷時体重']),
      cost: row['出荷コスト'] || '',
      memo: row['メモ'] || '',
      worker: row['作業者'] || '',
    });
  }
}

async function importSales(rows) {
  for (const row of rows) {
    const cattle = await getOrCreateCattle(row['耳標'], row['個体識別番号']);
    if (!cattle) continue;
    await db.sales.add({
      cattleId: cattle.id,
      date: row['活動日'] || '',
      salesType: row['販売種別'] || '',
      slaughterDate: row['と畜日'] || '',
      carcassWeight: row['枝肉総重量'] || '',
      totalAmount: cleanPrice(row['総販売金額']),
      totalCost: cleanPrice(row['総コスト']),
      grade: row['等級'] || '',
      bms: row['BMS'] || '',
      memo: row['メモ'] || '',
      worker: row['作業者'] || '',
    });
  }
}

async function importDisposal(rows) {
  for (const row of rows) {
    const cattle = await getOrCreateCattle(row['耳標'], row['個体識別番号']);
    if (!cattle) continue;
    await db.disposal.add({
      cattleId: cattle.id,
      date: row['活動日'] || '',
      reason: row['廃用理由'] || '',
      type: row['廃用種別'] || '',
      memo: row['メモ'] || '',
      worker: row['作業者'] || '',
    });
  }
}

async function importRecords(rows) {
  for (const row of rows) {
    const cattle = await getOrCreateCattle(row['耳標'], row['個体識別番号']);
    if (!cattle) continue;
    await db.records.add({
      cattleId: cattle.id,
      date: row['活動日'] || '',
      weight: cleanWeight(row['体重']),
      bcs: row['BCS'] || '',
      memo: row['メモ'] || '',
      worker: row['作業者'] || '',
    });
  }
}

async function importMovement(rows) {
  for (const row of rows) {
    const cattle = await getOrCreateCattle(row['耳標'], row['個体識別番号']);
    if (!cattle) continue;
    await db.movement.add({
      cattleId: cattle.id,
      date: row['活動日'] || '',
      destination: row['移動先牛群'] || '',
      memo: row['メモ'] || '',
      worker: row['作業者'] || '',
    });
  }
}
