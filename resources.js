// resources.js
// Koylerin kaynaklarini, en son ne zaman guncellendiklerine (last_updated)
// gore gecen sureyi hesaplayarak gunceller. Bu "tembel hesaplama" yontemi
// sayesinde bot kapali kalsa bile (bilgisayar kapansa, yeniden baslasa vs.)
// kaynaklar acildiginda dogru sekilde hesaplanir. Ayni fonksiyon, arka
// plandaki zamanlayici (scheduler.js) tarafindan da periyodik olarak cagrilir.

const { db } = require('./database');

// Tek bir koyun kaynaklarini "su ana kadar" gecen sureye gore gunceller.
// `village` parametresi villages tablosundan gelen bir satir olmalidir.
function syncVillageResources(village) {
  const now = Date.now();
  const lastUpdated = new Date(village.last_updated).getTime();
  const elapsedHours = Math.max(0, (now - lastUpdated) / (1000 * 60 * 60));

  if (elapsedHours <= 0) {
    return village;
  }

  const newWood = Math.min(village.warehouse_capacity, village.wood + village.wood_production * elapsedHours);
  const newClay = Math.min(village.warehouse_capacity, village.clay + village.clay_production * elapsedHours);
  const newIron = Math.min(village.warehouse_capacity, village.iron + village.iron_production * elapsedHours);
  const newGrain = Math.min(village.granary_capacity, village.grain + village.grain_production * elapsedHours);

  const update = db.prepare(`
    UPDATE villages
    SET wood = ?, clay = ?, iron = ?, grain = ?, last_updated = ?
    WHERE id = ?
  `);
  update.run(
    Math.floor(newWood),
    Math.floor(newClay),
    Math.floor(newIron),
    Math.floor(newGrain),
    new Date().toISOString(),
    village.id
  );

  return db.prepare('SELECT * FROM villages WHERE id = ?').get(village.id);
}

// Belirli bir koyu id'siyle getirir ve kaynaklarini guncelleyerek dondurur.
function getSyncedVillageById(villageId) {
  const village = db.prepare('SELECT * FROM villages WHERE id = ?').get(villageId);
  if (!village) return null;
  return syncVillageResources(village);
}

// Veritabanindaki tum koyleri gunceller (zamanlayici tarafindan cagirilir).
function syncAllVillages() {
  const villages = db.prepare('SELECT * FROM villages').all();
  for (const village of villages) {
    syncVillageResources(village);
  }
}

module.exports = { syncVillageResources, getSyncedVillageById, syncAllVillages };
