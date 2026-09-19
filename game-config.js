// game-config.js
// Oyunun binalar, kaynaklar ve dengeleme (balance) sabitlerini tek yerde tutar.
// Sayilari degistirerek oyunun hizini/zorlugunu kolayca ayarlayabilirsin.

// Hammadde alanlarinin seviye basina urettigi miktar (saatlik).
// Seviye 1 = 240/saat (4/dakika), seviye 2 = 480/saat...
// (Not: bu deger test/gelistirme asamasinda gozle gorulur olmasi icin
// yuksek tutuldu; oyunun son dengesinde dusurmek istersen sadece bu
// sayiyi degistirmen yeterli.)
const BASE_PRODUCTION_PER_HOUR = 240;

// Depo/Ambarin seviye basina ekledigi kapasite. Seviye 1 kapasitesi 1000'dir
// (Asama 1'deki varsayilan deger), her sonraki seviye bunu artirir.
const BASE_CAPACITY = 1000;
const CAPACITY_PER_LEVEL = 500;

// Her seviyede maliyet ve insaat suresi bu oranlarla carpilarak artar.
const COST_MULTIPLIER = 1.5;
const TIME_MULTIPLIER = 1.3;

// Bir koyde ayni anda en fazla kac bina insa edilebilir.
const MAX_CONCURRENT_UPGRADES = 2;

// Dunya haritasinin boyutu (Asama 5'te kullanilacak, simdiden koylere
// rastgele bir koordinat atamak icin kullaniliyor -> saldiri mesafesi hesabi).
const WORLD_SIZE = 50;

// Kislanin her seviyesi, asker egitim suresini bu oranda kisaltir
// (Merkez Binasinin insaat suresini kisaltmasiyla ayni mantik).
const BARRACKS_TRAIN_TIME_BONUS = 0.03;

// Pazarin her seviyesi, ayni anda acik tutabilecegin teklif sayisini bu
// kadar artirir (seviye 1 = 1 acik teklif, seviye 3 = 3 acik teklif...).
const MARKET_OFFERS_PER_LEVEL = 1;

function getMaxMarketOffers(marketLevel) {
  return marketLevel * MARKET_OFFERS_PER_LEVEL;
}

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
  },
  barracks: {
    name: 'Kisla',
    baseCost: { wood: 200, clay: 170, iron: 90, grain: 80 },
    baseTimeSeconds: 90,
    produces: null,
    capacityBonus: null
  },
  market: {
    name: 'Pazar',
    baseCost: { wood: 80, clay: 70, iron: 60, grain: 30 },
    baseTimeSeconds: 70,
    produces: null,
    capacityBonus: null
  }
};

// ---------------------------------------------------------
// MEDENIYETLER VE ASKERI BIRIMLER
// ---------------------------------------------------------

const CIVILIZATIONS = {
  roma: {
    name: 'Roma',
    tagline: 'Disiplinli ve dayanikli',
    description: 'Savunmada guclu, birimleri saglam ama pahali. Temkinli, uzun vadeli oyuncular icin.'
  },
  galya: {
    name: 'Galya',
    tagline: 'Hizli ve ekonomik',
    description: 'Ucuz ve hizli birimleri var, kaynaklarini cabuk topariar. Cevik oyun tarzi icin.'
  },
  toton: {
    name: 'Toton',
    tagline: 'Vahsi ve saldirgan',
    description: 'Saldirida cok guclu, ucuz asker ama savunmasi zayif. Agresif oyuncular icin.'
  }
};

