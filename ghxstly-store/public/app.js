(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = {
    currency: '$',
    accounts: [],
    selectedAccount: null,
    promo: { code: null, discount: 0 },
    lastOrderCode: ''
  };

  /* ---------- Helpers ---------- */
  let toastTimer = null;
  function toast(msg, cls) {
    const el = $('#toast');
    el.textContent = msg;
    el.style.borderColor = cls === 'err' ? '#f29b9b' : 'var(--mist-dim)';
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }
  window.__toast = toast;

  async function api(url, options = {}) {
    const res = await fetch(url, options);
    let data = null;
    try { data = await res.json(); } catch (_) { }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }
  window.__api = api;

  function fmt(n) { return `${state.currency}${Number(n).toFixed(2)}`; }

  function accountIcon(tierVar) {
    return `<svg viewBox="0 0 24 24" fill="none"><path d="M12 2C7.58 2 4 5.58 4 10v9.2c0 .6.7.94 1.17.57L7 18l2 1.6L11.5 18l1.5 1.6 2-1.6 1.83 1.77c.47.37 1.17.03 1.17-.57V10c0-4.42-3.58-8-8-8Z" fill="currentColor"/><circle cx="9" cy="10" r="1.3" fill="#0a0d12"/><circle cx="15" cy="10" r="1.3" fill="#0a0d12"/></svg>`;
  }

  /* ---------- Particle field ---------- */
  function initParticles() {
    const canvas = $('#mist-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h, particles;

    function resize() {
      const hero = canvas.parentElement;
      w = canvas.width = hero.offsetWidth;
      h = canvas.height = hero.offsetHeight;
    }
    function makeParticles() {
      const count = Math.min(38, Math.floor(w / 34));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: h + Math.random() * 120,
        r: 26 + Math.random() * 86,
        speed: 0.10 + Math.random() * 0.24,
        drift: (Math.random() - 0.5) * 0.16,
        alpha: 0.02 + Math.random() * 0.05
      }));
    }
    function tick() {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        grad.addColorStop(0, `rgba(191,242,230,${p.alpha})`);
        grad.addColorStop(1, 'rgba(191,242,230,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        p.y -= p.speed;
        p.x += p.drift;
        if (p.y < -p.r) { p.y = h + p.r; p.x = Math.random() * w; }
      }
      if (!reduceMotion) requestAnimationFrame(tick);
    }
    window.addEventListener('resize', () => { resize(); makeParticles(); });
    resize();
    makeParticles();
    if (reduceMotion) tick(); else requestAnimationFrame(tick);
  }

  /* ---------- Scroll reveal ---------- */
  function initReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); observer.unobserve(e.target); } });
    }, { threshold: 0.12 });
    $$('.reveal').forEach(el => observer.observe(el));
  }

  /* ---------- Card spotlight ---------- */
  function initSpotlight() {
    document.addEventListener('mousemove', (e) => {
      const card = e.target.closest('.acc-card');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      card.style.setProperty('--my', `${e.clientY - rect.top}px`);
    });
  }

  /* ---------- Meta & wallet ---------- */
  async function loadMeta() {
    try {
      const meta = await api('/api/meta');
      state.currency = meta.currency || '$';
      const invite = meta.discordInvite;
      ['#discord-link', '#discord-link-2', '#discord-link-3', '#open-ticket-btn'].forEach(sel => {
        const el = $(sel);
        if (el && invite) el.setAttribute('href', invite);
      });
      $('#stock-line').textContent = `${meta.stock} accounts in stock · all under ${state.currency}${meta.maxPrice} · delivered via Discord ticket`;
      $('#t1').textContent = meta.stock;
      $('#t2').textContent = meta.stock;
    } catch (_) { }
  }

  async function refreshWallet() {
    try {
      const data = await api('/api/wallet');
      $('#wallet-balance-value').textContent = fmt(data.balance);
      $('#wallet-modal-balance').textContent = fmt(data.balance);
    } catch (_) { }
  }

  /* ---------- Account grid ---------- */
  function renderAccounts() {
    const grid = $('#market-grid');
    const priceChecks = $$('.f-price:checked').map(c => c.value);
    const skinChecks = $$('.f-skins:checked').map(c => c.value);
    const inRange = (val, ranges) => ranges.some(r => {
      const [lo, hi] = r.split('-').map(Number);
      return val >= lo && val <= hi;
    });

    const filtered = state.accounts.filter(
      a => inRange(a.price, priceChecks) && inRange(a.skins, skinChecks)
    );

    if (filtered.length === 0) {
      grid.innerHTML = '<p class="empty-state">No accounts match those filters right now.</p>';
      return;
    }

    grid.innerHTML = filtered.map((a, i) => `
      <div class="acc-card" style="--tier-color: var(${a.tierVar}); animation-delay:${Math.min(i * 40, 400)}ms">
        <div class="acc-thumb" onclick="openModal(${a.id})">
          ${accountIcon(a.tierVar)}
          <span class="warranty-badge">${a.warranty}</span>
        </div>
        <div class="acc-body">
          <span class="acc-tag">${a.tier}</span>
          <span class="acc-name" onclick="openModal(${a.id})" role="button" tabindex="0">${a.name}</span>
          <span class="acc-stats">${a.skins}+ skins · <b class="stock-badge">in stock: ${a.stock}</b></span>
          <div class="acc-foot">
            <span class="price">${fmt(a.price)}</span>
            <button type="button" class="card-buy" onclick="openCheckout(${a.id})">Buy</button>
          </div>
        </div>
      </div>
    `).join('');
  }

  async function loadAccounts() {
    try {
      const data = await api('/api/accounts');
      state.accounts = data.accounts;
      renderAccounts();
    } catch (err) {
      $('#market-grid').innerHTML = `<p class="empty-state">Could not load accounts: ${err.message}</p>`;
    }
  }

  /* ---------- Account modal ---------- */
  window.openModal = function (id) {
    const a = state.accounts.find(x => x.id === id);
    if (!a) return;
    state.selectedAccount = a;
    $('#modal-eyebrow').textContent = `${a.tier} · ${fmt(a.price)}`;
    $('#modal-title').textContent = a.name;
    $('#modal-desc').textContent = a.desc;
    $('#modal-chips').innerHTML = (a.chips || [])
      .map(c => `<span class="chip ${c.gold ? 'gold' : ''}">${c.label}</span>`).join('');
    const gallery = $('#account-gallery');
    if (a.gallery && a.gallery.length) {
      gallery.innerHTML = a.gallery.map(
        g => `<button type="button" class="gallery-item" onclick="openImageViewer('${g.url}','${g.label}')">
                <img src="${g.url}" alt="${g.label}" loading="lazy">
                <span>${g.label}</span>
              </button>`
      ).join('');
      gallery.hidden = false;
    } else {
      gallery.innerHTML = '';
      gallery.hidden = true;
    }
    $('#modal-overlay').classList.add('show');
  };
  window.closeModal = function () { $('#modal-overlay').classList.remove('show'); };
  window.openImageViewer = function (src, alt) {
    $('#image-viewer-image').src = src;
    $('#image-viewer-image').alt = alt || '';
    $('#image-viewer').classList.add('show');
  };
  window.closeImageViewer = function () { $('#image-viewer').classList.remove('show'); };
  window.buyFromModal = function () {
    closeModal();
    if (state.selectedAccount) openCheckout(state.selectedAccount.id);
  };

  /* ---------- Checkout ---------- */
  window.openCheckout = function (id) {
    const a = state.accounts.find(x => x.id === id);
    if (!a) return;
    state.selectedAccount = a;
    state.promo = { code: null, discount: 0 };
    $('#promo-code').value = '';
    $('#checkout-discord').value = '';
    setPromoStatus('');
    $('#checkout-title').textContent = a.name;
    refreshCheckoutTotals();
    $('#checkout-modal-overlay').classList.add('show');
    setTimeout(() => $('#checkout-discord').focus(), 50);
  };
  window.closeCheckoutModal = function () { $('#checkout-modal-overlay').classList.remove('show'); };

  function discountedPrice() {
    return Math.max(0, state.selectedAccount.price * (1 - state.promo.discount / 100));
  }
  async function refreshCheckoutTotals() {
    try {
      const w = await api('/api/wallet');
      const price = discountedPrice();
      $('#checkout-balance').textContent = fmt(w.balance);
      $('#checkout-after').textContent = fmt(Math.max(0, w.balance - price));
      $('#checkout-buy').textContent = `Confirm purchase — ${fmt(price)}`;
    } catch (_) { }
  }

  function setPromoStatus(msg, cls) {
    const el = $('#promo-status');
    el.textContent = msg || '';
    el.className = 'form-hint' + (cls ? ' ' + cls : '');
  }

  window.checkPromo = async function () {
    const code = $('#promo-code').value.trim().toUpperCase();
    if (!code) { setPromoStatus('Enter a promo code first.', 'err'); return; }
    try {
      const data = await api(`/api/promo/check?code=${encodeURIComponent(code)}`);
      if (!data.valid) {
        state.promo = { code: null, discount: 0 };
        setPromoStatus('Invalid or fully-used promo code.', 'err');
      } else {
        state.promo = { code, discount: data.discount };
        setPromoStatus(`Promo applied: ${data.discount}% off.`, 'ok');
      }
      refreshCheckoutTotals();
    } catch (_) {
      setPromoStatus('Could not check that code.', 'err');
    }
  };

  window.confirmPurchase = async function () {
    if (!state.selectedAccount) return;
    const discordName = $('#checkout-discord').value.trim();
    if (discordName.length < 3) { toast('Enter your Discord username so the store can contact you.', 'err'); $('#checkout-discord').focus(); return; }
    const btn = $('#checkout-buy');
    btn.disabled = true;
    try {
      const data = await api('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: state.selectedAccount.id,
          promoCode: state.promo.code,
          discordName
        })
      });
      state.lastOrderCode = data.orderCode;
      closeCheckoutModal();
      $('#delivery-order-code').textContent = data.orderCode;
      $('#delivery-modal-overlay').classList.add('show');
      toast(`Purchase recorded — ${data.accountName}`);
      await refreshWallet();
      await loadAccounts();
    } catch (err) {
      if (err.status === 400 && err.data && err.data.error === 'Insufficient wallet balance.') {
        closeCheckoutModal();
        openWalletModal();
        toast('Insufficient balance. Recharge your wallet first.', 'err');
      } else {
        toast(err.message, 'err');
      }
    } finally {
      btn.disabled = false;
    }
  };

  window.copyOrderCode = async function () {
    if (!state.lastOrderCode) return;
    try {
      await navigator.clipboard.writeText(state.lastOrderCode);
      toast('Order code copied. Send it in your Discord ticket.');
    } catch (_) {
      toast(state.lastOrderCode);
    }
  };
  window.closeDeliveryModal = function () {
    $('#delivery-modal-overlay').classList.remove('show');
  };

  /* ---------- Wallet ---------- */
  window.openWalletModal = function () {
    refreshWallet();
    $('#wallet-code').value = '';
    $('#wallet-modal-overlay').classList.add('show');
    setTimeout(() => $('#wallet-code').focus(), 50);
  };
  window.closeWalletModal = function () { $('#wallet-modal-overlay').classList.remove('show'); };

  async function redeemWallet(e) {
    e.preventDefault();
    const input = $('#wallet-code');
    const code = input.value.trim();
    if (!code) return;
    try {
      const data = await api('/api/wallet/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      closeWalletModal();
      toast(`${fmt(data.added)} added to your wallet. New balance: ${fmt(data.balance)}`);
      await refreshWallet();
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  /* ---------- Custom account order ---------- */
  window.openCustomModal = function () {
    $('#custom-modal-overlay').classList.add('show');
    setTimeout(() => $('#custom-discord').focus(), 50);
  };
  window.closeCustomModal = function () { $('#custom-modal-overlay').classList.remove('show'); };

  async function submitCustomOrder(e) {
    e.preventDefault();
    const discordName = $('#custom-discord').value.trim();
    if (discordName.length < 3) { toast('Enter your Discord username so the store can contact you.', 'err'); return; }
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    const skins = $$('input[name="custom-skin"]:checked').map(cb => cb.value);
    try {
      await api('/api/custom-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discordName,
          skinCount: Number($('#custom-skins').value) || 110,
          skins,
          notes: $('#custom-notes').value.trim()
        })
      });
      closeCustomModal();
      toast(`Order sent! The store will contact ${discordName} on Discord.`);
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- Wire up ---------- */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal(); closeCheckoutModal(); closeWalletModal(); closeDeliveryModal(); closeCustomModal(); closeImageViewer();
    }
  });

  $$('.f-price, .f-skins').forEach(el => el.addEventListener('change', renderAccounts));
  $('#wallet-button').addEventListener('click', openWalletModal);
  $('#wallet-form').addEventListener('submit', redeemWallet);
  $('#promo-check').addEventListener('click', checkPromo);
  $('#checkout-buy').addEventListener('click', confirmPurchase);
  $('#copy-code').addEventListener('click', copyOrderCode);
  $('#modal-buy').addEventListener('click', buyFromModal);
  $('#custom-acc-btn').addEventListener('click', openCustomModal);
  $('#custom-form').addEventListener('submit', submitCustomOrder);
  $('#open-ticket-btn').addEventListener('click', () => closeDeliveryModal());

  /* ---------- Init ---------- */
  initParticles();
  initReveal();
  initSpotlight();
  loadMeta();
  refreshWallet();
  loadAccounts();
})();