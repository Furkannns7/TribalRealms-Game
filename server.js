// server.js
// Kucuk bir web sunucusu: hem Telegram Mini App'in (Web App) dosyalarini
// (webapp/ klasoru) sunar hem de mini app'in kullandigi API uc noktalarini
// saglar: koy/bina verisi, medeniyet secimi, asker egitimi, saldiri ve
// savas raporlari. bot.js ile AYNI surecte, ayni veritabanini paylasarak
// calisir — ayri bir sunucu baslatmana gerek yok.

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { db } = require('./database');
const {
  BUILDINGS, CIVILIZATIONS, MILITARY_UNITS, WORLD_SIZE,
  getUpgradeCost, getUpgradeTimeSeconds, getUnitsForCivilization, getTrainTimeSeconds
} = require('./game-config');
const { getVillageBuildings, getBuilding, startUpgrade, refreshVillage } = require('./buildings');
const { createVillage } = require('./players');
const { getArmy, getTrainingQueue, completeFinishedTraining, startTraining } = require('./military');
const {
  launchAttack, completeFinishedAttacks, getOutgoingAttacks, getIncomingAttacks, getReportsForUser
} = require('./combat');
const { getVillageOffers, getOtherOffers, createOffer, cancelOffer, acceptOffer } = require('./market');
const { getRecentMessages, sendMessage, getClanMessages, sendClanMessage } = require('./chat');
const { getClanById, getClanMembers, getAllClans, createClan, joinClan, leaveClan, kickMember } = require('./clans');

const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();

// ---------------------------------------------------------
// TELEGRAM WEB APP DOGRULAMASI
// ---------------------------------------------------------
function verifyInitData(initData) {
  if (!initData || !BOT_TOKEN) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const pairs = [];
  for (const [key, value] of params.entries()) {
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  const userJson = params.get('user');
  if (!userJson) return null;

  try {
    return JSON.parse(userJson);
  } catch (err) {
    return null;
  }
}

// initData'yi dogrulayip veritabanindaki kullaniciyi dondurur (koyu olsun
// olmasin). Basarisiz olursa null doner.
function authenticateUser(initData) {
  const tgUser = verifyInitData(initData);
  if (!tgUser) return null;
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(tgUser.id) || null;
}

function getVillageForUser(dbUser) {
  return db.prepare('SELECT * FROM villages WHERE user_id = ?').get(dbUser.id);
}

// ---------------------------------------------------------
// YARDIMCI: koy + bina + ordu verisini mini app'in anlayacagi JSON'a cevirir
// ---------------------------------------------------------
function buildVillagePayload(villageId, userId) {
  const village = refreshVillage(villageId);
  const mainBuilding = getBuilding(villageId, 'main_building');
  const barracks = getBuilding(villageId, 'barracks');
  const buildingRows = getVillageBuildings(villageId);
  const dbUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  const buildings = buildingRows.map((b) => {
    const config = BUILDINGS[b.type];
    const nextCost = getUpgradeCost(b.type, b.level);
    const nextTimeSeconds = getUpgradeTimeSeconds(b.type, b.level, mainBuilding.level);
    return {
      type: b.type,
      name: config.name,
      level: b.level,
      upgrading: !!b.upgrading,
      upgradeFinishesAt: b.upgrade_finishes_at,
      nextCost,
      nextTimeSeconds
    };
  });

  completeFinishedTraining(villageId);

  const armyRows = getArmy(villageId);
  const armyByType = {};
  for (const row of armyRows) armyByType[row.unit_type] = row.count;

  const unitRoster = getUnitsForCivilization(dbUser.civilization).map((unit) => ({
    type: unit.type,
    name: unit.name,
    role: unit.role,
    attack: unit.attack,
    defense: unit.defense,
    carry: unit.carry,
    upkeep: unit.upkeep,
    cost: unit.cost,
    trainTimeSeconds: getTrainTimeSeconds(unit.type, 1, barracks.level),
    owned: armyByType[unit.type] || 0
  }));

  const trainingQueue = getTrainingQueue(villageId).map((q) => ({
    unitType: q.unit_type,
    unitName: MILITARY_UNITS[q.unit_type].name,
    quantity: q.quantity,
    finishesAt: q.finishes_at
  }));

  return {
    village: {
      name: village.name,
      civilization: dbUser.civilization,
      civilizationName: CIVILIZATIONS[dbUser.civilization] ? CIVILIZATIONS[dbUser.civilization].name : dbUser.civilization,
      wood: village.wood,
      clay: village.clay,
      iron: village.iron,
      grain: village.grain,
      woodProduction: village.wood_production,
      clayProduction: village.clay_production,
      ironProduction: village.iron_production,
      grainProduction: village.grain_production,
      warehouseCapacity: village.warehouse_capacity,
      granaryCapacity: village.granary_capacity
    },
    buildings,
    barracksLevel: barracks.level,
    army: armyRows.map((r) => ({ type: r.unit_type, name: MILITARY_UNITS[r.unit_type].name, count: r.count })),
    unitRoster,
    trainingQueue,
    outgoingAttacks: getOutgoingAttacks(villageId).map((a) => ({ arrivesAt: a.arrives_at })),
    incomingAttacks: getIncomingAttacks(villageId).map((a) => ({ arrivesAt: a.arrives_at }))
  };
}

// Ham bir savas raporu satirini, bakan kisiye gore okunabilir hale getirir.
function formatReport(row, viewerUserId) {
  const isAttacker = row.attacker_user_id === viewerUserId;
  const unitsSent = JSON.parse(row.units_sent);
  const attackerLosses = JSON.parse(row.attacker_losses);
  const defenderLosses = JSON.parse(row.defender_losses);
  const loot = JSON.parse(row.loot);

  const nameUnits = (obj) => Object.entries(obj)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => ({ type, name: MILITARY_UNITS[type] ? MILITARY_UNITS[type].name : type, count }));

  return {
    id: row.id,
    role: isAttacker ? 'attacker' : 'defender',
    won: isAttacker ? row.outcome === 'attacker_win' : row.outcome === 'defender_win',
    opponentName: isAttacker
      ? (row.defender_username ? '@' + row.defender_username : row.defender_first_name)
      : (row.attacker_username ? '@' + row.attacker_username : row.attacker_first_name),
    opponentVillage: isAttacker ? row.defender_village_name : row.attacker_village_name,
    unitsSent: nameUnits(unitsSent),
    attackerLosses: nameUnits(attackerLosses),
    defenderLosses: nameUnits(defenderLosses),
    loot,
    createdAt: row.created_at
  };
}

