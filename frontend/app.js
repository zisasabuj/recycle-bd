// Same-origin API URL (works on localhost, tunnels, and production)
const API_URL = '';
const imgUrl = (p) => {
  if (!p) return '';
  if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:')) return p;
  if (p.startsWith('/uploads/')) return `${API_URL}${p}`;
  return p;
};
let token = localStorage.getItem('token');
let currentUser = null;
// socket removed — replaced with polling (Vercel serverless can't host WebSocket)
let authMode = 'login';
let currentCategory = '';
let allAuctions = [];
let locations = {};
let bdLocations = {};
let bdDistricts = [];
let categories = [];
// ---- Polling state ----
let detailPollHandle = null;     // interval id when viewing auction detail
let notifPollHandle = null;      // interval id for notification poll
let chatPollHandle = null;       // interval id for chat messages poll
let lastSeenBidId = null;        // for outbid detection
let lastSeenMaxBid = null;       // for new_max_bid flash
let lastAuctionStatus = null;    // for auction_ended banner
let lastNotifCount = 0;          // for new notification detection

// ---- Auth helper ----
function authH() {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const isAdmin = () => currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN');
const isSuperAdmin = () => currentUser && currentUser.role === 'SUPER_ADMIN';
const isOwner = (a) => currentUser && a && a.sellerId && currentUser.id === a.sellerId;
const canDelete = (a) => isAdmin() || isOwner(a);

// ========== INIT ==========
async function init() {
  await loadMeta();
  if (token) {
    try {
      const res = await fetch(`${API_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        currentUser = data.user;
        updateAuthUI();
        connectSocket();
      } else {
        localStorage.removeItem('token');
        token = null;
      }
    } catch (e) { console.error('Auth check failed', e); }
  }
  // Load watchlist set + ending soon (both full list AND hero strip) in parallel
  await Promise.all([
    loadWatchedSet(),
    loadEndingSoon('endingSoonList'),
    loadEndingSoon('heroEndingSoonList')
  ]);
  loadAuctions();
  setupChatSocket();
}

async function loadMeta() {
  try {
    const [locRes, catRes, bdRes] = await Promise.all([
      fetch(`${API_URL}/api/x/locations`),
      fetch(`${API_URL}/api/x/categories`),
      fetch(`${API_URL}/api/x/bd-locations`)
    ]);
    locations = (await locRes.json()).locations;
    categories = (await catRes.json()).categories;
    const bdData = await bdRes.json();
    bdLocations = bdData.locations;
    bdDistricts = bdData.districts;
    populateDistrictFilter();

    // City filter dropdown (primary location filter)
    const cityFilter = document.getElementById('districtFilter');
    const citySelect = document.getElementById('city');
    if (cityFilter) {
      cityFilter.innerHTML = '<option value="">All Cities</option>';
      Object.keys(locations).forEach(city => {
        cityFilter.innerHTML += `<option value="${city}">${city}</option>`;
      });
    }
    if (citySelect) {
      citySelect.innerHTML = '<option value="">Select City</option>';
      Object.keys(locations).forEach(city => {
        citySelect.innerHTML += `<option value="${city}">${city}</option>`;
      });
    }

    // Legacy: keep BD district list available for create form's optional fields
    const catFilter = document.getElementById('categoryFilter');
    const catSelect = document.getElementById('category');
    categories.forEach(cat => {
      if (catFilter) catFilter.innerHTML += `<option value="${cat}">${cat}</option>`;
      if (catSelect) catSelect.innerHTML += `<option value="${cat}">${cat}</option>`;
    });

    // Populate header search-category dropdown (Nest Mart)
    const headerCatSel = document.getElementById('headerCategorySelect');
    if (headerCatSel) {
      categories.forEach(cat => {
        headerCatSel.innerHTML += `<option value="${cat}">${cat}</option>`;
      });
    }

    // Populate create form city select (legacy locations)
    const citySel = document.getElementById('city');
    if (citySel) {
      Object.keys(locations).forEach(city => {
        citySel.innerHTML += `<option value="${city}">${city}</option>`;
      });
    }
  } catch (e) { console.error('Failed to load meta', e); }
}

function updateAreas() {
  const city = document.getElementById('city').value;
  const areaSelect = document.getElementById('area');
  areaSelect.innerHTML = '<option value="">Select Area</option>';
  if (city && locations[city]) {
    locations[city].forEach(area => {
      areaSelect.innerHTML += `<option value="${area}">${area}</option>`;
    });
  }
}

// Populate Thana dropdown based on selected District (create form)
function updateThanas() {
  const district = document.getElementById('district').value;
  const thanaSelect = document.getElementById('thana');
  thanaSelect.innerHTML = '<option value="">Select Thana (optional)</option>';
  if (district && bdLocations[district]) {
    bdLocations[district].forEach(t => {
      thanaSelect.innerHTML += `<option value="${t}">${t}</option>`;
    });
    thanaSelect.disabled = false;
  } else {
    thanaSelect.disabled = true;
  }
}

// Populate District filter dropdown from bdLocations (64 districts)
function populateDistrictFilter() {
  const districtFilter = document.getElementById('filterDistrict');
  if (!districtFilter) return;
  districtFilter.innerHTML = '<option value="">All Districts</option>';
  if (bdDistricts && bdDistricts.length) {
    bdDistricts.forEach(d => {
      // backend returns array of strings: ["Dhaka", "Chattogram", ...]
      const name = (typeof d === 'string') ? d : (d && d.name) ? d.name : '';
      if (!name) return;
      districtFilter.innerHTML += `<option value="${name}">${name}</option>`;
    });
  } else if (bdLocations) {
    // fallback: derive keys from bdLocations map
    Object.keys(bdLocations).forEach(d => {
      districtFilter.innerHTML += `<option value="${d}">${d}</option>`;
    });
  }
}

// Cascade Thana (Area) dropdown from selected District
function updateThanaFilter() {
  const district = document.getElementById('filterDistrict').value;
  const thanaSelect = document.getElementById('filterThana');
  if (!thanaSelect) return;
  thanaSelect.innerHTML = '<option value="">All Areas</option>';
  if (district && bdLocations[district]) {
    bdLocations[district].forEach(t => {
      thanaSelect.innerHTML += `<option value="${t}">${t}</option>`;
    });
    thanaSelect.disabled = false;
  } else {
    thanaSelect.disabled = false;  // keep enabled so user can browse all
  }
}

// ========== AUTH ==========
function openAuthModal() { document.getElementById('authModal').style.display = 'flex'; }
function closeAuthModal() { document.getElementById('authModal').style.display = 'none'; document.getElementById('authError').textContent = ''; }
function openCreateModal() { document.getElementById('createModal').style.display = 'flex'; }
// (closeCreateModal richer version defined later)

// ---- Mobile menu (hamburger) ----
function toggleMobileMenu() {
  const nav = document.getElementById('mainNav');
  const btn = document.getElementById('hamburgerBtn');
  if (!nav || !btn) return;
  const isOpen = nav.classList.toggle('open');
  btn.classList.toggle('active', isOpen);
  btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

// ---- Sidebar card collapse (mobile) ----
function toggleSbCard(headerEl) {
  const card = headerEl.closest('.sb-card');
  if (!card) return;
  const isCollapsed = card.getAttribute('data-collapsed') !== 'false';
  card.setAttribute('data-collapsed', isCollapsed ? 'false' : 'true');
  headerEl.setAttribute('aria-expanded', isCollapsed ? 'true' : 'false');
}

function closeMobileMenu() {
  const nav = document.getElementById('mainNav');
  const btn = document.getElementById('hamburgerBtn');
  if (!nav || !btn) return;
  nav.classList.remove('open');
  btn.classList.remove('active');
  btn.setAttribute('aria-expanded', 'false');
}

// Close mobile menu on resize to desktop width
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (window.innerWidth > 900) closeMobileMenu();
  }, 150);
});

function setCategory(el, cat) {
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  currentCategory = cat || '';
  loadAuctions();
}

function viewWinnerDemo() {
  window.open('winner.html', '_blank');
}
function toggleAuthMode() {
  authMode = authMode === 'login' ? 'register' : 'login';
  document.getElementById('authTitle').textContent = authMode === 'login' ? 'Login' : 'Register';
  document.getElementById('authSubmit').textContent = authMode === 'login' ? 'Login' : 'Register';
  document.getElementById('authSwitch').textContent = authMode === 'login' ? "Don't have an account? Register" : 'Already have an account? Login';
  // Hide/show the wrapping <label> for register-only fields
  ['emailLabel', 'fullNameLabel', 'phoneLabel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = authMode === 'register' ? 'block' : 'none';
  });
}

async function handleAuth(e) {
  e.preventDefault();
  const errorEl = document.getElementById('authError');
  errorEl.textContent = '';
  const username = document.getElementById('authUsername').value;
  const password = document.getElementById('authPassword').value;
  try {
    let res, data;
    if (authMode === 'login') {
      res = await fetch(`${API_URL}/api/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrUsername: username, password })
      });
    } else {
      const email = document.getElementById('authEmail').value.trim();
      const fullName = document.getElementById('authFullName').value.trim();
      const phone = document.getElementById('authPhone').value.trim();
      // Mandatory validation: email + phone required
      if (!email) throw new Error('Email address is required');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email address');
      if (!phone) throw new Error('Phone number is required');
      if (!/^[+\d][\d\s\-()]{6,}$/.test(phone)) throw new Error('Please enter a valid phone number');
      res = await fetch(`${API_URL}/api/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password, fullName, phone })
      });
    }
    data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Auth failed');
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    updateAuthUI();
    closeAuthModal();
    connectSocket();
    loadAuctions();
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

function logout() {
  localStorage.removeItem('token');
  token = null;
  currentUser = null;
  stopAllPolling();
  updateAuthUI();
  loadAuctions();
}

// ---- Polling manager (replaces socket.io) ----
function stopAllPolling() {
  if (detailPollHandle) { clearInterval(detailPollHandle); detailPollHandle = null; }
  if (notifPollHandle)  { clearInterval(notifPollHandle);  notifPollHandle  = null; }
  if (chatPollHandle)   { clearInterval(chatPollHandle);   chatPollHandle   = null; }
  lastSeenBidId = null;
  lastSeenMaxBid = null;
  lastAuctionStatus = null;
  lastNotifCount = 0;
}

function startDetailPolling(auctionId) {
  if (detailPollHandle) clearInterval(detailPollHandle);
  lastSeenBidId = null;
  lastSeenMaxBid = null;
  lastAuctionStatus = null;
  detailPollHandle = setInterval(() => pollAuctionDetail(auctionId), 4000);
  // Kick immediately
  pollAuctionDetail(auctionId);
}

function stopDetailPolling() {
  if (detailPollHandle) { clearInterval(detailPollHandle); detailPollHandle = null; }
}

async function pollAuctionDetail(auctionId) {
  if (!currentAuction || currentAuction.id !== auctionId) return;
  try {
    const r = await fetch(`${API_URL}/api/auction/${auctionId}`);
    if (!r.ok) return;
    const data = await r.json();
    const fresh = data.auction;
    if (!fresh) return;

    // 1. Detect status change (auction_ended equivalent)
    if (lastAuctionStatus && lastAuctionStatus === 'ACTIVE' && fresh.status !== 'ACTIVE') {
      const banner = document.createElement('div');
      banner.className = 'ended-banner';
      banner.textContent = `⏰ Auction has ended! Final amount: ৳${Number(fresh.currentMaxBid || 0).toLocaleString()}`;
      const detail = document.getElementById('auctionDetail');
      if (detail && !detail.querySelector('.ended-banner')) {
        detail.appendChild(banner);
      }
      const bidForm = document.getElementById('bidForm');
      if (bidForm) bidForm.style.display = 'none';
    }
    lastAuctionStatus = fresh.status;

    // 2. Detect new max bid (new_max_bid equivalent)
    const freshMax = Number(fresh.currentMaxBid || 0);
    if (lastSeenMaxBid !== null && freshMax !== lastSeenMaxBid) {
      const bidEl = document.getElementById('currentBidAmount');
      if (bidEl) {
        bidEl.textContent = `৳${freshMax.toLocaleString()}`;
        flashBidUpdate();
      }
    }
    lastSeenMaxBid = freshMax;

    // 3. You-won detection (only if logged in & current user is winner & status is PAYMENT_PENDING)
    if (currentUser && fresh.winnerId === currentUser.id && fresh.status === 'PAYMENT_PENDING') {
      const existing = document.querySelector('.won-banner');
      if (!existing) {
        const finalAmount = Number(fresh.currentMaxBid || 0);
        const commission = finalAmount * 0.20;
        const banner = document.createElement('div');
        banner.className = 'won-banner';
        banner.innerHTML = `
          <h3>🎉 Congratulations! You won this auction!</h3>
          <p>Final amount: ৳${finalAmount.toLocaleString()}</p>
          <p>Commission (20%): ৳${commission.toLocaleString()}</p>
          <button onclick="confirmPurchase('${fresh.id}')">Confirm Purchase & Pay</button>
          <button onclick="rejectPurchase('${fresh.id}')" style="background:#e53e3e">Reject</button>
        `;
        const detail = document.getElementById('auctionDetail');
        if (detail) detail.appendChild(banner);
      }
    }

    // 4. Outbid detection — fetch top bid, check if my last bid is no longer top
    if (currentUser) {
      try {
        const br = await fetch(`${API_URL}/api/x/bids?id=${auctionId}`);
        if (br.ok) {
          const bdata = await br.json();
          const bids = bdata.bids || [];
          const topBid = bids[0];
          if (topBid && topBid.bidderId === currentUser.id) {
            // I am top — clear outbid flag
            currentUser._outbid = false;
          } else if (topBid && topBid.bidderId !== currentUser.id) {
            // Someone else is top — if I had bid and am no longer top, alert
            const myLastBid = bids.find(b => b.bidderId === currentUser.id);
            if (myLastBid && !currentUser._outbidWarned) {
              alert(`⚠️ You were outbid! New max: ৳${Number(topBid.amount).toLocaleString()}`);
              currentUser._outbidWarned = true;
            }
          }
        }
      } catch {}
    }

    // 5. Contact unlocked detection
    if (currentUser) {
      try {
        const pr = await fetch(`${API_URL}/api/x/pay-status?id=${auctionId}`, { headers: authH() });
        if (pr.ok) {
          const pdata = await pr.json();
          if (pdata.unlocked && !currentUser._contactUnlockedNotified) {
            alert('✅ Contact details unlocked! Check the contact button below.');
            currentUser._contactUnlockedNotified = true;
            loadAuctionDetail(auctionId);
          }
        }
      } catch {}
    }
  } catch (e) { /* swallow */ }
}

function startNotifPolling() {
  if (notifPollHandle) return;
  if (!token) return;
  lastNotifCount = 0;
  notifPollHandle = setInterval(async () => {
    if (!token || !currentUser) return;
    try {
      const r = await fetch(`${API_URL}/api/notifications?unreadOnly=1`, { headers: authH() });
      if (!r.ok) return;
      const data = await r.json();
      const count = data.unread || 0;
      if (lastNotifCount > 0 && count > lastNotifCount) {
        // New notification — show toast
        const latest = data.notifications?.[0];
        if (latest) showToast(latest.message, 'info');
      }
      lastNotifCount = count;
      // Update badge if function exists
      if (typeof updateNotifBadge === 'function') updateNotifBadge(count);
    } catch {}
  }, 8000);
}

function startChatPolling(chatId) {
  if (chatPollHandle) clearInterval(chatPollHandle);
  let lastMessageCount = 0;
  chatPollHandle = setInterval(async () => {
    if (!token || currentChatId !== chatId) return;
    try {
      const r = await fetch(`${API_URL}/api/x/chat-messages?id=${chatId}`, { headers: authH() });
      if (!r.ok) return;
      const data = await r.json();
      const msgs = data.messages || [];
      if (msgs.length > lastMessageCount && lastMessageCount > 0) {
        // New message arrived — reload messages
        await loadChatMessages(chatId);
      }
      lastMessageCount = msgs.length;
    } catch {}
  }, 3000);
}

function stopChatPolling() {
  if (chatPollHandle) { clearInterval(chatPollHandle); chatPollHandle = null; }
}

function togglePasswordVisibility(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if (!input || !btn) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
    btn.setAttribute('aria-label', 'Hide password');
    btn.classList.add('active');
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
    btn.setAttribute('aria-label', 'Show password');
    btn.classList.remove('active');
  }
}

function handleProfileClick(event) {
  event.stopPropagation();
  const dd = document.getElementById('accountDropdown');
  if (!dd) {
    // Fallback: no dropdown markup yet — old behavior
    if (!currentUser) { openAuthModal(); return; }
    const menu = document.getElementById('profileMenu');
    if (menu) menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
    return;
  }
  const isOpen = dd.style.display === 'block';
  if (isOpen) {
    dd.style.display = 'none';
  } else {
    refreshAccountDropdown();
    dd.style.display = 'block';
  }
}

function closeAccountDropdown() {
  const dd = document.getElementById('accountDropdown');
  if (dd) dd.style.display = 'none';
}

function refreshAccountDropdown() {
  const title = document.getElementById('accountDropTitle');
  const sub = document.getElementById('accountDropSub');
  const divider = document.getElementById('accountDropDivider');
  const profile = document.getElementById('accountDropProfile');
  const admin = document.getElementById('accountDropAdmin');
  const logoutBtn = document.getElementById('accountDropLogout');
  const loginBtn = dd_item('🔑 Login');
  const signupBtn = dd_item('✨ Sign Up');
  if (!title || !sub) return;
  if (currentUser) {
    title.textContent = currentUser.fullName || currentUser.username;
    sub.textContent = currentUser.email || 'Signed in';
    if (loginBtn) loginBtn.style.display = 'none';
    if (signupBtn) signupBtn.style.display = 'none';
    if (divider) divider.style.display = 'block';
    if (profile) profile.style.display = 'block';
    if (logoutBtn) logoutBtn.style.display = 'block';
    if (admin) admin.style.display = (currentUser.role === 'SUPER_ADMIN') ? 'block' : 'none';
  } else {
    title.textContent = 'Welcome to Recycle';
    sub.textContent = 'Sign in to bid & sell';
    if (loginBtn) loginBtn.style.display = 'block';
    if (signupBtn) signupBtn.style.display = 'block';
    if (divider) divider.style.display = 'none';
    if (profile) profile.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (admin) admin.style.display = 'none';
  }
}

function dd_item(text) {
  // tiny helper: find the dropdown item button by its visible label prefix
  const dd = document.getElementById('accountDropdown');
  if (!dd) return null;
  for (const b of dd.querySelectorAll('.account-dropdown-item')) {
    if ((b.textContent || '').includes(text)) return b;
  }
  return null;
}

function openAuthModalRegister() {
  // Open modal in register mode (sign up)
  if (typeof authMode !== 'undefined' && authMode !== 'register') {
    toggleAuthMode();
  } else if (typeof authMode === 'undefined') {
    // Older code path: just open
  }
  const modal = document.getElementById('authModal');
  if (modal) modal.style.display = 'flex';
}

function closeProfileMenu() {
  const menu = document.getElementById('profileMenu');
  if (menu) menu.style.display = 'none';
}

// Close profile menu when clicking anywhere else
document.addEventListener('click', (e) => {
  const menu = document.getElementById('profileMenu');
  if (menu && menu.style.display !== 'none' && !e.target.closest('.topbar-user')) {
    menu.style.display = 'none';
  }
  const dd = document.getElementById('accountDropdown');
  if (dd && dd.style.display === 'block' && !e.target.closest('#accountAction')) {
    dd.style.display = 'none';
  }
});

function openProfileModal() {
  closeProfileMenu();
  if (!currentUser) return;
  document.getElementById('pfUsername').value = currentUser.username || '';
  document.getElementById('pfEmail').value = currentUser.email || '';
  document.getElementById('pfFullName').value = currentUser.fullName || '';
  document.getElementById('pfPhone').value = currentUser.phone || '';
  document.getElementById('profileError').textContent = '';
  document.getElementById('profileSuccess').style.display = 'none';
  document.getElementById('profileModal').style.display = 'flex';
}

// ============ v31 NEW: System Settings — Edit Mode (OPEN / CLOSE) ============
let currentEditMode = 'OPEN';

async function fetchEditMode() {
  try {
    const r = await fetch(`${API_URL}/api/x/settings-edit-mode`);
    if (!r.ok) return;
    const data = await r.json();
    currentEditMode = (data.mode === 'CLOSE' || data.mode === 'OPEN') ? data.mode : 'OPEN';
    updateModeUI();
  } catch (e) {
    console.warn('fetchEditMode failed:', e.message);
  }
}

function updateModeUI() {
  const disp = document.getElementById('currentEditModeDisplay');
  if (disp) disp.textContent = currentEditMode;
  const oBtn = document.getElementById('modeOpenBtn');
  const cBtn = document.getElementById('modeCloseBtn');
  if (oBtn) oBtn.classList.toggle('active', currentEditMode === 'OPEN');
  if (cBtn) cBtn.classList.toggle('active', currentEditMode === 'CLOSE');
}

async function openSettingsModal() {
  if (!currentUser || currentUser.role !== 'SUPER_ADMIN') {
    alert('Super Admin only');
    return;
  }
  document.getElementById('settingsModal').style.display = 'flex';
  const err = document.getElementById('settingsError');
  if (err) { err.style.display = 'none'; err.textContent = ''; }
  const msg = document.getElementById('heroStatsMsg');
  if (msg) { msg.style.display = 'none'; msg.textContent = ''; }
  await fetchEditMode();
  await loadHeroStatsIntoForm();
}

async function loadHeroStatsIntoForm() {
  // Pre-fill inputs with current admin-set values
  try {
    const r = await fetch(`${API_URL}/api/x/hero-stats`);
    if (!r.ok) return;
    const s = await r.json();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    set('hsActive', s.hero_active_count);
    set('hsAnon',   s.hero_anonymity_pct);
    set('hsDur',    s.hero_duration_label);
    set('hsUsers',  s.hero_users_count);
  } catch (e) { /* silent */ }
}

async function saveHeroStats() {
  if (!token) { alert('Sign in required'); return; }
  const body = {};
  const read = (id, key) => { const el = document.getElementById(id); if (el && el.value.trim()) body[key] = el.value.trim(); };
  read('hsActive', 'hero_active_count');
  read('hsAnon',   'hero_anonymity_pct');
  read('hsDur',    'hero_duration_label');
  read('hsUsers',  'hero_users_count');
  if (Object.keys(body).length === 0) { alert('Enter at least one value'); return; }
  const msg = document.getElementById('heroStatsMsg');
  const errEl = document.getElementById('settingsError');
  if (msg) { msg.style.display = 'none'; }
  if (errEl) { errEl.style.display = 'none'; }
  try {
    const r = await fetch(`${API_URL}/api/x/hero-stats`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = j.error || `Failed (${r.status})`; }
      return;
    }
    if (msg) { msg.style.display = 'block'; msg.textContent = `✅ Saved: ${(j.updated||[]).join(', ')}`; setTimeout(() => { if (msg) msg.style.display = 'none'; }, 3000); }
    // Reload homepage live
    loadAdminHeroOverrides();
  } catch (e) {
    if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Network error'; }
  }
}

function closeSettingsModal() {
  document.getElementById('settingsModal').style.display = 'none';
}

async function selectEditMode(mode) {
  if (!token) { alert('Sign in required'); return; }
  const errEl = document.getElementById('settingsError');
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  try {
    const r = await fetch(`${API_URL}/api/x/admin-edit-mode`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ mode })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = data.error || `Failed (${r.status})`; }
      return;
    }
    currentEditMode = data.mode || mode;
    updateModeUI();
    showToast(`✅ Edit mode set to ${currentEditMode}`);
  } catch (e) {
    if (errEl) { errEl.style.display = 'block'; errEl.textContent = e.message; }
  }
}

// Apply current edit mode to the open edit form (openEditModal)
function applyEditModeToForm() {
  const allFieldIds = ['title', 'description', 'category', 'condition', 'basePrice', 'bidIncrement', 'city', 'area', 'district', 'thana'];
  const editableInClose = ['description']; // CLOSE mode: only description

  // Banner inside createModal (above form)
  let banner = document.getElementById('editModeBanner');
  const formEl = document.getElementById('createForm');
  if (formEl && !banner) {
    banner = document.createElement('div');
    banner.id = 'editModeBanner';
    banner.className = 'edit-mode-banner';
    formEl.parentNode.insertBefore(banner, formEl);
  }
  if (banner) {
    banner.className = 'edit-mode-banner ' + (currentEditMode === 'CLOSE' ? 'close' : 'open');
    banner.innerHTML = currentEditMode === 'OPEN'
      ? '🔓 <b>OPEN</b> mode — all fields editable, no review'
      : '🔒 <b>CLOSE</b> mode — only description can be edited';
    banner.style.display = editingAuctionId ? 'flex' : 'none';
  }

  allFieldIds.forEach(fid => {
    const el = document.getElementById(fid);
    if (!el) return;
    const isEditable = currentEditMode === 'OPEN' || editableInClose.includes(fid);
    el.disabled = !isEditable;
    el.classList.toggle('field-locked', !isEditable);

    // Field-level hint (only show locked fields once)
    let hint = document.getElementById(fid + '_lockedHint');
    if (!isEditable && !hint && el.parentNode) {
      hint = document.createElement('span');
      hint.id = fid + '_lockedHint';
      hint.className = 'field-locked-hint';
      hint.textContent = '🔒 Locked in CLOSE mode';
      el.parentNode.appendChild(hint);
    } else if (isEditable && hint) {
      hint.remove();
    }
  });

  // Image upload section: disabled in CLOSE mode (image not editable)
  const imgLabel = document.querySelector('label[for="images"]');
  const imgInput = document.getElementById('images');
  if (imgLabel) {
    imgLabel.style.opacity = currentEditMode === 'CLOSE' ? '0.5' : '1';
    imgLabel.style.pointerEvents = currentEditMode === 'CLOSE' ? 'none' : 'auto';
  }
  if (imgInput) imgInput.disabled = currentEditMode === 'CLOSE';
}

// (richer showToast is defined later in file — kept here as comment only)

// Fetch edit mode on app boot (for the edit-form behavior)
fetchEditMode();

function closeProfileModal() {
  document.getElementById('profileModal').style.display = 'none';
}

async function saveProfile(e) {
  e.preventDefault();
  const errorEl = document.getElementById('profileError');
  const successEl = document.getElementById('profileSuccess');
  errorEl.textContent = '';
  successEl.style.display = 'none';

  const email = document.getElementById('pfEmail').value.trim();
  const fullName = document.getElementById('pfFullName').value.trim();
  const phone = document.getElementById('pfPhone').value.trim();

  try {
    const res = await fetch(`${API_URL}/api/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ email, fullName, phone })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Update failed');
    // Update current user in memory + storage
    currentUser = data.user;
    updateAuthUI();
    successEl.textContent = '✅ Profile updated';
    successEl.style.display = 'block';
    setTimeout(closeProfileModal, 900);
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

