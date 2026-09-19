// combat.js
// Saldiri gonderme, savas matematigi ve savas raporlari (loglar) burada.

const { db } = require('./database');
const { MILITARY_UNITS } = require('./game-config');
const { getArmy, getArmyCount, addUnits, removeUnits } = require('./military');

// ---------------------------------------------------------
// HEDEF BULMA
// ---------------------------------------------------------

// Kullanici adi (@ ile veya ile) ya da Telegram ID ile hedef oyuncuyu/koyunu bulur.
function findTargetVillage(query) {
  const clean = String(query).trim().replace(/^@/, '');
  if (!clean) return null;

  let user = null;
  if (/^\d+$/.test(clean)) {
    user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(Number(clean));
  }
  if (!user) {
    user = db.prepare('SELECT * FROM users WHERE username IS NOT NULL AND LOWER(username) = LOWER(?)').get(clean);
  }
  if (!user) return null;

  const village = db.prepare('SELECT * FROM villages WHERE user_id = ?').get(user.id);
  if (!village) return null;

  return { user, village };
}

// ---------------------------------------------------------
// SEYAHAT SURESI
// ---------------------------------------------------------

// Iki koy arasindaki mesafeye ve gonderilen en yavas birimin hizina gore
// saldirinin varis suresini (saniye) hesaplar.
function calculateTravelSeconds(fromVillage, toVillage, unitTypes) {
  const dx = fromVillage.x - toVillage.x;
  const dy = fromVillage.y - toVillage.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const slowest = Math.max(...unitTypes.map((t) => MILITARY_UNITS[t].speedSecondsPerTile));
  return Math.max(10, Math.round(distance * slowest));
}

// ---------------------------------------------------------
// SAVAS MATEMATIGI
// ---------------------------------------------------------

// Saldiran gucu ile savunan gucunu karsilastirir, kayiplari ve (varsa)
// hayatta kalan saldirgan birimleri hesaplar. Basit kural: guclu taraf
// kazanir, kayiplar guc oranina gore olceklenir (max %70).
function resolveBattle(attackerUnits, defenderArmy) {
  let attackPower = 0;
  for (const [type, count] of Object.entries(attackerUnits)) {
    attackPower += count * MILITARY_UNITS[type].attack;
  }

  let defensePower = 0;
  for (const row of defenderArmy) {
    defensePower += row.count * MILITARY_UNITS[row.unit_type].defense;
  }

  const attackerWins = attackPower > defensePower;
  const attackerLosses = {};
  const defenderLosses = {};
  const survivingAttackers = {};

  if (attackerWins) {
    const ratio = attackPower > 0 ? defensePower / attackPower : 0;
    const lossFraction = Math.min(0.7, Math.pow(ratio, 1.5));

    for (const [type, count] of Object.entries(attackerUnits)) {
      const lost = Math.min(count, Math.round(count * lossFraction));
      attackerLosses[type] = lost;
      survivingAttackers[type] = count - lost;
    }
    for (const row of defenderArmy) {
      defenderLosses[row.unit_type] = row.count; // savunan tum birimlerini kaybeder
    }
  } else {
    const ratio = defensePower > 0 ? attackPower / defensePower : 1;
    const lossFraction = Math.min(0.7, Math.pow(ratio, 1.5));

    for (const row of defenderArmy) {
      defenderLosses[row.unit_type] = Math.min(row.count, Math.round(row.count * lossFraction));
    }
    for (const [type, count] of Object.entries(attackerUnits)) {
      attackerLosses[type] = count; // saldiri basarisiz, gonderilen birimler donmez
      survivingAttackers[type] = 0;
    }
  }

  return { attackerWins, attackPower, defensePower, attackerLosses, defenderLosses, survivingAttackers };
}

// Hayatta kalan saldirganlarin toplam tasima kapasitesine ve savunanin
// mevcut kaynaklarina gore yagma miktarini hesaplar.
function calculateLoot(survivingAttackers, defenderVillage) {
  let carryCapacity = 0;
  for (const [type, count] of Object.entries(survivingAttackers)) {
    carryCapacity += count * MILITARY_UNITS[type].carry;
  }

  const available = { wood: defenderVillage.wood, clay: defenderVillage.clay, iron: defenderVillage.iron, grain: defenderVillage.grain };
  const totalAvailable = available.wood + available.clay + available.iron + available.grain;
  const totalLoot = Math.min(carryCapacity, totalAvailable);

  if (totalAvailable <= 0 || totalLoot <= 0) {
    return { wood: 0, clay: 0, iron: 0, grain: 0 };
  }

  return {
    wood: Math.floor(totalLoot * (available.wood / totalAvailable)),
    clay: Math.floor(totalLoot * (available.clay / totalAvailable)),
    iron: Math.floor(totalLoot * (available.iron / totalAvailable)),
    grain: Math.floor(totalLoot * (available.grain / totalAvailable))
  };
}

// ---------------------------------------------------------
// SALDIRI BASLATMA
// ---------------------------------------------------------

