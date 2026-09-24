// npc.js
// Vahalar (oasis) ve haydut kamplari (bandit_camp): oyunculara ait olmayan,
// haritada sabit duran PvE hedefleri. Vahalar ele gecirilince surekli bir
// uretim bonusu verir; haydut kamplari zamanla yeniden dolan bir kaynak
// stogunu tekrar tekrar yagmalamaya acik tutar.

const { db } = require('./database');
const { NPC_UNITS, MILITARY_UNITS, WORLD_SIZE } = require('./game-config');
const { resolveBattle, calculateLoot, calculateTravelSeconds } = require('./combat');
const { getArmyCount, removeUnits, addUnits } = require('./military');

const OASIS_RESOURCES = ['wood', 'clay', 'iron', 'grain'];
const BANDIT_REGEN_PER_HOUR = 40; // haydut kampinin saatlik kaynak yenilenme hizi

// ---------------------------------------------------------
// DUNYAYI BIR KEZE MAHSUS DOLDURMA (SEED)
// ---------------------------------------------------------

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const OASIS_TIERS = [
  { garrison: { wolf: 2 }, bonusPercent: 15 },
  { garrison: { wolf: 3, boar: 2 }, bonusPercent: 25 },
  { garrison: { bear: 2, wolf: 3 }, bonusPercent: 35 }
];

const OASIS_NAME_BY_RESOURCE = {
  wood: 'Çam Ormanı Vahası',
  clay: 'Kil Vadisi Vahası',
  iron: 'Demir Mağarası Vahası',
  grain: 'Buğday Ovası Vahası'
};

// Veritabani bombos ise dunyaya bir kereye mahsus vaha ve haydut kampi
// serpistirir. Zaten doluysa hicbir sey yapmaz (tekrar tekrar cagirmak guvenli).
function seedNpcTargets() {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM npc_targets').get().c;
  if (existing > 0) return;

  const insert = db.prepare(`
    INSERT INTO npc_targets (type, name, x, y, garrison, bonus_resource, bonus_percent, loot_wood, loot_clay, loot_iron, loot_grain, loot_capacity, last_regen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();

  // 16 vaha: 4 kaynak turu x 4'er adet, tier'lar karisik.
  for (const resource of OASIS_RESOURCES) {
    for (let i = 0; i < 4; i++) {
      const tier = pick(OASIS_TIERS);
      insert.run(
        'oasis',
        OASIS_NAME_BY_RESOURCE[resource],
        randInt(0, WORLD_SIZE - 1),
        randInt(0, WORLD_SIZE - 1),
        JSON.stringify(tier.garrison),
        resource,
        tier.bonusPercent,
        0, 0, 0, 0, 0,
        now
      );
    }
  }

  // 10 haydut kampi.
  for (let i = 1; i <= 10; i++) {
    const capacity = randInt(300, 600);
    insert.run(
      'bandit_camp',
      `Haydut Kampı #${i}`,
      randInt(0, WORLD_SIZE - 1),
      randInt(0, WORLD_SIZE - 1),
      JSON.stringify({ bandit: randInt(3, 9) }),
      null, null,
      randInt(50, capacity), randInt(50, capacity), randInt(50, capacity), randInt(50, capacity),
      capacity,
      now
    );
  }

  console.log('PvE hedefleri (vahalar + haydut kamplari) olusturuldu.');
}

// ---------------------------------------------------------
// HAYDUT KAMPI KAYNAK YENILENMESI (tembel hesaplama, koylerdeki gibi)
// ---------------------------------------------------------

function regenBanditCamp(camp) {
  if (camp.type !== 'bandit_camp') return camp;

  const now = Date.now();
  const lastRegen = new Date(camp.last_regen).getTime();
  const elapsedHours = Math.max(0, (now - lastRegen) / (1000 * 60 * 60));
  if (elapsedHours <= 0) return camp;

  const gain = BANDIT_REGEN_PER_HOUR * elapsedHours;
  const newWood = Math.min(camp.loot_capacity, camp.loot_wood + gain);
  const newClay = Math.min(camp.loot_capacity, camp.loot_clay + gain);
  const newIron = Math.min(camp.loot_capacity, camp.loot_iron + gain);
  const newGrain = Math.min(camp.loot_capacity, camp.loot_grain + gain);

  db.prepare(`
    UPDATE npc_targets SET loot_wood = ?, loot_clay = ?, loot_iron = ?, loot_grain = ?, last_regen = ?
    WHERE id = ?
  `).run(Math.floor(newWood), Math.floor(newClay), Math.floor(newIron), Math.floor(newGrain), new Date().toISOString(), camp.id);

  return db.prepare('SELECT * FROM npc_targets WHERE id = ?').get(camp.id);
}

function getNpcTarget(id) {
  let target = db.prepare('SELECT * FROM npc_targets WHERE id = ?').get(id);
  if (!target) return null;
  if (target.type === 'bandit_camp') target = regenBanditCamp(target);
  return target;
}

// Haritada gosterilecek tum PvE hedeflerini getirir.
function getMapNpcTargets() {
  return db.prepare('SELECT * FROM npc_targets').all();
}

// Bir koyun sahip oldugu vahalarin, belirli bir kaynak icin toplam uretim
// bonusunu (carpan olarak, ornegin 1.25 = +%25) hesaplar.
function getOasisBonusMultiplier(villageId, resource) {
  const rows = db.prepare(`
    SELECT bonus_percent FROM npc_targets
    WHERE type = 'oasis' AND claimed_by_village_id = ? AND bonus_resource = ?
  `).all(villageId, resource);

  const totalPercent = rows.reduce((sum, r) => sum + r.bonus_percent, 0);
  return 1 + totalPercent / 100;
}