function updateAuthUI() {
  const name = currentUser ? currentUser.username : '';
  const role = currentUser ? (currentUser.role || 'Member') : '';
  const _isAdmin = currentUser && (currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN');

  // Top header / sidebar user chip
  const userInfo = document.getElementById('userInfo');
  const topbarUser = document.getElementById('topbarUser');
  // Settings button visibility — SUPER_ADMIN only
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.style.display = (currentUser && currentUser.role === 'SUPER_ADMIN') ? 'inline-flex' : 'none';
  }
  if (userInfo) {
    if (currentUser) {
      userInfo.style.display = 'flex';
      document.getElementById('userName').textContent = name;
      document.getElementById('userRole').textContent = role;
      // Show admin badge for ADMIN/SUPER_ADMIN
      const userRoleEl = document.getElementById('userRole');
      if (userRoleEl) {
        if (currentUser.role === 'SUPER_ADMIN') {
          userRoleEl.innerHTML = '<span style="background:linear-gradient(135deg,#F59E0B,#EF4444);color:white;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;letter-spacing:0.5px">👑 SUPER</span>';
        } else if (currentUser.role === 'ADMIN') {
          userRoleEl.innerHTML = '<span style="background:linear-gradient(135deg,#3B82F6,#7C3AED);color:white;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;letter-spacing:0.5px">🛡️ ADMIN</span>';
        }
      }
    } else {
      userInfo.style.display = 'none';
    }
  }
  if (topbarUser) {
    topbarUser.innerHTML = currentUser
      ? `<div class="avatar sm" id="topbarAvatar">${name.charAt(0).toUpperCase()}</div>
         <div class="user-meta">
           <div class="user-name" id="topbarUserName">${name}</div>
           <div class="user-role" id="topbarUserRole">${role}</div>
         </div>
         <div class="profile-menu" id="profileMenu" style="display:none">
           <div class="profile-menu-header">
             <div class="profile-menu-name" id="pmName">${currentUser.fullName || currentUser.username}</div>
             <div class="profile-menu-email" id="pmEmail">${currentUser.email || ''}</div>
           </div>
           <button class="profile-menu-item" onclick="openProfileModal(); event.stopPropagation();">✏️ Edit Profile</button>
           <button class="profile-menu-item" onclick="logout(); event.stopPropagation();">🚪 Logout</button>
         </div>`
      : `<div class="avatar sm">👤</div>
         <div class="user-meta">
           <div class="user-name" id="topbarUserName">Sign in</div>
           <div class="user-role">Guest</div>
         </div>`;
  }

  // Legacy header buttons (kept for backwards compat)
  const authBtn = document.getElementById('authBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  if (authBtn)   authBtn.style.display   = currentUser ? 'none' : 'block';
  if (logoutBtn) logoutBtn.style.display = currentUser ? 'block' : 'none';
}

function comingSoon(feature) {
  alert('🚧 ' + feature + ' — coming soon. Browse + Post Item live now.');
}

function switchView(view) {
  // Reset nav active
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const item = document.querySelector(`.nav-item[data-view="${view}"]`);
  if (item) item.classList.add('active');

  // Hide ALL views first
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');

  if (view === 'browse') {
    document.getElementById('browseSection').style.display = 'block';
    loadAuctions();
    loadEndingSoon('endingSoonList');
    loadEndingSoon('heroEndingSoonList');
    return;
  }
  if (view === 'endingSoon') {
    document.getElementById('endingSoonSectionView').style.display = 'block';
    loadEndingSoon('endingSoonGrid');
    return;
  }
  if (view === 'watchlist') {
    document.getElementById('watchlistSection').style.display = 'block';
    loadWatchlistView();
    return;
  }
  if (view === 'dashboard') {
    document.getElementById('dashboardSection').style.display = 'block';
    loadDashboardView();
    return;
  }
  if (view === 'sellers') {
    document.getElementById('sellersSection').style.display = 'block';
    loadSellersView();
    return;
  }
  // Fallback: show browse
  document.getElementById('browseSection').style.display = 'block';
  loadAuctions();
}

// ========== SOCKET ==========
function connectSocket() {
  // Socket replaced by polling (Vercel serverless can't host WebSocket).
  // This function now just starts the notification poll loop.
  startNotifPolling();
}

function flashBidUpdate() {
  const el = document.getElementById('currentBidAmount');
  el.style.transition = 'transform 0.3s, color 0.3s';
  el.style.transform = 'scale(1.2)';
  el.style.color = '#48bb78';
  setTimeout(() => { el.style.transform = 'scale(1)'; el.style.color = '#667eea'; }, 500);
}

// ========== AUCTIONS LIST ==========
let currentAuction = null;

async function loadAuctions() {
  const district = document.getElementById('filterDistrict')?.value || '';
  const thana = document.getElementById('filterThana')?.value || '';
  const category = currentCategory || '';
  const search = document.getElementById('searchInput')?.value || '';
  const sort = document.getElementById('topSort')?.value || 'ending';
  const condition = document.getElementById('filterCondition')?.value || '';
  const params = new URLSearchParams();
  // Map district/thana dropdowns → city/area for backend compat (seed data uses city/area)
  if (district) params.set('city', district);
  if (thana) params.set('area', thana);
  if (category) params.set('category', category);
  if (search) params.set('search', search);
  if (sort) params.set('sort', sort);
  if (condition) params.set('condition', condition);

  try {
    const res = await fetch(`${API_URL}/api/auctions?${params}`);
    const data = await res.json();
    allAuctions = data.auctions || [];
    renderAuctions(allAuctions);
    updateHeroStats(allAuctions);
  } catch (e) { console.error('Failed to load auctions', e); }
}

function renderAuctions(auctions) {
  const container = document.getElementById('auctionsList');
  if (!auctions.length) {
    container.innerHTML = '<div class="lot-empty">No active auctions. Be the first to post one!</div>';
    updateKpis([]);
    return;
  }
  container.innerHTML = auctions.map(a => renderLotCard(a)).join('');

  // Count text in section header
  const cnt = document.getElementById('lotCount');
  if (cnt) cnt.textContent = `(${auctions.length} found)`;

  updateKpis(auctions);
}

function getCatIcon(cat) {
  const c = (cat || '').toLowerCase();
  if (c.includes('mobile') || c.includes('phone')) return '📱';
  if (c.includes('electronic')) return '💻';
  if (c.includes('laptop')) return '💻';
  if (c.includes('vehicle') || c.includes('bike') || c.includes('car')) return '🏍️';
  if (c.includes('furniture') || c.includes('sofa')) return '🛋️';
  if (c.includes('fashion') || c.includes('cloth')) return '👕';
  if (c.includes('book')) return '📚';
  if (c.includes('home')) return '🏠';
  return '📦';
}

function parseRemaining(endsAt) {
  return new Date(endsAt).getTime() - Date.now();
}

function updateKpis(auctions) {
  const active = auctions.filter(a => a.status === 'ACTIVE').length;
  const totalBids = auctions.reduce((s, a) => s + (a._count.bids || 0), 0);
  const elA = document.getElementById('kpiActive');
  const elB = document.getElementById('kpiBids');
  if (elA) elA.textContent = active;
  if (elB) elB.textContent = totalBids;
}

function updateHeroStats(auctions) {
  // Active Auctions — show TOTAL active count across platform, not just loaded list.
  // Pass through any cached count; if not yet fetched, kick a background fetch.
  const heroActive = document.getElementById('heroActive');
  if (heroActive && typeof window.__totalActiveCount === 'number') {
    heroActive.textContent = window.__totalActiveCount;
  } else if (heroActive) {
    // Fallback to loaded list count if global count not yet available
    heroActive.textContent = (auctions || []).filter(a => a.status === 'ACTIVE').length;
  }
  // Kick global count fetch (non-blocking)
  fetchGlobalActiveCount();

  // Anonymity Rate — sealed-bid system: 100% by design (or admin override)
  const heroAnon = document.getElementById('heroAnonymity');
  if (heroAnon) heroAnon.textContent = '100%';

  // Auction Duration — system timer (48h sealed window)
  const heroDur = document.getElementById('heroDuration');
  if (heroDur) heroDur.textContent = '48h';

  // Then overlay admin-edited values from /api/settings/hero-stats
  loadAdminHeroOverrides();
}

async function fetchGlobalActiveCount() {
  try {
    // Pull a large page to derive count; simple + works without new endpoint
    const r = await fetch(`${API_URL}/api/auctions?limit=200&status=ACTIVE`);
    if (!r.ok) return;
    const data = await r.json();
    const total = (data.auctions || []).filter(a => a.status === 'ACTIVE').length;
    window.__totalActiveCount = total;
    const heroActive = document.getElementById('heroActive');
    if (heroActive) heroActive.textContent = total;
  } catch (e) { /* silent */ }
}

async function loadAdminHeroOverrides() {
  try {
    const r = await fetch(`${API_URL}/api/x/hero-stats`);
    if (!r.ok) return;
    const s = await r.json();
    const map = {
      hero_active_count: 'heroActive',
      hero_anonymity_pct: 'heroAnonymity',
      hero_duration_label: 'heroDuration',
      hero_users_count: 'heroUsers'
    };
    for (const [k, id] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el && typeof s[k] === 'string' && s[k].length > 0) {
        el.textContent = s[k];
      }
    }
  } catch (e) { /* silent — keep live data */ }
}

