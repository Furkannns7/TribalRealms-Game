// server.js
// Kucuk bir web sunucusu: hem Telegram Mini App'in (Web App) dosyalarini
// (webapp/ klasoru) sunar hem de mini app'in kullandigi API uc noktalarini
// (koy verisi getirme, bina yukseltme) saglar. bot.js ile AYNI surecte,
// ayni veritabanini paylasarak calisir — ayri bir sunucu baslatmana gerek yok.

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { db } = require('./database');
const { BUILDINGS, getUpgradeCost, getUpgradeTimeSeconds } = require('./game-config');
const { getVillageBuildings, getBuilding, startUpgrade, refreshVillage } = require('./buildings');

const BOT_TOKEN = process.env.BOT_TOKEN;

// ---------------------------------------------------------
// TELEGRAM WEB APP DOGRULAMASI
// ---------------------------------------------------------
// Mini app'ten gelen "initData" verisinin gercekten Telegram tarafindan
// imzalandigini (baskasi tarafindan uydurulmadigini) dogrular. Algoritma
// Telegram'in resmi dokumantasyonundaki formule dayanir. Bu kontrol
// olmadan, teoride herkes baska bir oyuncunun kimligine burunup onun
// koyunu gorebilir/degistirebilir — bu yuzden atlanmamali.
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

// initData'yi dogrulayip, veritabanindaki kullanici + koy satirlarini
// birlikte dondurur. Basarisiz olursa null doner.
function authenticate(initData) {
  const tgUser = verifyInitData(initData);
  if (!tgUser) return null;

  const dbUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(tgUser.id);
  if (!dbUser) return null;

  const village = db.prepare('SELECT * FROM villages WHERE user_id = ?').get(dbUser.id);
  if (!village) return null;

  return { dbUser, village };
}

// ---------------------------------------------------------
// YARDIMCI: koy + bina verisini mini app'in anlayacagi JSON'a cevirir
// ---------------------------------------------------------
function buildVillagePayload(villageId) {
  const village = refreshVillage(villageId);
  const mainBuilding = getBuilding(villageId, 'main_building');
  const buildingRows = getVillageBuildings(villageId);

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

  return {
    village: {
      name: village.name,
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
    buildings
  };
}

function startServer(port) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'webapp')));

  // Koy + binalar verisini getirir.
  app.post('/api/village', (req, res) => {
    const auth = authenticate(req.body.initData);
    if (!auth) {
      return res.status(401).json({ error: 'Dogrulama basarisiz. Once botta /start yapmalisin.' });
    }
    res.json(buildVillagePayload(auth.village.id));
  });

  // Bir binayi bir ust seviyeye yukseltmeyi dener.
  app.post('/api/upgrade', (req, res) => {
    const auth = authenticate(req.body.initData);
    if (!auth) {
      return res.status(401).json({ error: 'Dogrulama basarisiz. Once botta /start yapmalisin.' });
    }

    const type = req.body.type;
    if (!BUILDINGS[type]) {
      return res.status(400).json({ error: 'Gecersiz bina tipi.' });
    }

    const result = startUpgrade(auth.village.id, type);
    if (!result.success) {
      return res.status(400).json({ error: result.reason, cost: result.cost || null });
    }

    res.json({ success: true, timeSeconds: result.timeSeconds, ...buildVillagePayload(auth.village.id) });
  });

  app.listen(port, () => {
    console.log(`Mini App sunucusu http://localhost:${port} adresinde calisiyor.`);
  });
}

module.exports = { startServer };
