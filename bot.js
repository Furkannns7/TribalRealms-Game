// bot.js
// Botun ana giris dosyasi. Telegram baglantisini kurar, /start komutunu
// karsilar, oyuncuyu veritabanina kaydeder ve gorsel koyu (Telegram Mini
// App) acan bir buton gosterir.

require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { initDatabase } = require('./database');
const { getOrCreateUser } = require('./players');
const { seedNpcTargets } = require('./npc');
const { startScheduler } = require('./scheduler');
const { startServer } = require('./server');

const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();
const WEBAPP_URL = (process.env.WEBAPP_URL || '').trim();
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error('HATA: .env dosyasinda BOT_TOKEN tanimli degil!');
  process.exit(1);
}

if (!WEBAPP_URL) {
  console.error('HATA: .env dosyasinda WEBAPP_URL tanimli degil!');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Veritabani tablolarini (yoksa) olustur.
initDatabase();

// Dunya ilk kez ayaga kalkiyorsa vaha/haydut kamplarini serpistir
seedNpcTargets();

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
    ? `Hos geldin, ${ctx.from.first_name}!\n\nAsagidaki butona basarak once bir medeniyet sec, sonra koyunu gorsel olarak gor, binalarina dokun, ordunu kur!`
    : `Tekrar hos geldin, ${ctx.from.first_name}!\n\nKoyun seni bekliyor.`;

  ctx.reply(welcomeText, openVillageKeyboard());
});

bot.command('koy', (ctx) => {
  getOrCreateUser(ctx.from);
  ctx.reply('Köyün:', openVillageKeyboard());
});

// ---------------------------------------------------------
// BOTU VE ARKA PLAN SERVISLERINI BASLAT
// ---------------------------------------------------------

// 1. Render port taramasini aninda yakalamasi icin sunucuyu ve zamanlayiciyi ONCE baslatiyoruz:
startServer(PORT);
startScheduler();

// 2. Ardindan Telegram botu devreye giriyor:
bot.launch()
  .then(() => {
    console.log('Bot basariyla baslatildi!');
  })
  .catch((err) => console.error('Bot baslatilamadi:', err));

// Kapanma sinyalleri
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));