// ---------------------------------------------------------
// SALDIRI GONDERME
// ---------------------------------------------------------

function attackNpcTarget(attackerVillageId, npcId, unitsMap) {
  const requestedTypes = Object.keys(unitsMap).filter((t) => unitsMap[t] > 0);
  if (requestedTypes.length === 0) {
    return { success: false, reason: 'En az bir birlik seçmelisin.' };
  }

  const target = getNpcTarget(npcId);
  if (!target) {
    return { success: false, reason: 'Hedef bulunamadı.' };
  }
  if (target.type === 'oasis' && target.claimed_by_village_id) {
    return { success: false, reason: 'Bu vaha zaten ele geçirilmiş.' };
  }

  const attackerVillage = db.prepare('SELECT * FROM villages WHERE id = ?').get(attackerVillageId);

  for (const type of requestedTypes) {
    if (getArmyCount(attackerVillageId, type) < unitsMap[type]) {
      return { success: false, reason: `Yetersiz ${MILITARY_UNITS[type].name}.` };
    }
  }

  for (const type of requestedTypes) {
    removeUnits(attackerVillageId, type, unitsMap[type]);
  }

  const travelSeconds = calculateTravelSeconds(attackerVillage, target, requestedTypes);
  const arrivesAt = new Date(Date.now() + travelSeconds * 1000).toISOString();

  const unitsToSend = {};
  for (const type of requestedTypes) unitsToSend[type] = unitsMap[type];

  db.prepare(`
    INSERT INTO npc_attacks (attacker_village_id, npc_target_id, units, arrives_at)
    VALUES (?, ?, ?, ?)
  `).run(attackerVillageId, npcId, JSON.stringify(unitsToSend), arrivesAt);

  return { success: true, travelSeconds, arrivesAt, targetName: target.name };
}

// ---------------------------------------------------------
// SALDIRILARI SONUCLANDIRMA
// ---------------------------------------------------------

function completeFinishedNpcAttacks() {
  const now = new Date().toISOString();
  const dueAttacks = db.prepare('SELECT * FROM npc_attacks WHERE arrives_at <= ?').all(now);

  for (const attack of dueAttacks) {
    const unitsSent = JSON.parse(attack.units);
    let target = getNpcTarget(attack.npc_target_id);
    const attackerVillage = db.prepare('SELECT * FROM villages WHERE id = ?').get(attack.attacker_village_id);

    if (!target || !attackerVillage) {
      db.prepare('DELETE FROM npc_attacks WHERE id = ?').run(attack.id);
      continue;
    }

    const garrison = Object.entries(JSON.parse(target.garrison)).map(([unit_type, count]) => ({ unit_type, count }));
    const result = resolveBattle(unitsSent, garrison, NPC_UNITS);

    if (result.attackerWins) {
      if (target.type === 'oasis') {
        db.prepare('UPDATE npc_targets SET claimed_by_village_id = ? WHERE id = ?').run(attackerVillage.id, target.id);
      } else {
        const loot = calculateLoot(result.survivingAttackers, {
          wood: target.loot_wood, clay: target.loot_clay, iron: target.loot_iron, grain: target.loot_grain
        });

        db.prepare(`
          UPDATE npc_targets SET loot_wood = loot_wood - ?, loot_clay = loot_clay - ?, loot_iron = loot_iron - ?, loot_grain = loot_grain - ?
          WHERE id = ?
        `).run(loot.wood, loot.clay, loot.iron, loot.grain, target.id);

        const attackerFresh = db.prepare('SELECT * FROM villages WHERE id = ?').get(attackerVillage.id);
        db.prepare('UPDATE villages SET wood = ?, clay = ?, iron = ?, grain = ? WHERE id = ?').run(
          Math.min(attackerFresh.warehouse_capacity, attackerFresh.wood + loot.wood),
          Math.min(attackerFresh.warehouse_capacity, attackerFresh.clay + loot.clay),
          Math.min(attackerFresh.warehouse_capacity, attackerFresh.iron + loot.iron),
          Math.min(attackerFresh.granary_capacity, attackerFresh.grain + loot.grain),
          attackerFresh.id
        );
      }

      // Hayatta kalan birlikler eve doner (koyler arasi saldirilardaki gibi, aninda).
      for (const [type, count] of Object.entries(result.survivingAttackers)) {
        if (count > 0) addUnits(attackerVillage.id, type, count);
      }
    }
    // Kaybedilirse gonderilen tum birlikler kaybedilir (zaten yola cikarken dusulmustu), garnizon degismez.

    db.prepare('DELETE FROM npc_attacks WHERE id = ?').run(attack.id);
  }

  return dueAttacks.length;
}

function getOutgoingNpcAttacks(villageId) {
  return db.prepare('SELECT id, npc_target_id, arrives_at FROM npc_attacks WHERE attacker_village_id = ? ORDER BY arrives_at ASC').all(villageId);
}

module.exports = {
  seedNpcTargets,
  getNpcTarget,
  getMapNpcTargets,
  getOasisBonusMultiplier,
  attackNpcTarget,
  completeFinishedNpcAttacks,
  getOutgoingNpcAttacks
};
