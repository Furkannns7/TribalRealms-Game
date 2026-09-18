// database.js
// Bu dosya SQLite veritabani baglantisini kurar ve oyunun temel tablolarini olusturur.
// Node.js'in kendi icine gomulu "node:sqlite" modulunu kullaniyoruz; bu sayede
// better-sqlite3 gibi native (C++) bir pakete ve Visual Studio Build Tools'a
// ihtiyac kalmiyor. node:sqlite, Node 24+ surumlerinde stabildir.

const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// Veritabani dosyasi proje klasorunde "game.db" adiyla olusturulacak/acilacak.
const db = new DatabaseSync(path.join(__dirname, 'game.db'));

// WAL modu: ayni anda cok sayida okuma/yazma oldugunda performansi artirir.
db.exec('PRAGMA journal_mode = WAL');

function initDatabase() {
  // ---- USERS TABLOSU ----
  // Her Telegram kullanicisi icin bir kayit tutar.
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      gold INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ---- VILLAGES TABLOSU ----
  // Her oyuncunun (simdilik) bir koyu var. Ileride bir kullaniciya birden
  // fazla koy eklemek istersen, user_id iliskisi buna zaten uygun.
  db.exec(`
    CREATE TABLE IF NOT EXISTS villages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
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
  // "upgrading" ve "upgrade_finishes_at", Asama 2'de eklenen bina yukseltme
  // (insaat) sistemi icin kullanilir.
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

  // ---- MIGRATION (Asama 1'de olusturulmus eski veritabanlari icin) ----
  // Eger "game.db" dosyan Asama 1'den kaldiysa, buildings tablosunda
  // upgrading/upgrade_finishes_at sutunlari olmayabilir. Asagidaki kod bu
  // sutunlari (yoksa) sessizce ekler; zaten varsa hatayi yoksayar.
  try {
    db.exec('ALTER TABLE buildings ADD COLUMN upgrading INTEGER DEFAULT 0');
  } catch (err) {
    // Sutun zaten var; sorun degil.
  }
  try {
    db.exec('ALTER TABLE buildings ADD COLUMN upgrade_finishes_at DATETIME');
  } catch (err) {
    // Sutun zaten var; sorun degil.
  }

  console.log('Veritabani tablolari hazir.');
}

module.exports = { db, initDatabase };
