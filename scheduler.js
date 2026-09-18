// scheduler.js
// Arka planda calisan zamanlayici. Her dakika, veritabanindaki TUM koyler
// icin kaynaklari gunceller ve suresi dolan insaatlari tamamlar. Bu sayede
// oyuncu bot ile hic konusmasa bile, tekrar geldiginde kaynaklari ve
// tamamlanmis binalari dogru sekilde gorur.
//
// Not: resources.js/buildings.js'teki hesaplama "gecen sureye gore" calistigi
// icin (last_updated karsilastirmasi), bu zamanlayici her dakika calismasa
// bile (ornegin bot bir sure kapali kalsa) sonuclar yine dogru olur. Zamanlayici
// sadece kaynaklarin ekranda/arka planda "gercek zamanli" hissettirmesini saglar.

const cron = require('node-cron');
const { db } = require('./database');
const { refreshVillage } = require('./buildings');

function startScheduler() {
  cron.schedule('* * * * *', () => {
    const villages = db.prepare('SELECT id FROM villages').all();
    for (const { id } of villages) {
      refreshVillage(id);
    }
  });

  console.log('Zamanlayici baslatildi (her dakika calisiyor).');
}

module.exports = { startScheduler };
