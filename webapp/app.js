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
    viewMilitary: document.getElementById('view-military'),
    viewAttack: document.getElementById('view-attack'),
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
    reportsList: document.getElementById('reports-list')
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

    renderScene();

    if (state.activeSheetType) {
      const building = state.buildings.find((b) => b.type === state.activeSheetType);
      if (building) renderSheetContent(building);
    }

    if (state.activeTab === 'military') renderMilitary();
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
    el.viewMilitary.hidden = tab !== 'military';
    el.viewAttack.hidden = tab !== 'attack';
    el.viewPlaceholder.hidden = tab !== 'market';

    if (tab === 'market') {
      el.placeholderText.textContent = "Pazar ve kaynak takası Aşama 6'da eklenecek.";
    }
    if (tab === 'military') renderMilitary();
    if (tab === 'attack') { renderAttack(); fetchReports(); }
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