function launchAttack(attackerVillageId, targetQuery, unitsMap) {
  const requestedTypes = Object.keys(unitsMap).filter((t) => unitsMap[t] > 0);
  if (requestedTypes.length === 0) {
    return { success: false, reason: 'En az bir birim secmelisin.' };
  }

  const attackerVillage = db.prepare('SELECT * FROM villages WHERE id = ?').get(attackerVillageId);
  const target = findTargetVillage(targetQuery);

  if (!target) {
    return { success: false, reason: 'Oyuncu bulunamadi. Kullanici adini veya Telegram ID\'sini kontrol et.' };
  }
  if (target.village.id === attackerVillageId) {
    return { success: false, reason: 'Kendi koyune saldiramazsin.' };
  }

  for (const type of requestedTypes) {
    if (getArmyCount(attackerVillageId, type) < unitsMap[type]) {
      return { success: false, reason: `Yetersiz ${MILITARY_UNITS[type].name}.` };
    }
  }

  for (const type of requestedTypes) {
    removeUnits(attackerVillageId, type, unitsMap[type]);
  }

  const travelSeconds = calculateTravelSeconds(attackerVillage, target.village, requestedTypes);
  const arrivesAt = new Date(Date.now() + travelSeconds * 1000).toISOString();

  const unitsToSend = {};
  for (const type of requestedTypes) unitsToSend[type] = unitsMap[type];

  db.prepare(`
    INSERT INTO attacks (attacker_village_id, defender_village_id, units, arrives_at)
    VALUES (?, ?, ?, ?)
  `).run(attackerVillageId, target.village.id, JSON.stringify(unitsToSend), arrivesAt);

  return { success: true, travelSeconds, arrivesAt, targetName: target.village.name };
}

// ---------------------------------------------------------
// SALDIRILARI SONUCLANDIRMA (zamanlayici tarafindan cagirilir)
// ---------------------------------------------------------

function completeFinishedAttacks() {
  const now = new Date().toISOString();
  const dueAttacks = db.prepare('SELECT * FROM attacks WHERE arrives_at <= ?').all(now);

  for (const attack of dueAttacks) {
    const unitsSent = JSON.parse(attack.units);
    const defenderVillage = db.prepare('SELECT * FROM villages WHERE id = ?').get(attack.defender_village_id);
    const attackerVillage = db.prepare('SELECT * FROM villages WHERE id = ?').get(attack.attacker_village_id);

    if (!defenderVillage || !attackerVillage) {
      db.prepare('DELETE FROM attacks WHERE id = ?').run(attack.id);
      continue;
    }

    const defenderArmy = getArmy(attack.defender_village_id);
    const result = resolveBattle(unitsSent, defenderArmy);

    for (const [type, lost] of Object.entries(result.defenderLosses)) {
      if (lost > 0) removeUnits(attack.defender_village_id, type, lost);
    }

    let loot = { wood: 0, clay: 0, iron: 0, grain: 0 };

    if (result.attackerWins) {
      loot = calculateLoot(result.survivingAttackers, defenderVillage);

      db.prepare(`
        UPDATE villages SET wood = wood - ?, clay = clay - ?, iron = iron - ?, grain = grain - ? WHERE id = ?
      `).run(loot.wood, loot.clay, loot.iron, loot.grain, defenderVillage.id);

      const attackerFresh = db.prepare('SELECT * FROM villages WHERE id = ?').get(attackerVillage.id);
      db.prepare('UPDATE villages SET wood = ?, clay = ?, iron = ?, grain = ? WHERE id = ?').run(
        Math.min(attackerFresh.warehouse_capacity, attackerFresh.wood + loot.wood),
        Math.min(attackerFresh.warehouse_capacity, attackerFresh.clay + loot.clay),
        Math.min(attackerFresh.warehouse_capacity, attackerFresh.iron + loot.iron),
        Math.min(attackerFresh.granary_capacity, attackerFresh.grain + loot.grain),
        attackerFresh.id
      );

      // Hayatta kalan saldirganlar eve doner (basitlestirme: aninda doner, donus yolculugu modellenmiyor).
      for (const [type, count] of Object.entries(result.survivingAttackers)) {
        if (count > 0) addUnits(attackerVillage.id, type, count);
      }
    }

    db.prepare(`
      INSERT INTO battle_reports (attacker_village_id, defender_village_id, attacker_user_id, defender_user_id, outcome, units_sent, attacker_losses, defender_losses, loot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      attackerVillage.id,
      defenderVillage.id,
      attackerVillage.user_id,
      defenderVillage.user_id,
      result.attackerWins ? 'attacker_win' : 'defender_win',
      JSON.stringify(unitsSent),
      JSON.stringify(result.attackerLosses),
      JSON.stringify(result.defenderLosses),
      JSON.stringify(loot)
    );

    db.prepare('DELETE FROM attacks WHERE id = ?').run(attack.id);
  }

  return dueAttacks.length;
}

// ---------------------------------------------------------
// YOLDAKI SALDIRILAR VE RAPORLAR
// ---------------------------------------------------------

function getOutgoingAttacks(villageId) {
  return db.prepare('SELECT id, arrives_at FROM attacks WHERE attacker_village_id = ? ORDER BY arrives_at ASC').all(villageId);
}

function getIncomingAttacks(villageId) {
  return db.prepare('SELECT id, arrives_at FROM attacks WHERE defender_village_id = ? ORDER BY arrives_at ASC').all(villageId);
}

function getReportsForUser(userId, limit) {
  return db.prepare(`
    SELECT br.*,
           av.name AS attacker_village_name, dv.name AS defender_village_name,
           au.first_name AS attacker_first_name, au.username AS attacker_username,
           du.first_name AS defender_first_name, du.username AS defender_username
    FROM battle_reports br
    JOIN villages av ON av.id = br.attacker_village_id
    JOIN villages dv ON dv.id = br.defender_village_id
    JOIN users au ON au.id = br.attacker_user_id
    JOIN users du ON du.id = br.defender_user_id
    WHERE br.attacker_user_id = ? OR br.defender_user_id = ?
    ORDER BY br.created_at DESC
    LIMIT ?
  `).all(userId, userId, limit || 30);
}

module.exports = {
  findTargetVillage,
  calculateTravelSeconds,
  resolveBattle,
  calculateLoot,
  launchAttack,
  completeFinishedAttacks,
  getOutgoingAttacks,
  getIncomingAttacks,
  getReportsForUser
};
