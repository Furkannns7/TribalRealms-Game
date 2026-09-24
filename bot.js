// bot.js
// Botun ana giris dosyasi. Telegram baglantisini kurar, /start komutunu
// karsilar, oyuncuyu veritabanina kaydeder ve gorsel koyu (Telegram Mini
// App) acan bir buton gosterir. Koyun kendisi, medeniyet secimi, binalar,
// ordu ve saldiri hepsi webapp/ klasorundeki gorsel arayuzde yasiyor; bu
// dosya sadece giris kapisi ve arka plan servislerini (API sunucusu +
// zamanlayici) baslatmaktan sorumlu.

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
  console.error('HATA: .env dosyasinda BOT_TOKEN tanimli degil! .env.example dosyasini kopyalayip .env olarak kaydet ve icine token\'ini yaz.');
  process.exit(1);
}

if (!WEBAPP_URL) {
  console.error('HATA: .env dosyasinda WEBAPP_URL tanimli degil! Mini App icin HTTPS bir adres gerekiyor (README.md\'deki tunel adimlarina bak).');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Veritabani tablolarini (yoksa) olustur.
initDatabase();

// Dunya ilk kez ayaga kalkiyorsa vaha/haydut kamplarini serpistir (guvenli:
// zaten doluysa hicbir sey yapmaz).
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

// /koy gibi bir komutla da (ana menude kaybolan butonu tekrar bulmak icin) acilabilsin.
bot.command('koy', (ctx) => {
  getOrCreateUser(ctx.from);
  ctx.reply('Köyün:', openVillageKeyboard());
});

// ---------------------------------------------------------
// BOTU VE ARKA PLAN SERVISLERINI BASLAT
// ---------------------------------------------------------

bot.launch()
  .then(() => {
    console.log('Bot basariyla baslatildi!');
    startScheduler();
    startServer(PORT);
  })
  .catch((err) => console.error('Bot baslatilamadi:', err));

// Ctrl+C ile kapatildiginda duzgun sekilde kapansin.
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
