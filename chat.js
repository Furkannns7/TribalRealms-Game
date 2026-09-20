// chat.js
// Tum oyunculara acik, tek odali basit bir genel sohbet.

const { db } = require('./database');

const MAX_MESSAGE_LENGTH = 300;

// Son N mesaji, en eskiden en yeniye siralanmis olarak getirir.
function getRecentMessages(limit) {
  const rows = db.prepare(`
    SELECT cm.id, cm.user_id, cm.message, cm.created_at, u.username, u.first_name
    FROM chat_messages cm
    JOIN users u ON u.id = cm.user_id
    ORDER BY cm.id DESC
    LIMIT ?
  `).all(limit || 50);

  return rows.reverse();
}

function sendMessage(userId, message) {
  const trimmed = String(message || '').trim();

  if (!trimmed) {
    return { success: false, reason: 'Bos mesaj gonderemezsin.' };
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { success: false, reason: `Mesaj en fazla ${MAX_MESSAGE_LENGTH} karakter olabilir.` };
  }

  db.prepare('INSERT INTO chat_messages (user_id, message) VALUES (?, ?)').run(userId, trimmed);
  return { success: true };
}

// ---------------------------------------------------------
// KLAN SOHBETI (Asama 8) - sadece o klanin uyeleri gorur
// ---------------------------------------------------------

function getClanMessages(clanId, limit) {
  const rows = db.prepare(`
    SELECT cm.id, cm.user_id, cm.message, cm.created_at, u.username, u.first_name
    FROM clan_chat_messages cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.clan_id = ?
    ORDER BY cm.id DESC
    LIMIT ?
  `).all(clanId, limit || 50);

  return rows.reverse();
}

function sendClanMessage(clanId, userId, message) {
  const trimmed = String(message || '').trim();

  if (!trimmed) {
    return { success: false, reason: 'Bos mesaj gonderemezsin.' };
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { success: false, reason: `Mesaj en fazla ${MAX_MESSAGE_LENGTH} karakter olabilir.` };
  }

  db.prepare('INSERT INTO clan_chat_messages (clan_id, user_id, message) VALUES (?, ?, ?)').run(clanId, userId, trimmed);
  return { success: true };
}

module.exports = {
  getRecentMessages, sendMessage, MAX_MESSAGE_LENGTH,
  getClanMessages, sendClanMessage
};