function getTimeLeft(endsAt) {
  const ms = new Date(endsAt) - new Date();
  if (ms <= 0) return 'Ended';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 24) return `${Math.floor(h/24)}d ${h%24}h`;
  return `${h}h ${m}m ${s}s`;
}

// ========== AUCTION DETAIL ==========
async function viewAuction(id) {
  // Hide ALL views first (consistent with switchView)
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('view-active');
    v.style.display = 'none';
  });
  const detail = document.getElementById('auctionDetailSection');
  detail.classList.add('view-active');
  detail.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  await loadAuctionDetail(id);
  startDetailPolling(id);   // poll replaces socket join_auction
}

async function loadAuctionDetail(id) {
  const res = await fetch(`${API_URL}/api/auction/${id}`);
  const data = await res.json();
  currentAuction = data.auction;
  renderAuctionDetail(currentAuction);
  // Load similar items in parallel (non-blocking)
  loadSimilarItems(id);
}

async function loadSimilarItems(id) {
  try {
    const r = await fetch(`${API_URL}/api/x/similar?id=${id}`);
    if (!r.ok) return;
    const data = await r.json();
    const list = data.auctions || [];
    const slot = document.getElementById('similarItemsRow');
    if (!slot) return;
    if (!list.length) { slot.innerHTML = ''; slot.style.display = 'none'; return; }
    slot.style.display = 'block';
    slot.innerHTML = `
      <div class="similar-section">
        <h3>🔍 Similar Items</h3>
        <div class="similar-grid">
          ${list.map(a => renderLotCard(a)).join('')}
        </div>
      </div>`;
  } catch (e) { console.error('similar items', e); }
}

function backToList() {
  stopCountdown();
  document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
  document.getElementById('browseSection').style.display = 'block';
  if (currentAuction) { stopDetailPolling(); }   // poll replaces socket leave_auction
  currentAuction = null;
  loadAuctions();
}

