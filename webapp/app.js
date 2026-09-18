// app.js
// Mini App'in istemci tarafi mantigi. Telegram'dan initData'yi alir,
// sunucudan koy verisini ceker, koy sahnesini (binalari) cizer, bina
// tiklamalarini ve yukseltme islemlerini yonetir.

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

  // Her bina tipinin koy sahnesindeki konumu (yuzde olarak).
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

  // ---------------------------------------------------------
  // DURUM (STATE)
  // ---------------------------------------------------------

  let state = {
    village: null,
    buildings: [],
    activeSheetType: null,
    countdownTimer: null
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
    viewPlaceholder: document.getElementById('view-placeholder'),
    placeholderText: document.getElementById('placeholder-text'),
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
    sheetClose: document.getElementById('sheet-close')
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

  async function fetchVillage() {
    const data = await apiPost('/api/village', {});
    state.village = data.village;
    state.buildings = data.buildings;
    render();
  }

  // ---------------------------------------------------------
  // GORUNTULEME (RENDER)
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

    stopCountdown();
    if (building.upgrading) startCountdown();
  }

  function closeSheet() {
    state.activeSheetType = null;
    el.sheetBackdrop.classList.remove('show');
    el.sheet.classList.remove('show');
    stopCountdown();
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

  function formatDuration(totalSec) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m > 0 ? `${m} dk ${s} sn` : `${s} sn`;
  }

  function updateCountdownUI(building) {
    const remainingMs = Math.max(0, new Date(building.upgradeFinishesAt).getTime() - Date.now());
    const totalMs = (building.nextTimeSeconds || 1) * 1000;
    const progressPct = Math.min(100, Math.max(0, 100 - (remainingMs / totalMs) * 100));

    el.progressFill.style.width = progressPct + '%';
    el.sheetCountdown.textContent = `İnşa ediliyor… ${formatRemaining(building.upgradeFinishesAt)} kaldı`;

    if (remainingMs <= 0) {
      stopCountdown();
      fetchVillage().catch(showApiError);
    }
  }

  function startCountdown() {
    state.countdownTimer = setInterval(() => {
      // Sahnedeki zamanlayici etiketlerini guncelle
      document.querySelectorAll('.marker-timer').forEach((elm) => {
        elm.textContent = formatRemaining(elm.dataset.finishesAt);
      });

      if (state.activeSheetType) {
        const building = state.buildings.find((b) => b.type === state.activeSheetType);
        if (building && building.upgrading) updateCountdownUI(building);
      }
    }, 1000);
  }

  function stopCountdown() {
    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
    }
  }

  // ---------------------------------------------------------
  // YUKSELTME ISLEMI
  // ---------------------------------------------------------

  el.sheetUpgradeBtn.addEventListener('click', async () => {
    const type = state.activeSheetType;
    if (!type) return;

    el.sheetUpgradeBtn.disabled = true;
    el.sheetUpgradeBtn.textContent = 'Başlatılıyor…';

    try {
      const data = await apiPost('/api/upgrade', { type });
      state.village = data.village;
      state.buildings = data.buildings;
      render();
      showToast('İnşaat başladı!');
      const building = state.buildings.find((b) => b.type === type);
      if (building) {
        renderSheetContent(building);
        startCountdown();
      }
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
  // ALT SEKMELER (TAB BAR)
  // ---------------------------------------------------------

  const TAB_MESSAGES = {
    military: 'Askeriye ve asker üretimi Aşama 3\'te eklenecek.',
    market: 'Pazar ve kaynak takası Aşama 4\'te eklenecek.',
    attack: 'Saldırı ve yağma sistemi Aşama 3\'te eklenecek.'
  };

  el.tabBar.addEventListener('click', (event) => {
    const btn = event.target.closest('.tab-btn');
    if (!btn) return;

    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    const tab = btn.dataset.tab;
    if (tab === 'village') {
      el.viewVillage.hidden = false;
      el.viewPlaceholder.hidden = true;
    } else {
      el.viewVillage.hidden = true;
      el.viewPlaceholder.hidden = false;
      el.placeholderText.textContent = TAB_MESSAGES[tab] || 'Bu özellik yakında eklenecek.';
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
  // BASLANGIC
  // ---------------------------------------------------------

  async function init() {
    if (!tg || !initData) {
      el.loadingText.textContent = 'Bu ekranı Telegram botundaki "Köyünü Aç" butonundan açmalısın.';
      return;
    }

    try {
      await fetchVillage();
      el.loadingOverlay.classList.add('hidden');
    } catch (err) {
      el.loadingText.textContent = err.message || 'Köy yüklenemedi. Önce botta /start yapmalısın.';
    }
  }

  // Arka planda periyodik yenileme: sunucu tarafinda zaten saatlik uretim
  // hesaplaniyor, burada sadece ekrani guncel tutuyoruz.
  setInterval(() => {
    if (state.village) fetchVillage().catch(() => {});
  }, 15000);

  init();
})();
