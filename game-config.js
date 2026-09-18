// game-config.js
// Oyunun binalar, kaynaklar ve dengeleme (balance) sabitlerini tek yerde tutar.
// Sayilari degistirerek oyunun hizini/zorlugunu kolayca ayarlayabilirsin.

// Hammadde alanlarinin seviye basina urettigi miktar (saatlik).
// Seviye 1 = 10/saat, seviye 2 = 20/saat, seviye 5 = 50/saat...
const BASE_PRODUCTION_PER_HOUR = 10;

// Depo/Ambarin seviye basina ekledigi kapasite. Seviye 1 kapasitesi 1000'dir
// (Asama 1'deki varsayilan deger), her sonraki seviye bunu artirir.
const BASE_CAPACITY = 1000;
const CAPACITY_PER_LEVEL = 500;

// Her seviyede maliyet ve insaat suresi bu oranlarla carpilarak artar.
const COST_MULTIPLIER = 1.5;
const TIME_MULTIPLIER = 1.3;

// Merkez Binasinin her seviyesi, diger binalarin insaat suresini bu oranda kisaltir.
// (ornek: Merkez Binasi seviye 5 ise sure %16 kisalir)
const MAIN_BUILDING_TIME_BONUS = 0.04;

// Her bina tipi icin: gorunen isim, seviye 1->2 yukseltmenin temel maliyeti,
// seviye 1->2 yukseltmenin temel insaat suresi (saniye) ve (varsa) hangi
// kaynagi urettigi / hangi kapasiteyi artirdigi.
const BUILDINGS = {
  main_building: {
    name: 'Merkez Binasi',
    baseCost: { wood: 70, clay: 40, iron: 60, grain: 20 },
    baseTimeSeconds: 60,
    produces: null,
    capacityBonus: null
  },
  woodcutter: {
    name: 'Kesimhane (Odun)',
    baseCost: { wood: 40, clay: 30, iron: 20, grain: 20 },
    baseTimeSeconds: 40,
    produces: 'wood',
    capacityBonus: null
  },
  clay_pit: {
    name: 'Kil Ocagi (Tugla)',
    baseCost: { wood: 30, clay: 40, iron: 20, grain: 20 },
    baseTimeSeconds: 40,
    produces: 'clay',
    capacityBonus: null
  },
  iron_mine: {
    name: 'Demir Madeni',
    baseCost: { wood: 30, clay: 30, iron: 40, grain: 20 },
    baseTimeSeconds: 45,
    produces: 'iron',
    capacityBonus: null
  },
  grain_field: {
    name: 'Tahil Tarlasi',
    baseCost: { wood: 25, clay: 25, iron: 25, grain: 15 },
    baseTimeSeconds: 35,
    produces: 'grain',
    capacityBonus: null
  },
  warehouse: {
    name: 'Depo',
    baseCost: { wood: 60, clay: 50, iron: 40, grain: 10 },
    baseTimeSeconds: 50,
    produces: null,
    capacityBonus: 'warehouse'
  },
  granary: {
    name: 'Tahil Ambari',
    baseCost: { wood: 50, clay: 40, iron: 30, grain: 10 },
    baseTimeSeconds: 50,
    produces: null,
    capacityBonus: 'granary'
  }
};

// Bir sonraki seviyeye yukseltmenin kaynak maliyetini hesaplar.
function getUpgradeCost(type, currentLevel) {
  const config = BUILDINGS[type];
  const factor = Math.pow(COST_MULTIPLIER, currentLevel - 1);
  return {
    wood: Math.round(config.baseCost.wood * factor),
    clay: Math.round(config.baseCost.clay * factor),
    iron: Math.round(config.baseCost.iron * factor),
    grain: Math.round(config.baseCost.grain * factor)
  };
}

// Bir sonraki seviyeye yukseltmenin suresini (saniye) hesaplar.
// Merkez Binasinin seviyesi arttikca sure kisalir.
function getUpgradeTimeSeconds(type, currentLevel, mainBuildingLevel) {
  const config = BUILDINGS[type];
  const rawTime = config.baseTimeSeconds * Math.pow(TIME_MULTIPLIER, currentLevel - 1);
  const speedBonus = 1 + (mainBuildingLevel - 1) * MAIN_BUILDING_TIME_BONUS;
  return Math.max(5, Math.round(rawTime / speedBonus));
}

// Bir hammadde alaninin belirli seviyedeki saatlik uretimini hesaplar.
function getProductionPerHour(level) {
  return BASE_PRODUCTION_PER_HOUR * level;
}

// Depo/Ambarin belirli seviyedeki kapasitesini hesaplar.
function getCapacity(level) {
  return BASE_CAPACITY + CAPACITY_PER_LEVEL * (level - 1);
}

module.exports = {
  BUILDINGS,
  getUpgradeCost,
  getUpgradeTimeSeconds,
  getProductionPerHour,
  getCapacity
};