function renderAuctionDetail(a) {
  const hasImg = a.images && a.images[0];
  const catIcon = getCatIcon(a.category);
  const isSeller = currentUser && currentUser.id === a.sellerId;
  const loc = [a.area, a.thana, a.district, a.city].filter(Boolean).join(', ');
  const container = document.getElementById('auctionDetail');

  const topBid = a.currentMaxBid;
  const minNext = (topBid ? Number(topBid) : Number(a.basePrice)) + Number(a.bidIncrement);
  const myBids = a.bids ? a.bids.filter(b => currentUser && b.bidderId === currentUser.id) : [];
  const myTop = myBids.length ? Math.max(...myBids.map(b => b.amount)) : null;

  container.innerHTML = `
    <div class="detail-wrap">
      <p class="breadcrumb">
        <span class="back-btn" onclick="backToList()">← Back to Browse</span>
        &nbsp;·&nbsp;
        <span onclick="backToList()" style="cursor:pointer">🏠 Home</span>
        &nbsp;/&nbsp; <span>${escapeHtml(a.category || 'Category')}</span>
        &nbsp;/&nbsp; <span class="cur">${escapeHtml(a.title)}</span>
      </p>

      <div class="koko-grid">
        <!-- LEFT: Purple gradient card with product image + 3 status dots -->
        <div class="koko-left-card">
          <div class="koko-left-img">
            ${hasImg
              ? `<img src="${escapeAttr(imgUrl(a.images[0]))}" alt="${escapeHtml(a.title)}" class="koko-main-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="ico koko-fallback" style="display:none">${catIcon}</span>`
              : `<span class="ico koko-fallback">${catIcon}</span>`}
            <div class="koko-status-row">
              <span class="koko-status koko-status-orange">
                <span class="dot"></span>${escapeHtml(a.condition || 'Used')}
              </span>
              <span class="koko-status koko-status-purple">
                <span class="dot"></span>Anonymous
              </span>
              <span class="koko-status koko-status-green">
                <span class="dot"></span>Sealed
              </span>
            </div>
          </div>
          <div class="koko-thumb-row">
            ${(a.images && a.images.length ? a.images : [])
              .slice(0, 5)
              .map((url, i) => `
                <div class="koko-thumb${i === 0 ? ' active' : ''}" onclick="swapImage('${escapeAttr(imgUrl(url))}', this)">
                  <img src="${escapeAttr(imgUrl(url))}" alt="thumb ${i+1}" onerror="this.parentElement.style.display='none'">
                </div>
              `).join('')}
            ${(!a.images || !a.images.length ? [0,1,2] : Array.from({length: Math.max(0, 3 - a.images.length)})).map(() => `
              <div class="koko-thumb empty">${catIcon}</div>
            `).join('')}
          </div>
        </div>

        <!-- RIGHT: column of stacked cards -->
        <div class="koko-right-col">
          <!-- Card 1: white card with title + 3 time values + 2 price boxes -->
          <div class="koko-card koko-card-white">
            <div class="koko-card-head">
              <span class="koko-card-icon">💰</span>
              <div>
                <p class="koko-card-eyebrow">Sealed Bid Auction · ${escapeHtml(a.category || '')}</p>
                <h1 class="koko-title">${escapeHtml(a.title)}</h1>
              </div>
            </div>
            <div class="koko-3values">
              <div class="koko-value koko-value-pink">
                <p class="num" id="cdH">00</p>
                <p class="lbl">HOURS</p>
              </div>
              <div class="koko-value koko-value-pink">
                <p class="num" id="cdM">00</p>
                <p class="lbl">MIN</p>
              </div>
              <div class="koko-value koko-value-pink">
                <p class="num" id="cdS">00</p>
                <p class="lbl">SEC</p>
              </div>
            </div>
            <div class="koko-2prices">
              <div class="koko-price koko-price-amber">
                <p class="lbl">BASE PRICE</p>
                <p class="val">৳ ${Number(a.basePrice).toLocaleString()}</p>
              </div>
              <div class="koko-price koko-price-purple">
                <p class="lbl">TOP BID NOW</p>
                <p class="val" id="currentBidAmount">${topBid ? '৳ ' + Number(topBid).toLocaleString() : '— none'}</p>
              </div>
            </div>
            <div class="koko-lock">
              <span class="ico">🔒</span>
              <span>Bidder identity is fully anonymous. Only the top bid is visible. <span class="koko-link">▶</span></span>
            </div>
          </div>

          <!-- Card 2: dark bar with key number (Total bids / unique bidders) -->
          <div class="koko-card koko-card-dark">
            <span class="ico">🎟️</span>
            <div class="koko-dark-info">
              <p class="lbl">Total Bids Received</p>
              <p class="num">${a._count.bids || 0}</p>
            </div>
            <div class="koko-dark-info">
              <p class="lbl">Bid Increment</p>
              <p class="num">৳ ${Number(a.bidIncrement).toLocaleString()}</p>
            </div>
          </div>

          <!-- Card 3: green success — bid history summary -->
          <div class="koko-card koko-card-green">
            <p class="koko-section-title">🏷️ Bid History · Sealed</p>
            <div class="koko-history-row">
              <span class="ico">📦</span>
              <div class="koko-history-info">
                <p class="title">${a._count.bids || 0} sealed bid${a._count.bids === 1 ? '' : 's'} received</p>
                <p class="sub">Bidder identities are revealed only after the auction ends</p>
              </div>
              <div class="koko-history-end">
                <p class="amount">${a._count.bids ? (a._count.bids * (topBid || a.basePrice)).toLocaleString() : '—'}</p>
                <p class="amount-lbl">৳ est. total</p>
                <span class="koko-success-pill">SEALED</span>
              </div>
            </div>
          </div>

          <!-- Card 4: 3-row list of recent bidders (anonymized) -->
          <div class="koko-card koko-card-white">
            <p class="koko-section-title">🎭 Recent Bidders (Anonymized)</p>
            <div class="koko-bidder-list">
              ${(a.bids && a.bids.length)
                ? [...a.bids].sort((x,y) => y.amount - x.amount).slice(0, 3).map((b, i) => `
                  <div class="koko-bidder-row ${i === 1 ? 'highlighted' : ''}">
                    <span class="ico">🏷️</span>
                    <span class="name">Anonymous Bidder #${i+1}</span>
                    <span class="meta">${formatBidTime(b.createdAt)}</span>
                    <span class="amount">৳ ${Number(b.amount).toLocaleString()}</span>
                  </div>
                `).join('')
                : '<div class="koko-bidder-row empty"><span class="ico">⏳</span><span class="name">No bids yet — be the first</span><span class="amount">—</span></div>'}
            </div>
          </div>

          <!-- Card 5: bid input form (or login prompt) -->
          <div class="koko-card koko-card-cta">
            ${!isSeller && currentUser && a.status === 'ACTIVE' ? `
              <p class="koko-cta-label">Place Sealed Bid (Minimum ৳ ${minNext.toLocaleString()})</p>
              <div class="koko-cta-input">
                <span class="prefix">৳</span>
                <input type="number" id="bidAmount" value="${minNext}" min="${minNext}" />
                <button class="koko-cta-btn" onclick="placeBid('${a.id}', ${Number(a.bidIncrement)})">
                  🔨 Place Bid
                </button>
              </div>
              <p class="koko-cta-hint">Min <strong>৳ ${minNext.toLocaleString()}</strong> required · ${myTop ? `Your highest: ৳ ${Number(myTop).toLocaleString()}` : 'You haven\'t bid yet'}</p>
            ` : isSeller ? '<p class="koko-cta-label">You are the seller of this auction</p><button class="koko-cta-btn koko-delete" style="background:#dc2626;margin-top:8px" onclick="deleteAuction(\''+a.id+'\', \''+escapeAttr(a.title)+'\')">🗑️ Delete This Auction</button>'
            : !currentUser ? '<p class="koko-cta-label">🔒 <a onclick="showAuthModal()" style="cursor:pointer;color:var(--color-purple);text-decoration:underline">Login</a> to place a sealed bid</p>'
            : '<p class="koko-cta-label">Auction is not currently active</p>'}
            ${(canDelete(a) && !isSeller) ? '<button class="koko-cta-btn koko-delete" style="background:#dc2626;margin-top:8px" onclick="deleteAuction(\''+a.id+'\', \''+escapeAttr(a.title)+'\')">🗑️ Admin: Delete This Auction</button>' : ''}
          </div>

          <!-- Pagination dots (visual) -->
          <div class="koko-pagination">
            <span class="dot active"></span>
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>

          <!-- Actions bar: heart + chat -->
          <div class="detail-actions" style="display:flex;gap:12px;justify-content:center;margin-top:18px;flex-wrap:wrap">
            <span class="detail-heart ${watchedSet.has(a.id) ? 'active' : ''}" data-aid="${a.id}"
                  onclick="toggleWatchlist('${a.id}', this)">
              ${watchedSet.has(a.id) ? '❤️' : '🤍'} ${watchedSet.has(a.id) ? 'Saved' : 'Save'}
            </span>
            <button class="btn-back" onclick="openChatForAuction('${a.id}')" style="background:linear-gradient(135deg, #7C3AED, #5B21B6);color:white;border-color:transparent">
              💬 Chat with ${isSeller ? 'Buyer' : 'Seller'}
            </button>
          </div>

          <!-- Footer -->
          <p class="koko-footer">
            BidBlind · Sealed-bid auction platform · All bids are final at auction end<br>
            <span class="muted">Privacy guaranteed · Anonymous bidding · Secure payment via Stripe</span>
          </p>
        </div>
      </div>
      <!-- Similar items row (filled by loadSimilarItems) -->
      <div id="similarItemsRow" style="display:none"></div>
    </div>
  `;
  startCountdown(a.endsAt);
}

function renderBidRows(bids, topBid) {
  const sorted = [...bids].sort((a, b) => b.amount - a.amount);
  const top = sorted[0];
  const visible = sorted.slice(0, 5);
  const more = sorted.length - visible.length;
  return visible.map((b, i) => {
    const isTop = b.id === top.id;
    return `
      <div class="bid-row-item ${isTop ? 'is-top' : ''}">
        <div class="bid-row-left">
          <div class="bid-row-avatar ${isTop ? 'top' : 'norm'}">${i + 1}</div>
          <div>
            <p class="bid-row-name">Bidder #${i + 1}</p>
            <p class="bid-row-time">${formatBidTime(b.createdAt)}</p>
          </div>
        </div>
        <div class="bid-row-amt-wrap">
          <p class="bid-row-amt">৳ ${Number(b.amount).toLocaleString()}</p>
          ${isTop ? '<span class="bid-row-top-tag">Top</span>' : ''}
        </div>
      </div>
    `;
  }).join('') + (more > 0 ? `<p class="bid-more">+ ${more}more bids...</p>` : '');
}

function formatBidTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `Today ${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Store interval IDs globally so we can clear them
let countdownInterval = null;
let browseRefreshInterval = null;
let searchDebounceTimer = null;

function searchDebounce() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => loadAuctions(), 300);
}

function startCountdown(endsAt) {
  if (countdownInterval) clearInterval(countdownInterval);
  const hEl = document.getElementById('cdH');
  const mEl = document.getElementById('cdM');
  const sEl = document.getElementById('cdS');
  if (!hEl || !mEl || !sEl) return;
  const tick = () => {
    const remain = parseRemaining(endsAt);
    if (remain <= 0) {
      hEl.textContent = '00'; mEl.textContent = '00'; sEl.textContent = '00';
      return;
    }
    const h = Math.floor(remain / 3600000);
    const m = Math.floor((remain % 3600000) / 60000);
    const s = Math.floor((remain % 60000) / 1000);
    hEl.textContent = toBn(String(h).padStart(2, '0'));
    mEl.textContent = toBn(String(m).padStart(2, '0'));
    sEl.textContent = toBn(String(s).padStart(2, '0'));
  };
  tick();
  countdownInterval = setInterval(tick, 1000);
}

function toBn(s) {
  const map = ['0','1','2','3','4','5','6','7','8','9'];
  return String(s).split('').map(c => /\d/.test(c) ? map[+c] : c).join('');
}

function stopCountdown() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
}

