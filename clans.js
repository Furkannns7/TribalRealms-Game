// clans.js
// Klan (ittifak) kurma, katilma, ayrilma ve uye atma mantigi.

const { db } = require('./database');

const TAG_REGEX = /^[A-Za-z0-9]{2,5}$/;

function getClanById(clanId) {
  return db.prepare('SELECT * FROM clans WHERE id = ?').get(clanId);
}

function getUserWithClan(userId) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

function getClanMembers(clanId) {
  return db.prepare('SELECT id, telegram_id, username, first_name FROM users WHERE clan_id = ? ORDER BY id ASC').all(clanId);
}

// Katilinabilecek tum klanlari (uye sayisiyla birlikte) getirir.
function getAllClans() {
  return db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM users u WHERE u.clan_id = c.id) AS member_count
    FROM clans c
    ORDER BY member_count DESC, c.created_at DESC
  `).all();
}

// Yeni bir klan kurar; kurucu otomatik olarak lider ve ilk uye olur.
function createClan(userId, name, tag) {
  const user = getUserWithClan(userId);
  if (user.clan_id) {
    return { success: false, reason: 'Zaten bir klandesin. Once klandan ayril.' };
  }

  const cleanName = String(name || '').trim();
  const cleanTag = String(tag || '').trim().toUpperCase();

  if (cleanName.length < 3 || cleanName.length > 25) {
    return { success: false, reason: 'Klan adi 3-25 karakter olmali.' };
  }
  if (!TAG_REGEX.test(cleanTag)) {
    return { success: false, reason: 'Klan etiketi 2-5 harf/rakamdan olusmali (ornek: TRK).' };
  }
  if (db.prepare('SELECT id FROM clans WHERE tag = ?').get(cleanTag)) {
    return { success: false, reason: 'Bu etiket zaten kullaniliyor.' };
  }

  const result = db.prepare('INSERT INTO clans (name, tag, leader_user_id) VALUES (?, ?, ?)').run(cleanName, cleanTag, userId);
  const clanId = result.lastInsertRowid;
  db.prepare('UPDATE users SET clan_id = ? WHERE id = ?').run(clanId, userId);

  return { success: true, clanId };
}

// Var olan bir klana katilir.
function joinClan(userId, clanId) {
  const user = getUserWithClan(userId);
  if (user.clan_id) {
    return { success: false, reason: 'Zaten bir klandesin. Once klandan ayril.' };
  }

  const clan = getClanById(clanId);
  if (!clan) {
    return { success: false, reason: 'Klan bulunamadi.' };
  }

  db.prepare('UPDATE users SET clan_id = ? WHERE id = ?').run(clanId, userId);
  return { success: true };
}

// Klandan ayrilir. Lider ayrilirsa, klanda baska uye varsa en eski uye
// yeni lider olur; kimse kalmadiysa klan (ve sohbeti) tamamen silinir.
function leaveClan(userId) {
  const user = getUserWithClan(userId);
  if (!user.clan_id) {
    return { success: false, reason: 'Bir klanda degilsin.' };
  }

  const clanId = user.clan_id;
  const clan = getClanById(clanId);

  db.prepare('UPDATE users SET clan_id = NULL WHERE id = ?').run(userId);

  if (clan.leader_user_id === userId) {
    const nextMember = db.prepare('SELECT id FROM users WHERE clan_id = ? ORDER BY id ASC LIMIT 1').get(clanId);
    if (nextMember) {
      db.prepare('UPDATE clans SET leader_user_id = ? WHERE id = ?').run(nextMember.id, clanId);
    } else {
      db.prepare('DELETE FROM clan_chat_messages WHERE clan_id = ?').run(clanId);
      db.prepare('DELETE FROM clans WHERE id = ?').run(clanId);
    }
  }

  return { success: true };
}

// Klan lideri, baska bir uyeyi klandan atar.
function kickMember(leaderUserId, targetUserId) {
  const leader = getUserWithClan(leaderUserId);
  if (!leader.clan_id) {
    return { success: false, reason: 'Bir klanda degilsin.' };
  }

  const clan = getClanById(leader.clan_id);
  if (clan.leader_user_id !== leaderUserId) {
    return { success: false, reason: 'Sadece klan lideri uye atabilir.' };
  }
  if (targetUserId === leaderUserId) {
    return { success: false, reason: 'Kendini atamazsin, klandan ayrilabilirsin.' };
  }

  const target = getUserWithClan(targetUserId);
  if (!target || target.clan_id !== clan.id) {
    return { success: false, reason: 'Bu oyuncu klaninda degil.' };
  }

  db.prepare('UPDATE users SET clan_id = NULL WHERE id = ?').run(targetUserId);
  return { success: true };
}

module.exports = { getClanById, getClanMembers, getAllClans, createClan, joinClan, leaveClan, kickMember };
