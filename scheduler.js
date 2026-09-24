// scheduler.js
// Arka planda calisan zamanlayici. Her dakika, veritabanindaki TUM koyler
// icin kaynaklari gunceller, suresi dolan insaatlari/asker egitimlerini
// tamamlar ve varan saldirilari sonuclandirir. Bu sayede oyuncu bot ile hic
// konusmasa bile, tekrar geldiginde her sey dogru sekilde gorunur.

const cron = require('node-cron');
const { db } = require('./database');
const { refreshVillage } = require('./buildings');
const { completeFinishedTraining } = require('./military');
const { completeFinishedAttacks } = require('./combat');
const { completeFinishedNpcAttacks } = require('./npc');

function startScheduler() {
  cron.schedule('* * * * *', () => {
    const villages = db.prepare('SELECT id FROM villages').all();
    for (const { id } of villages) {
      refreshVillage(id);
      completeFinishedTraining(id);
    }
    // Saldirilar birden fazla koyu ilgilendirdigi icin tek seferde, tum
    // veritabani genelinde kontrol ediliyor.
    completeFinishedAttacks();
    completeFinishedNpcAttacks();
  });

  console.log('Zamanlayici baslatildi (her dakika calisiyor).');
}

module.exports = { startScheduler };