async function placeBid(auctionId, increment) {
  const amount = Number(document.getElementById('bidAmount').value);
  if (!amount || amount <= 0) { alert('Enter a valid amount'); return; }
  try {
    const r = await fetch(`${API_URL}/api/x/place-bid?id=${auctionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount }),
    });
    const data = await r.json();
    if (!r.ok) {
      alert('❌ ' + (data.error || 'Bid failed'));
      return;
    }
    // Optimistic UI update — server is source of truth, but we update now for responsiveness
    if (currentAuction && currentAuction.id === auctionId && currentUser) {
      if (!currentAuction.bids) currentAuction.bids = [];
      currentAuction.bids.unshift({ amount, bidderId: currentUser.id, createdAt: new Date().toISOString() });
      currentAuction.currentMaxBid = amount;
      renderAuctionDetail(currentAuction);
    }
    document.getElementById('bidAmount').value = '';
  } catch (e) {
    alert('❌ Network error: ' + e.message);
  }
}

async function confirmPurchase(auctionId) {
  const res = await fetch(`${API_URL}/api/x/confirm?id=${auctionId}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (data.transaction) {
    if (confirm(`Pay ৳${data.transaction.commissionAmt} commission?`)) {
      const payRes = await fetch(`${API_URL}/api/x/pay-buyer?id=${auctionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone: '01700000000' })
      });
      const payData = await payRes.json();
      alert(payData.success ? '✅ Payment successful!' : '❌ Payment failed: ' + payData.error);
    }
  }
}

async function rejectPurchase(auctionId) {
  await fetch(`${API_URL}/api/x/reject?id=${auctionId}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }
  });
  alert('Rejection registered. Will pass to 2nd highest bidder.');
}

async function getContact(auctionId) {
  const res = await fetch(`${API_URL}/api/x/pay-contact?id=${auctionId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  if (data.contact) {
    alert(`Contact:\nName: ${data.contact.fullName || 'N/A'}\nPhone: ${data.contact.phone || 'N/A'}\nEmail: ${data.contact.email}`);
  } else {
    alert('❌ ' + (data.error || 'Contact not available'));
  }
}

// ========== CREATE AUCTION ==========
let editingAuctionId = null; // null = create mode, otherwise = edit mode

// (richer openCreateModal is defined later in file)

async function openEditModal(auctionId) {
  try {
    const r = await fetch(`${API_URL}/api/auction/${auctionId}`);
    if (!r.ok) throw new Error('fetch failed');
    const a = await r.json();
    const auction = a.auction || a;
    // GUARD: if bidding already started (>=1 bid), editing is locked
    if ((auction.bidCount || 0) > 0) {
      showToast('Sorry, bidding already started. You cannot edit this auction.', 'err');
      return;
    }
    editingAuctionId = auctionId;
    // Pre-fill form
    document.getElementById('title').value = auction.title || '';
    document.getElementById('description').value = auction.description || '';
    document.getElementById('category').value = auction.category || '';
    document.getElementById('condition').value = auction.condition || 'USED';
    document.getElementById('basePrice').value = auction.basePrice || '';
    document.getElementById('bidIncrement').value = auction.bidIncrement || 100;
    document.getElementById('city').value = auction.city || '';
    document.getElementById('area').value = auction.area || '';
    document.getElementById('district').value = auction.district || '';
    document.getElementById('thana').value = auction.thana || '';
    // Preload existing images (each will get an X button via renderPreview)
    existingImageUrls = Array.isArray(auction.images) ? [...auction.images] : [];
    // Reset selected files (uploading new ones will append to existingImageUrls)
    selectedFiles = [];
    document.getElementById('images').value = '';
    renderPreview();
    // Switch modal title
    const h2 = document.querySelector('#createModal h2');
    if (h2) h2.textContent = '✏️ Edit Auction';
    // Apply current edit mode (OPEN = all editable, CLOSE = description only)
    applyEditModeToForm();
    // Open
    document.getElementById('createModal').style.display = 'flex';
  } catch (e) {
    alert('Failed to load auction: ' + e.message);
  }
}

function closeCreateModal() {
  document.getElementById('createModal').style.display = 'none';
  document.getElementById('createError').textContent = '';
  // Reset edit mode
  editingAuctionId = null;
  existingImageUrls = [];
  selectedFiles = [];
  const h2 = document.querySelector('#createModal h2');
  if (h2) h2.textContent = '＋ Post Item for Auction';
  // Reset locked fields for fresh create
  const allFieldIds = ['title', 'description', 'category', 'condition', 'basePrice', 'bidIncrement', 'city', 'area', 'district', 'thana'];
  allFieldIds.forEach(fid => {
    const el = document.getElementById(fid);
    if (el) { el.disabled = false; el.classList.remove('field-locked'); }
    const hint = document.getElementById(fid + '_lockedHint');
    if (hint) hint.remove();
  });
  const banner = document.getElementById('editModeBanner');
  if (banner) banner.style.display = 'none';
  const imgInput = document.getElementById('images');
  if (imgInput) imgInput.disabled = false;
  const imgLabel = document.querySelector('label[for="images"]');
  if (imgLabel) { imgLabel.style.opacity = '1'; imgLabel.style.pointerEvents = 'auto'; }
}

// Image preview + validation
let selectedFiles = [];
// Keep existing data URI URLs from edit-mode for X-remove tracking
let existingImageUrls = []; // for edit mode: preloaded URLs the user can remove

document.addEventListener('change', (e) => {
  if (e.target.id === 'images') {
    selectedFiles = Array.from(e.target.files).slice(0, 5);
    const preview = document.getElementById('imagePreview');
    if (selectedFiles.length === 0) {
      preview.innerHTML = '<span class="placeholder">No images selected</span>';
      return;
    }
    preview.innerHTML = '';
    selectedFiles.forEach((file, idx) => {
      if (file.size > 5 * 1024 * 1024) {
        alert(`File "${file.name}" is over 5MB and will be skipped`);
        selectedFiles[idx] = null;
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const wrap = document.createElement('div');
        wrap.className = 'preview-item';
        const img = document.createElement('img');
        img.src = ev.target.result;
        img.title = file.name;
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'preview-x';
        x.title = 'Remove this image';
        x.innerHTML = '×';
        x.onclick = () => {
          selectedFiles.splice(idx, 1);
          // Rebuild preview
          renderPreview();
          // Sync the underlying file input so re-selection is consistent
          try {
            const dt = new DataTransfer();
            selectedFiles.forEach(f => dt.items.add(f));
            e.target.files = dt.files;
          } catch (_) { /* some browsers don't allow programmatic DataTransfer on file inputs */ }
        };
        wrap.appendChild(img);
        wrap.appendChild(x);
        preview.appendChild(wrap);
      };
      reader.readAsDataURL(file);
    });
    selectedFiles = selectedFiles.filter(Boolean);
  }
});

function renderPreview() {
  const preview = document.getElementById('imagePreview');
  preview.innerHTML = '';
  if (selectedFiles.length === 0 && existingImageUrls.length === 0) {
    preview.innerHTML = '<span class="placeholder">No images selected</span>';
    return;
  }
  // Show existing (edit-mode) images first
  existingImageUrls.forEach((url, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'preview-item existing';
    const img = document.createElement('img');
    img.src = url;
    img.title = 'Existing image';
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'preview-x';
    x.title = 'Remove this image';
    x.innerHTML = '×';
    x.onclick = () => {
      existingImageUrls.splice(idx, 1);
      renderPreview();
    };
    wrap.appendChild(img);
    wrap.appendChild(x);
    preview.appendChild(wrap);
  });
  // Then newly picked files
  selectedFiles.forEach((file, idx) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wrap = document.createElement('div');
      wrap.className = 'preview-item';
      const img = document.createElement('img');
      img.src = ev.target.result;
      img.title = file.name;
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'preview-x';
      x.title = 'Remove this image';
      x.innerHTML = '×';
      x.onclick = () => {
        selectedFiles.splice(idx, 1);
        renderPreview();
        const fileInput = document.getElementById('images');
        if (fileInput) {
          try {
            const dt = new DataTransfer();
            selectedFiles.forEach(f => dt.items.add(f));
            fileInput.files = dt.files;
          } catch (_) {}
        }
      };
      wrap.appendChild(img);
      wrap.appendChild(x);
      preview.appendChild(wrap);
    };
    reader.readAsDataURL(file);
  });
}

async function handleCreateAuction(e) {
  e.preventDefault();
  const errorEl = document.getElementById('createError');
  errorEl.textContent = '';

  // Create mode requires at least 1 image; edit mode allows no new images (existingImageUrls counts)
  if (!editingAuctionId && selectedFiles.length === 0) {
    errorEl.textContent = 'Please select at least one image';
    return;
  }
  if (editingAuctionId && selectedFiles.length === 0 && existingImageUrls.length === 0) {
    errorEl.textContent = 'Please keep at least one image or upload a new one';
    return;
  }

  // Use FormData for multipart upload
  const formData = new FormData();
  selectedFiles.forEach(f => formData.append('images', f));
  formData.append('title', document.getElementById('title').value);
  formData.append('description', document.getElementById('description').value);
  formData.append('category', document.getElementById('category').value);
  formData.append('condition', document.getElementById('condition').value);
  formData.append('basePrice', document.getElementById('basePrice').value);
  formData.append('bidIncrement', document.getElementById('bidIncrement').value || '100');
  formData.append('city', document.getElementById('city').value);
  formData.append('area', document.getElementById('area').value);
  formData.append('district', document.getElementById('district').value);
  formData.append('thana', document.getElementById('thana').value);

  try {
    // Show progress
    errorEl.innerHTML = '<div class="upload-progress">⏳ ' + (editingAuctionId ? 'Saving changes' : 'Uploading images') + '...</div>';

    // Convert selected files to base64 data URIs (backend uploadToImgBB expects dataUri)
    const toDataUri = (file) => new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const imageDataUris = await Promise.all(selectedFiles.slice(0, 5).map(toDataUri));

    let res, data;
    if (editingAuctionId) {
      // ===== EDIT MODE =====
      // Send: keepImages = existing URLs user did NOT delete (still in existingImageUrls)
      //       images = newly picked files as data URIs (uploaded to imgBB)
      // Backend will merge: keepImages + newly uploaded → final images[]
      const jsonBody = {
        title: document.getElementById('title').value,
        description: document.getElementById('description').value,
        category: document.getElementById('category').value,
        condition: document.getElementById('condition').value,
        basePrice: document.getElementById('basePrice').value,
        bidIncrement: document.getElementById('bidIncrement').value || 100,
        city: document.getElementById('city').value,
        area: document.getElementById('area').value,
        district: document.getElementById('district').value,
        thana: document.getElementById('thana').value,
        keepImages: existingImageUrls,
        images: imageDataUris.length > 0 ? imageDataUris : undefined
      };
      res = await fetch(`${API_URL}/api/auction/${editingAuctionId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(jsonBody)
      });
    } else {
      // ===== CREATE MODE =====
      const jsonBody = {
        title: document.getElementById('title').value,
        description: document.getElementById('description').value,
        category: document.getElementById('category').value,
        condition: document.getElementById('condition').value,
        basePrice: document.getElementById('basePrice').value,
        bidIncrement: document.getElementById('bidIncrement').value || 100,
        city: document.getElementById('city').value,
        area: document.getElementById('area').value,
        district: document.getElementById('district').value,
        thana: document.getElementById('thana').value,
        images: imageDataUris
      };
      res = await fetch(`${API_URL}/api/x/upload-auction`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(jsonBody)
      });
    }
    data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    closeCreateModal();
    if (editingAuctionId) {
      alert('✅ Auction updated!');
    } else {
      alert('✅ Auction created with ' + data.auction.images.length + ' image(s)! 48h timer started.');
    }
    selectedFiles = [];
    document.getElementById('images').value = '';
    loadAuctions();
    if (editingAuctionId === null && currentAuction) {
      // If user was viewing the same auction, refresh detail
    }
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function swapImage(url, el) {
  // Detail page uses .koko-main-img + .koko-thumb classes (not #thumbRow)
  const main = document.querySelector('.koko-main-img') || document.querySelector('.detail-img-wrap img.detail-img');
  if (main) {
    main.style.opacity = '0';
    setTimeout(() => {
      main.src = url;
      main.style.opacity = '1';
    }, 150);
  }
  document.querySelectorAll('.koko-thumb').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

// Auto-refresh auctions list removed — Socket.IO pushes new_max_bid events in real-time
// Old polling caused visible "blink" every 30s. If disconnected, refresh button can re-fetch.

init();

async function deleteAuction(id, title) {
  if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
  try {
    const res = await fetch(`${API_URL}/api/auction/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Delete failed');
    alert('✅ Deleted');
    loadAuctions();
  } catch (err) {
    alert('❌ ' + err.message);
  }
}
/* ============================================================
   v=26 FEATURE ADDITIONS
   - Watchlist (❤️ heart + my watchlist view)
   - Ending Soon (🔥 section + dedicated view)
   - Similar items (detail page row)
   - Seller Dashboard (analytics page)
   - Chat panel (buyer ↔ seller, post-win only)
   ============================================================ */

// ---- Module state ----
let watchedSet = new Set();
let currentChatId = null;
let chatPanelOpen = false;

// ---- Watchlist: load user's watched auction IDs ----
async function loadWatchedSet() {
  if (!token) { watchedSet = new Set(); return; }
  try {
    const r = await fetch(`${API_URL}/api/watchlist`, { headers: authH() });
    if (!r.ok) { watchedSet = new Set(); return; }
    const data = await r.json();
    watchedSet = new Set((data.auctions || []).map(a => a.id));
  } catch (e) { watchedSet = new Set(); }
}

// ---- Toggle watchlist (heart click) ----
async function toggleWatchlist(auctionId, btnEl) {
  if (!token) {
    openAuthModal();
    showToast('Please sign in to save items', 'warn');
    return;
  }
  const isWatched = watchedSet.has(auctionId);
  // optimistic update
  if (isWatched) watchedSet.delete(auctionId);
  else watchedSet.add(auctionId);
  if (btnEl) {
    btnEl.classList.toggle('active', !isWatched);
    btnEl.textContent = !isWatched ? '❤️' : '🤍';
    btnEl.title = !isWatched ? 'Remove from watchlist' : 'Add to watchlist';
  }
  // sync all hearts on this auction
  document.querySelectorAll(`.lot-heart[data-aid="${auctionId}"], .detail-heart[data-aid="${auctionId}"]`)
    .forEach(el => {
      el.classList.toggle('active', !isWatched);
      if (el.classList.contains('detail-heart')) {
        el.innerHTML = (!isWatched ? '❤️' : '🤍') + ' ' + (!isWatched ? 'Saved' : 'Save');
      } else {
        el.textContent = !isWatched ? '❤️' : '🤍';
      }
    });
  try {
    if (isWatched) {
      const r = await fetch(`${API_URL}/api/x/watchlist-toggle?id=${auctionId}`, { method: 'DELETE', headers: authH() });
      if (!r.ok) throw new Error('remove failed');
      showToast('Removed from watchlist', 'ok');
    } else {
      const r = await fetch(`${API_URL}/api/watchlist`, {
        method: 'POST',
        headers: { ...authH(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ auctionId })
      });
      if (!r.ok) throw new Error('add failed');
      showToast('❤️ Saved to watchlist', 'ok');
    }
  } catch (e) {
    // revert
    if (isWatched) watchedSet.add(auctionId);
    else watchedSet.delete(auctionId);
    if (btnEl) {
      btnEl.classList.toggle('active', isWatched);
      btnEl.textContent = isWatched ? '❤️' : '🤍';
    }
    showToast('Failed — try again', 'err');
  }
}

// ---- Ending Soon: fetch and render ----
//  - targetId: render target. Special case 'heroEndingSoonList' = small hero cards (max 4)
async function loadEndingSoon(targetId) {
  targetId = targetId || 'endingSoonList';
  try {
    const r = await fetch(`${API_URL}/api/auctions?endingIn=24&limit=8`, { headers: token ? authH() : {} });
    if (!r.ok) return;
    const data = await r.json();
    const list = data.auctions || [];
    const grid = document.getElementById(targetId);
    if (!grid) return;
    if (!list.length) {
      grid.innerHTML = '<div class="hero-es-empty">No auctions ending soon</div>';
      return;
    }
    // Hero right-side: small compact cards, 4 max (7-day window so it always has items)
    if (targetId === 'heroEndingSoonList') {
      const r7 = await fetch(`${API_URL}/api/auctions?endingIn=168&limit=8`, { headers: token ? authH() : {} });
      if (!r7.ok) return;
      const data7 = await r7.json();
      const list7 = data7.auctions || [];
      const grid7 = document.getElementById('heroEndingSoonList');
      if (!grid7) return;
      if (!list7.length) {
        grid7.innerHTML = '<div class="hero-es-empty">No auctions ending soon</div>';
        return;
      }
      grid7.innerHTML = list7.slice(0, 4).map(a => renderHeroEndingSoonCard(a)).join('');
      return;
    }
    // Full Ending Soon view: regular lot cards
    grid.innerHTML = list.map(a => renderLotCard(a, 'ending-soon-card')).join('');
  } catch (e) {
    console.error('loadEndingSoon', e);
  }
}

// ---- Hero Ending Soon: small card with image + title + price + timer ----
function renderHeroEndingSoonCard(a) {
  const hasImg = a.images && a.images[0];
  const catIcon = getCatIcon(a.category);
  const timeLeft = getTimeLeft(a.endsAt);
  const urgent = parseRemaining(a.endsAt) <= 3 * 3600 * 1000;
  const base = a.basePrice;
  const imgSrc = hasImg ? escapeAttr(imgUrl(a.images[0])) : '';
  return `
    <div class="hero-es-card" onclick="viewAuction('${a.id}')">
      ${hasImg
        ? `<img class="hero-es-card-img" src="${imgSrc}" alt="${escapeHtml(a.title)}" onerror="this.outerHTML='<div class=\\'hero-es-card-img\\' style=\\'display:flex;align-items:center;justify-content:center;font-size:32px\\'>${catIcon}</div>'">`
        : `<div class="hero-es-card-img" style="display:flex;align-items:center;justify-content:center;font-size:32px">${catIcon}</div>`}
      <div class="hero-es-card-body">
        <p class="hero-es-card-title">${escapeHtml(a.title)}</p>
        <div class="hero-es-card-meta">
          <span class="hero-es-card-price">৳${Number(base).toLocaleString()}</span>
          <span class="hero-es-card-timer" title="${urgent ? 'Ending very soon' : ''}">${urgent ? '⏰ ' : ''}${timeLeft}</span>
        </div>
      </div>
    </div>`;
}

// ---- Watchlist view ----
async function loadWatchlistView() {
  const grid = document.getElementById('watchlistGrid');
  if (!grid) return;
  if (!token) {
    grid.innerHTML = '<div class="watchlist-empty"><div class="ico">🔒</div><h3>Sign in to see your watchlist</h3><p>Save items you love and we\'ll keep them here for you.</p><button class="btn-primary" onclick="openAuthModal()">Sign in</button></div>';
    return;
  }
  try {
    const r = await fetch(`${API_URL}/api/watchlist`, { headers: authH() });
    if (!r.ok) throw new Error('fetch failed');
    const data = await r.json();
    const list = data.auctions || [];
    if (!list.length) {
      grid.innerHTML = '<div class="watchlist-empty"><div class="ico">❤️</div><h3>No saved items yet</h3><p>Tap the heart icon on any item to save it here.</p><button class="btn-primary" onclick="switchView(\'browse\')">Browse items</button></div>';
      return;
    }
    grid.innerHTML = list.map(a => renderLotCard(a)).join('');
  } catch (e) {
    grid.innerHTML = '<div class="lot-empty">Failed to load watchlist.</div>';
  }
}

// ---- Seller Dashboard ----
async function loadDashboardView() {
  const root = document.getElementById('dashboardContent');
  if (!root) return;
  if (!token) {
    root.innerHTML = '<div class="watchlist-empty"><div class="ico">🔒</div><h3>Sign in to see your dashboard</h3><p>Track your auctions, bids, and earnings.</p><button class="btn-primary" onclick="openAuthModal()">Sign in</button></div>';
    return;
  }
  try {
    const r = await fetch(`${API_URL}/api/x/seller-dashboard`, { headers: authH() });
    if (!r.ok) throw new Error('fetch failed');
    const data = await r.json();
    const t = data.totals || {};
    const list = data.perAuction || [];
    root.innerHTML = `
      <div class="dash-stats">
        <div class="dash-stat"><div class="dash-stat-label">Active Auctions</div><p class="dash-stat-value purple">${t.activeCount || 0}</p><div class="dash-stat-sub">of ${t.totalAuctions || 0} total</div></div>
        <div class="dash-stat"><div class="dash-stat-label">Items Sold</div><p class="dash-stat-value green">${t.soldCount || 0}</p><div class="dash-stat-sub">closed auctions</div></div>
        <div class="dash-stat"><div class="dash-stat-label">Total Views</div><p class="dash-stat-value blue">${t.totalViews || 0}</p><div class="dash-stat-sub">across all listings</div></div>
        <div class="dash-stat"><div class="dash-stat-label">Total Bids</div><p class="dash-stat-value amber">${t.totalBids || 0}</p><div class="dash-stat-sub">${t.totalWatchlist || 0} watchlist saves</div></div>
        <div class="dash-stat"><div class="dash-stat-label">Gross Earnings</div><p class="dash-stat-value green">৳ ${Number(t.grossEarnings || 0).toLocaleString()}</p><div class="dash-stat-sub">20% commission applied</div></div>
        <div class="dash-stat"><div class="dash-stat-label">Net Earnings</div><p class="dash-stat-value pink">৳ ${Number(t.netEarnings || 0).toLocaleString()}</p><div class="dash-stat-sub">after ৳${Number(t.commissionPaid || 0).toLocaleString()} fee</div></div>
      </div>
      <div class="dash-per-auction">
        <h3>📦 Per-Auction Breakdown</h3>
        <div class="dash-row head">
          <div></div><div>Item</div><div style="text-align:center">Views</div><div style="text-align:center">Bids</div><div style="text-align:center">Saves</div><div style="text-align:center">Status</div>
        </div>
        ${list.length === 0 ? '<div class="lot-empty" style="grid-column:1/-1;padding:20px">No auctions yet. Post your first item!</div>' :
          list.map(a => {
            const img = (a.images && a.images[0]) ? `<img src="${escapeAttr(imgUrl(a.images[0]))}" alt="" onerror="this.style.display='none'">` : '<div style="width:50px;height:50px;background:#F3F4F6;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px">📦</div>';
            const editBtn = `<button class="dash-edit-btn" onclick="event.stopPropagation();openEditModal('${a.id}')" title="Edit this auction">✏️ Edit</button>`;
            return `
              <div class="dash-row" onclick="viewAuction('${a.id}')" style="cursor:pointer">
                ${img}
                <div class="dash-row-title">${escapeHtml(a.title)}</div>
                <div class="dash-row-cell ${a.viewCount === 0 ? 'zero' : ''}">${a.viewCount || 0}</div>
                <div class="dash-row-cell ${a.bidCount === 0 ? 'zero' : ''}">${a.bidCount || 0}</div>
                <div class="dash-row-cell ${a.watchCount === 0 ? 'zero' : ''}">${a.watchCount || 0}</div>
                <div class="dash-row-cell">${a.status} ${a.bidCount === 0 ? editBtn : ''}</div>
              </div>`;
          }).join('')
        }
      </div>
    `;
  } catch (e) {
    root.innerHTML = '<div class="lot-empty">Failed to load dashboard.</div>';
  }
}

// ---- Sellers view ----
async function loadSellersView() {
  const root = document.getElementById('sellersContent');
  if (!root) return;
  root.innerHTML = '<div class="lot-empty">Loading sellers…</div>';
  try {
    // Pull all active auctions; aggregate per seller
    const r = await fetch(`${API_URL}/api/auctions?limit=100&status=ACTIVE`);
    if (!r.ok) throw new Error('fetch failed');
    const data = await r.json();
    const list = data.auctions || [];
    const bySeller = {};
    list.forEach(a => {
      const s = a.seller || {};
      const key = s.id || a.sellerId;
      if (!bySeller[key]) bySeller[key] = {
        username: s.username || 'seller',
        rating: s.rating || 0,
        auctions: 0, totalBids: 0
      };
      bySeller[key].auctions += 1;
      bySeller[key].totalBids += (a._count && a._count.bids) || 0;
    });
    const sellers = Object.values(bySeller)
      .sort((a, b) => (b.auctions - a.auctions) || (b.totalBids - a.totalBids))
      .slice(0, 24);
    if (!sellers.length) {
      root.innerHTML = '<div class="lot-empty">No active sellers yet.</div>';
      return;
    }
    root.innerHTML = `
      <div class="sellers-grid">
        ${sellers.map((s, i) => `
          <div class="seller-card">
            <div class="seller-avatar">${escapeHtml(s.username.charAt(0).toUpperCase())}</div>
            <div class="seller-info">
              <div class="seller-name">${escapeHtml(s.username)}</div>
              <div class="seller-meta">⭐ ${Number(s.rating).toFixed(1)} · ${s.auctions} active · ${s.totalBids} bids</div>
            </div>
            <div class="seller-rank">#${i + 1}</div>
          </div>
        `).join('')}
      </div>`;
  } catch (e) {
    console.error('loadSellersView', e);
    root.innerHTML = '<div class="lot-empty">Failed to load sellers.</div>';
  }
}

// ---- Chat panel ----
async function loadChatList() {
  const listEl = document.getElementById('chatList');
  if (!listEl) return;
  if (!token) { listEl.innerHTML = '<div class="chat-empty">Sign in to use chat</div>'; return; }
  try {
    const r = await fetch(`${API_URL}/api/chats`, { headers: authH() });
    if (!r.ok) throw new Error('fetch failed');
    const data = await r.json();
    const chats = data.chats || [];
    if (!chats.length) {
      listEl.innerHTML = '<div class="chat-empty">No chats yet.<br>Win an auction to chat with the seller.</div>';
      const fab = document.getElementById('chatFab');
      if (fab) fab.style.display = 'none';
      return;
    }
    listEl.innerHTML = chats.map(c => {
      const other = c.otherUser || {};
      const preview = (c.messages && c.messages[0]) ? c.messages[0].content : 'No messages yet';
      return `
        <div class="chat-item" onclick="openChat('${c.id}')">
          <div class="chat-item-title">${escapeHtml(c.auction?.title || 'Auction')}</div>
          <div class="chat-item-preview">${escapeHtml(other.username || 'User')}: ${escapeHtml(preview.slice(0, 40))}</div>
        </div>`;
    }).join('');
    const fab = document.getElementById('chatFab');
    if (fab) fab.style.display = 'flex';
  } catch (e) {
    listEl.innerHTML = '<div class="chat-empty">Failed to load chats</div>';
  }
}

async function openChat(chatId) {
  currentChatId = chatId;
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
  event.currentTarget?.classList.add('active');
  document.getElementById('chatList').style.display = 'none';
  document.getElementById('chatThread').style.display = 'flex';
  await loadChatMessages(chatId);
  startChatPolling(chatId);   // poll replaces socket chat:new
}

async function loadChatMessages(chatId) {
  const msgEl = document.getElementById('chatMessages');
  const headEl = document.getElementById('chatThreadHead');
  if (!msgEl) return;
  msgEl.innerHTML = '<div class="chat-empty">Loading…</div>';
  try {
    const r = await fetch(`${API_URL}/api/x/chat-messages?id=${chatId}`, { headers: authH() });
    if (!r.ok) throw new Error('fetch failed');
    const data = await r.json();
    const msgs = data.messages || [];
    const chat = data.chat || {};
    const other = chat.otherUser || {};
    if (headEl) headEl.textContent = `${other.username || 'User'} · ${chat.auction?.title || ''}`;
    if (!msgs.length) {
      msgEl.innerHTML = '<div class="chat-empty">No messages yet — say hello!</div>';
      return;
    }
    msgEl.innerHTML = msgs.map(m => {
      const mine = currentUser && m.senderId === currentUser.id;
      return `
        <div class="chat-msg ${mine ? 'mine' : 'theirs'}">
          ${escapeHtml(m.content)}
          <div class="chat-msg-time">${formatBidTime(m.createdAt)}</div>
        </div>`;
    }).join('');
    msgEl.scrollTop = msgEl.scrollHeight;
  } catch (e) {
    msgEl.innerHTML = '<div class="chat-empty">Failed to load messages</div>';
  }
}

async function sendMessage() {
  if (!currentChatId) return;
  const input = document.getElementById('chatInputText');
  const text = (input?.value || '').trim();
  if (!text) return;
  input.value = '';
  try {
    const r = await fetch(`${API_URL}/api/x/chat-messages?id=${currentChatId}`, {
      method: 'POST',
      headers: { ...authH(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text })
    });
    if (!r.ok) throw new Error('send failed');
    await loadChatMessages(currentChatId);
  } catch (e) {
    showToast('Failed to send', 'err');
  }
}

function toggleChatPanel() {
  const panel = document.getElementById('chatPanel');
  if (!panel) return;
  chatPanelOpen = !chatPanelOpen;
  panel.style.display = chatPanelOpen ? 'flex' : 'none';
  if (chatPanelOpen) {
    // make sure list is shown, not thread
    document.getElementById('chatList').style.display = 'block';
    document.getElementById('chatThread').style.display = 'none';
    loadChatList();
  }
}
function closeChatPanel() {
  chatPanelOpen = false;
  const panel = document.getElementById('chatPanel');
  if (panel) panel.style.display = 'none';
}

// ---- Toast helper ----
function showToast(msg, type) {
  let t = document.getElementById('globalToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'globalToast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:12px 22px;border-radius:999px;font-weight:600;font-size:14px;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,0.18);transition:all 0.25s ease;';
    document.body.appendChild(t);
  }
  const colors = { ok: 'linear-gradient(135deg, #10B981, #059669)', err: 'linear-gradient(135deg, #EF4444, #DC2626)', warn: 'linear-gradient(135deg, #F59E0B, #D97706)' };
  t.style.background = colors[type] || colors.ok;
  t.style.color = 'white';
  t.textContent = msg;
  t.style.opacity = '1';
  t.style.bottom = '24px';
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => {
    t.style.opacity = '0';
    setTimeout(() => { t.style.bottom = '8px'; }, 250);
  }, 2200);
}

// ---- Render helper: lot card with heart ----
function renderLotCard(a, extraClass) {
  const hasImg = a.images && a.images[0];
  const topBid = a.currentMaxBid;
  const base = a.basePrice;
  const timeLeft = getTimeLeft(a.endsAt);
  const ended = timeLeft === 'Ended';
  const urgent = !ended && parseRemaining(a.endsAt) <= 3 * 3600 * 1000; // <3h
  const condClass = `cond-${(a.condition || 'good').toLowerCase().replace(' ', '')}`;
  const locStr = [a.area, a.thana, a.district, a.city].filter(Boolean).join(', ');
  const catIcon = getCatIcon(a.category);
  const isWatched = watchedSet.has(a.id);
  const heartClass = token ? 'lot-heart' : 'lot-heart guest';
  return `
    <div class="lot-card ${extraClass || ''}" onclick="viewAuction('${a.id}')">
      <div class="lot-img-area">
        ${hasImg
          ? `<img src="${escapeAttr(imgUrl(a.images[0]))}" alt="${escapeHtml(a.title)}" class="lot-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
          : ''}
        <span class="lot-img-fallback"${hasImg ? ' style="display:none"' : ''}>${catIcon}</span>
        <span class="lot-badge ${condClass}">${escapeHtml(a.condition || 'Good')}</span>
        <span class="lot-timer ${urgent ? 'urgent' : ''}">${urgent ? '⏰ ' : ''}${timeLeft}</span>
        <span class="${heartClass} ${isWatched ? 'active' : ''}" data-aid="${a.id}"
              onclick="event.stopPropagation();toggleWatchlist('${a.id}', this)"
              title="${isWatched ? 'Remove from watchlist' : 'Save to watchlist'}">${isWatched ? '❤️' : '🤍'}</span>
      </div>
      <div class="lot-body">
        <p class="lot-loc">📍 ${escapeHtml(locStr || 'Bangladesh')}</p>
        <p class="lot-title">${escapeHtml(a.title)}</p>
        <div class="lot-prices">
          <div>
            <p class="lot-price-base-label">Base Price</p>
            <p class="lot-price-base">৳ ${Number(base).toLocaleString()}</p>
          </div>
          <div style="text-align:right">
            <p class="lot-price-top-label">Top Bid</p>
            ${topBid
              ? `<p class="lot-price-top">৳ ${Number(topBid).toLocaleString()}</p>`
              : `<p class="lot-price-none">— none</p>`}
          </div>
        </div>
        <div class="lot-foot">
          <span class="lot-bids">${catIcon} ${a._count.bids} bids</span>
          <span class="lot-live">LIVE</span>
        </div>
        ${(canDelete(a)) ? `
        <button class="lot-delete" onclick="event.stopPropagation();deleteAuction('${a.id}','${escapeAttr(a.title)}')" title="Delete this auction">🗑️ Delete</button>
        ` : ''}
      </div>
    </div>
  `;
}

// ---- Init chat polling (replaces socket chat:new listener) ----
function setupChatSocket() {
  // Chat is now polled in openChat() via startChatPolling().
  // Keeping this as a no-op so existing init() calls don't break.
}

// Open chat for a specific auction (called from detail page)
async function openChatForAuction(auctionId) {
  if (!token) { openAuthModal(); showToast('Sign in to chat', 'warn'); return; }
  try {
    // Find or create chat for this auction
    const r = await fetch(`${API_URL}/api/chats`, { headers: authH() });
    if (!r.ok) {
      // Fall back: try to get/create per-auction chat
      showToast('Chat locked — win the auction first to chat', 'warn');
      return;
    }
    const data = await r.json();
    const chats = data.chats || [];
    const match = chats.find(c => c.auctionId === Number(auctionId));
    if (match) {
      chatPanelOpen = true;
      document.getElementById('chatPanel').style.display = 'flex';
      openChat(match.id);
    } else {
      showToast('No active chat yet — win the auction to chat with the seller', 'warn');
    }
  } catch (e) {
    showToast('Chat not available', 'warn');
  }
}
/* =================================================================
   NEST MART LAYOUT — New JS helpers (append at end of app.js)
   ================================================================= */

/* ---------- Sidebar category click ---------- */
function setCategoryFromSidebar(el, cat) {
  // Update active state on sidebar items
  document.querySelectorAll('.sb-cat-item').forEach(p => p.classList.remove('active'));
  document.querySelectorAll(`.sb-cat-item[data-cat="${cat}"]`).forEach(p => p.classList.add('active'));
  currentCategory = cat || '';
  // Sync top pill (legacy)
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
  const matchingPill = document.querySelector(`.filter-pill[data-cat="${cat}"]`);
  if (matchingPill) matchingPill.classList.add('active');
  loadAuctions();
  // Scroll popular auctions section into view (just below hero)
  const target = document.getElementById('popularAuctions');
  if (target) {
    const rect = target.getBoundingClientRect();
    const headerOffset = 80; // approx sticky header height
    window.scrollTo({ top: window.scrollY + rect.top - headerOffset, behavior: 'smooth' });
  } else {
    document.getElementById('auctionsList')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ---------- Price filter (sidebar) ---------- */
function applyPriceFilter() {
  const min = parseInt(document.getElementById('priceMin')?.value, 10) || 0;
  const max = parseInt(document.getElementById('priceMax')?.value, 10) || Infinity;
  const filtered = allAuctions.filter(a => a.basePrice >= min && a.basePrice <= max);
  const container = document.getElementById('auctionsList');
  if (!filtered.length) {
    container.innerHTML = '<div class="lot-empty">No auctions match your price range.</div>';
    document.getElementById('lotCount').textContent = '(0 found)';
    return;
  }
  container.innerHTML = filtered.map(a => renderLotCard(a)).join('');
  document.getElementById('lotCount').textContent = `(${filtered.length} of ${allAuctions.length} shown)`;
}

/* ---------- Condition filter (sidebar checkboxes) ---------- */
function applyConditionFilter() {
  const checked = Array.from(document.querySelectorAll('input[name="condition"]:checked')).map(c => c.value);
  if (!checked.length) {
    // No filter → show all
    const container = document.getElementById('auctionsList');
    container.innerHTML = allAuctions.map(a => renderLotCard(a)).join('');
    document.getElementById('lotCount').textContent = `(${allAuctions.length} found)`;
    return;
  }
  const filtered = allAuctions.filter(a => checked.includes(a.condition));
  const container = document.getElementById('auctionsList');
  container.innerHTML = filtered.map(a => renderLotCard(a)).join('');
  document.getElementById('lotCount').textContent = `(${filtered.length} of ${allAuctions.length} shown)`;
}

/* ---------- Sidebar: Latest 3 items ---------- */
async function loadSbNew() {
  try {
    const res = await fetch(`${API_URL}/api/auctions?sort=newest&limit=3`);
    const data = await res.json();
    const items = (data.auctions || []).slice(0, 3);
    const el = document.getElementById('sbNewList');
    if (!el) return;
    if (!items.length) {
      el.innerHTML = '<div class="sb-new-empty">No items yet</div>';
      return;
    }
    el.innerHTML = items.map(a => {
      const hasImg = a.images && a.images[0];
      const icon = getCatIcon(a.category);
      return `
        <div class="sb-new-card" onclick="viewAuction('${a.id}')">
          <div class="sb-new-img">
            ${hasImg ? `<img src="${escapeAttr(imgUrl(a.images[0]))}" alt="" onerror="this.style.display='none';this.parentElement.textContent='${icon}'">` : icon}
          </div>
          <div class="sb-new-info">
            <div class="sb-new-name">${escapeHtml(a.title)}</div>
            <div class="sb-new-price">৳ ${Number(a.basePrice).toLocaleString()}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) { console.error('loadSbNew', e); }
}

/* ---------- Hero Ending-Soon: 4 compact cards in hero right side ---------- */
async function loadHeroEndingSoon() {
  const el = document.getElementById('heroEndingSoon');
  if (!el) return;
  try {
    const res = await fetch(`${API_URL}/api/auctions?sort=ending&limit=4`);
    const data = await res.json();
    const items = (data.auctions || []).slice(0, 4);
    if (!items.length) {
      el.innerHTML = '<div class="hero-ending-skel">No deals ending soon.</div>';
      return;
    }
    el.innerHTML = items.map(a => {
      const icon = getCatIcon(a.category);
      const remain = parseRemaining(a.endsAt);
      const d = Math.max(0, Math.floor(remain / (24 * 3600 * 1000)));
      const h = Math.max(0, Math.floor((remain % (24 * 3600 * 1000)) / (3600 * 1000)));
      const m = Math.max(0, Math.floor((remain % (3600 * 1000)) / (60 * 1000)));
      const s = Math.max(0, Math.floor((remain % (60 * 1000)) / 1000));
      const timeStr = remain <= 0 ? 'Ended' : (d > 0 ? `${d}d ${h}h` : (h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`));
      return `
        <div class="hero-ending-card" onclick="viewAuction('${a.id}')" data-end="${a.endsAt}">
          <div class="hero-ending-icon">${icon}</div>
          <div class="hero-ending-title">${escapeHtml(a.title)}</div>
          <div class="hero-ending-price">৳ ${Number(a.basePrice).toLocaleString()}</div>
          <div class="hero-ending-time">⏱ <span data-d="${d}" data-h="${h}" data-m="${m}" data-s="${s}">${timeStr}</span></div>
        </div>
      `;
    }).join('');
    startHeroEndingCountdowns();
  } catch (e) { console.error('loadHeroEndingSoon', e); el.innerHTML = '<div class="hero-ending-skel">Failed to load.</div>'; }
}

let heroEndingInterval = null;
function startHeroEndingCountdowns() {
  if (heroEndingInterval) clearInterval(heroEndingInterval);
  heroEndingInterval = setInterval(() => {
    document.querySelectorAll('.hero-ending-time span').forEach(span => {
      let s = parseInt(span.dataset.s, 10) - 1;
      let m = parseInt(span.dataset.m, 10);
      let h = parseInt(span.dataset.h, 10);
      let d = parseInt(span.dataset.d, 10);
      if (s < 0) { s = 59; m--; }
      if (m < 0) { m = 59; h--; }
      if (h < 0) { h = 23; d--; }
      if (d < 0) { d = 0; h = 0; m = 0; s = 0; }
      span.dataset.d = d; span.dataset.h = h; span.dataset.m = m; span.dataset.s = s;
      const remain = ((d * 24 + h) * 60 + m) * 60 * 1000 + s * 1000;
      if (remain <= 0) { span.textContent = 'Ended'; return; }
      const timeStr = d > 0 ? `${d}d ${h}h` : (h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`);
      span.textContent = timeStr;
    });
  }, 1000);
}
function stopHeroEndingCountdowns() { if (heroEndingInterval) { clearInterval(heroEndingInterval); heroEndingInterval = null; } }

/* ---------- Deals Of The Day: 4 ending-soon with countdown ---------- */
async function loadDealsGrid() {
  try {
    const res = await fetch(`${API_URL}/api/auctions?sort=ending&limit=4`);
    const data = await res.json();
    const items = (data.auctions || []).slice(0, 4);
    const el = document.getElementById('dealsGrid');
    if (!el) return;
    if (!items.length) {
      el.innerHTML = '<div class="lot-empty">No ending-soon deals right now.</div>';
      return;
    }
    el.innerHTML = items.map((a, idx) => {
      const hasImg = a.images && a.images[0];
      const icon = getCatIcon(a.category);
      const t = getTimeLeft(a.endsAt);
      const tl = parseRemaining(a.endsAt);
      const d = Math.max(0, Math.floor(tl / (24 * 3600 * 1000)));
      const h = Math.max(0, Math.floor((tl % (24 * 3600 * 1000)) / (3600 * 1000)));
      const m = Math.max(0, Math.floor((tl % (3600 * 1000)) / (60 * 1000)));
      const s = Math.max(0, Math.floor((tl % (60 * 1000)) / 1000));
      return `
        <div class="lot-card deal-card" onclick="viewAuction('${a.id}')" data-end="${a.endsAt}">
          <div class="lot-img-area">
            ${hasImg
              ? `<img src="${escapeAttr(imgUrl(a.images[0]))}" alt="" class="lot-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
              : ''}
            <span class="lot-img-fallback"${hasImg ? ' style="display:none"' : ''}>${icon}</span>
            <span class="lot-badge cond-${(a.condition||'good').toLowerCase().replace(' ','')}">${escapeHtml(a.condition||'Good')}</span>
            <span class="deal-flame">🔥 Hot Deal</span>
          </div>
          <div class="lot-body">
            <p class="lot-title">${escapeHtml(a.title)}</p>
            <div class="deal-countdown" data-d="${d}" data-h="${h}" data-m="${m}" data-s="${s}">
              <div class="cd-cell"><b>${d}</b><span>Days</span></div>
              <div class="cd-cell"><b>${String(h).padStart(2,'0')}</b><span>Hrs</span></div>
              <div class="cd-cell"><b>${String(m).padStart(2,'0')}</b><span>Min</span></div>
              <div class="cd-cell"><b>${String(s).padStart(2,'0')}</b><span>Sec</span></div>
            </div>
            <div class="lot-prices">
              <div>
                <p class="lot-price-base-label">Base</p>
                <p class="lot-price-base">৳ ${Number(a.basePrice).toLocaleString()}</p>
              </div>
              <div style="text-align:right">
                <p class="lot-price-top-label">Top Bid</p>
                ${a.currentMaxBid
                  ? `<p class="lot-price-top">৳ ${Number(a.currentMaxBid).toLocaleString()}</p>`
                  : `<p class="lot-price-none">— none</p>`}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    startDealCountdowns();
  } catch (e) { console.error('loadDealsGrid', e); }
}

let dealCountdownInterval = null;
function startDealCountdowns() {
  stopDealCountdowns();
  dealCountdownInterval = setInterval(() => {
    document.querySelectorAll('.deal-countdown').forEach(cd => {
      let s = parseInt(cd.dataset.s, 10) - 1;
      let m = parseInt(cd.dataset.m, 10);
      let h = parseInt(cd.dataset.h, 10);
      let d = parseInt(cd.dataset.d, 10);
      if (s < 0) { s = 59; m--; }
      if (m < 0) { m = 59; h--; }
      if (h < 0) { h = 23; d--; }
      if (d < 0) { d = 0; h = 0; m = 0; s = 0; }
      cd.dataset.d = d; cd.dataset.h = h; cd.dataset.m = m; cd.dataset.s = s;
      const cells = cd.querySelectorAll('.cd-cell b');
      if (cells.length === 4) {
        cells[0].textContent = d;
        cells[1].textContent = String(h).padStart(2,'0');
        cells[2].textContent = String(m).padStart(2,'0');
        cells[3].textContent = String(s).padStart(2,'0');
      }
    });
  }, 1000);
}
function stopDealCountdowns() {
  if (dealCountdownInterval) { clearInterval(dealCountdownInterval); dealCountdownInterval = null; }
}

/* ---------- 4-column: Top Selling / Trending / Recently Added / Top Rated ---------- */
async function loadFourColSections() {
  try {
    // Real data-driven sorts (sortMap keys: top-selling, trending, newest, top-rated)
    const [topSelling, trending, recent, topRated] = await Promise.all([
      fetch(`${API_URL}/api/auctions?sort=top-selling&limit=3`).then(r => r.json()).then(d => flattenAuctions(d.auctions || [])),
      fetch(`${API_URL}/api/auctions?sort=trending&limit=3`).then(r => r.json()).then(d => flattenAuctions(d.auctions || [])),
      fetch(`${API_URL}/api/auctions?sort=newest&limit=3`).then(r => r.json()).then(d => flattenAuctions(d.auctions || [])),
      fetch(`${API_URL}/api/auctions?sort=top-rated&limit=3`).then(r => r.json()).then(d => flattenAuctions(d.auctions || [])),
    ]);
    renderFcList('fcTopSelling', topSelling);
    renderFcList('fcTrending', trending);
    renderFcList('fcRecent', recent);
    renderFcList('fcTopRated', topRated);
  } catch (e) { console.error('loadFourColSections', e); }
}

// Normalize API response: _count.bids → bidCount, ensure viewCount default
function flattenAuctions(arr) {
  return (arr || []).map(a => ({
    ...a,
    bidCount: a._count?.bids ?? a.bidCount ?? 0,
    viewCount: a.viewCount ?? 0,
    sellerRating: a.seller?.rating ?? 0
  }));
}

function renderFcList(id, items) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!items || !items.length) {
    el.innerHTML = '<div class="fc-empty">No items</div>';
    return;
  }
  el.innerHTML = items.map(a => {
    const hasImg = a.images && a.images[0];
    const icon = getCatIcon(a.category);
    return `
      <div class="fc-item" onclick="viewAuction('${a.id}')">
        <div class="fc-img">
          ${hasImg ? `<img src="${escapeAttr(imgUrl(a.images[0]))}" alt="" onerror="this.style.display='none';this.parentElement.textContent='${icon}'">` : icon}
        </div>
        <div class="fc-info">
          <div class="fc-name">${escapeHtml(a.title)}</div>
          <div class="fc-price-row">
            <span class="fc-price">৳ ${Number(a.basePrice).toLocaleString()}</span>
            ${a.currentMaxBid ? `<span class="fc-was">৳ ${Number(a.currentMaxBid).toLocaleString()}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/* ---------- Sidebar: category counts ---------- */
function updateSidebarCategoryCounts() {
  const counts = {};
  allAuctions.forEach(a => { counts[a.category] = (counts[a.category] || 0) + 1; });
  const all = document.getElementById('catCountAll');
  if (all) all.textContent = allAuctions.length;
  ['Electronics','Computer','Cookeries','Furniture','Vehicles','Fashion','Sports','Other'].forEach(cat => {
    const el = document.getElementById('catCount' + cat);
    if (el) el.textContent = counts[cat] || 0;
  });
  // Condition counts
  const condCounts = {};
  allAuctions.forEach(a => { condCounts[a.condition] = (condCounts[a.condition] || 0) + 1; });
  const us = document.getElementById('condUsed'); if (us) us.textContent = condCounts['Used'] || 0;
  const nw = document.getElementById('condNew');  if (nw) nw.textContent = condCounts['New'] || 0;
}

/* ---------- Tweak renderAuctions to also call new helpers ---------- */
const _origRenderAuctions = renderAuctions;
renderAuctions = function(auctions) {
  _origRenderAuctions(auctions);
  updateSidebarCategoryCounts();
  // Sidebar New Products reflects current category filter
  loadSbNew();
  // 4-col sections
  loadFourColSections();
};

/* ---------- Auto-load deals grid + 4-col on init ---------- */
const _origInit = init;
init = async function() {
  await _origInit();
  // After main load completes, populate deals grid (uses ending-soon sort)
  loadDealsGrid();
  // Hero right-side ending-soon mini cards
  loadHeroEndingSoon();
};

/* ---------- Header dropdown sync: keep headerCategorySelect in sync with currentCategory ---------- */
const _origSetCategory = setCategory;
setCategory = function(el, cat) {
  _origSetCategory(el, cat);
  const header = document.getElementById('headerCategorySelect');
  if (header) header.value = cat || '';
  // sync sidebar active state
  document.querySelectorAll('.sb-cat-item').forEach(p => p.classList.remove('active'));
  document.querySelectorAll(`.sb-cat-item[data-cat="${cat||''}"]`).forEach(p => p.classList.add('active'));
};

/* ---------- Header dropdown change → trigger setCategory ---------- */
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'headerCategorySelect') {
    setCategoryFromSidebar(document.querySelector('.sb-cat-item.active') || document.querySelector('.sb-cat-item'), e.target.value);
  }
});

// ============================================================
// PAGE-REFRESH TEXT REVEAL (hero stat labels & titles)
// ============================================================
function applyTextReveal() {
  document.querySelectorAll('.hero-stat, .section-title, .view-header h1').forEach(group => {
    if (group.dataset.revealApplied) return;
    group.dataset.revealApplied = '1';
    const targets = group.children.length > 0 ? Array.from(group.children) : [group];
    targets.forEach((el, i) => {
      el.classList.add('text-reveal');
      el.style.animationDelay = (i * 0.1) + 's';
    });
  });
}

// ============================================================
// SCROLL FADE-IN (cards reveal as user scrolls)
// ============================================================
let __scrollObserver = null;
function applyScrollReveal() {
  if (!('IntersectionObserver' in window)) {
    // Fallback: just reveal everything
    document.querySelectorAll('.reveal, .lot-card, .seller-card, .four-col-card, .deals-card, section').forEach(el => el.classList.add('visible'));
    return;
  }
  if (!__scrollObserver) {
    __scrollObserver = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          __scrollObserver.unobserve(e.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -20px 0px' });
  }
  // Broad selector list — covers hero, sections, cards, sidebar, modal panels, view containers, footer
  const sel = [
    '.lot-card', '.seller-card', '.four-col-card', '.deals-card',
    'section', 'aside', 'footer',
    '.sidebar', '.catsidebar', '.filter-bar',
    '.lot-section', '.view-section',
    '.modal-content', '.toast'
  ].join(', ');
  document.querySelectorAll(sel).forEach(el => {
    if (el.classList.contains('reveal-applied')) return;
    el.classList.add('reveal-applied');
    if (el.classList.contains('reveal')) return;       // already has it
    el.classList.add('reveal');
    // Already on-screen at load? Reveal immediately.
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) {
      // Already visible — add .visible after a microtask so the transition plays
      setTimeout(() => el.classList.add('visible'), 50);
      __scrollObserver.unobserve(el);
    } else {
      __scrollObserver.observe(el);
    }
  });
}

// Hook into render cycle
const __origLoadAuctions = window.loadAuctions;
if (typeof __origLoadAuctions === 'function') {
  window.loadAuctions = async function(...args) {
    const r = await __origLoadAuctions.apply(this, args);
    setTimeout(() => { applyTextReveal(); applyScrollReveal(); }, 50);
    return r;
  };
}
const __origLoadFourCol = window.loadFourColSections;
if (typeof __origLoadFourCol === 'function') {
  window.loadFourColSections = async function(...args) {
    const r = await __origLoadFourCol.apply(this, args);
    setTimeout(() => { applyScrollReveal(); }, 50);
    return r;
  };
}
// Initial reveal pass on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => { applyTextReveal(); applyScrollReveal(); }, 100);
});