// Her birim: hangi medeniyete ait, adi, rolu (attack/defense/raid), saldiri/
// savunma gucu, tasima kapasitesi (yagmada tasiyabilecegi kaynak), tahil
// tuketimi (saatlik, "upkeep"), egitim maliyeti, temel egitim suresi
// (saniye, kisla seviyesine ve adete gore olceklenir) ve hiz (bir kareyi
// gecmesi kac saniye surer — dusuk deger = hizli birim).
const MILITARY_UNITS = {
  roma_legionnaire: { civilization: 'roma', name: 'Lejyoner', role: 'attack', attack: 40, defense: 35, carry: 50, upkeep: 1, cost: { wood: 120, clay: 100, iron: 150, grain: 30 }, trainTimeSeconds: 180, speedSecondsPerTile: 5 },
  roma_praetorian: { civilization: 'roma', name: 'Pretoryen', role: 'defense', attack: 10, defense: 65, carry: 20, upkeep: 1, cost: { wood: 100, clay: 130, iron: 160, grain: 70 }, trainTimeSeconds: 220, speedSecondsPerTile: 6 },
  roma_equite: { civilization: 'roma', name: 'Roma Suvarisi', role: 'raid', attack: 55, defense: 40, carry: 80, upkeep: 2, cost: { wood: 140, clay: 160, iron: 200, grain: 100 }, trainTimeSeconds: 400, speedSecondsPerTile: 3 },

  galya_phalanx: { civilization: 'galya', name: 'Falanks', role: 'defense', attack: 15, defense: 40, carry: 25, upkeep: 1, cost: { wood: 60, clay: 50, iron: 60, grain: 20 }, trainTimeSeconds: 120, speedSecondsPerTile: 6 },
  galya_swordsman: { civilization: 'galya', name: 'Kilic Ustasi', role: 'attack', attack: 35, defense: 20, carry: 45, upkeep: 1, cost: { wood: 70, clay: 50, iron: 70, grain: 20 }, trainTimeSeconds: 140, speedSecondsPerTile: 5 },
  galya_rider: { civilization: 'galya', name: 'Galya Atlisi', role: 'raid', attack: 45, defense: 25, carry: 90, upkeep: 2, cost: { wood: 100, clay: 80, iron: 110, grain: 60 }, trainTimeSeconds: 280, speedSecondsPerTile: 2 },

  toton_clubman: { civilization: 'toton', name: 'Gurzcu', role: 'attack', attack: 45, defense: 10, carry: 40, upkeep: 1, cost: { wood: 60, clay: 30, iron: 40, grain: 15 }, trainTimeSeconds: 100, speedSecondsPerTile: 5 },
  toton_spearman: { civilization: 'toton', name: 'Mizrakci', role: 'defense', attack: 15, defense: 30, carry: 25, upkeep: 1, cost: { wood: 70, clay: 40, iron: 60, grain: 20 }, trainTimeSeconds: 130, speedSecondsPerTile: 6 },
  toton_paladin: { civilization: 'toton', name: 'Toton Sovalyesi', role: 'raid', attack: 55, defense: 25, carry: 70, upkeep: 2, cost: { wood: 110, clay: 70, iron: 100, grain: 80 }, trainTimeSeconds: 300, speedSecondsPerTile: 3 }
};

// Bir medeniyetin tum birimlerini (tip anahtariyla birlikte) dondurur.
function getUnitsForCivilization(civilization) {
  return Object.entries(MILITARY_UNITS)
    .filter(([, unit]) => unit.civilization === civilization)
    .map(([type, unit]) => ({ type, ...unit }));
}

// Belirli sayida birimin egitim suresini (saniye) hesaplar. Kislanin
// seviyesi arttikca sure kisalir.
function getTrainTimeSeconds(unitType, quantity, barracksLevel) {
  const unit = MILITARY_UNITS[unitType];
  const speedBonus = 1 + (barracksLevel - 1) * BARRACKS_TRAIN_TIME_BONUS;
  return Math.max(1, Math.round((unit.trainTimeSeconds * quantity) / speedBonus));
}


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
  MAX_CONCURRENT_UPGRADES,
  WORLD_SIZE,
  CIVILIZATIONS,
  MILITARY_UNITS,
  getUpgradeCost,
  getUpgradeTimeSeconds,
  getProductionPerHour,
  getCapacity,
  getUnitsForCivilization,
  getTrainTimeSeconds,
  getMaxMarketOffers
};
