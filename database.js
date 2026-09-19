// database.js
// Bu dosya SQLite veritabani baglantisini kurar ve oyunun temel tablolarini olusturur.
// Node.js'in kendi icine gomulu "node:sqlite" modulunu kullaniyoruz; bu sayede
// better-sqlite3 gibi native (C++) bir pakete ve Visual Studio Build Tools'a
// ihtiyac kalmiyor. node:sqlite, Node 24+ surumlerinde stabildir.

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const { getProductionPerHour } = require('./game-config');

// Veritabani dosyasi proje klasorunde "game.db" adiyla olusturulacak/acilacak.
const db = new DatabaseSync(path.join(__dirname, 'game.db'));

// WAL modu: ayni anda cok sayida okuma/yazma oldugunda performansi artirir.
db.exec('PRAGMA journal_mode = WAL');

function columnExists(table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((r) => r.name === column);
}

function initDatabase() {
  // ---- USERS TABLOSU ----
  // Her Telegram kullanicisi icin bir kayit tutar. "civilization" Asama 3'te
  // eklendi: oyuncu ilk kez koy kurarken sectigi medeniyet (roma/galya/toton).
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      gold INTEGER DEFAULT 0,
      civilization TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ---- VILLAGES TABLOSU ----
  // "x" ve "y": koyun dunya haritasindaki konumu (Asama 5'te kullanilacak,
  // simdilik saldiri mesafesi/seyahat suresi hesabi icin kullaniliyor).
  db.exec(`
    CREATE TABLE IF NOT EXISTS villages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      x INTEGER,
      y INTEGER,
      wood INTEGER DEFAULT 500,
      clay INTEGER DEFAULT 500,
      iron INTEGER DEFAULT 500,
      grain INTEGER DEFAULT 500,
      wood_production INTEGER DEFAULT 10,
      clay_production INTEGER DEFAULT 10,
      iron_production INTEGER DEFAULT 10,
      grain_production INTEGER DEFAULT 10,
      warehouse_capacity INTEGER DEFAULT 1000,
      granary_capacity INTEGER DEFAULT 1000,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ---- BUILDINGS TABLOSU ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS buildings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      village_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      level INTEGER DEFAULT 1,
      upgrading INTEGER DEFAULT 0,
      upgrade_finishes_at DATETIME,
      FOREIGN KEY (village_id) REFERENCES villages(id)
    )
  `);

  // ---- ARMY TABLOSU (Asama 3) ----
  // Bir koydeki her birim tipinden kac adet oldugunu tutar.
  db.exec(`
    CREATE TABLE IF NOT EXISTS army (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      village_id INTEGER NOT NULL,
      unit_type TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      UNIQUE(village_id, unit_type),
      FOREIGN KEY (village_id) REFERENCES villages(id)
    )
  `);

  // ---- TRAINING_QUEUE TABLOSU (Asama 3) ----
  // Kislada egitilmekte olan asker siparislerini tutar (sirayla tamamlanir).
  db.exec(`
    CREATE TABLE IF NOT EXISTS training_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      village_id INTEGER NOT NULL,
      unit_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      finishes_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (village_id) REFERENCES villages(id)
    )
  `);

  // ---- ATTACKS TABLOSU (Asama 4) ----
  // Yolda olan (henuz varmamis) saldirilari tutar.
  db.exec(`
    CREATE TABLE IF NOT EXISTS attacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attacker_village_id INTEGER NOT NULL,
      defender_village_id INTEGER NOT NULL,
      units TEXT NOT NULL,
      arrives_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (attacker_village_id) REFERENCES villages(id),
      FOREIGN KEY (defender_village_id) REFERENCES villages(id)
    )
  `);

  // ---- BATTLE_REPORTS TABLOSU (Asama 4) ----
  // Sonuclanmis saldirilarin kalici loglari ("yagmalama sonucu loglar").
  db.exec(`
    CREATE TABLE IF NOT EXISTS battle_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attacker_village_id INTEGER NOT NULL,
      defender_village_id INTEGER NOT NULL,
      attacker_user_id INTEGER NOT NULL,
      defender_user_id INTEGER NOT NULL,
      outcome TEXT NOT NULL,
      units_sent TEXT NOT NULL,
      attacker_losses TEXT NOT NULL,
      defender_losses TEXT NOT NULL,
      loot TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ---- MARKET_OFFERS TABLOSU (Asama 6) ----
  // Oyuncularin pazara koydugu acik kaynak takas teklifleri. Teklif
  // konulurken verilecek kaynak koyden hemen dusulur ("rezerve edilir"),
  // boylece ayni kaynak iki teklifte birden kullanilamaz.
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      village_id INTEGER NOT NULL,
      offer_resource TEXT NOT NULL,
      offer_amount INTEGER NOT NULL,
      request_resource TEXT NOT NULL,
      request_amount INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (village_id) REFERENCES villages(id)
    )
  `);

  // ---- CHAT_MESSAGES TABLOSU (Asama 7) ----
  // Tum oyunculara acik tek bir genel sohbet odasi.
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ---- CLANS TABLOSU (Asama 8) ----
  db.exec(`
    CREATE TABLE IF NOT EXISTS clans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      tag TEXT NOT NULL UNIQUE,
      leader_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ---- CLAN_CHAT_MESSAGES TABLOSU (Asama 8) ----
  // Sadece o klanin uyelerinin gordugu ozel sohbet.
  db.exec(`
    CREATE TABLE IF NOT EXISTS clan_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clan_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (clan_id) REFERENCES clans(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ---- MIGRATION (onceki asamalardan kalma eski game.db dosyalari icin) ----
  // Asagidaki ALTER'lar sutun zaten varsa sessizce hata verir, o hata yoksayilir.
  try { db.exec('ALTER TABLE buildings ADD COLUMN upgrading INTEGER DEFAULT 0'); } catch (err) {}
  try { db.exec('ALTER TABLE buildings ADD COLUMN upgrade_finishes_at DATETIME'); } catch (err) {}
  try { db.exec('ALTER TABLE users ADD COLUMN civilization TEXT'); } catch (err) {}
  try { db.exec('ALTER TABLE villages ADD COLUMN x INTEGER'); } catch (err) {}
  try { db.exec('ALTER TABLE villages ADD COLUMN y INTEGER'); } catch (err) {}

  // Eski test hesaplarina (Asama 1-2'den kalma) varsayilan medeniyet ata,
  // yoksa mini app'te takilip kalirlar.
  db.exec(`
    UPDATE users SET civilization = 'roma'
    WHERE civilization IS NULL
      AND id IN (SELECT user_id FROM villages)
  `);

  // Eski koylere (x/y olmayan) rastgele koordinat ata.
  const villagesWithoutCoords = db.prepare('SELECT id FROM villages WHERE x IS NULL OR y IS NULL').all();
  const assignCoords = db.prepare('UPDATE villages SET x = ?, y = ? WHERE id = ?');
  for (const v of villagesWithoutCoords) {
    assignCoords.run(Math.floor(Math.random() * 50), Math.floor(Math.random() * 50), v.id);
  }

  // Eski koylere (Asama 3'ten once olusturulmus) kisla ekle.
  const villagesWithoutBarracks = db.prepare(`
    SELECT v.id FROM villages v
    WHERE NOT EXISTS (SELECT 1 FROM buildings b WHERE b.village_id = v.id AND b.type = 'barracks')
  `).all();
  const insertBarracks = db.prepare('INSERT INTO buildings (village_id, type, level) VALUES (?, ?, 1)');
  for (const v of villagesWithoutBarracks) {
    insertBarracks.run(v.id, 'barracks');
  }

  // Eski koylere (Asama 6'dan once olusturulmus) pazar ekle.
  const villagesWithoutMarket = db.prepare(`
    SELECT v.id FROM villages v
    WHERE NOT EXISTS (SELECT 1 FROM buildings b WHERE b.village_id = v.id AND b.type = 'market')
  `).all();
  const insertMarket = db.prepare('INSERT INTO buildings (village_id, type, level) VALUES (?, ?, 1)');
  for (const v of villagesWithoutMarket) {
    insertMarket.run(v.id, 'market');
  }

  // Uretim hizi formulu (game-config.js -> BASE_PRODUCTION_PER_HOUR)
  // degistiginde, mevcut koylerin uretim sutunlarini bina seviyelerine
  // gore yeniden hesapla. Boylece dengeleme sayisini degistirdiginde
  // eski koyler de otomatik guncellenir, tekrar bina yukseltmesi gerekmez.
  const PRODUCTION_COLUMN_BY_BUILDING = {
    woodcutter: 'wood_production',
    clay_pit: 'clay_production',
    iron_mine: 'iron_production',
    grain_field: 'grain_production'
  };
  const resourceBuildings = db.prepare(`
    SELECT village_id, type, level FROM buildings
    WHERE type IN ('woodcutter', 'clay_pit', 'iron_mine', 'grain_field')
  `).all();
  for (const b of resourceBuildings) {
    const column = PRODUCTION_COLUMN_BY_BUILDING[b.type];
    const correctProduction = getProductionPerHour(b.level);
    db.prepare(`UPDATE villages SET ${column} = ? WHERE id = ?`).run(correctProduction, b.village_id);
  }

  console.log('Veritabani tablolari hazir.');
}

module.exports = { db, initDatabase, columnExists };
