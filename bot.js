// bot.js
// Botun ana giris dosyasi. Telegram baglantisini kurar, /start komutunu
// karsilar, oyuncuyu (ve gerekiyorsa koyunu) veritabanina kaydeder ve
// gorsel koyu (Telegram Mini App) acan bir buton gosterir. Koyun kendisi
// artik bu dosyada degil, webapp/ klasorundeki gorsel arayuzde yasiyor;
// bu dosya sadece giris kapisi ve arka plan servislerini (API sunucusu +
// zamanlayici) baslatmaktan sorumlu.

require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { db, initDatabase } = require('./database');
const { startScheduler } = require('./scheduler');
const { startServer } = require('./server');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error('HATA: .env dosyasinda BOT_TOKEN tanimli degil! .env.example dosyasini kopyalayip .env olarak kaydet ve icine token\'ini yaz.');
  process.exit(1);
}

if (!WEBAPP_URL) {
  console.error('HATA: .env dosyasinda WEBAPP_URL tanimli degil! Mini App icin HTTPS bir adres gerekiyor (README.md\'deki ngrok adimlarina bak).');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Veritabani tablolarini (yoksa) olustur.
initDatabase();

// ---------------------------------------------------------
// YARDIMCI FONKSIYONLAR
// ---------------------------------------------------------

// Kullaniciyi veritabaninda bulur; yoksa yeni kullanici + koy + temel binalar olusturur.
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
  const result = insertUser.run(
    telegramUser.id,
    telegramUser.username || null,
    telegramUser.first_name || 'Oyuncu'
  );

  const newUserId = result.lastInsertRowid;

  // Yeni koy olustur. last_updated'i kendimiz (ISO formatinda) veriyoruz ki
  // kaynak hesaplamalari (resources.js) her zaman guvenilir olsun.
  const villageName = `${telegramUser.first_name || 'Oyuncu'}'nun Koyu`;
  const insertVillage = db.prepare(`
    INSERT INTO villages (user_id, name, last_updated)
    VALUES (?, ?, ?)
  `);
  insertVillage.run(newUserId, villageName, new Date().toISOString());

  const villageId = db.prepare('SELECT id FROM villages WHERE user_id = ?').get(newUserId).id;

  // Koye temel binalari seviye 1 olarak ekle.
  const insertBuilding = db.prepare(`
    INSERT INTO buildings (village_id, type, level) VALUES (?, ?, ?)
  `);
  const defaultBuildings = [
    'main_building', 'woodcutter', 'clay_pit', 'iron_mine',
    'grain_field', 'warehouse', 'granary'
  ];
  for (const type of defaultBuildings) {
    insertBuilding.run(villageId, type, 1);
  }

  user = findUser.get(telegramUser.id);
  return { user, isNew: true };
}

// Koyu acan Mini App butonunu olusturur.
function openVillageKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.webApp('🎮 Köyünü Aç', WEBAPP_URL)]
  ]);
}

// ---------------------------------------------------------
// KOMUTLAR
// ---------------------------------------------------------

bot.start((ctx) => {
  const { isNew } = getOrCreateUser(ctx.from);

  const welcomeText = isNew
    ? `Hos geldin, ${ctx.from.first_name}!\n\nYeni bir koy kurdun. Asagidaki butona basarak koyunu gorsel olarak gor, binalarina dokun ve yukselt!`
    : `Tekrar hos geldin, ${ctx.from.first_name}!\n\nKoyun seni bekliyor.`;

  ctx.reply(welcomeText, openVillageKeyboard());
});

// /koy gibi bir komutla da (ana menude kaybolan butonu tekrar bulmak icin) acilabilsin.
bot.command('koy', (ctx) => {
  getOrCreateUser(ctx.from);
  ctx.reply('Köyün:', openVillageKeyboard());
});

// ---------------------------------------------------------
// BOTU VE ARKA PLAN SERVISLERINI BASLAT
// ---------------------------------------------------------

// Web sunucusu ve zamanlayici Telegram baglantisindan bagimsiz olarak hemen baslasin:
startServer(PORT);
startScheduler();

// Ardindan Telegram botu dinlemeye alinsin:
bot.launch()
  .then(() => {
    console.log('Bot basariyla baslatildi!');
  })
  .catch((err) => {
    console.error('Bot baslatilamadi:', err);
  });

// Ctrl+C ile kapatildiginda duzgun sekilde kapansin.
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));