// Bir koyun pazar durumunu (seviye, kendi teklifleri, baskalarinin
// teklifleri, guncel kaynaklar) mini app'in anlayacagi JSON'a cevirir.
function buildMarketPayload(villageId) {
  const village = refreshVillage(villageId);
  const marketBuilding = getBuilding(villageId, 'market');

  return {
    marketLevel: marketBuilding.level,
    myOffers: getVillageOffers(villageId).map((o) => ({
      id: o.id,
      offerResource: o.offer_resource,
      offerAmount: o.offer_amount,
      requestResource: o.request_resource,
      requestAmount: o.request_amount
    })),
    offers: getOtherOffers(villageId, 50).map((o) => ({
      id: o.id,
      offerResource: o.offer_resource,
      offerAmount: o.offer_amount,
      requestResource: o.request_resource,
      requestAmount: o.request_amount,
      fromName: o.username ? '@' + o.username : o.first_name,
      fromVillage: o.village_name
    })),
    village: {
      wood: village.wood,
      clay: village.clay,
      iron: village.iron,
      grain: village.grain,
      warehouseCapacity: village.warehouse_capacity,
      granaryCapacity: village.granary_capacity
    }
  };
}

function formatChatMessages(rows, viewerUserId) {
  return rows.map((r) => ({
    id: r.id,
    senderName: r.username ? '@' + r.username : r.first_name,
    message: r.message,
    createdAt: r.created_at,
    isMine: r.user_id === viewerUserId
  }));
}

// Bu kullanicinin klan durumunu (klandaysa uye listesiyle, degilse
// katilinabilecek klan listesiyle) mini app'in anlayacagi JSON'a cevirir.
function buildClanStatusPayload(dbUser) {
  if (!dbUser.clan_id) {
    return {
      inClan: false,
      clans: getAllClans().map((c) => ({ id: c.id, name: c.name, tag: c.tag, memberCount: c.member_count }))
    };
  }

  const clan = getClanById(dbUser.clan_id);
  const members = getClanMembers(dbUser.clan_id).map((m) => ({
    id: m.id,
    name: m.username ? '@' + m.username : m.first_name,
    isLeader: m.id === clan.leader_user_id
  }));

  return {
    inClan: true,
    clan: { id: clan.id, name: clan.name, tag: clan.tag, isLeader: clan.leader_user_id === dbUser.id },
    members
  };
}

