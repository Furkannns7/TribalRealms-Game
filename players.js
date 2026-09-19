// players.js
// Kullanici kaydi ve koy olusturma mantigi burada toplaniyor, cunku hem
// bot.js (/start komutu) hem de server.js (medeniyet secildiginde) buna
// ihtiyac duyuyor.

const { db } = require('./database');
const { WORLD_SIZE, getProductionPerHour } = require('./game-config');

// Koye eklenecek temel binalar (hepsi seviye 1'den baslar).
const DEFAULT_BUILDINGS = [
  'main_building', 'woodcutter', 'clay_pit', 'iron_mine',
  'grain_field', 'warehouse', 'granary', 'barracks', 'market'
];

// Kullaniciyi veritabaninda bulur; yoksa (henuz koy/medeniyet olmadan) yeni
// bir kullanici kaydi olusturur. Koy, medeniyet secildiginde createVillage
// ile ayrica olusturulur.
function getOrCreateUser(telegramUser) {
  const findUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?');
  let user = findUser.get(telegramUser.id);

  if (user) {
    return { user, isNew: false };
  }

  const insertUser = db.prepare(`
    INSERT INTO users (telegram_id, username, first_name)
    VALUES (?, ?, ?)
  `);
  insertUser.run(
    telegramUser.id,
    telegramUser.username || null,
    telegramUser.first_name || 'Oyuncu'
  );

  user = findUser.get(telegramUser.id);
  return { user, isNew: true };
}

// Bir kullaniciya, sectigi medeniyetle birlikte ilk koyunu olusturur.
// Sadece kullanicinin HENUZ koyu yoksa cagrilmali.
function createVillage(userId, villageName, civilization) {
  db.prepare('UPDATE users SET civilization = ? WHERE id = ?').run(civilization, userId);

  const x = Math.floor(Math.random() * WORLD_SIZE);
  const y = Math.floor(Math.random() * WORLD_SIZE);
  const startProduction = getProductionPerHour(1);

  const insertVillage = db.prepare(`
    INSERT INTO villages (user_id, name, x, y, last_updated, wood_production, clay_production, iron_production, grain_production)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertVillage.run(userId, villageName, x, y, new Date().toISOString(), startProduction, startProduction, startProduction, startProduction);

  const villageId = db.prepare('SELECT id FROM villages WHERE user_id = ?').get(userId).id;

  const insertBuilding = db.prepare('INSERT INTO buildings (village_id, type, level) VALUES (?, ?, ?)');
  for (const type of DEFAULT_BUILDINGS) {
    insertBuilding.run(villageId, type, 1);
  }

  return db.prepare('SELECT * FROM villages WHERE id = ?').get(villageId);
}

module.exports = { getOrCreateUser, createVillage, DEFAULT_BUILDINGS };
