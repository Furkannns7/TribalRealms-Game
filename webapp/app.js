// app.js
// Mini App'in istemci tarafi mantigi. Telegram'dan initData'yi alir,
// sunucudan koy/ordu verisini ceker, koy sahnesini cizer, bina/asker/
// saldiri islemlerini yonetir.

(function () {
  'use strict';

  const tg = window.Telegram && window.Telegram.WebApp;
  const initData = tg ? tg.initData : '';

  if (tg) {
    tg.ready();
    tg.expand();
    try { tg.setHeaderColor('#f4ecd8'); } catch (err) { /* eski istemcilerde olmayabilir */ }
    try { tg.setBackgroundColor('#4c7540'); } catch (err) { /* eski istemcilerde olmayabilir */ }
  }

  // ---------------------------------------------------------
  // SABITLER
  // ---------------------------------------------------------

  const POSITIONS = {
    main_building: { top: 18, left: 50 },
    woodcutter: { top: 42, left: 16 },
    clay_pit: { top: 42, left: 84 },
    iron_mine: { top: 68, left: 28 },
    grain_field: { top: 68, left: 72 },
    warehouse: { top: 90, left: 16 },
    granary: { top: 90, left: 84 }
  };

  const DESCRIPTIONS = {
    main_building: 'Köydeki tüm inşaatların süresini kısaltır. Seviyesi arttıkça her bina daha hızlı yükselir.',
    woodcutter: 'Saatlik odun üretimini artırır.',
    clay_pit: 'Saatlik tuğla üretimini artırır.',
    iron_mine: 'Saatlik demir üretimini artırır.',
    grain_field: 'Saatlik tahıl üretimini artırır.',
    warehouse: 'Odun, tuğla ve demir depolama kapasitesini artırır.',
    granary: 'Tahıl depolama kapasitesini artırır.'
  };

  const RESOURCE_ICON = { wood: 'icon-res-wood', clay: 'icon-res-clay', iron: 'icon-res-iron', grain: 'icon-res-grain' };
  const RESOURCE_LABEL = { wood: 'Odun', clay: 'Tuğla', iron: 'Demir', grain: 'Tahıl' };
  const CIVILIZATION_NAMES = { roma: 'Roma', galya: 'Galya', toton: 'Töton' };

  // ---------------------------------------------------------
  // DURUM (STATE)
  // ---------------------------------------------------------

  let state = {
    village: null,
    buildings: [],
    barracksLevel: 1,
    army: [],
    unitRoster: [],
    trainingQueue: [],
    outgoingAttacks: [],
    incomingAttacks: [],
    reports: [],
    marketLevel: 1,
    myOffers: [],
    marketOffers: [],
    chatMessages: [],
    chatScope: 'global',
    clanStatus: { inClan: false, clan: null, members: [], clans: [] },
    activeSheetType: null,
    activeTab: 'village'
  };

  // ---------------------------------------------------------
  // DOM REFERANSLARI
  // ---------------------------------------------------------

  const el = {
    scene: document.getElementById('village-scene'),
    villageName: document.getElementById('village-name'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text'),
    toast: document.getElementById('toast'),
    tabBar: document.getElementById('tab-bar'),
    viewVillage: document.getElementById('view-village'),
    viewMap: document.getElementById('view-map'),
    mapSvg: document.getElementById('map-svg'),
    viewMilitary: document.getElementById('view-military'),
    viewMarket: document.getElementById('view-market'),
    marketLevelEl: document.getElementById('market-level'),
    marketSlotsEl: document.getElementById('market-slots'),
    offerResourceSelect: document.getElementById('offer-resource'),
    offerAmountInput: document.getElementById('offer-amount'),
    requestResourceSelect: document.getElementById('request-resource'),
    requestAmountInput: document.getElementById('request-amount'),
    marketCreateBtn: document.getElementById('market-create-btn'),
    myOffersList: document.getElementById('my-offers-list'),
    marketOffersList: document.getElementById('market-offers-list'),
    viewAttack: document.getElementById('view-attack'),
    viewChat: document.getElementById('view-chat'),
    chatScopeToggle: document.getElementById('chat-scope-toggle'),
    chatMessagesEl: document.getElementById('chat-messages'),
    chatInput: document.getElementById('chat-input'),
    chatSendBtn: document.getElementById('chat-send-btn'),
    viewClan: document.getElementById('view-clan'),
    clanNoClanView: document.getElementById('clan-no-clan-view'),
    clanInClanView: document.getElementById('clan-in-clan-view'),
    clanNameInput: document.getElementById('clan-name-input'),
    clanTagInput: document.getElementById('clan-tag-input'),
    clanCreateBtn: document.getElementById('clan-create-btn'),
    clanBrowseList: document.getElementById('clan-browse-list'),
    clanHeaderName: document.getElementById('clan-header-name'),
    clanHeaderTag: document.getElementById('clan-header-tag'),
    clanMembersList: document.getElementById('clan-members-list'),
    clanLeaveBtn: document.getElementById('clan-leave-btn'),
    viewPlaceholder: document.getElementById('view-placeholder'),
    placeholderText: document.getElementById('placeholder-text'),
    civPicker: document.getElementById('view-civ-picker'),
    civCards: document.getElementById('civ-cards'),
    sheetBackdrop: document.getElementById('sheet-backdrop'),
    sheet: document.getElementById('building-sheet'),
    sheetIconUse: document.getElementById('sheet-icon-use'),
    sheetName: document.getElementById('sheet-name'),
    sheetLevel: document.getElementById('sheet-level'),
    sheetDescription: document.getElementById('sheet-description'),
    sheetProgress: document.getElementById('sheet-progress'),
    progressFill: document.getElementById('progress-fill'),
    sheetCountdown: document.getElementById('sheet-countdown'),
    sheetCostBox: document.getElementById('sheet-cost-box'),
    sheetCostChips: document.getElementById('sheet-cost-chips'),
    sheetTime: document.getElementById('sheet-time'),
    sheetUpgradeBtn: document.getElementById('sheet-upgrade-btn'),
    sheetClose: document.getElementById('sheet-close'),
    barracksLevelEl: document.getElementById('barracks-level'),
    trainingQueueList: document.getElementById('training-queue-list'),
    unitRosterEl: document.getElementById('unit-roster'),
    incomingBanner: document.getElementById('incoming-banner'),
    attackTargetInput: document.getElementById('attack-target'),
    attackUnitList: document.getElementById('attack-unit-list'),
    attackSendBtn: document.getElementById('attack-send-btn'),
    outgoingList: document.getElementById('outgoing-list'),
    reportsList: document.getElementById('reports-list'),
    villageSheetBackdrop: document.getElementById('village-sheet-backdrop'),
    villageInfoSheet: document.getElementById('village-info-sheet'),
    villageSheetClose: document.getElementById('village-sheet-close'),
    villageInfoName: document.getElementById('village-info-name'),
    villageInfoOwner: document.getElementById('village-info-owner'),
    villageInfoDetail: document.getElementById('village-info-detail'),
    villageInfoAttackBtn: document.getElementById('village-info-attack-btn')
  };

  for (const chip of document.querySelectorAll('.res-chip')) {
    chip.amountEl = chip.querySelector('.res-amount');
    chip.rateEl = chip.querySelector('.res-rate');
  }

  // ---------------------------------------------------------
  // API
  // ---------------------------------------------------------

  async function apiPost(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ initData }, body))
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data.error || 'Bilinmeyen hata');
      error.payload = data;
      throw error;
    }
    return data;
  }

  function applyPayload(data) {
    state.village = data.village;
    state.buildings = data.buildings;
    state.barracksLevel = data.barracksLevel;
    state.army = data.army;
    state.unitRoster = data.unitRoster;
    state.trainingQueue = data.trainingQueue;
    state.outgoingAttacks = data.outgoingAttacks;
    state.incomingAttacks = data.incomingAttacks;
  }

  async function fetchVillage() {
    const data = await apiPost('/api/village', {});
    el.loadingOverlay.classList.add('hidden');

    if (data.needsCivilization) {
      showCivPicker(data.civilizations);
      return;
    }

    hideCivPicker();
    applyPayload(data);
    render();
  }

  async function fetchReports() {
    try {
      const data = await apiPost('/api/reports', {});
      state.reports = data.reports;
      renderReports();
    } catch (err) {
      // sessiz gec, savas raporlari kritik degil
    }
  }

  // ---------------------------------------------------------
  // MEDENIYET SECIM EKRANI
  // ---------------------------------------------------------

  function showCivPicker(civilizations) {
    el.civCards.innerHTML = '';
    for (const civ of civilizations) {
      const card = document.createElement('div');
      card.className = 'civ-card';
      card.innerHTML =
        `<h3 class="civ-card-name">${civ.name}</h3>` +
        `<p class="civ-card-tagline">${civ.tagline}</p>` +
        `<p class="civ-card-desc">${civ.description}</p>`;
      card.addEventListener('click', () => chooseCivilization(civ.key, card));
      el.civCards.appendChild(card);
    }
    el.civPicker.classList.remove('hidden');
  }

  function hideCivPicker() {
    el.civPicker.classList.add('hidden');
  }

  async function chooseCivilization(key, cardEl) {
    document.querySelectorAll('.civ-card').forEach((c) => { c.style.pointerEvents = 'none'; });
    if (cardEl) cardEl.style.opacity = '0.6';

    try {
      const data = await apiPost('/api/choose-civilization', { civilization: key });
      hideCivPicker();
      applyPayload(data);
      render();
    } catch (err) {
      showToast(err.message || 'Medeniyet seçilemedi.');
      document.querySelectorAll('.civ-card').forEach((c) => { c.style.pointerEvents = ''; });
      if (cardEl) cardEl.style.opacity = '';
    }
  }

  // ---------------------------------------------------------
  // GENEL GORUNTULEME
  // ---------------------------------------------------------

  function render() {
    if (!state.village) return;

    el.villageName.textContent = state.village.name;
    updateResourceBar();
    renderScene();

    if (state.activeSheetType) {
      const building = state.buildings.find((b) => b.type === state.activeSheetType);
      if (building) renderSheetContent(building);
    }

    if (state.activeTab === 'military') renderMilitary();
    if (state.activeTab === 'market') fetchMarket();
    if (state.activeTab === 'attack') renderAttack();
  }

  function renderScene() {
    el.scene.innerHTML = '';

    for (const building of state.buildings) {
      const pos = POSITIONS[building.type];
      if (!pos) continue;

      const marker = document.createElement('button');
      marker.className = 'building-marker' + (building.upgrading ? ' is-building' : '');
      marker.style.top = pos.top + '%';
      marker.style.left = pos.left + '%';
      marker.setAttribute('aria-label', building.name);

      const plot = document.createElement('div');
      plot.className = 'marker-plot';
      plot.innerHTML =
        `<svg class="marker-icon"><use href="#icon-${building.type}"/></svg>` +
        `<span class="marker-level">${building.level}</span>`;

      if (building.upgrading) {
        const timer = document.createElement('span');
        timer.className = 'marker-timer';
        timer.textContent = formatRemaining(building.upgradeFinishesAt);
        timer.dataset.finishesAt = building.upgradeFinishesAt;
        plot.appendChild(timer);
      }

      const label = document.createElement('span');
      label.className = 'marker-label';
      label.textContent = building.name;

      marker.appendChild(plot);
      marker.appendChild(label);
      marker.addEventListener('click', () => openSheet(building.type));

      el.scene.appendChild(marker);
    }
  }

  function formatRemaining(finishesAt) {
    const remainingMs = new Date(finishesAt).getTime() - Date.now();
    const totalSec = Math.max(0, Math.round(remainingMs / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m > 0 ? `${m}dk ${s}sn` : `${s}sn`;
  }

  function formatDuration(totalSec) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m > 0 ? `${m} dk ${s} sn` : `${s} sn`;
  }

  // ---------------------------------------------------------
  // BINA DETAY PANELI (SHEET)
  // ---------------------------------------------------------

  function openSheet(type) {
    state.activeSheetType = type;
    const building = state.buildings.find((b) => b.type === type);
    if (!building) return;

    el.sheetIconUse.setAttribute('href', `#icon-${type}`);
    renderSheetContent(building);

    el.sheetBackdrop.classList.remove('hidden');
    el.sheet.classList.remove('hidden');
    requestAnimationFrame(() => {
      el.sheetBackdrop.classList.add('show');
      el.sheet.classList.add('show');
    });
  }

  function closeSheet() {
    state.activeSheetType = null;
    el.sheetBackdrop.classList.remove('show');
    el.sheet.classList.remove('show');
    setTimeout(() => {
      if (!state.activeSheetType) {
        el.sheetBackdrop.classList.add('hidden');
        el.sheet.classList.add('hidden');
      }
    }, 250);
  }

  function renderSheetContent(building) {
    el.sheetName.textContent = building.name;
    el.sheetLevel.textContent = `Seviye ${building.level}`;
    el.sheetDescription.textContent = DESCRIPTIONS[building.type] || '';

    if (building.upgrading) {
      el.sheetProgress.classList.remove('hidden');
      el.sheetCostBox.style.display = 'none';
      el.sheetUpgradeBtn.style.display = 'none';
      updateCountdownUI(building);
    } else {
      el.sheetProgress.classList.add('hidden');
      el.sheetCostBox.style.display = '';
      el.sheetUpgradeBtn.style.display = '';
      el.sheetUpgradeBtn.disabled = false;
      el.sheetUpgradeBtn.textContent = `Yükselt (Sv.${building.level + 1})`;

      el.sheetCostChips.innerHTML = '';
      const current = { wood: state.village.wood, clay: state.village.clay, iron: state.village.iron, grain: state.village.grain };
      for (const key of ['wood', 'clay', 'iron', 'grain']) {
        const need = building.nextCost[key];
        if (need <= 0) continue;
        const chip = document.createElement('div');
        const insufficient = current[key] < need;
        chip.className = 'cost-chip' + (insufficient ? ' insufficient' : '');
        chip.innerHTML = `<svg><use href="#${RESOURCE_ICON[key]}"/></svg><span>${need}</span>`;
        el.sheetCostChips.appendChild(chip);
      }
      el.sheetTime.textContent = `İnşaat süresi: ${formatDuration(building.nextTimeSeconds)}`;
    }
  }

  function updateCountdownUI(building) {
    const remainingMs = Math.max(0, new Date(building.upgradeFinishesAt).getTime() - Date.now());
    const totalMs = (building.nextTimeSeconds || 1) * 1000;
    const progressPct = Math.min(100, Math.max(0, 100 - (remainingMs / totalMs) * 100));

    el.progressFill.style.width = progressPct + '%';
    el.sheetCountdown.textContent = `İnşa ediliyor… ${formatRemaining(building.upgradeFinishesAt)} kaldı`;

    if (remainingMs <= 0) {
      fetchVillage().catch(showApiError);
    }
  }

  el.sheetUpgradeBtn.addEventListener('click', async () => {
    const type = state.activeSheetType;
    if (!type) return;

    el.sheetUpgradeBtn.disabled = true;
    el.sheetUpgradeBtn.textContent = 'Başlatılıyor…';

    try {
      const data = await apiPost('/api/upgrade', { type });
      applyPayload(data);
      render();
      showToast('İnşaat başladı!');
      const building = state.buildings.find((b) => b.type === type);
      if (building) renderSheetContent(building);
    } catch (err) {
      el.sheetUpgradeBtn.disabled = false;
      const building = state.buildings.find((b) => b.type === type);
      el.sheetUpgradeBtn.textContent = building ? `Yükselt (Sv.${building.level + 1})` : 'Yükselt';
      showToast(err.message || 'İşlem başarısız oldu.');
    }
  });

  el.sheetClose.addEventListener('click', closeSheet);
  el.sheetBackdrop.addEventListener('click', closeSheet);

  // ---------------------------------------------------------
  // ASKERIYE (KISLA)
  // ---------------------------------------------------------

  function renderMilitary() {
    el.barracksLevelEl.textContent = state.barracksLevel;

    el.trainingQueueList.innerHTML = '';
    if (state.trainingQueue.length === 0) {
      el.trainingQueueList.innerHTML = '<p class="queue-empty">Eğitimde birlik yok.</p>';
    } else {
      for (const q of state.trainingQueue) {
        const row = document.createElement('div');
        row.className = 'queue-item';
        row.innerHTML =
          `<span>${q.quantity}x ${q.unitName}</span>` +
          `<span class="queue-timer" data-finishes-at="${q.finishesAt}">${formatRemaining(q.finishesAt)}</span>`;
        el.trainingQueueList.appendChild(row);
      }
    }

    el.unitRosterEl.innerHTML = '';
    for (const unit of state.unitRoster) {
      const card = document.createElement('div');
      card.className = 'unit-card';

      const costChips = ['wood', 'clay', 'iron', 'grain']
        .filter((k) => unit.cost[k] > 0)
        .map((k) => `<div class="cost-chip"><svg><use href="#${RESOURCE_ICON[k]}"/></svg><span>${unit.cost[k]}</span></div>`)
        .join('');

      card.innerHTML =
        `<div class="unit-card-top">` +
        `<svg class="unit-role-icon"><use href="#icon-role-${unit.role}"/></svg>` +
        `<span class="unit-card-name">${unit.name}</span>` +
        `<span class="unit-card-owned">${unit.owned} adet</span>` +
        `</div>` +
        `<div class="unit-stats"><span>Atk ${unit.attack}</span><span>Sav ${unit.defense}</span><span>Taş ${unit.carry}</span><span>${unit.upkeep} tahıl/sa</span></div>` +
        `<div class="unit-card-costs">${costChips}</div>` +
        `<div class="unit-train-row">` +
        `<input type="number" class="qty-input" min="1" value="1" data-unit="${unit.type}" />` +
        `<button class="train-btn" data-unit="${unit.type}">Eğit (${formatDuration(unit.trainTimeSeconds)}/adet)</button>` +
        `</div>`;

      el.unitRosterEl.appendChild(card);
    }

    el.unitRosterEl.querySelectorAll('.train-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const type = btn.dataset.unit;
        const input = el.unitRosterEl.querySelector(`.qty-input[data-unit="${type}"]`);
        const quantity = Math.max(1, parseInt(input.value, 10) || 1);

        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = 'Başlatılıyor…';

        try {
          const data = await apiPost('/api/train', { unitType: type, quantity });
          applyPayload(data);
          render();
          showToast('Eğitim başladı!');
        } catch (err) {
          showToast(err.message || 'Eğitim başlatılamadı.');
        } finally {
          btn.disabled = false;
          btn.textContent = original;
        }
      });
    });
  }

  // ---------------------------------------------------------
  // SALDIRI
  // ---------------------------------------------------------

  function renderAttack() {
    if (state.incomingAttacks.length > 0) {
      const soonest = state.incomingAttacks[0];
      el.incomingBanner.dataset.finishesAt = soonest.arrivesAt;
      el.incomingBanner.textContent = `⚠ Gelen saldırı! Varış: ${formatRemaining(soonest.arrivesAt)}`;
      el.incomingBanner.classList.remove('hidden');
    } else {
      el.incomingBanner.classList.add('hidden');
      delete el.incomingBanner.dataset.finishesAt;
    }

    el.outgoingList.innerHTML = '';
    if (state.outgoingAttacks.length === 0) {
      el.outgoingList.innerHTML = '<p class="queue-empty">Yolda saldırın yok.</p>';
    } else {
      for (const a of state.outgoingAttacks) {
        const row = document.createElement('div');
        row.className = 'queue-item';
        row.innerHTML =
          `<span>Saldırı yolda</span>` +
          `<span class="queue-timer" data-finishes-at="${a.arrivesAt}">${formatRemaining(a.arrivesAt)}</span>`;
        el.outgoingList.appendChild(row);
      }
    }

    el.attackUnitList.innerHTML = '';
    if (state.army.length === 0) {
      el.attackUnitList.innerHTML = '<p class="queue-empty">Saldırabileceğin birliğin yok. Önce Askeriye\'den asker eğit.</p>';
    } else {
      for (const u of state.army) {
        const roster = state.unitRoster.find((r) => r.type === u.type);
        const row = document.createElement('div');
        row.className = 'unit-select-row';
        row.innerHTML =
          `<svg class="unit-role-icon"><use href="#icon-role-${roster ? roster.role : 'attack'}"/></svg>` +
          `<span class="unit-select-name">${u.name}</span>` +
          `<span class="unit-select-owned">${u.count} adet</span>` +
          `<input type="number" class="qty-input" min="0" max="${u.count}" value="0" data-unit="${u.type}" />`;
        el.attackUnitList.appendChild(row);
      }
    }
  }

  function renderReports() {
    el.reportsList.innerHTML = '';
    if (state.reports.length === 0) {
      el.reportsList.innerHTML = '<p class="queue-empty">Henüz savaş raporu yok.</p>';
      return;
    }

    for (const r of state.reports) {
      const item = document.createElement('div');
      item.className = 'report-item ' + (r.won ? 'won' : 'lost');

      const roleLabel = r.role === 'attacker' ? 'Sen saldırdın' : 'Sana saldırıldı';
      const resultLabel = r.won
        ? (r.role === 'attacker' ? 'Kazandın' : 'Savundun')
        : (r.role === 'attacker' ? 'Kaybettin' : 'Yenildin');
      const lootText = (r.won && r.role === 'attacker')
        ? `Yağma: Odun ${r.loot.wood}, Tuğla ${r.loot.clay}, Demir ${r.loot.iron}, Tahıl ${r.loot.grain}`
        : (r.role === 'attacker' ? 'Birlikleriniz kayboldu.' : (r.won ? 'Saldırı püskürtüldü.' : 'Köyün yağmalandı.'));

      item.innerHTML =
        `<div class="report-top"><span>${roleLabel} — ${r.opponentName}</span><span>${resultLabel}</span></div>` +
        `<div class="report-detail">${r.opponentVillage} · ${lootText}</div>`;

      el.reportsList.appendChild(item);
    }
  }

  el.attackSendBtn.addEventListener('click', async () => {
    const target = el.attackTargetInput.value.trim();
    if (!target) {
      showToast('Hedef kullanıcı adı ya da Telegram ID gir.');
      return;
    }

    const units = {};
    el.attackUnitList.querySelectorAll('.qty-input').forEach((input) => {
      const n = parseInt(input.value, 10) || 0;
      if (n > 0) units[input.dataset.unit] = n;
    });

    if (Object.keys(units).length === 0) {
      showToast('En az bir birlik seç.');
      return;
    }

    el.attackSendBtn.disabled = true;
    el.attackSendBtn.textContent = 'Gönderiliyor…';

    try {
      const data = await apiPost('/api/attack', { target, units });
      applyPayload(data);
      render();
      showToast(`Saldırı gönderildi! Varış: ${formatDuration(data.travelSeconds)}`);
      el.attackTargetInput.value = '';
      fetchReports();
    } catch (err) {
      showToast(err.message || 'Saldırı gönderilemedi.');
    } finally {
      el.attackSendBtn.disabled = false;
      el.attackSendBtn.textContent = 'Saldırıya Gönder';
    }
  });

  // ---------------------------------------------------------
  // SOHBET
  // ---------------------------------------------------------

  let chatPollTimer = null;

  function startChatPolling() {
    stopChatPolling();
    chatPollTimer = setInterval(fetchChat, 4000);
  }

  function stopChatPolling() {
    if (chatPollTimer) {
      clearInterval(chatPollTimer);
      chatPollTimer = null;
    }
  }

  async function fetchChat() {
    const endpoint = state.chatScope === 'clan' ? '/api/clan/chat' : '/api/chat';
    try {
      const data = await apiPost(endpoint, {});
      state.chatMessages = data.messages;
      renderChat();
    } catch (err) {
      // sessiz gec, sohbet kritik degil
    }
  }

  function formatClock(iso) {
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }

  function renderChat() {
    el.chatMessagesEl.innerHTML = '';

    for (const m of state.chatMessages) {
      const row = document.createElement('div');
      row.className = 'chat-msg ' + (m.isMine ? 'mine' : 'theirs');

      if (!m.isMine) {
        const sender = document.createElement('span');
        sender.className = 'chat-sender';
        sender.textContent = m.senderName;
        row.appendChild(sender);
      }

      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      bubble.textContent = m.message; // textContent kullanilir, HTML olarak yorumlanmaz (guvenlik)
      row.appendChild(bubble);

      const time = document.createElement('span');
      time.className = 'chat-time';
      time.textContent = formatClock(m.createdAt);
      row.appendChild(time);

      el.chatMessagesEl.appendChild(row);
    }

    el.chatMessagesEl.scrollTop = el.chatMessagesEl.scrollHeight;
  }

  async function sendChatMessage() {
    const text = el.chatInput.value.trim();
    if (!text) return;

    const endpoint = state.chatScope === 'clan' ? '/api/clan/chat/send' : '/api/chat/send';

    el.chatSendBtn.disabled = true;
    el.chatInput.disabled = true;

    try {
      const data = await apiPost(endpoint, { message: text });
      state.chatMessages = data.messages;
      renderChat();
      el.chatInput.value = '';
    } catch (err) {
      showToast(err.message || 'Mesaj gönderilemedi.');
    } finally {
      el.chatSendBtn.disabled = false;
      el.chatInput.disabled = false;
      el.chatInput.focus();
    }
  }

  el.chatSendBtn.addEventListener('click', sendChatMessage);
  el.chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendChatMessage();
    }
  });

  el.chatScopeToggle.addEventListener('click', (event) => {
    const btn = event.target.closest('.scope-btn');
    if (!btn) return;

    document.querySelectorAll('.scope-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.chatScope = btn.dataset.scope;
    fetchChat();
  });

  // ---------------------------------------------------------
  // KLAN
  // ---------------------------------------------------------

  async function fetchClanStatus(renderAfter) {
    try {
      const data = await apiPost('/api/clan', {});
      state.clanStatus = data;

      el.chatScopeToggle.classList.toggle('hidden', !data.inClan);
      if (!data.inClan && state.chatScope === 'clan') {
        state.chatScope = 'global';
        document.querySelectorAll('.scope-btn').forEach((b) => b.classList.remove('active'));
        document.querySelector('.scope-btn[data-scope="global"]').classList.add('active');
      }

      if (renderAfter) renderClan();
    } catch (err) {
      // sessiz gec
    }
  }

  function renderClan() {
    const status = state.clanStatus;

    el.clanNoClanView.hidden = status.inClan;
    el.clanInClanView.hidden = !status.inClan;

    if (!status.inClan) {
      el.clanBrowseList.innerHTML = '';
      if (!status.clans || status.clans.length === 0) {
        el.clanBrowseList.innerHTML = '<p class="queue-empty">Henüz hiç klan kurulmamış. İlk klanı sen kur!</p>';
      } else {
        for (const c of status.clans) {
          const item = document.createElement('div');
          item.className = 'report-item';
          item.innerHTML =
            `<div class="report-top offer-item">` +
            `<span class="offer-text">${c.name} [${c.tag}]<span class="offer-from">${c.memberCount} üye</span></span>` +
            `<button class="offer-action-btn accept" data-clan="${c.id}">Katıl</button>` +
            `</div>`;
          el.clanBrowseList.appendChild(item);
        }
        el.clanBrowseList.querySelectorAll('.offer-action-btn.accept').forEach((btn) => {
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
              const data = await apiPost('/api/clan/join', { clanId: Number(btn.dataset.clan) });
              state.clanStatus = data;
              renderClan();
              showToast('Klana katıldın!');
            } catch (err) {
              showToast(err.message || 'Katılamadın.');
              btn.disabled = false;
            }
          });
        });
      }
    } else {
      el.clanHeaderName.textContent = status.clan.name;
      el.clanHeaderTag.textContent = status.clan.tag;

      el.clanMembersList.innerHTML = '';
      for (const m of status.members) {
        const row = document.createElement('div');
        row.className = 'queue-item member-row';
        row.innerHTML =
          `<span class="member-name">${m.name}${m.isLeader ? '<span class="leader-badge">LİDER</span>' : ''}</span>`;

        if (status.clan.isLeader && !m.isLeader) {
          const kickBtn = document.createElement('button');
          kickBtn.className = 'offer-action-btn cancel';
          kickBtn.textContent = 'At';
          kickBtn.addEventListener('click', async () => {
            kickBtn.disabled = true;
            try {
              const data = await apiPost('/api/clan/kick', { targetUserId: m.id });
              state.clanStatus = data;
              renderClan();
              showToast('Üye klandan atıldı.');
            } catch (err) {
              showToast(err.message || 'Atılamadı.');
              kickBtn.disabled = false;
            }
          });
          row.appendChild(kickBtn);
        }

        el.clanMembersList.appendChild(row);
      }
    }
  }

  el.clanCreateBtn.addEventListener('click', async () => {
    const name = el.clanNameInput.value.trim();
    const tag = el.clanTagInput.value.trim();

    if (name.length < 3) {
      showToast('Klan adı en az 3 karakter olmalı.');
      return;
    }
    if (tag.length < 2) {
      showToast('Klan etiketi en az 2 karakter olmalı.');
      return;
    }

    el.clanCreateBtn.disabled = true;
    el.clanCreateBtn.textContent = 'Kuruluyor…';

    try {
      const data = await apiPost('/api/clan/create', { name, tag });
      state.clanStatus = data;
      renderClan();
      el.chatScopeToggle.classList.remove('hidden');
      showToast('Klan kuruldu!');
    } catch (err) {
      showToast(err.message || 'Klan kurulamadı.');
    } finally {
      el.clanCreateBtn.disabled = false;
      el.clanCreateBtn.textContent = 'Klan Kur';
    }
  });

  el.clanLeaveBtn.addEventListener('click', async () => {
    el.clanLeaveBtn.disabled = true;
    try {
      const data = await apiPost('/api/clan/leave', {});
      state.clanStatus = data;
      renderClan();
      el.chatScopeToggle.classList.add('hidden');
      if (state.chatScope === 'clan') {
        state.chatScope = 'global';
        fetchChat();
      }
      showToast('Klandan ayrıldın.');
    } catch (err) {
      showToast(err.message || 'Ayrılamadın.');
    } finally {
      el.clanLeaveBtn.disabled = false;
    }
  });

  // ---------------------------------------------------------
  // PAZAR
  // ---------------------------------------------------------

  async function fetchMarket() {
    try {
      const data = await apiPost('/api/market', {});
      applyMarketPayload(data);
      renderMarket();
    } catch (err) {
      showToast(err.message || 'Pazar yüklenemedi.');
    }
  }

  function applyMarketPayload(data) {
    state.marketLevel = data.marketLevel;
    state.myOffers = data.myOffers;
    state.marketOffers = data.offers;
    if (data.village && state.village) {
      Object.assign(state.village, data.village);
      updateResourceBar();
    }
  }

  function updateResourceBar() {
    const resources = {
      wood: [state.village.wood, state.village.woodProduction],
      clay: [state.village.clay, state.village.clayProduction],
      iron: [state.village.iron, state.village.ironProduction],
      grain: [state.village.grain, state.village.grainProduction]
    };
    for (const chip of document.querySelectorAll('.res-chip')) {
      const key = chip.dataset.res;
      const [amount, rate] = resources[key];
      chip.amountEl.textContent = Math.floor(amount);
      chip.rateEl.textContent = `+${rate}/sa`;
    }
  }

  function renderMarket() {
    el.marketLevelEl.textContent = state.marketLevel;
    el.marketSlotsEl.textContent = `${state.myOffers.length} / ${state.marketLevel} açık teklif kullanılıyor.`;

    el.myOffersList.innerHTML = '';
    if (state.myOffers.length === 0) {
      el.myOffersList.innerHTML = '<p class="queue-empty">Açık teklifin yok.</p>';
    } else {
      for (const o of state.myOffers) {
        const row = document.createElement('div');
        row.className = 'queue-item offer-item';
        row.innerHTML =
          `<span class="offer-text">${o.offerAmount} ${RESOURCE_LABEL[o.offerResource]} → ${o.requestAmount} ${RESOURCE_LABEL[o.requestResource]}</span>` +
          `<button class="offer-action-btn cancel" data-offer="${o.id}">İptal</button>`;
        el.myOffersList.appendChild(row);
      }
      el.myOffersList.querySelectorAll('.offer-action-btn.cancel').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const data = await apiPost('/api/market/cancel', { offerId: Number(btn.dataset.offer) });
            applyMarketPayload(data);
            renderMarket();
            showToast('Teklif iptal edildi.');
          } catch (err) {
            showToast(err.message || 'İptal edilemedi.');
            btn.disabled = false;
          }
        });
      });
    }

    el.marketOffersList.innerHTML = '';
    if (state.marketOffers.length === 0) {
      el.marketOffersList.innerHTML = '<p class="queue-empty">Piyasada teklif yok.</p>';
    } else {
      for (const o of state.marketOffers) {
        const item = document.createElement('div');
        item.className = 'report-item';
        item.innerHTML =
          `<div class="report-top offer-item">` +
          `<span class="offer-text">${o.offerAmount} ${RESOURCE_LABEL[o.offerResource]} → ${o.requestAmount} ${RESOURCE_LABEL[o.requestResource]}` +
          `<span class="offer-from">${o.fromName} · ${o.fromVillage}</span></span>` +
          `<button class="offer-action-btn accept" data-offer="${o.id}">Kabul Et</button>` +
          `</div>`;
        el.marketOffersList.appendChild(item);
      }
      el.marketOffersList.querySelectorAll('.offer-action-btn.accept').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          const original = btn.textContent;
          btn.textContent = '…';
          try {
            const data = await apiPost('/api/market/accept', { offerId: Number(btn.dataset.offer) });
            applyMarketPayload(data);
            renderMarket();
            showToast('Takas tamamlandı!');
          } catch (err) {
            showToast(err.message || 'Kabul edilemedi.');
            btn.disabled = false;
            btn.textContent = original;
          }
        });
      });
    }
  }

  el.marketCreateBtn.addEventListener('click', async () => {
    const offerResource = el.offerResourceSelect.value;
    const requestResource = el.requestResourceSelect.value;
    const offerAmount = parseInt(el.offerAmountInput.value, 10) || 0;
    const requestAmount = parseInt(el.requestAmountInput.value, 10) || 0;

    if (offerResource === requestResource) {
      showToast('Verdiğin ve istediğin kaynak aynı olamaz.');
      return;
    }
    if (offerAmount <= 0 || requestAmount <= 0) {
      showToast('Geçerli bir miktar gir.');
      return;
    }

    el.marketCreateBtn.disabled = true;
    el.marketCreateBtn.textContent = 'Oluşturuluyor…';

    try {
      const data = await apiPost('/api/market/create', { offerResource, offerAmount, requestResource, requestAmount });
      applyMarketPayload(data);
      renderMarket();
      showToast('Teklif oluşturuldu!');
    } catch (err) {
      showToast(err.message || 'Teklif oluşturulamadı.');
    } finally {
      el.marketCreateBtn.disabled = false;
      el.marketCreateBtn.textContent = 'Teklif Oluştur';
    }
  });

  // ---------------------------------------------------------
  // DUNYA HARITASI
  // ---------------------------------------------------------

  const CIV_CLASS = { roma: 'civ-roma', galya: 'civ-galya', toton: 'civ-toton' };
  const MAP_MIN_SPAN = 6;
  let mapVillages = [];
  let activeMapVillageId = null;
  let mapWorldSize = 50;
  let mapView = { x: 0, y: 0, w: 50, h: 50 };
  let mapDragState = null;

  async function fetchMap() {
    try {
      const data = await apiPost('/api/map', {});
      mapVillages = data.villages;
      renderMap(data.worldSize, data.villages);
    } catch (err) {
      showToast(err.message || 'Harita yüklenemedi.');
    }
  }

  function clampMapView(view) {
    let { x, y, w, h } = view;
    w = Math.min(Math.max(w, MAP_MIN_SPAN), mapWorldSize);
    h = Math.min(Math.max(h, MAP_MIN_SPAN), mapWorldSize);
    x = Math.min(Math.max(x, 0), Math.max(0, mapWorldSize - w));
    y = Math.min(Math.max(y, 0), Math.max(0, mapWorldSize - h));
    return { x, y, w, h };
  }

  function applyMapView() {
    el.mapSvg.setAttribute('viewBox', `${mapView.x} ${mapView.y} ${mapView.w} ${mapView.h}`);
  }

  function zoomMap(factor) {
    const cx = mapView.x + mapView.w / 2;
    const cy = mapView.y + mapView.h / 2;
    const newW = mapView.w * factor;
    const newH = mapView.h * factor;
    mapView = clampMapView({ x: cx - newW / 2, y: cy - newH / 2, w: newW, h: newH });
    applyMapView();
  }

  function panMap(fracX, fracY) {
    mapView = clampMapView({
      x: mapView.x + mapView.w * fracX,
      y: mapView.y + mapView.h * fracY,
      w: mapView.w,
      h: mapView.h
    });
    applyMapView();
  }

  function centerMapOnMyVillage() {
    const mine = mapVillages.find((v) => v.isMine);
    if (!mine) return;
    mapView = clampMapView({ x: mine.x - mapView.w / 2, y: mine.y - mapView.h / 2, w: mapView.w, h: mapView.h });
    applyMapView();
  }

  document.getElementById('map-zoom-in').addEventListener('click', () => zoomMap(0.7));
  document.getElementById('map-zoom-out').addEventListener('click', () => zoomMap(1 / 0.7));
  document.getElementById('map-center-btn').addEventListener('click', centerMapOnMyVillage);

  document.querySelectorAll('.map-dpad-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const step = 0.4;
      const dir = btn.dataset.dir;
      if (dir === 'up') panMap(0, -step);
      if (dir === 'down') panMap(0, step);
      if (dir === 'left') panMap(-step, 0);
      if (dir === 'right') panMap(step, 0);
    });
  });

  // Parmakla/fare ile surukleyerek haritada gezinme.
  el.mapSvg.addEventListener('pointerdown', (event) => {
    mapDragState = { startX: event.clientX, startY: event.clientY, view: { ...mapView } };
    el.mapSvg.setPointerCapture(event.pointerId);
  });

  el.mapSvg.addEventListener('pointermove', (event) => {
    if (!mapDragState) return;
    const rect = el.mapSvg.getBoundingClientRect();
    const unitsPerPxX = mapDragState.view.w / rect.width;
    const unitsPerPxY = mapDragState.view.h / rect.height;
    const dxPx = event.clientX - mapDragState.startX;
    const dyPx = event.clientY - mapDragState.startY;
    mapView = clampMapView({
      x: mapDragState.view.x - dxPx * unitsPerPxX,
      y: mapDragState.view.y - dyPx * unitsPerPxY,
      w: mapDragState.view.w,
      h: mapDragState.view.h
    });
    applyMapView();
  });

  ['pointerup', 'pointercancel', 'pointerleave'].forEach((evt) => {
    el.mapSvg.addEventListener(evt, () => { mapDragState = null; });
  });

  function renderMap(worldSize, villages) {
    mapWorldSize = worldSize;

    // Ilk acilista (ya da her sekme yenilendiginde) kendi koyune
    // odaklanmis, yakinlastirilmis bir gorunumle basla.
    const mine = villages.find((v) => v.isMine);
    const initialSpan = Math.min(16, worldSize);
    const centerX = mine ? mine.x : worldSize / 2;
    const centerY = mine ? mine.y : worldSize / 2;
    mapView = clampMapView({ x: centerX - initialSpan / 2, y: centerY - initialSpan / 2, w: initialSpan, h: initialSpan });

    const svg = el.mapSvg;
    svg.innerHTML = '';

    const ns = 'http://www.w3.org/2000/svg';

    for (let i = 0; i <= worldSize; i += 5) {
      const vLine = document.createElementNS(ns, 'line');
      vLine.setAttribute('x1', i); vLine.setAttribute('y1', 0);
      vLine.setAttribute('x2', i); vLine.setAttribute('y2', worldSize);
      vLine.setAttribute('class', 'map-grid-line');
      svg.appendChild(vLine);

      const hLine = document.createElementNS(ns, 'line');
      hLine.setAttribute('x1', 0); hLine.setAttribute('y1', i);
      hLine.setAttribute('x2', worldSize); hLine.setAttribute('y2', i);
      hLine.setAttribute('class', 'map-grid-line');
      svg.appendChild(hLine);
    }

    for (const v of villages) {
      const halo = document.createElementNS(ns, 'circle');
      halo.setAttribute('cx', v.x);
      halo.setAttribute('cy', v.y);
      halo.setAttribute('r', v.isMine ? 2.2 : 1.6);
      halo.setAttribute('class', 'map-village-dot-halo');
      svg.appendChild(halo);

      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', v.x);
      dot.setAttribute('cy', v.y);
      dot.setAttribute('r', v.isMine ? 1.3 : 0.9);
      dot.setAttribute('class', 'map-village-dot ' + (v.isMine ? 'is-mine' : (CIV_CLASS[v.civilization] || 'civ-roma')));
      dot.addEventListener('click', () => openVillageInfoSheet(v));
      svg.appendChild(dot);

      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x', v.x);
      label.setAttribute('y', v.y - 2);
      label.setAttribute('class', v.isMine ? 'map-village-label' : 'map-village-clan-tag');
      label.textContent = v.isMine ? 'Sen' : (v.clanTag || '');
      if (label.textContent) svg.appendChild(label);
    }

    applyMapView();
  }

  function openVillageInfoSheet(village) {
    activeMapVillageId = village.id;

    el.villageInfoName.textContent = village.name;

    if (village.isMine) {
      el.villageInfoOwner.textContent = 'Bu senin köyün';
      el.villageInfoDetail.textContent = '';
      el.villageInfoAttackBtn.style.display = 'none';
    } else {
      const civName = CIVILIZATION_NAMES[village.civilization] || village.civilization;
      const clanPart = village.clanTag ? ` · [${village.clanTag}]` : '';
      el.villageInfoOwner.textContent = `Sahip: ${village.ownerName}${clanPart}`;
      el.villageInfoDetail.textContent = `${civName} · ${village.distance} kare uzaklıkta`;
      el.villageInfoAttackBtn.style.display = '';
    }

    el.villageSheetBackdrop.classList.remove('hidden');
    el.villageInfoSheet.classList.remove('hidden');
    requestAnimationFrame(() => {
      el.villageSheetBackdrop.classList.add('show');
      el.villageInfoSheet.classList.add('show');
    });
  }

  function closeVillageInfoSheet() {
    activeMapVillageId = null;
    el.villageSheetBackdrop.classList.remove('show');
    el.villageInfoSheet.classList.remove('show');
    setTimeout(() => {
      el.villageSheetBackdrop.classList.add('hidden');
      el.villageInfoSheet.classList.add('hidden');
    }, 250);
  }

  el.villageSheetClose.addEventListener('click', closeVillageInfoSheet);
  el.villageSheetBackdrop.addEventListener('click', closeVillageInfoSheet);

  el.villageInfoAttackBtn.addEventListener('click', () => {
    const village = mapVillages.find((v) => v.id === activeMapVillageId);
    if (!village) return;
    const target = village.ownerUsername || String(village.ownerTelegramId);

    closeVillageInfoSheet();

    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="attack"]').classList.add('active');
    state.activeTab = 'attack';
    el.viewVillage.hidden = true;
    el.viewMap.hidden = true;
    el.viewMilitary.hidden = true;
    el.viewAttack.hidden = false;
    el.viewPlaceholder.hidden = true;

    renderAttack();
    fetchReports();
    el.attackTargetInput.value = target;
  });

  // ---------------------------------------------------------
  // ALT SEKMELER (TAB BAR)
  // ---------------------------------------------------------

  el.tabBar.addEventListener('click', (event) => {
    const btn = event.target.closest('.tab-btn');
    if (!btn) return;

    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    const tab = btn.dataset.tab;
    state.activeTab = tab;

    el.viewVillage.hidden = tab !== 'village';
    el.viewMap.hidden = tab !== 'map';
    el.viewMilitary.hidden = tab !== 'military';
    el.viewMarket.hidden = tab !== 'market';
    el.viewChat.hidden = tab !== 'chat';
    el.viewClan.hidden = tab !== 'clan';
    el.viewAttack.hidden = tab !== 'attack';
    el.viewPlaceholder.hidden = true;

    if (tab === 'map') fetchMap();
    if (tab === 'military') renderMilitary();
    if (tab === 'market') fetchMarket();
    if (tab === 'clan') fetchClanStatus(true);
    if (tab === 'attack') { renderAttack(); fetchReports(); }

    if (tab === 'chat') {
      fetchChat();
      startChatPolling();
    } else {
      stopChatPolling();
    }
  });

  // ---------------------------------------------------------
  // TOAST / HATA GOSTERIMI
  // ---------------------------------------------------------

  let toastTimer = null;
  function showToast(message) {
    el.toast.textContent = message;
    el.toast.classList.remove('hidden');
    requestAnimationFrame(() => el.toast.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.classList.remove('show');
      setTimeout(() => el.toast.classList.add('hidden'), 200);
    }, 2600);
  }

  function showApiError(err) {
    console.error(err);
    showToast(err.message || 'Bir şeyler ters gitti.');
  }

  // ---------------------------------------------------------
  // CANLI GERI SAYIMLAR (her saniye)
  // ---------------------------------------------------------

  function tickTimers() {
    document.querySelectorAll('.marker-timer[data-finishes-at]').forEach((elm) => {
      elm.textContent = formatRemaining(elm.dataset.finishesAt);
    });
    document.querySelectorAll('.queue-timer[data-finishes-at]').forEach((elm) => {
      elm.textContent = formatRemaining(elm.dataset.finishesAt);
    });
    if (el.incomingBanner.dataset.finishesAt && !el.incomingBanner.classList.contains('hidden')) {
      el.incomingBanner.textContent = `⚠ Gelen saldırı! Varış: ${formatRemaining(el.incomingBanner.dataset.finishesAt)}`;
    }
    if (state.activeSheetType) {
      const building = state.buildings.find((b) => b.type === state.activeSheetType);
      if (building && building.upgrading) updateCountdownUI(building);
    }
  }
  setInterval(tickTimers, 1000);

  // ---------------------------------------------------------
  // BASLANGIC
  // ---------------------------------------------------------

  async function init() {
    if (!tg || !initData) {
      el.loadingText.textContent = 'Bu ekranı Telegram botundaki "Köyünü Aç" butonundan açmalısın.';
      return;
    }

    try {
      await fetchVillage();
      fetchClanStatus(false);
    } catch (err) {
      el.loadingText.textContent = err.message || 'Köy yüklenemedi. Önce botta /start yapmalısın.';
    }
  }

  // Arka planda periyodik yenileme: sunucu tarafinda zaten uretim/insaat/
  // saldiri hesaplaniyor, burada sadece ekrani guncel tutuyoruz.
  setInterval(() => {
    if (state.village) fetchVillage().catch(() => {});
  }, 15000);

  init();
})();
