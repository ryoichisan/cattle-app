import Dexie from 'dexie';

export const db = new Dexie('CattleBreedingDB');

db.version(1).stores({
  cattle: '++id, earTag, individualId, name, type, sex, breed, birthDate, status',
  breeding: '++id, cattleId, date, method, bullName, time, memo',
  pregnancyChecks: '++id, cattleId, date, result, twins, memo',
  heat: '++id, cattleId, date, signs, etPlan, memo',
  calving: '++id, cattleId, date, category, difficulty, time, calfEarTag, calfSex, calfBreed, calfWeight, memo',
  miscarriage: '++id, cattleId, date, category, memo',
  treatment: '++id, cattleId, date, diseaseName, bodyTemp, category, status, medicine, quantity, adminRoute, unitCost, memo',
  shipment: '++id, cattleId, date, destination, weight, cost, memo',
  sales: '++id, cattleId, date, salesType, totalAmount, memo',
  disposal: '++id, cattleId, date, reason, type, memo',
  records: '++id, cattleId, date, weight, bcs, memo',
  movement: '++id, cattleId, date, destination, memo',
});

db.version(2).stores({
  death: '++id, cattleId, date, reason, memo',
});

// Helper to find cattle by earTag
export async function findCattleByEarTag(earTag) {
  return db.cattle.where('earTag').equals(earTag).first();
}

// Get all active cattle (not disposed/shipped)
export async function getActiveCattle() {
  const allCattle = await db.cattle.toArray();
  const disposals = await db.disposal.toArray();
  const disposedIds = new Set(disposals.map(d => d.cattleId));
  return allCattle.filter(c => !disposedIds.has(c.id) && (c.type === '繁殖雌牛' || c.type === '' || !c.type));
}

// Get latest breeding for a cattle
export async function getLatestBreeding(cattleId) {
  return db.breeding.where('cattleId').equals(cattleId)
    .reverse().sortBy('date').then(arr => arr[0]);
}

// Get latest calving for a cattle
export async function getLatestCalving(cattleId) {
  return db.calving.where('cattleId').equals(cattleId)
    .reverse().sortBy('date').then(arr => arr[0]);
}

// Get latest pregnancy check for a cattle
export async function getLatestPregnancyCheck(cattleId) {
  return db.pregnancyChecks.where('cattleId').equals(cattleId)
    .reverse().sortBy('date').then(arr => arr[0]);
}
