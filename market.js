// market.js
// Pazar teklifleri: bir oyuncu elindeki fazla kaynagi baska bir kaynakla
// takas etmek icin teklif koyar, baska bir oyuncu bu teklifi kabul eder.
// Basitlik icin teklif konulunca verilecek kaynak hemen koyden dusulur
// ("rezerve edilir") ve kabul edildiginde islem aninda gerceklesir -
// gercek Travian'daki gibi tuccar/seyahat suresi modellenmiyor.

const { db } = require('./database');

const VALID_RESOURCES = ['wood', 'clay', 'iron', 'grain'];

function capacityColumnFor(resource) {
  return resource === 'grain' ? 'granary_capacity' : 'warehouse_capacity';
}

function getActiveOfferCount(villageId) {
  return db.prepare('SELECT COUNT(*) AS c FROM market_offers WHERE village_id = ?').get(villageId).c;
}

function getVillageOffers(villageId) {
  return db.prepare('SELECT * FROM market_offers WHERE village_id = ? ORDER BY created_at DESC').all(villageId);
}

// Baska oyunculara ait acik teklifleri (kendi koyu haric) getirir.
function getOtherOffers(villageId, limit) {
  return db.prepare(`
    SELECT mo.*, v.name AS village_name, u.username, u.first_name
    FROM market_offers mo
    JOIN villages v ON v.id = mo.village_id
    JOIN users u ON u.id = v.user_id
    WHERE mo.village_id != ?
    ORDER BY mo.created_at DESC
    LIMIT ?
  `).all(villageId, limit || 50);
}

// Yeni bir takas teklifi olusturur. Verilecek kaynak hemen koyden dusulur.
function createOffer(villageId, offerResource, offerAmount, requestResource, requestAmount, marketLevel) {
  if (!VALID_RESOURCES.includes(offerResource) || !VALID_RESOURCES.includes(requestResource)) {
    return { success: false, reason: 'Gecersiz kaynak tipi.' };
  }
  if (offerResource === requestResource) {
    return { success: false, reason: 'Verdigin ve istedigin kaynak ayni olamaz.' };
  }
  if (!Number.isInteger(offerAmount) || offerAmount <= 0 || !Number.isInteger(requestAmount) || requestAmount <= 0) {
    return { success: false, reason: 'Gecersiz miktar.' };
  }

  const activeCount = getActiveOfferCount(villageId);
  if (activeCount >= marketLevel) {
    return { success: false, reason: `Pazarin seviyesi en fazla ${marketLevel} acik teklife izin veriyor. Once birini iptal et ya da Pazari yukselt.` };
  }

  const village = db.prepare('SELECT * FROM villages WHERE id = ?').get(villageId);
  if (village[offerResource] < offerAmount) {
    return { success: false, reason: 'Yetersiz kaynak.' };
  }

  db.prepare(`UPDATE villages SET ${offerResource} = ${offerResource} - ? WHERE id = ?`).run(offerAmount, villageId);

  db.prepare(`
    INSERT INTO market_offers (village_id, offer_resource, offer_amount, request_resource, request_amount)
    VALUES (?, ?, ?, ?, ?)
  `).run(villageId, offerResource, offerAmount, requestResource, requestAmount);

  return { success: true };
}

// Kendi (henuz kabul edilmemis) teklifini iptal eder, rezerve edilen kaynagi geri verir.
function cancelOffer(offerId, villageId) {
  const offer = db.prepare('SELECT * FROM market_offers WHERE id = ? AND village_id = ?').get(offerId, villageId);
  if (!offer) {
    return { success: false, reason: 'Teklif bulunamadi.' };
  }

  const village = db.prepare('SELECT * FROM villages WHERE id = ?').get(villageId);
  const capColumn = capacityColumnFor(offer.offer_resource);
  const newAmount = Math.min(village[capColumn], village[offer.offer_resource] + offer.offer_amount);

  db.prepare(`UPDATE villages SET ${offer.offer_resource} = ? WHERE id = ?`).run(newAmount, villageId);
  db.prepare('DELETE FROM market_offers WHERE id = ?').run(offerId);

  return { success: true };
}

// Baska bir oyuncunun teklifini kabul eder: alici istenen kaynagi verir,
// teklif edilen kaynagi alir; satici (rezerve edilmisti) istedigi kaynagi alir.
function acceptOffer(offerId, buyerVillageId) {
  const offer = db.prepare('SELECT * FROM market_offers WHERE id = ?').get(offerId);
  if (!offer) {
    return { success: false, reason: 'Teklif artik gecerli degil (baskasi kabul etmis ya da iptal edilmis olabilir).' };
  }
  if (offer.village_id === buyerVillageId) {
    return { success: false, reason: 'Kendi teklifini kabul edemezsin.' };
  }

  const buyerVillage = db.prepare('SELECT * FROM villages WHERE id = ?').get(buyerVillageId);
  if (buyerVillage[offer.request_resource] < offer.request_amount) {
    return { success: false, reason: 'Yetersiz kaynak.' };
  }

  db.prepare(`UPDATE villages SET ${offer.request_resource} = ${offer.request_resource} - ? WHERE id = ?`)
    .run(offer.request_amount, buyerVillageId);

  const buyerCapColumn = capacityColumnFor(offer.offer_resource);
  const buyerFresh = db.prepare('SELECT * FROM villages WHERE id = ?').get(buyerVillageId);
  const newBuyerAmount = Math.min(buyerFresh[buyerCapColumn], buyerFresh[offer.offer_resource] + offer.offer_amount);
  db.prepare(`UPDATE villages SET ${offer.offer_resource} = ? WHERE id = ?`).run(newBuyerAmount, buyerVillageId);

  const sellerCapColumn = capacityColumnFor(offer.request_resource);
  const sellerFresh = db.prepare('SELECT * FROM villages WHERE id = ?').get(offer.village_id);
  const newSellerAmount = Math.min(sellerFresh[sellerCapColumn], sellerFresh[offer.request_resource] + offer.request_amount);
  db.prepare(`UPDATE villages SET ${offer.request_resource} = ? WHERE id = ?`).run(newSellerAmount, offer.village_id);

  db.prepare('DELETE FROM market_offers WHERE id = ?').run(offerId);

  return { success: true, offer };
}

module.exports = { VALID_RESOURCES, getVillageOffers, getOtherOffers, createOffer, cancelOffer, acceptOffer };
