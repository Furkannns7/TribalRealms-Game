// buildings.js
// Bina listesini okuma, yukseltme baslatma ve suresi dolan insaatlari
// veritabanina isleme mantigi burada.

const { db } = require('./database');
const { BUILDINGS, getUpgradeCost, getUpgradeTimeSeconds, getProductionPerHour, getCapacity } = require('./game-config');
const { syncVillageResources } = require('./resources');

// Bir koyun tum binalarini (tip + seviye + insaat durumu) getirir.
function getVillageBuildings(villageId) {
  return db.prepare('SELECT * FROM buildings WHERE village_id = ?').all(villageId);
}

// Belirli bir bina satirini getirir.
function getBuilding(villageId, type) {
  return db.prepare('SELECT * FROM buildings WHERE village_id = ? AND type = ?').get(villageId, type);
}

// Bir binanin seviyesi degistiginde koyun uretim/kapasite degerlerini gunceller.
function applyBuildingEffect(villageId, type, newLevel) {
  const config = BUILDINGS[type];

  if (config.produces) {
    const production = getProductionPerHour(newLevel);
    const column = `${config.produces}_production`;
    db.prepare(`UPDATE villages SET ${column} = ? WHERE id = ?`).run(production, villageId);
  }

  if (config.capacityBonus) {
    const capacityColumn = config.capacityBonus === 'warehouse' ? 'warehouse_capacity' : 'granary_capacity';
    const newCapacity = getCapacity(newLevel);
    db.prepare(`UPDATE villages SET ${capacityColumn} = ? WHERE id = ?`).run(newCapacity, villageId);
  }
}

// Suresi dolmus (tamamlanmis) insaatlari veritabanina isler: seviyeyi bir
// artirir, ilgili uretim/kapasite degerini gunceller.
function completeFinishedUpgrades(villageId) {
  const now = new Date().toISOString();
  const finished = db.prepare(`
    SELECT * FROM buildings
    WHERE village_id = ? AND upgrading = 1 AND upgrade_finishes_at <= ?
  `).all(villageId, now);

  for (const building of finished) {
    const newLevel = building.level + 1;

    db.prepare(`
      UPDATE buildings SET level = ?, upgrading = 0, upgrade_finishes_at = NULL WHERE id = ?
    `).run(newLevel, building.id);

    applyBuildingEffect(villageId, building.type, newLevel);
  }

  return finished.length;
}

// Bir koyun kaynaklarini gunceller VE suresi dolan insaatlarini tamamlar.
// Koy menusu her acildiginda ve zamanlayici her calistiginda bu fonksiyon
// cagrilmalidir; boylece gosterilen bilgiler her zaman gunceldir.
function refreshVillage(villageId) {
  let village = db.prepare('SELECT * FROM villages WHERE id = ?').get(villageId);
  if (!village) return null;

  village = syncVillageResources(village);
  completeFinishedUpgrades(villageId);

  return db.prepare('SELECT * FROM villages WHERE id = ?').get(villageId);
}

// Bir binayi bir ust seviyeye yukseltmeyi dener.
// Basarili olursa insaati baslatir (kaynaklari duser, upgrading=1 yapar).
function startUpgrade(villageId, type) {
  refreshVillage(villageId);

  const village = db.prepare('SELECT * FROM villages WHERE id = ?').get(villageId);
  const building = getBuilding(villageId, type);

  if (!building) {
    return { success: false, reason: 'Bina bulunamadi.' };
  }
  if (building.upgrading) {
    return { success: false, reason: 'Bu bina zaten insa ediliyor.' };
  }

  const mainBuilding = getBuilding(villageId, 'main_building');
  const cost = getUpgradeCost(type, building.level);
  const timeSeconds = getUpgradeTimeSeconds(type, building.level, mainBuilding.level);

  if (village.wood < cost.wood || village.clay < cost.clay || village.iron < cost.iron || village.grain < cost.grain) {
    return { success: false, reason: 'Yetersiz kaynak.', cost };
  }

  db.prepare(`
    UPDATE villages
    SET wood = wood - ?, clay = clay - ?, iron = iron - ?, grain = grain - ?
    WHERE id = ?
  `).run(cost.wood, cost.clay, cost.iron, cost.grain, villageId);

  const finishesAt = new Date(Date.now() + timeSeconds * 1000).toISOString();
  db.prepare(`
    UPDATE buildings SET upgrading = 1, upgrade_finishes_at = ? WHERE id = ?
  `).run(finishesAt, building.id);

  return { success: true, timeSeconds, cost };
}

module.exports = {
  getVillageBuildings,
  getBuilding,
  completeFinishedUpgrades,
  applyBuildingEffect,
  refreshVillage,
  startUpgrade
};
