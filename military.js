// military.js
// Ordu (army) ve asker egitimi (training_queue) ile ilgili tum mantik burada.
// buildings.js'teki insaat sistemiyle aynı desen: baslat -> zamani gelince
// tamamla -> refresh fonksiyonu her ikisini de kontrol eder.

const { db } = require('./database');
const { MILITARY_UNITS, getUnitsForCivilization, getTrainTimeSeconds } = require('./game-config');

// Bir koyun ordusunu (birim tipi -> adet) getirir.
function getArmy(villageId) {
  return db.prepare('SELECT unit_type, count FROM army WHERE village_id = ? AND count > 0').all(villageId);
}

function getArmyCount(villageId, unitType) {
  const row = db.prepare('SELECT count FROM army WHERE village_id = ? AND unit_type = ?').get(villageId, unitType);
  return row ? row.count : 0;
}

// Orduya birim ekler (egitim tamamlandiginda ya da saldiridan donen birimler icin).
function addUnits(villageId, unitType, quantity) {
  if (quantity <= 0) return;
  db.prepare(`
    INSERT INTO army (village_id, unit_type, count) VALUES (?, ?, ?)
    ON CONFLICT(village_id, unit_type) DO UPDATE SET count = count + excluded.count
  `).run(villageId, unitType, quantity);
}

// Ordudan birim duser (saldiriya giderken ya da kayip olarak). Negatife
// dusmez, elde ne varsa o kadar duser ve gercekte dusulen miktari dondurur.
function removeUnits(villageId, unitType, quantity) {
  const current = getArmyCount(villageId, unitType);
  const actual = Math.min(current, quantity);
  if (actual <= 0) return 0;
  db.prepare('UPDATE army SET count = count - ? WHERE village_id = ? AND unit_type = ?').run(actual, villageId, unitType);
  return actual;
}

function getTrainingQueue(villageId) {
  return db.prepare('SELECT * FROM training_queue WHERE village_id = ? ORDER BY finishes_at ASC').all(villageId);
}

// Suresi dolan egitim siparislerini orduya ekler.
function completeFinishedTraining(villageId) {
  const now = new Date().toISOString();
  const finished = db.prepare(`
    SELECT * FROM training_queue WHERE village_id = ? AND finishes_at <= ?
  `).all(villageId, now);

  for (const order of finished) {
    addUnits(villageId, order.unit_type, order.quantity);
    db.prepare('DELETE FROM training_queue WHERE id = ?').run(order.id);
  }

  return finished.length;
}

// Yeni bir asker egitim siparisi baslatir. Kislanin mevcut kuyrugunun
// arkasina eklenir (sirayla tamamlanir).
function startTraining(villageId, unitType, quantity, barracksLevel) {
  const unit = MILITARY_UNITS[unitType];
  if (!unit) {
    return { success: false, reason: 'Gecersiz birim tipi.' };
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { success: false, reason: 'Gecersiz adet.' };
  }

  const village = db.prepare('SELECT * FROM villages WHERE id = ?').get(villageId);
  const totalCost = {
    wood: unit.cost.wood * quantity,
    clay: unit.cost.clay * quantity,
    iron: unit.cost.iron * quantity,
    grain: unit.cost.grain * quantity
  };

  if (village.wood < totalCost.wood || village.clay < totalCost.clay || village.iron < totalCost.iron || village.grain < totalCost.grain) {
    return { success: false, reason: 'Yetersiz kaynak.', cost: totalCost };
  }

  db.prepare(`
    UPDATE villages SET wood = wood - ?, clay = clay - ?, iron = iron - ?, grain = grain - ? WHERE id = ?
  `).run(totalCost.wood, totalCost.clay, totalCost.iron, totalCost.grain, villageId);

  const durationSeconds = getTrainTimeSeconds(unitType, quantity, barracksLevel);

  // Kuyrukta zaten bekleyen bir siparis varsa, yenisi onun bitisinden sonra baslar.
  const lastInQueue = db.prepare(`
    SELECT finishes_at FROM training_queue WHERE village_id = ? ORDER BY finishes_at DESC LIMIT 1
  `).get(villageId);

  const startFrom = lastInQueue ? new Date(lastInQueue.finishes_at).getTime() : Date.now();
  const baseTime = Math.max(startFrom, Date.now());
  const finishesAt = new Date(baseTime + durationSeconds * 1000).toISOString();

  db.prepare(`
    INSERT INTO training_queue (village_id, unit_type, quantity, finishes_at) VALUES (?, ?, ?, ?)
  `).run(villageId, unitType, quantity, finishesAt);

  return { success: true, finishesAt, durationSeconds, cost: totalCost };
}

module.exports = {
  getArmy,
  getArmyCount,
  addUnits,
  removeUnits,
  getTrainingQueue,
  completeFinishedTraining,
  startTraining,
  getUnitsForCivilization
};