function startServer(port) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'webapp')));

  // Koy + binalar + ordu verisini getirir. Koy yoksa (henuz medeniyet
  // secilmemis) bunun yerine secim ekrani icin gereken veriyi dondurur.
  app.post('/api/village', (req, res) => {
    const dbUser = authenticateUser(req.body.initData);
    if (!dbUser) {
      return res.status(401).json({ error: 'Dogrulama basarisiz. Once botta /start yapmalisin.' });
    }

    const village = getVillageForUser(dbUser);
    if (!village) {
      return res.json({
        needsCivilization: true,
        civilizations: Object.entries(CIVILIZATIONS).map(([key, c]) => ({ key, ...c }))
      });
    }

    completeFinishedAttacks();
    res.json(buildVillagePayload(village.id, dbUser.id));
  });

  // Ilk koyu, secilen medeniyetle birlikte olusturur.
  app.post('/api/choose-civilization', (req, res) => {
    const dbUser = authenticateUser(req.body.initData);
    if (!dbUser) {
      return res.status(401).json({ error: 'Dogrulama basarisiz.' });
    }
    if (getVillageForUser(dbUser)) {
      return res.status(400).json({ error: 'Zaten bir koyun var.' });
    }

    const civilization = req.body.civilization;
    if (!CIVILIZATIONS[civilization]) {
      return res.status(400).json({ error: 'Gecersiz medeniyet.' });
    }

    const villageName = `${dbUser.first_name || 'Oyuncu'}'nun Koyu`;
    const village = createVillage(dbUser.id, villageName, civilization);

    res.json(buildVillagePayload(village.id, dbUser.id));
  });

  // Bir binayi bir ust seviyeye yukseltmeyi dener.
  app.post('/api/upgrade', (req, res) => {
    const dbUser = authenticateUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Dogrulama basarisiz.' });
    const village = getVillageForUser(dbUser);
    if (!village) return res.status(404).json({ error: 'Once koy kurmalisin.' });

    const type = req.body.type;
    if (!BUILDINGS[type]) {
      return res.status(400).json({ error: 'Gecersiz bina tipi.' });
    }

    const result = startUpgrade(village.id, type);
    if (!result.success) {
      return res.status(400).json({ error: result.reason, cost: result.cost || null });
    }

    res.json({ success: true, timeSeconds: result.timeSeconds, ...buildVillagePayload(village.id, dbUser.id) });
  });

  // Asker egitimi baslatir.
  app.post('/api/train', (req, res) => {
    const dbUser = authenticateUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Dogrulama basarisiz.' });
    const village = getVillageForUser(dbUser);
    if (!village) return res.status(404).json({ error: 'Once koy kurmalisin.' });

    const unitType = req.body.unitType;
    const quantity = Math.floor(Number(req.body.quantity));
    const unit = MILITARY_UNITS[unitType];

    if (!unit || unit.civilization !== dbUser.civilization) {
      return res.status(400).json({ error: 'Bu birimi egitemezsin.' });
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'Gecersiz adet.' });
    }

    const barracks = getBuilding(village.id, 'barracks');
    const result = startTraining(village.id, unitType, quantity, barracks.level);
    if (!result.success) {
      return res.status(400).json({ error: result.reason, cost: result.cost || null });
    }

    res.json({ success: true, ...buildVillagePayload(village.id, dbUser.id) });
  });

  // Baska bir oyuncunun koyune saldiri gonderir.
  app.post('/api/attack', (req, res) => {
    const dbUser = authenticateUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Dogrulama basarisiz.' });
    const village = getVillageForUser(dbUser);
    if (!village) return res.status(404).json({ error: 'Once koy kurmalisin.' });

    const target = req.body.target;
    const units = req.body.units;
    if (!target || typeof units !== 'object' || units === null) {
      return res.status(400).json({ error: 'Gecersiz istek.' });
    }

    const unitsMap = {};
    for (const [type, qty] of Object.entries(units)) {
      const n = Math.floor(Number(qty));
      if (n > 0) unitsMap[type] = n;
    }

    const result = launchAttack(village.id, target, unitsMap);
    if (!result.success) {
      return res.status(400).json({ error: result.reason });
    }

    res.json({
      success: true,
      travelSeconds: result.travelSeconds,
      arrivesAt: result.arrivesAt,
      targetName: result.targetName,
      ...buildVillagePayload(village.id, dbUser.id)
    });
  });

  // Bu kullanicinin (saldiran ya da savunan olarak) katildigi savas
  // raporlarini (yagmalama loglarini) getirir.
  app.post('/api/reports', (req, res) => {
    const dbUser = authenticateUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Dogrulama basarisiz.' });

    completeFinishedAttacks();
    const rows = getReportsForUser(dbUser.id, 30);
    res.json({ reports: rows.map((r) => formatReport(r, dbUser.id)) });
  });

  // Dunya haritasindaki tum koyleri (sahibi, medeniyeti, konumu, benden
  // uzakligi) getirir. Kaynak/ordu bilgisi PAYLASILMAZ, sadece harita icin
  // gereken genel bilgiler doner.
  app.post('/api/map', (req, res) => {
    const dbUser = authenticateUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Dogrulama basarisiz.' });

    const myVillage = getVillageForUser(dbUser);

    const rows = db.prepare(`
      SELECT v.id, v.name, v.x, v.y, u.telegram_id, u.username, u.first_name, u.civilization, c.tag AS clan_tag
      FROM villages v
      JOIN users u ON u.id = v.user_id
      LEFT JOIN clans c ON c.id = u.clan_id
    `).all();

    const villages = rows.map((r) => {
      const isMine = !!myVillage && r.id === myVillage.id;
      const distance = (myVillage && !isMine)
        ? Math.round(Math.sqrt(Math.pow(r.x - myVillage.x, 2) + Math.pow(r.y - myVillage.y, 2)))
        : 0;
      return {
        id: r.id,
        name: r.name,
        x: r.x,
        y: r.y,
        ownerName: r.username ? '@' + r.username : r.first_name,
        ownerUsername: r.username || null,
        ownerTelegramId: r.telegram_id,
        civilization: r.civilization,
        clanTag: r.clan_tag || null,
        isMine,
        distance
      };
    });

    res.json({ worldSize: WORLD_SIZE, villages });
  });

  // Bu koyun pazar durumunu (seviye, kendi teklifleri, baskalarinin
  // teklifleri) getirir.
  app.post('/api/market', (req, res) => {
    const dbUser = authenticateUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Dogrulama basarisiz.' });
    const village = getVillageForUser(dbUser);
    if (!village) return res.status(404).json({ error: 'Once koy kurmalisin.' });

    res.json(buildMarketPayload(village.id));
  });

  // Yeni bir takas teklifi olusturur.
  app.post('/api/market/create', (req, res) => {
    const dbUser = authenticateUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Dogrulama basarisiz.' });
    const village = getVillageForUser(dbUser);
    if (!village) return res.status(404).json({ error: 'Once koy kurmalisin.' });

    const marketBuilding = getBuilding(village.id, 'market');
    const offerAmount = Math.floor(Number(req.body.offerAmount));
    const requestAmount = Math.floor(Number(req.body.requestAmount));

    const result = createOffer(
      village.id, req.body.offerResource, offerAmount, req.body.requestResource, requestAmount, marketBuilding.level
    );
    if (!result.success) {
      return res.status(400).json({ error: result.reason });
    }

    res.json(buildMarketPayload(village.id));
  });

  // Kendi teklifini iptal eder.
  app.post('/api/market/cancel', (req, res) => {
    const dbUser = authenticateUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Dogrulama basarisiz.' });
    const village = getVillageForUser(dbUser);
    if (!village) return res.status(404).json({ error: 'Once koy kurmalisin.' });

    const result = cancelOffer(Number(req.body.offerId), village.id);
    if (!result.success) {
      return res.status(400).json({ error: result.reason });
    }

    res.json(buildMarketPayload(village.id));
  });

  // Baska bir oyuncunun teklifini kabul eder.
  app.post('/api/market/accept', (req, res) => {
    const dbUser = authenticateUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Dogrulama basarisiz.' });
    const village = getVillageForUser(dbUser);
    if (!village) return res.status(404).json({ error: 'Once koy kurmalisin.' });

    const result = acceptOffer(Number(req.body.offerId), village.id);
    if (!result.success) {
      return res.status(400).json({ error: result.reason });
    }

    res.json(buildMarketPayload(village.id));
  });

  // Genel sohbetteki son mesajlari getirir.
  app.post('/api/chat', (req, res) => {
    const dbUser = authenticateUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Dogrulama basarisiz.' });

    res.json({ messages: formatChatMessages(getRecentMessages(50), dbUser.id) });
  });

  // Genel sohbete yeni bir mesaj gonderir.
  app.post('/api/chat/send', (req, res) => {
    const dbUser = authenticateUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Dogrulama basarisiz.' });

    const result = sendMessage(dbUser.id, req.body.message);
    if (!result.success) {
      return res.status(400).json({ error: result.reason });
    }

    res.json({ messages: formatChatMessages(getRecentMessages(50), dbUser.id) });
  });

  // Bu kullanicinin klan durumunu getirir.
  app.post('/api/clan', (req, res) => {
    const dbUser = authenticateUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Dogrulama basarisiz.' });

    res.json(buildClanStatusPayload(dbUser));
  });

  // Yeni bir klan kurar.
  app.post('/api/clan/create', (req, res) => {
    const dbUser = authenticateUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Dogrulama basarisiz.' });

    const result = createClan(dbUser.id, req.body.name, req.body.tag);
    if (!result.success) {
      return res.status(400).json({ error: result.reason });
    }

    const freshUser = db.prepare('SELECT * FROM users WHERE id = ?').get(dbUser.id);
    res.json(buildClanStatusPayload(freshUser));
  });

  // Var olan bir klana katilir.
  app.post('/api/clan/join', (req, res) => {
    const dbUser = authenticateUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Dogrulama basarisiz.' });

    const result = joinClan(dbUser.id, Number(req.body.clanId));
    if (!result.success) {
      return res.status(400).json({ error: result.reason });
    }

    const freshUser = db.prepare('SELECT * FROM users WHERE id = ?').get(dbUser.id);
    res.json(buildClanStatusPayload(freshUser));
  });

  // Klandan ayrilir.
  app.post('/api/clan/leave', (req, res) => {
    const dbUser = authenticateUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Dogrulama basarisiz.' });

    const result = leaveClan(dbUser.id);
    if (!result.success) {
      return res.status(400).json({ error: result.reason });
    }

    const freshUser = db.prepare('SELECT * FROM users WHERE id = ?').get(dbUser.id);
    res.json(buildClanStatusPayload(freshUser));
  });

  // Klan lideri, baska bir uyeyi atar.
  app.post('/api/clan/kick', (req, res) => {
    const dbUser = authenticateUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Dogrulama basarisiz.' });

    const result = kickMember(dbUser.id, Number(req.body.targetUserId));
    if (!result.success) {
      return res.status(400).json({ error: result.reason });
    }

    res.json(buildClanStatusPayload(dbUser));
  });

  // Klan sohbetindeki son mesajlari getirir.
  app.post('/api/clan/chat', (req, res) => {
    const dbUser = authenticateUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Dogrulama basarisiz.' });
    if (!dbUser.clan_id) return res.status(400).json({ error: 'Bir klanda degilsin.' });

    res.json({ messages: formatChatMessages(getClanMessages(dbUser.clan_id, 50), dbUser.id) });
  });

  // Klan sohbetine mesaj gonderir.
  app.post('/api/clan/chat/send', (req, res) => {
    const dbUser = authenticateUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Dogrulama basarisiz.' });
    if (!dbUser.clan_id) return res.status(400).json({ error: 'Bir klanda degilsin.' });

    const result = sendClanMessage(dbUser.clan_id, dbUser.id, req.body.message);
    if (!result.success) {
      return res.status(400).json({ error: result.reason });
    }

    res.json({ messages: formatChatMessages(getClanMessages(dbUser.clan_id, 50), dbUser.id) });
  });

  app.listen(port, () => {
    console.log(`Mini App sunucusu http://localhost:${port} adresinde calisiyor.`);
  });
}

module.exports = { startServer };
