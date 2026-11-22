/* MALABAR CRUNCH — Wholesale & Retail Manager
   Offline-first PWA. Data: IndexedDB (device) ⇄ Firebase Realtime Database (REST). */
(function () {
  "use strict";

  /* =====================================================================
     1. CONFIG
     ===================================================================== */
  const CFG = {
    DB: "https://malabercrunch-default-rtdb.asia-southeast1.firebasedatabase.app",
    ROOT: "malabar-crunch-v1",
    IDB: "malabar-crunch",
    SYNC_DEBOUNCE: 1200,
    POLL_MS: 45000,
    AUTOLOCK_MS: 5 * 60 * 1000,
    MAX_TRIES: 5,
    LOCK_MS: 30000
  };
  const COLS = ["items", "suppliers", "customers", "purchases", "sales", "payments", "settings"];
  const BACKUP_COLS = ["items", "suppliers", "customers", "purchases", "sales", "payments"];

  const DEFAULT_ITEMS = [
    ["Banana Chips (കായ വറുത്തത്)", 360], ["Sharkara Varatti (ശർക്കര വരട്ടി)", 340], ["Special Mixture (മിക്സ്ചർ)", 240],
    ["Murukku (മുറുക്ക്)", 220], ["Tapioca Chips (കപ്പ വറുത്തത്)", 200], ["Jackfruit Chips (ചക്ക വറുത്തത്)", 420],
    ["Achappam (അച്ചപ്പം)", 260], ["Kuzhalappam (കുഴലപ്പം)", 280], ["Unniyappam (ഉണ്ണിയപ്പം)", 250],
    ["Laddu (ലഡു)", 240], ["Jalebi (ജിലേബി)", 220], ["Black Halwa (കറുത്ത ഹൽവ)", 260],
    ["Peanut Candy (കടലമിഠായി)", 210], ["Ellunda (എള്ളുണ്ട)", 240], ["Spicy Boondi (ബൂന്ദി)", 230]
  ];

  const PERMS = [
    ["showDashboard", "ഡാഷ്‌ബോർഡ് കാണിക്കുക", "പ്രധാന കണക്കുകളും സംഗ്രഹവും കാണാൻ"],
    ["showProfit", "ലാഭ കണക്കുകൾ കാണിക്കുക", "ദിവസ/മാസ ലാഭം പാർട്ണർക്ക് കാണണോ?"],
    ["showPurchase", "പർച്ചേസ് വിഭാഗം കാണിക്കുക", "സാധനങ്ങൾ വാങ്ങുന്ന ഭാഗം കാണാൻ"],
    ["showPurchaseRates", "വാങ്ങുന്ന വില കാണിക്കുക", "സപ്ലയർ വിലയും ആകെ പർച്ചേസ് തുകയും കാണാൻ"],
    ["showSales", "സെയിൽസ് & ബിൽ കാണിക്കുക", "കടകളിലേക്ക് ബിൽ അടിക്കാൻ"],
    ["showShops", "കടകളും കടവും കാണിക്കുക", "കടകളുടെ ലിസ്റ്റും കടം പിരിവും"],
    ["showReports", "മാസ റിപ്പോർട്ട് കാണിക്കുക", "പ്രതിമാസ റിപ്പോർട്ട് കാണാൻ"],
    ["allowDelete", "ഡിലീറ്റ് ചെയ്യാൻ അനുവദിക്കുക", "ബിൽ/പർച്ചേസ്/കടകൾ നീക്കം ചെയ്യാൻ"],
    ["showBackup", "ബാക്കപ്പ് ഓപ്ഷൻ കാണിക്കുക", "ബാക്കപ്പ് എടുക്കാനും ഡൗൺലോഡ് ചെയ്യാനും"]
  ];

  /* =====================================================================
     2. HELPERS
     ===================================================================== */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const h = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const pad = (n) => String(n).padStart(2, "0");
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const uid = (p) => p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clean = (s) => String(s || "").normalize("NFC").trim().replace(/\s+/g, " ");
  const norm = (s) => clean(s).toLowerCase();
  const money = (n) => "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const kgFmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  // Local calendar date (NOT UTC) — fixes wrong "today" in India before 5:30 AM
  const isoOf = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const todayIso = () => isoOf(new Date());
  const monthNow = () => todayIso().slice(0, 7);
  const parseIso = (iso) => { const p = String(iso || "").split("-").map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); };
  const MONTHS = ["ജനുവരി", "ഫെബ്രുവരി", "മാർച്ച്", "ഏപ്രിൽ", "മേയ്", "ജൂൺ", "ജൂലൈ", "ഓഗസ്റ്റ്", "സെപ്റ്റംബർ", "ഒക്ടോബർ", "നവംബർ", "ഡിസംബർ"];
  const WD = ["ഞായർ", "തിങ്കൾ", "ചൊവ്വ", "ബുധൻ", "വ്യാഴം", "വെള്ളി", "ശനി"];
  const fmtDate = (iso) => { const d = parseIso(iso); return d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear(); };
  const fmtDay = (iso) => { const d = parseIso(iso); return d.getDate() + " " + MONTHS[d.getMonth()] + ", " + WD[d.getDay()]; };
  const fmtMonth = (k) => { const p = String(k).split("-").map(Number); return MONTHS[(p[1] || 1) - 1] + " " + p[0]; };
  const initial = (s) => { const t = clean(s) || "?"; return (typeof Intl !== "undefined" && Intl.Segmenter) ? (Array.from(new Intl.Segmenter("ml", { granularity: "grapheme" }).segment(t), (x) => x.segment)[0] || "?") : Array.from(t)[0]; };
  const segs = (s) => (typeof Intl !== "undefined" && Intl.Segmenter) ? Array.from(new Intl.Segmenter("ml", { granularity: "grapheme" }).segment(s), (x) => x.segment) : Array.from(s);

  function cyrb53(str, seed) {
    seed = seed || 0;
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  const pinHash = (pin) => String(cyrb53("mc-pin:" + pin));

  const ICON = (() => {
    const p = {
      grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
      receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2V3zM9 8h6M9 12h6"/>',
      cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6"/>',
      store: '<path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3M10 20v-5h4v5"/>',
      chart: '<path d="M3 3v18h18M8 17v-6M13 17V7M18 17v-9"/>',
      shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4"/>',
      lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
      trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
      x: '<path d="M18 6 6 18M6 6l12 12"/>',
      check: '<path d="M5 12l5 5 9-10"/>',
      phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
      msg: '<path d="M21 11.5a8.4 8.4 0 0 1-12.5 7.3L3 20l1.3-5A8.4 8.4 0 1 1 21 11.5z"/>',
      download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
      upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
      print: '<path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z"/>',
      file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6"/>',
      book: '<path d="M4 4h12a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4zM4 17a3 3 0 0 1 3-3h12"/>',
      refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8M18 2v4h-4M6 22v-4h4"/>',
      delete: '<path d="M21 4H8l-6 8 6 8h13a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zM18 9l-6 6M12 9l6 6"/>',
      phone2: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>'
    };
    const o = {};
    Object.keys(p).forEach((k) => { o[k] = '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p[k] + "</svg>"; });
    return o;
  })();

  /* =====================================================================
     3. STATE & LOCAL PERSISTENCE
     ===================================================================== */
  function defaultSettings() {
    return {
      id: "main", updatedAt: 0,
      adminHash: pinHash("1234"), staffHash: pinHash("0000"),
      backupTime: "08:00",
      biz: { name: "MALABAR CRUNCH", tag: "WHOLESALE & RETAIL", place: "NANIYOOR NAMBRAM", phone: "9847058980" },
      perms: { showDashboard: true, showProfit: false, showPurchase: true, showPurchaseRates: false, showSales: true, showShops: true, showReports: false, allowDelete: false, showBackup: true }
    };
  }
  function defaultState() {
    const items = {};
    DEFAULT_ITEMS.forEach((it, i) => { const id = "it" + (i + 1); items[id] = { id, name: it[0], defaultPrice: it[1], order: i + 1, deleted: false, updatedAt: 0 }; });
    return {
      v: 1,
      data: { items, suppliers: {}, customers: {}, purchases: {}, sales: {}, payments: {}, settings: { main: defaultSettings() } },
      dirty: {},
      lastSync: 0,
      lastAutoBackup: "",
      lock: { n: 0, until: 0 }
    };
  }
  let state = defaultState();
  let session = null; // { role: 'admin' | 'staff' }
  let ui = { tab: "dashboard", dDate: todayIso(), dMonth: monthNow(), pMonth: monthNow(), pSearch: "", sMonth: monthNow(), sSearch: "", rMonth: monthNow(), editSale: null, editPurchase: null };
  let pin = "";
  let persistTimer = null, dbPromise = null;

  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  function idb() {
    if (!dbPromise) {
      dbPromise = new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error("no idb"));
        const q = indexedDB.open(CFG.IDB, 1);
        q.onupgradeneeded = () => q.result.createObjectStore("kv");
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      });
    }
    return dbPromise;
  }
  async function idbGet(k) { const db = await withTimeout(idb(), 2500); return new Promise((res, rej) => { const r = db.transaction("kv", "readonly").objectStore("kv").get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  async function idbSet(k, v) { const db = await withTimeout(idb(), 2500); return new Promise((res, rej) => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }

  async function loadState() {
    const base = defaultState();
    let saved = null;
    try { saved = await withTimeout(idbGet("state"), 3000); } catch (e) { /* ignore */ }
    if (!saved) { try { const raw = localStorage.getItem("mc_state_v1"); if (raw) saved = JSON.parse(raw); } catch (e) { /* ignore */ } }
    if (saved && typeof saved === "object" && saved.data) {
      state = Object.assign(base, saved);
      COLS.forEach((c) => { if (!state.data[c] || typeof state.data[c] !== "object") state.data[c] = base.data[c]; });
      if (!state.data.settings.main) state.data.settings.main = defaultSettings();
      if (!state.dirty) state.dirty = {};
      if (!state.lock) state.lock = { n: 0, until: 0 };
    }
  }
  function persist() { clearTimeout(persistTimer); persistTimer = setTimeout(persistNow, 250); }
  async function persistNow() {
    clearTimeout(persistTimer);
    try { await withTimeout(idbSet("state", JSON.parse(JSON.stringify(state))), 4000); }
    catch (e) { try { localStorage.setItem("mc_state_v1", JSON.stringify(state)); } catch (e2) { /* full */ } }
  }

  /* =====================================================================
     4. DATA ACCESS & BUSINESS LOGIC
     ===================================================================== */
  const S = () => state.data.settings.main;
  const live = (col) => Object.values(state.data[col]).filter((r) => r && !r.deleted);
  const byId = (col, id) => { const r = state.data[col][id]; return r && !r.deleted ? r : null; };
  const can = (k) => !!session && (session.role === "admin" || !!S().perms[k]);
  const isAdmin = () => !!session && session.role === "admin";

  function save(col, rec) {
    rec.updatedAt = Date.now();
    state.data[col][rec.id] = rec;
    state.dirty[col + "/" + rec.id] = 1;
    persist();
    scheduleSync();
    return rec;
  }
  function softDelete(col, id) { const r = state.data[col][id]; if (r) { r.deleted = true; save(col, r); } }

  const sortedItems = () => live("items").sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
  const byName = (a, b) => a.name.localeCompare(b.name, "ml");

  // Outstanding credit of a customer. Optionally ignore one invoice (used while editing it).
  function balanceOf(shopId, exceptSaleId) {
    const c = state.data.customers[shopId];
    let t = c ? num(c.openingCredit) : 0;
    live("sales").forEach((s) => { if (s.shopId === shopId && s.id !== exceptSaleId) t += num(s.credit); });
    live("payments").forEach((p) => { if (p.shopId === shopId) t -= num(p.amount); });
    return r2(t);
  }
  const supplierPayable = (id) => r2(live("purchases").filter((p) => p.shopId === id && p.status === "Unpaid").reduce((a, p) => a + num(p.total), 0));

  function nextBillNo() {
    let max = 1000;
    live("sales").forEach((s) => { const m = /^MC-(\d+)$/.exec(s.billNo || ""); if (m) max = Math.max(max, parseInt(m[1], 10)); });
    return "MC-" + (max + 1);
  }
  // Two devices may create the same bill number offline — renumber the later one deterministically.
  function fixDuplicateBills() {
    const groups = {};
    live("sales").forEach((s) => { (groups[s.billNo] = groups[s.billNo] || []).push(s); });
    let changed = false;
    Object.keys(groups).forEach((no) => {
      const g = groups[no];
      if (g.length < 2) return;
      g.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || (a.id < b.id ? -1 : 1));
      g.slice(1).forEach((s) => { s.billNo = nextBillNo(); save("sales", s); changed = true; });
    });
    return changed;
  }

  const salesOn = (d) => live("sales").filter((s) => s.date === d);
  const salesIn = (m) => live("sales").filter((s) => (s.date || "").startsWith(m));
  const purchasesOn = (d) => live("purchases").filter((p) => p.date === d);
  const purchasesIn = (m) => live("purchases").filter((p) => (p.date || "").startsWith(m));
  const sumBy = (arr, f) => arr.reduce((a, x) => a + num(f(x)), 0);
  const kgOf = (sales) => sumBy(sales, (s) => sumBy(s.items || [], (i) => i.kg));
  const collectedOn = (d) => r2(sumBy(salesOn(d), (s) => s.paidAmount) + sumBy(live("payments").filter((p) => p.date === d), (p) => p.amount));

  function lineAmount(nos, kg, price) { return r2((kg > 0 ? kg : nos) * price); }

  /* =====================================================================
     5. FIREBASE SYNC
     ===================================================================== */
  let syncing = false, syncTimer = null, syncState = "idle", syncErr = "";
  const online = () => navigator.onLine !== false;
  const pending = () => Object.keys(state.dirty).length;
  const url = (path) => CFG.DB.replace(/\/+$/, "") + "/" + CFG.ROOT + (path ? "/" + path : "") + ".json";

  async function fetchRoot() {
    const r = await fetch(url(""), { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  function mergeRemote(root) {
    if (!root) return false;
    let changed = false;
    COLS.forEach((col) => {
      const rc = root[col];
      if (!rc || typeof rc !== "object") return;
      Object.keys(rc).forEach((id) => {
        const rv = rc[id];
        if (!rv || typeof rv !== "object") return;
        const lv = state.data[col][id];
        if (!lv || (rv.updatedAt || 0) > (lv.updatedAt || 0)) {
          state.data[col][id] = rv;
          delete state.dirty[col + "/" + id];
          changed = true;
        }
      });
    });
    return changed;
  }
  async function push() {
    const keys = Object.keys(state.dirty);
    for (let i = 0; i < keys.length; i += 4) {
      await Promise.all(keys.slice(i, i + 4).map(async (k) => {
        const [col, id] = k.split("/");
        const rec = state.data[col] && state.data[col][id];
        if (!rec) { delete state.dirty[k]; return; }
        const stamp = rec.updatedAt;
        const r = await fetch(url(k), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const now = state.data[col][id];
        if (now && now.updatedAt === stamp) delete state.dirty[k];
      }));
    }
  }
  function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(false), CFG.SYNC_DEBOUNCE); updateStatus(); }

  async function sync(manual) {
    if (syncing) return manual ? "busy" : undefined;
    if (!online()) { updateStatus(); return "offline"; }
    syncing = true; syncState = "busy"; syncErr = ""; updateStatus();
    let changed = false;
    try { await push(); } catch (e) { syncErr = String((e && e.message) || e); }
    try { changed = mergeRemote(await fetchRoot()); } catch (e) { syncErr = syncErr || String((e && e.message) || e); }
    if (!syncErr) {
      state.lastSync = Date.now(); syncState = "ok";
      if (fixDuplicateBills()) changed = true;
      if (changed) { try { await push(); } catch (e) { /* retry next time */ } }
    } else { syncState = "err"; }
    syncing = false;
    persist(); updateStatus();
    if (changed) softRefresh();
    return syncState;
  }

  function statusText() {
    const n = pending();
    if (!online()) return ["off", "ഓഫ്‌ലൈൻ" + (n ? " • " + n + " മാറ്റം അയക്കാനുണ്ട്" : " • ഫോണിൽ സേവ് ആകുന്നു")];
    if (syncState === "busy") return ["busy", "സിങ്ക് ചെയ്യുന്നു…"];
    if (syncState === "err") return ["err", "സെർവർ ലഭ്യമല്ല (" + syncErr + ")" + (n ? " • " + n + " മാറ്റം പിന്നീട് അയക്കും" : "")];
    if (n) return ["", "ഓൺലൈൻ • " + n + " മാറ്റം അയക്കാനുണ്ട്"];
    return ["", "ഓൺലൈൻ • സിങ്ക് പൂർത്തിയായി"];
  }
  function updateStatus() {
    const d = $("#syncDot"), t = $("#syncText");
    if (!d || !t) return;
    const s = statusText();
    d.className = "dot " + s[0];
    t.textContent = s[1];
  }

  /* =====================================================================
     6. UI PLUMBING: toast, modal
     ===================================================================== */
  let toastTimer = null;
  function toast(msg, kind) {
    const el = $("#toast");
    el.textContent = msg;
    el.className = "toast" + (kind ? " " + kind : "");
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3400);
  }
  let modal = null;
  function openModal(m) {
    modal = m;
    renderModal();
    if (m.focus !== false) { const f = $("#modalRoot input:not([readonly]), #modalRoot select"); if (f) setTimeout(() => f.focus(), 60); }
  }
  function closeModal() { modal = null; renderModal(); }
  function renderModal() {
    const root = $("#modalRoot");
    if (!modal) { root.innerHTML = ""; return; }
    root.innerHTML = '<div class="overlay" data-act="modal-bg"><div class="sheet' + (modal.wide ? " wide" : "") + '" role="dialog" aria-modal="true"><h3>' + h(modal.title) + "</h3>" +
      (modal.text ? '<p class="t">' + h(modal.text) + "</p>" : "") + (modal.body || "") + '<p id="modalErr" class="neg" style="margin:0;font-size:.78rem;font-weight:700" hidden></p>' +
      (modal.footer ? modal.footer : '<div class="acts"><button type="button" class="btn ghost" data-act="modal-cancel">റദ്ദാക്കുക</button><button type="button" class="btn ' + (modal.danger ? "danger" : "") + '" data-act="modal-ok">' + h(modal.ok || "സേവ്") + "</button></div>") + "</div></div>";
  }
  const mv = (id) => { const e = document.getElementById("mf_" + id); return e ? (e.type === "checkbox" ? e.checked : e.value) : ""; };
  function modalErr(msg) { const e = $("#modalErr"); if (e) { e.textContent = msg; e.hidden = false; } return false; }
  function confirmBox(title, text, okLabel, fn) { openModal({ title, text, ok: okLabel, danger: true, focus: false, onOk: fn }); }

  /* =====================================================================
     7. LOGIN
     ===================================================================== */
  function loginView() {
    const b = S().biz;
    const dots = [0, 1, 2, 3].map((i) => '<i class="' + (i < pin.length ? "on" : "") + '"></i>').join("");
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => '<button type="button" data-act="pin" data-k="' + k + '">' + k + "</button>").join("");
    return '<div class="login"><div class="login-card"><div class="login-head"><div class="logo">MC</div><h1>' + h(b.name) + '</h1><div class="tag">' + h(b.tag) + '</div><div class="loc">📍 ' + h(b.place) + " • 📞 " + h(b.phone) + "</div></div>" +
      '<div class="login-body"><h2>സുരക്ഷാ പിൻ നൽകുക</h2><p>അഡ്മിൻ അല്ലെങ്കിൽ പാർട്ണർ പിൻ ടൈപ്പ് ചെയ്യുക</p><div class="dots" id="dots">' + dots + '</div><div class="pin-err" id="pinErr"></div>' +
      '<div class="pad">' + keys + '<button type="button" class="sec" data-act="pin-clear">CLEAR</button><button type="button" data-act="pin" data-k="0">0</button><button type="button" class="sec2" data-act="pin-back" aria-label="Backspace">' + ICON.delete + "</button></div>" +
      '<div class="sync-note"><span class="dot ' + statusText()[0] + '" id="syncDot"></span><span id="syncText">' + h(statusText()[1]) + "</span></div></div></div></div>";
  }
  function updateDots() { const d = $("#dots"); if (d) d.innerHTML = [0, 1, 2, 3].map((i) => '<i class="' + (i < pin.length ? "on" : "") + '"></i>').join(""); }
  function pinMsg(msg) { const e = $("#pinErr"); if (e) e.textContent = msg || ""; }

  async function verifyPin() {
    const entered = pin;
    const now = Date.now();
    if (state.lock.until > now) { pin = ""; updateDots(); pinMsg("കുറച്ച് സമയത്തിന് ശേഷം ശ്രമിക്കുക (" + Math.ceil((state.lock.until - now) / 1000) + " സെക്കൻഡ്)"); return; }
    // First run on a new device: fetch the shared settings (PINs) before checking
    if (!state.lastSync && online()) { pinMsg("പരിശോധിക്കുന്നു…"); try { await withTimeout(sync(true), 8000); } catch (e) { /* use local */ } pinMsg(""); }
    const hs = pinHash(entered);
    let role = null;
    if (hs === S().adminHash) role = "admin"; else if (hs === S().staffHash) role = "staff";
    if (role) {
      state.lock = { n: 0, until: 0 }; persist();
      pin = ""; session = { role };
      ui.tab = firstTab();
      autoBackupCheck();
      render();
      toast(role === "admin" ? "സ്വാഗതം അഡ്മിൻ" : "സ്വാഗതം പാർട്ണർ");
      sync(false);
      return;
    }
    state.lock.n++;
    if (state.lock.n >= CFG.MAX_TRIES) { state.lock = { n: 0, until: Date.now() + CFG.LOCK_MS }; pinMsg("5 തവണ തെറ്റി. 30 സെക്കൻഡ് കാത്തിരിക്കുക."); }
    else pinMsg("തെറ്റായ പിൻ! (" + (CFG.MAX_TRIES - state.lock.n) + " ശ്രമങ്ങൾ ബാക്കി)");
    persist();
    pin = ""; updateDots();
    const d = $("#dots"); if (d) { d.classList.remove("shake"); void d.offsetWidth; d.classList.add("shake"); }
  }
  function logout() { session = null; pin = ""; modal = null; renderModal(); render(); }

  /* =====================================================================
     8. SHELL & TABS
     ===================================================================== */
  const TABS = [
    ["dashboard", "ഡാഷ്‌ബോർഡ്", "grid", () => can("showDashboard")],
    ["sales", "സെയിൽസ്", "receipt", () => can("showSales")],
    ["purchase", "പർച്ചേസ്", "cart", () => can("showPurchase")],
    ["shops", "കടകൾ", "store", () => can("showShops")],
    ["reports", "റിപ്പോർട്ട്", "chart", () => can("showReports")],
    ["admin", "അഡ്മിൻ", "shield", () => isAdmin() || can("showBackup")]
  ];
  const visibleTabs = () => TABS.filter((t) => t[3]());
  const firstTab = () => (visibleTabs()[0] || TABS[0])[0];

  function render() {
    const root = $("#root");
    if (!session) { root.innerHTML = loginView(); return; }
    const b = S().biz;
    const tabs = visibleTabs();
    if (!tabs.some((t) => t[0] === ui.tab)) ui.tab = firstTab();
    const st = statusText();
    root.innerHTML =
      '<header class="header"><div class="header-in"><div class="brand"><div class="logo">MC</div><div style="min-width:0"><b>' + h(b.name) + '<span class="role ' + (isAdmin() ? "" : "staff") + '">' + (isAdmin() ? "👑 ADMIN" : "🤝 PARTNER") + "</span></b><small>" + h(b.tag) + " • " + h(b.place) + " • " + h(b.phone) + "</small></div></div>" +
      '<div class="hbtns"><button type="button" class="hb" data-act="install" id="btnInstall">' + ICON.phone2 + '<span class="hide-s">ഇൻസ്റ്റാൾ</span></button><button type="button" class="hb red" data-act="logout">' + ICON.lock + "<span>ലോക്ക്</span></button></div></div>" +
      '<div class="statusbar"><span class="dot ' + st[0] + '" id="syncDot"></span><span id="syncText">' + h(st[1]) + "</span></div>" +
      '<nav class="topnav"><div class="topnav-in">' + tabs.map((t) => '<button type="button" data-act="tab" data-tab="' + t[0] + '" class="' + (ui.tab === t[0] ? "on" : "") + '">' + ICON[t[2]] + t[1] + "</button>").join("") + "</div></nav></header>" +
      '<main class="main" id="app">' + tabHtml() + "</main>" +
      '<nav class="bottom">' + tabs.map((t) => '<button type="button" data-act="tab" data-tab="' + t[0] + '" class="' + (ui.tab === t[0] ? "on" : "") + '">' + ICON[t[2]] + "<span>" + t[1] + "</span></button>").join("") + "</nav>";
    postRender();
    const inst = $("#btnInstall"); if (inst) inst.hidden = isStandalone();
  }
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  function tabHtml() {
    switch (ui.tab) {
      case "sales": return salesView();
      case "purchase": return purchaseView();
      case "shops": return shopsView();
      case "reports": return reportsView();
      case "admin": return adminView();
      default: return dashboardView();
    }
  }
  function postRender() {
    if (ui.tab === "sales") initSalesForm();
    if (ui.tab === "purchase") initPurchaseForm();
  }
  // Re-render after background sync without destroying a form the user is typing in
  function softRefresh() {
    if (!session) return;
    if (modal) return;
    const a = document.activeElement;
    const typing = a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && $("#app") && $("#app").contains(a);
    if (ui.tab === "sales" || ui.tab === "purchase") {
      const el = $("#liveList"); if (el) el.innerHTML = ui.tab === "sales" ? salesListInner() : purchaseListInner();
      if (!typing) refreshShopSelects();
      return;
    }
    if (typing) return;
    const y = window.scrollY; render(); window.scrollTo(0, y);
  }

  const emptyBox = (t) => '<div class="empty">' + h(t) + "</div>";
  const dateRow = (label, id, val, act) => '<label class="f">' + label + '<input class="in sm" type="' + (id.indexOf("Month") > -1 || id === "rMonth" ? "month" : "date") + '" data-ui="' + id + '" value="' + h(val) + '"></label>';

  /* ---------- Dashboard ---------- */
  function dashboardView() {
    const d = ui.dDate || todayIso(), m = ui.dMonth || monthNow();
    const dS = salesOn(d), dP = purchasesOn(d), mS = salesIn(m), mP = purchasesIn(m);
    const dSales = sumBy(dS, (s) => s.totalBill), dPur = sumBy(dP, (p) => p.total);
    const mSales = sumBy(mS, (s) => s.totalBill), mPur = sumBy(mP, (p) => p.total);
    const totalCredit = r2(live("customers").reduce((a, c) => a + Math.max(0, balanceOf(c.id)), 0));
    const showRates = can("showPurchaseRates") && can("showPurchase");
    const showProfit = can("showProfit");
    // 7-day bars
    const days = []; const base = parseIso(d);
    for (let i = 6; i >= 0; i--) { const x = new Date(base); x.setDate(base.getDate() - i); days.push(isoOf(x)); }
    const vals = days.map((x) => sumBy(salesOn(x), (s) => s.totalBill));
    const mx = Math.max(1, ...vals);
    const bars = days.map((x, i) => '<div class="bar' + (x === d ? " today" : "") + '"><div class="col" style="height:' + Math.max(3, Math.round((vals[i] / mx) * 100)) + '%"></div><em>' + (vals[i] ? (vals[i] >= 1000 ? Math.round(vals[i] / 100) / 10 + "k" : Math.round(vals[i])) : "") + "</em><small>" + parseIso(x).getDate() + "</small></div>").join("");
    // top credit shops
    const debtors = live("customers").map((c) => ({ c, b: balanceOf(c.id) })).filter((x) => x.b > 0).sort((a, b) => b.b - a.b).slice(0, 5);
    const recentS = live("sales").sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6);
    const recentP = live("purchases").sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6);

    let o = '<section class="card stack"><div><h2>' + (d === todayIso() ? "ഇന്നത്തെ സംഗ്രഹം" : "ദിവസ സംഗ്രഹം") + '</h2><div class="muted">' + h(fmtDay(d)) + '</div></div>' +
      '<div class="g2">' + dateRow("തീയതി", "dDate", d) + dateRow("മാസം", "dMonth", m) + "</div>" +
      '<div class="row wrap">' + (can("showSales") ? '<button type="button" class="btn sm" data-act="tab" data-tab="sales">' + ICON.plus + "പുതിയ ബിൽ</button>" : "") + (can("showPurchase") ? '<button type="button" class="btn sm amber" data-act="tab" data-tab="purchase">' + ICON.plus + "പർച്ചേസ്</button>" : "") + (can("showShops") ? '<button type="button" class="btn sm ghost" data-act="tab" data-tab="shops">' + ICON.store + "കടകൾ</button>" : "") + '<button type="button" class="btn sm ghost" data-act="reset-dash">ഇന്നത്തേക്ക്</button></div></section>';

    o += '<section class="tiles">' +
      '<div class="tile hero"><div class="lbl">ഈ ദിവസത്തെ വിൽപ്പന</div><div class="val">' + money(dSales) + '</div><div class="sub">' + dS.length + " ബില്ലുകൾ • " + kgFmt(kgOf(dS)) + " Kg</div></div>" +
      '<div class="tile amber"><div class="lbl">ഇന്നത്തെ കളക്ഷൻ</div><div class="val">' + money(collectedOn(d)) + '</div><div class="sub">ബിൽ പണം + കടം വരവ്</div></div>' +
      (showRates ? '<div class="tile"><div class="lbl">ദിവസ പർച്ചേസ്</div><div class="val blue">' + money(dPur) + '</div><div class="sub">' + dP.length + " എൻട്രികൾ • " + kgFmt(sumBy(dP, (p) => p.kg)) + " Kg</div></div>" : "") +
      '<div class="tile rose"><div class="lbl">ആകെ ബാക്കി കടം</div><div class="val">' + money(totalCredit) + '</div><div class="sub">എല്ലാ കടകളും</div></div>' +
      (showProfit && showRates ? '<div class="tile"><div class="lbl">ദിവസ ലാഭം (വിൽപ്പന − പർച്ചേസ്)</div><div class="val ' + (dSales - dPur >= 0 ? "pos" : "neg") + '">' + money(dSales - dPur) + "</div></div>" : "") + "</section>";

    o += '<section class="tiles">' +
      '<div class="tile"><div class="lbl">' + h(fmtMonth(m)) + " വിൽപ്പന</div><div class=\"val pos\">" + money(mSales) + '</div><div class="sub">' + kgFmt(kgOf(mS)) + " Kg • " + mS.length + " ബില്ലുകൾ</div></div>" +
      (showRates ? '<div class="tile"><div class="lbl">' + h(fmtMonth(m)) + " പർച്ചേസ്</div><div class=\"val blue\">" + money(mPur) + '</div><div class="sub">' + kgFmt(sumBy(mP, (p) => p.kg)) + " Kg</div></div>" : "") +
      (showProfit && showRates ? '<div class="tile hero"><div class="lbl">മാസ ലാഭം (വിൽപ്പന − പർച്ചേസ്)</div><div class="val">' + money(mSales - mPur) + "</div></div>" : "") + "</section>";

    if (can("showSales")) o += '<section class="card"><div class="card-h"><h3>7 ദിവസ വിൽപ്പന</h3><span class="muted">' + h(fmtDate(days[0])) + " – " + h(fmtDate(d)) + '</span></div><div class="bars">' + bars + "</div></section>";

    o += '<div class="cols2">';
    if (can("showShops")) o += '<section class="card flush"><div class="card-h"><h3>കടം കൂടുതലുള്ള കടകൾ</h3></div><div class="list">' + (debtors.length ? debtors.map((x) => '<div class="li"><div class="avatar">' + h(initial(x.c.name)) + '</div><div class="grow"><div class="t trunc">' + h(x.c.name) + '</div><div class="s">' + h(x.c.place || x.c.phone || "") + '</div></div><div class="amt neg">' + money(x.b) + "</div></div>").join("") : emptyBox("ബാക്കി കടം ഇല്ല 🎉")) + "</div></section>";
    if (can("showSales")) o += '<section class="card flush"><div class="card-h"><h3>പുതിയ വിൽപ്പനകൾ</h3></div><div class="list">' + (recentS.length ? recentS.map((s) => '<div class="li"><div class="grow"><div class="t trunc">' + h(s.shopName) + '</div><div class="s">' + h(s.billNo) + " • " + h(fmtDate(s.date)) + '</div></div><div class="right"><div class="amt pos">' + money(s.totalBill) + '</div><div class="s ' + (s.credit > 0 ? "neg" : "") + '">' + (s.credit > 0 ? "കടം " + money(s.credit) : "Paid") + "</div></div></div>").join("") : emptyBox("വിൽപ്പന വിവരങ്ങൾ ഇല്ല")) + "</div></section>";
    if (can("showPurchase")) o += '<section class="card flush"><div class="card-h"><h3>പുതിയ പർച്ചേസുകൾ</h3></div><div class="list">' + (recentP.length ? recentP.map((p) => '<div class="li"><div class="grow"><div class="t trunc">' + h(p.item) + '</div><div class="s">' + h(p.shopName) + " • " + h(fmtDate(p.date)) + '</div></div><div class="right"><div class="amt">' + kgFmt(p.kg) + " Kg</div>" + (showRates ? '<div class="s blue">' + money(p.total) + "</div>" : "") + "</div></div>").join("") : emptyBox("പർച്ചേസ് വിവരങ്ങൾ ഇല്ല")) + "</div></section>";
    return o + "</div>";
  }

  /* ---------- Purchase ---------- */
  function supplierOptions(sel) { return live("suppliers").sort(byName).map((s) => '<option value="' + h(s.id) + '"' + (s.id === sel ? " selected" : "") + ">" + h(s.name) + (s.phone ? " (" + h(s.phone) + ")" : "") + "</option>").join(""); }
  function customerOptions(sel) { return live("customers").sort(byName).map((c) => '<option value="' + h(c.id) + '"' + (c.id === sel ? " selected" : "") + ">" + h(c.name) + (c.place ? " (" + h(c.place) + ")" : "") + "</option>").join(""); }

  function purchaseView() {
    const noSup = !live("suppliers").length;
    return '<section class="card stack"><div class="card-h" style="margin:0"><h2 id="pTitle">പുതിയ പർച്ചേസ്</h2><button type="button" class="btn sm ghost" data-act="add-supplier">' + ICON.plus + "സപ്ലയർ</button></div>" +
      (noSup ? '<div class="banner">ആദ്യം ഒരു സപ്ലയറെ ചേർക്കുക ("സപ്ലയർ" ബട്ടൺ).</div>' : "") +
      '<div class="g2"><label class="f">തീയതി<input id="p_date" class="in" type="date"></label><label class="f">സപ്ലയർ<select id="p_shop" class="sel" data-ch="p-shop">' + supplierOptions() + "</select></label></div>" +
      '<div id="p_shopinfo" class="muted"></div>' +
      '<label class="f">ഇനം<input id="p_item" class="in" list="itemsList" placeholder="സാധനത്തിന്റെ പേര്" autocomplete="off"></label><datalist id="itemsList">' + sortedItems().map((i) => '<option value="' + h(i.name) + '">').join("") + "</datalist>" +
      '<div class="g3"><label class="f">തൂക്കം (Kg)<input id="p_kg" class="in calc-p" type="number" min="0" step="0.01" inputmode="decimal"></label><label class="f">വില / Kg (₹)<input id="p_rate" class="in calc-p" type="number" min="0" step="0.01" inputmode="decimal"></label><label class="f">ആകെ (₹)<input id="p_total" class="in" readonly value="0"></label></div>' +
      '<div class="g2"><label class="f">പേയ്‌മെന്റ്<select id="p_status" class="sel"><option value="Paid">പണം കൊടുത്തു (Paid)</option><option value="Unpaid">കൊടുക്കാനുണ്ട് (Unpaid)</option></select></label><label class="f">കുറിപ്പ്<input id="p_notes" class="in" placeholder="ഓപ്ഷണൽ"></label></div>' +
      '<div class="row"><button type="button" class="btn grow" data-act="save-purchase" id="pSubmit">' + ICON.check + 'പർച്ചേസ് സേവ് ചെയ്യുക</button><button type="button" class="btn ghost" data-act="cancel-purchase" id="pCancel" hidden>റദ്ദാക്കുക</button></div></section>' +
      '<section class="card flush"><div class="card-h"><h3>പർച്ചേസ് ലിസ്റ്റ്</h3><div class="g2" style="min-width:min(100%,360px)">' + dateRow("മാസം", "pMonth", ui.pMonth) + '<label class="f">തിരയുക<input class="in sm" data-ui="pSearch" value="' + h(ui.pSearch) + '" placeholder="കട / ഇനം"></label></div></div><div id="liveList">' + purchaseListInner() + "</div></section>";
  }
  function purchaseListInner() {
    const rates = can("showPurchaseRates"), del = can("allowDelete");
    const q = norm(ui.pSearch);
    const rows = live("purchases").filter((p) => (!ui.pMonth || (p.date || "").startsWith(ui.pMonth)) && (!q || norm(p.shopName).includes(q) || norm(p.item).includes(q))).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0));
    const tot = sumBy(rows, (p) => p.total), kg = sumBy(rows, (p) => p.kg);
    const head = '<div class="muted" style="padding:0 16px 10px">ആകെ ' + rows.length + " എൻട്രികൾ • " + kgFmt(kg) + " Kg" + (rates ? " • " + money(tot) : "") + "</div>";
    if (!rows.length) return head + emptyBox("പർച്ചേസ് വിവരങ്ങൾ ലഭ്യമല്ല");
    return head + '<div class="list">' + rows.map((p) => '<div class="li"><div class="grow"><div class="t">' + h(p.item) + (p.status === "Unpaid" ? ' <span class="chip rose">കൊടുക്കാനുണ്ട്</span>' : "") + '</div><div class="s">' + h(p.shopName) + " • " + h(fmtDate(p.date)) + (p.notes ? " • " + h(p.notes) : "") + '</div></div><div class="right"><div class="amt">' + kgFmt(p.kg) + " Kg</div>" + (rates ? '<div class="s blue">' + money(p.total) + " (@" + money(p.rate) + ")</div>" : "") + "</div>" +
      '<div class="row" style="gap:6px">' + (p.status === "Unpaid" && rates ? '<button type="button" class="ib green" title="Paid ആക്കുക" data-act="pur-paid" data-id="' + h(p.id) + '">' + ICON.check + "</button>" : "") + '<button type="button" class="ib" title="Edit" data-act="edit-purchase" data-id="' + h(p.id) + '">' + ICON.edit + "</button>" + (del ? '<button type="button" class="ib danger" title="Delete" data-act="del-purchase" data-id="' + h(p.id) + '">' + ICON.trash + "</button>" : "") + "</div></div>").join("") + "</div>";
  }
  function initPurchaseForm() {
    const e = ui.editPurchase ? byId("purchases", ui.editPurchase) : null;
    if (ui.editPurchase && !e) ui.editPurchase = null;
    $("#p_date").value = e ? e.date : todayIso();
    if (e) { if (byId("suppliers", e.shopId)) $("#p_shop").value = e.shopId; $("#p_item").value = e.item; $("#p_kg").value = e.kg; $("#p_rate").value = e.rate; $("#p_status").value = e.status || "Paid"; $("#p_notes").value = e.notes || ""; }
    $("#pTitle").textContent = e ? "പർച്ചേസ് എഡിറ്റ് ചെയ്യുക" : "പുതിയ പർച്ചേസ്";
    $("#pSubmit").lastChild.textContent = e ? "അപ്ഡേറ്റ് ചെയ്യുക" : "പർച്ചേസ് സേവ് ചെയ്യുക";
    $("#pCancel").hidden = !e;
    calcPurchase(); purchaseShopInfo();
  }
  function calcPurchase() { const t = $("#p_total"); if (t) t.value = r2(num($("#p_kg").value) * num($("#p_rate").value)); }
  function purchaseShopInfo() { const s = byId("suppliers", $("#p_shop") && $("#p_shop").value); const el = $("#p_shopinfo"); if (el) el.textContent = s ? "📞 " + (s.phone || "-") + "  📍 " + (s.place || "-") + (supplierPayable(s.id) > 0 ? "  • കൊടുക്കാനുള്ളത്: " + money(supplierPayable(s.id)) : "") : ""; }
  function refreshShopSelects() {
    const ps = $("#p_shop"); if (ps) { const v = ps.value; ps.innerHTML = supplierOptions(v); purchaseShopInfo(); }
    const ss = $("#s_shop"); if (ss) { const v = ss.value; ss.innerHTML = customerOptions(v); salesShopInfo(); }
  }

  /* ---------- Sales ---------- */
  function salesView() {
    const noCust = !live("customers").length;
    return '<section class="card stack"><div class="card-h" style="margin:0"><h2 id="sTitle">പുതിയ ബിൽ</h2><button type="button" class="btn sm ghost" data-act="add-customer">' + ICON.plus + "കട</button></div>" +
      (noCust ? '<div class="banner">ആദ്യം ഒരു കടയെ ചേർക്കുക ("കട" ബട്ടൺ).</div>' : "") +
      '<label class="f">കട<select id="s_shop" class="sel" data-ch="s-shop">' + customerOptions() + '</select></label><div class="g2"><label class="f">തീയതി<input id="s_date" class="in" type="date"></label><label class="f">ബിൽ നമ്പർ<input id="s_bill" class="in" readonly></label></div>' +
      '<div id="s_shopinfo" class="banner green" hidden></div>' +
      '<div id="s_rows" class="stack"></div>' +
      '<button type="button" class="btn ghost sm" style="justify-self:start" data-act="add-row">' + ICON.plus + 'ഇനം ചേർക്കുക</button>' +
      '<div class="muted">തൂക്കം (Kg) നൽകിയാൽ Kg × വില, ഇല്ലെങ്കിൽ Nos × വില കണക്കാക്കും.</div>' +
      '<div class="totals"><label class="f">ആകെ ബിൽ (₹)<input id="s_total" class="in" readonly value="0"></label><label class="f">ലഭിച്ച തുക (₹)<input id="s_paid" class="in calc-s" type="number" min="0" step="0.01" inputmode="decimal" placeholder="ഒഴിച്ചിട്ടാൽ മുഴുവൻ"></label><label class="f">ഈ ബില്ലിലെ കടം (₹)<input id="s_credit" class="in" readonly value="0"></label></div>' +
      '<label class="f">കുറിപ്പ്<input id="s_note" class="in" placeholder="ഓപ്ഷണൽ"></label>' +
      '<div class="row"><button type="button" class="btn grow" data-act="save-sale" id="sSubmit">' + ICON.receipt + '<span>ബിൽ സേവ് ചെയ്യുക</span></button><button type="button" class="btn ghost" data-act="cancel-sale" id="sCancel" hidden>റദ്ദാക്കുക</button></div></section>' +
      '<section class="card flush"><div class="card-h"><h3>സെയിൽസ് ബില്ലുകൾ</h3><div class="g2" style="min-width:min(100%,360px)">' + dateRow("മാസം", "sMonth", ui.sMonth) + '<label class="f">തിരയുക<input class="in sm" data-ui="sSearch" value="' + h(ui.sSearch) + '" placeholder="കട / ബിൽ നമ്പർ"></label></div></div><div id="liveList">' + salesListInner() + "</div></section>";
  }
  function itemRowHtml(pre) {
    const items = sortedItems();
    const sel = pre ? pre.itemId : (items[0] && items[0].id);
    let opts = items.map((i) => '<option value="' + h(i.id) + '" data-price="' + i.defaultPrice + '"' + (i.id === sel ? " selected" : "") + ">" + h(i.name) + "</option>").join("");
    if (pre && !items.some((i) => i.id === pre.itemId)) opts = '<option value="' + h(pre.itemId || "x") + '" data-price="' + pre.price + '" selected>' + h(pre.name) + "</option>" + opts;
    const price = pre ? pre.price : (items[0] ? items[0].defaultPrice : 0);
    return '<div class="irow"><label class="f full">ഇനം<select class="sel r-item" data-ch="row-item">' + opts + '</select></label>' +
      '<label class="f">Nos<input class="in r-nos calc-r" type="number" min="0" step="1" inputmode="numeric" value="' + (pre && pre.nos ? pre.nos : "") + '"></label>' +
      '<label class="f">Kg<input class="in r-kg calc-r" type="number" min="0" step="0.01" inputmode="decimal" value="' + (pre && pre.kg ? pre.kg : "") + '"></label>' +
      '<label class="f">വില<input class="in r-price calc-r" type="number" min="0" step="0.01" inputmode="decimal" value="' + price + '"></label>' +
      '<div class="amt"><span class="muted">തുക</span><b class="r-amt">0</b></div><button type="button" class="ib danger rm" data-act="rm-row" aria-label="നീക്കം ചെയ്യുക">' + ICON.x + "</button></div>";
  }
  function addRow(pre) { $("#s_rows").insertAdjacentHTML("beforeend", itemRowHtml(pre)); recalcSale(); }
  function recalcSale() {
    let total = 0;
    $$("#s_rows .irow").forEach((row) => {
      const a = lineAmount(num($(".r-nos", row).value), num($(".r-kg", row).value), num($(".r-price", row).value));
      $(".r-amt", row).textContent = a.toFixed(2);
      total += a;
    });
    total = r2(total);
    $("#s_total").value = total.toFixed(2);
    const paidRaw = $("#s_paid").value;
    const paid = paidRaw === "" ? total : num(paidRaw);
    $("#s_credit").value = Math.max(0, r2(total - paid)).toFixed(2);
  }
  function salesShopInfo() {
    const el = $("#s_shopinfo"); if (!el) return;
    const c = byId("customers", $("#s_shop") && $("#s_shop").value);
    if (!c) { el.hidden = true; return; }
    const b = balanceOf(c.id, ui.editSale);
    el.hidden = false;
    el.className = "banner " + (b > 0 ? "" : "green");
    el.textContent = "📞 " + (c.phone || "-") + "  📍 " + (c.place || "-") + "  • മുൻ ബാക്കി കടം: " + money(b);
  }
  function initSalesForm() {
    const e = ui.editSale ? byId("sales", ui.editSale) : null;
    if (ui.editSale && !e) ui.editSale = null;
    $("#s_date").value = e ? e.date : todayIso();
    $("#s_bill").value = e ? e.billNo : nextBillNo();
    if (e && byId("customers", e.shopId)) $("#s_shop").value = e.shopId;
    $("#s_rows").innerHTML = "";
    if (e) e.items.forEach((it) => addRow(it)); else addRow();
    $("#s_paid").value = e && e.paidAmount !== e.totalBill ? e.paidAmount : "";
    $("#s_note").value = e ? e.note || "" : "";
    $("#sTitle").textContent = e ? "ബിൽ എഡിറ്റ് ചെയ്യുക — " + e.billNo : "പുതിയ ബിൽ";
    $("#sSubmit span").textContent = e ? "അപ്ഡേറ്റ് ചെയ്യുക" : "ബിൽ സേവ് ചെയ്യുക";
    $("#sCancel").hidden = !e;
    recalcSale(); salesShopInfo();
  }
  function salesListInner() {
    const del = can("allowDelete");
    const q = norm(ui.sSearch);
    const rows = live("sales").filter((s) => (!ui.sMonth || (s.date || "").startsWith(ui.sMonth)) && (!q || norm(s.shopName).includes(q) || norm(s.billNo).includes(q))).sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0));
    const head = '<div class="muted" style="padding:0 16px 10px">ആകെ വിൽപ്പന: ' + money(sumBy(rows, (s) => s.totalBill)) + " • ആകെ കടം: " + money(sumBy(rows, (s) => s.credit)) + " • " + rows.length + " ബില്ലുകൾ</div>";
    if (!rows.length) return head + emptyBox("സെയിൽസ് ബില്ലുകൾ ലഭ്യമല്ല");
    return head + '<div class="list">' + rows.map((s) => '<div class="li"><div class="grow"><div class="t"><span class="mono pos">' + h(s.billNo) + "</span> " + h(s.shopName) + '</div><div class="s">' + h(fmtDate(s.date)) + " • " + (s.items || []).length + " ഇനങ്ങൾ • " + h((s.items || []).map((i) => String(i.name).split(" ")[0]).join(", ")) + '</div></div><div class="right"><div class="amt">' + money(s.totalBill) + '</div><div class="s ' + (s.credit > 0 ? "neg" : "pos") + '">' + (s.credit > 0 ? "കടം " + money(s.credit) : "Paid") + "</div></div>" +
      '<div class="row" style="gap:6px"><button type="button" class="ib green" title="Bill" data-act="view-bill" data-id="' + h(s.id) + '">' + ICON.print + '</button><button type="button" class="ib" title="Edit" data-act="edit-sale" data-id="' + h(s.id) + '">' + ICON.edit + "</button>" + (del ? '<button type="button" class="ib danger" title="Delete" data-act="del-sale" data-id="' + h(s.id) + '">' + ICON.trash + "</button>" : "") + "</div></div>").join("") + "</div>";
  }

  /* ---------- Shops ---------- */
  function shopsView() {
    const custs = live("customers").sort(byName), sups = live("suppliers").sort(byName);
    const rates = can("showPurchaseRates"), del = can("allowDelete");
    const totalCredit = r2(custs.reduce((a, c) => a + Math.max(0, balanceOf(c.id)), 0));
    return '<section class="card flush"><div class="card-h"><div><h2>വിൽപ്പന കടകൾ (Customers)</h2><div class="muted">ആകെ ബാക്കി കടം: <b class="neg">' + money(totalCredit) + '</b></div></div><button type="button" class="btn sm" data-act="add-customer">' + ICON.plus + "പുതിയ കട</button></div><div class=\"list\">" +
      (custs.length ? custs.map((c) => { const b = balanceOf(c.id); return '<div class="li wrapli"><div class="avatar">' + h(initial(c.name)) + '</div><div class="grow"><div class="t trunc">' + h(c.name) + '</div><div class="s">📞 ' + h(c.phone || "-") + " • 📍 " + h(c.place || "-") + '</div></div><div class="right"><div class="amt ' + (b > 0 ? "neg" : "pos") + '">' + (b < 0 ? "അഡ്വാൻസ് " + money(-b) : money(b)) + '</div></div><div class="row acts-row">' +
        (b > 0 ? '<button type="button" class="btn sm" data-act="pay-credit" data-id="' + h(c.id) + '">+ പണം വരവ്</button>' : "") + '<button type="button" class="ib" title="Ledger" data-act="ledger" data-id="' + h(c.id) + '">' + ICON.book + '</button><button type="button" class="ib" title="Edit" data-act="edit-customer" data-id="' + h(c.id) + '">' + ICON.edit + "</button>" + (del ? '<button type="button" class="ib danger" title="Delete" data-act="del-customer" data-id="' + h(c.id) + '">' + ICON.trash + "</button>" : "") + "</div></div>"; }).join("") : emptyBox("കടകളെ ചേർത്തിട്ടില്ല")) + "</div></section>" +
      (can("showPurchase") ? '<section class="card flush"><div class="card-h"><h2>സപ്ലയർമാർ (Suppliers)</h2><button type="button" class="btn sm amber" data-act="add-supplier">' + ICON.plus + "പുതിയ സപ്ലയർ</button></div><div class=\"list\">" +
        (sups.length ? sups.map((s) => { const pay = supplierPayable(s.id); const bought = sumBy(live("purchases").filter((p) => p.shopId === s.id), (p) => p.total); return '<div class="li wrapli"><div class="avatar" style="background:var(--blue50);color:var(--blue)">' + h(initial(s.name)) + '</div><div class="grow"><div class="t trunc">' + h(s.name) + '</div><div class="s">📞 ' + h(s.phone || "-") + " • 📍 " + h(s.place || "-") + '</div></div><div class="right">' + (rates ? '<div class="s blue">ആകെ വാങ്ങിയത്: ' + money(bought) + "</div>" + (pay > 0 ? '<div class="s neg">കൊടുക്കാനുള്ളത്: ' + money(pay) + "</div>" : "") : "") + '</div><div class="row acts-row">' + (s.phone ? '<a class="ib green" href="tel:' + h(s.phone) + '" title="Call">' + ICON.phone + "</a>" : "") + '<button type="button" class="ib" title="Edit" data-act="edit-supplier" data-id="' + h(s.id) + '">' + ICON.edit + "</button>" + (del ? '<button type="button" class="ib danger" title="Delete" data-act="del-supplier" data-id="' + h(s.id) + '">' + ICON.trash + "</button>" : "") + "</div></div>"; }).join("") : emptyBox("സപ്ലയർമാരെ ചേർത്തിട്ടില്ല")) + "</div></section>" : "");
  }

  /* ---------- Reports ---------- */
  function reportData(m) {
    const mS = salesIn(m), mP = purchasesIn(m);
    const items = {}, shops = {};
    mS.forEach((s) => {
      (s.items || []).forEach((it) => { const k = it.name; const o = items[k] || (items[k] = { name: k, nos: 0, kg: 0, amount: 0 }); o.nos += num(it.nos); o.kg += num(it.kg); o.amount += num(it.amount); });
      const o = shops[s.shopId] || (shops[s.shopId] = { name: s.shopName, bills: 0, total: 0, credit: 0 }); o.bills++; o.total += num(s.totalBill); o.credit += num(s.credit);
    });
    return {
      sales: r2(sumBy(mS, (s) => s.totalBill)), purchase: r2(sumBy(mP, (p) => p.total)), credit: r2(sumBy(mS, (s) => s.credit)),
      collected: r2(sumBy(mS, (s) => s.paidAmount) + sumBy(live("payments").filter((p) => (p.date || "").startsWith(m)), (p) => p.amount)),
      kg: kgOf(mS), bills: mS.length,
      items: Object.values(items).sort((a, b) => b.amount - a.amount), shops: Object.values(shops).sort((a, b) => b.total - a.total)
    };
  }
  function reportsView() {
    const m = ui.rMonth || monthNow(), d = reportData(m);
    const rates = can("showPurchaseRates"), profit = can("showProfit");
    return '<section class="card stack"><div><h2>പ്രതിമാസ റിപ്പോർട്ട്</h2><div class="muted">' + h(fmtMonth(m)) + '</div></div><div style="max-width:220px">' + dateRow("മാസം", "rMonth", m) + '</div><div class="row wrap"><button type="button" class="btn sm" data-act="report-pdf">' + ICON.file + 'PDF ഡൗൺലോഡ്</button><button type="button" class="btn sm ghost" data-act="report-wa">' + ICON.msg + "WhatsApp</button></div></section>" +
      '<section class="tiles"><div class="tile hero"><div class="lbl">ആകെ വിൽപ്പന</div><div class="val">' + money(d.sales) + '</div><div class="sub">' + d.bills + " ബില്ലുകൾ • " + kgFmt(d.kg) + " Kg</div></div>" +
      (rates ? '<div class="tile"><div class="lbl">ആകെ പർച്ചേസ്</div><div class="val blue">' + money(d.purchase) + "</div></div>" : "") +
      '<div class="tile amber"><div class="lbl">കളക്ഷൻ</div><div class="val">' + money(d.collected) + '</div><div class="sub">ബിൽ പണം + കടം വരവ്</div></div><div class="tile rose"><div class="lbl">ഈ മാസത്തെ പുതിയ കടം</div><div class="val">' + money(d.credit) + "</div></div>" +
      (profit && rates ? '<div class="tile"><div class="lbl">ലാഭം (വിൽപ്പന − പർച്ചേസ്)</div><div class="val ' + (d.sales - d.purchase >= 0 ? "pos" : "neg") + '">' + money(d.sales - d.purchase) + "</div></div>" : "") + "</section>" +
      '<div class="cols2"><section class="card flush"><div class="card-h"><h3>ഇനം തിരിച്ചുള്ള വിൽപ്പന</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>ഇനം</th><th class="r">Nos</th><th class="r">Kg</th><th class="r">തുക</th></tr></thead><tbody>' + (d.items.length ? d.items.map((r) => "<tr><td><b>" + h(r.name) + '</b></td><td class="r">' + r.nos + '</td><td class="r">' + kgFmt(r.kg) + '</td><td class="r"><b class="pos">' + money(r.amount) + "</b></td></tr>").join("") : '<tr><td colspan="4" class="empty">ഈ മാസം വിൽപ്പന ഇല്ല</td></tr>') + "</tbody></table></div></section>" +
      '<section class="card flush"><div class="card-h"><h3>കട തിരിച്ചുള്ള വിൽപ്പന</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>കട</th><th class="r">ബില്ലുകൾ</th><th class="r">തുക</th><th class="r">കടം</th></tr></thead><tbody>' + (d.shops.length ? d.shops.map((r) => "<tr><td><b>" + h(r.name) + '</b></td><td class="r">' + r.bills + '</td><td class="r"><b>' + money(r.total) + '</b></td><td class="r ' + (r.credit > 0 ? "neg" : "") + '">' + money(r.credit) + "</td></tr>").join("") : '<tr><td colspan="4" class="empty">ഈ മാസം വിൽപ്പന ഇല്ല</td></tr>') + "</tbody></table></div></section></div>";
  }

  /* ---------- Admin ---------- */
  async function getSnapshots() { try { return (await withTimeout(idbGet("snapshots"), 3000)) || []; } catch (e) { return []; } }
  let snapCache = [];
  function adminView() {
    const s = S();
    let o = "";
    if (isAdmin()) {
      const defaultPin = s.adminHash === pinHash("1234") || s.staffHash === pinHash("0000");
      o += (defaultPin ? '<div class="banner red">⚠️ ഡിഫോൾട്ട് പിൻ (1234 / 0000) ഇപ്പോഴും ഉപയോഗത്തിലുണ്ട്. താഴെ നിന്ന് ഉടൻ മാറ്റുക.</div>' : "") +
        '<section class="card stack"><h2>പാർട്ണർ അനുമതികൾ</h2><div class="muted">പാർട്ണർ ലോഗിനിൽ എന്തൊക്കെ കാണിക്കണം എന്ന് തിരഞ്ഞെടുക്കുക</div>' + PERMS.map((p) => '<div class="switch ' + (s.perms[p[0]] ? "on" : "") + '" data-act="perm" data-k="' + p[0] + '"><div><div class="t" style="font-weight:800;font-size:.84rem">' + h(p[1]) + '</div><div class="muted">' + h(p[2]) + '</div></div><div class="tr"><i></i></div></div>').join("") + "</section>" +
        '<div class="cols2"><section class="card stack"><h2>സുരക്ഷാ പിൻ</h2><label class="f">അഡ്മിൻ പിൻ (4 അക്കം)<input id="a_pin" class="in" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="പുതിയ പിൻ"></label><label class="f">പാർട്ണർ പിൻ (4 അക്കം)<input id="s_pin" class="in" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="പുതിയ പിൻ"></label><div class="muted">ഒഴിച്ചിട്ടാൽ ആ പിൻ മാറില്ല. പിൻ എല്ലാ ഉപകരണങ്ങളിലും സിങ്ക് ആകും.</div><button type="button" class="btn" data-act="save-pins">പിൻ സേവ് ചെയ്യുക</button></section>' +
        '<section class="card stack"><h2>സ്ഥാപന വിവരങ്ങൾ</h2><label class="f">പേര്<input id="b_name" class="in" value="' + h(s.biz.name) + '"></label><label class="f">ടാഗ്‌ലൈൻ<input id="b_tag" class="in" value="' + h(s.biz.tag) + '"></label><div class="g2"><label class="f">സ്ഥലം<input id="b_place" class="in" value="' + h(s.biz.place) + '"></label><label class="f">ഫോൺ<input id="b_phone" class="in" inputmode="tel" value="' + h(s.biz.phone) + '"></label></div><button type="button" class="btn" data-act="save-biz">സേവ് ചെയ്യുക</button></section></div>' +
        '<section class="card"><div class="row between wrap"><div><h2>ഉൽപ്പന്ന ലിസ്റ്റ് & വില</h2><div class="muted">' + sortedItems().length + ' ഇനങ്ങൾ — ചേർക്കാം, മാറ്റാം, നീക്കാം</div></div><button type="button" class="btn amber" data-act="manage-items">' + ICON.edit + "ലിസ്റ്റ് എഡിറ്റ് ചെയ്യുക</button></div></section>";
    }
    if (can("showBackup")) {
      o += '<section class="card stack"><h2>ബാക്കപ്പ് & സിങ്ക്</h2><div class="banner green" id="syncBanner">' + h(statusText()[1]) + (state.lastSync ? " • അവസാന സിങ്ക്: " + new Date(state.lastSync).toLocaleString("en-IN") : "") + '</div><div class="row wrap"><button type="button" class="btn" data-act="sync-now">' + ICON.refresh + 'ഇപ്പോൾ സിങ്ക് ചെയ്യുക</button><button type="button" class="btn ghost" data-act="snapshot">ഫോണിൽ ബാക്കപ്പ് എടുക്കുക</button><button type="button" class="btn ghost" data-act="export">' + ICON.download + 'JSON ഡൗൺലോഡ്</button><label class="btn ghost" style="cursor:pointer">' + ICON.upload + 'ഫയലിൽ നിന്ന് റീസ്റ്റോർ<input type="file" accept=".json,application/json" data-ch="restore-file" hidden></label></div>' +
        (isAdmin() ? '<label class="f" style="max-width:220px">ഓട്ടോ ബാക്കപ്പ് സമയം<input type="time" class="in sm" data-ch="backup-time" value="' + h(s.backupTime) + '"></label>' : "") +
        '<div id="snapList" class="stack"><div class="muted">ലോഡ് ചെയ്യുന്നു…</div></div></section>';
      getSnapshots().then((arr) => { snapCache = arr; const el = $("#snapList"); if (el) el.innerHTML = arr.length ? arr.map((b) => '<div class="li" style="border:1px solid var(--line);border-radius:13px"><div class="grow"><div class="t">' + h(b.label) + '</div><div class="s">' + h(b.ts) + '</div></div><button type="button" class="btn sm ghost" data-act="restore-snap" data-id="' + h(b.id) + '">Restore</button></div>').join("") : '<div class="muted">ഫോൺ ബാക്കപ്പുകൾ ഇല്ല</div>'; });
    }
    return o;
  }

  /* =====================================================================
     9. BACKUPS
     ===================================================================== */
  function dataSnapshot() { const o = {}; BACKUP_COLS.forEach((c) => { o[c] = JSON.parse(JSON.stringify(state.data[c])); }); return o; }
  async function createSnapshot(label) {
    const arr = await getSnapshots();
    arr.unshift({ id: "bk" + Date.now(), label, ts: new Date().toLocaleString("en-IN"), data: dataSnapshot() });
    try { await idbSet("snapshots", arr.slice(0, 15)); } catch (e) { /* ignore */ }
  }
  async function autoBackupCheck() {
    const t = todayIso(); const now = new Date(); const hhmm = pad(now.getHours()) + ":" + pad(now.getMinutes());
    if (state.lastAutoBackup !== t && hhmm >= (S().backupTime || "08:00")) { state.lastAutoBackup = t; persist(); await createSnapshot("Auto Backup (" + t + ")"); }
  }
  // Replace current data with a backup: backup records are re-stamped; records missing from it become deleted.
  function restoreData(data) {
    const now = Date.now();
    BACKUP_COLS.forEach((col) => {
      const src = data[col]; if (!src) return;
      const map = Array.isArray(src) ? Object.fromEntries(src.filter((r) => r && r.id).map((r) => [r.id, r])) : src;
      Object.keys(state.data[col]).forEach((id) => { if (!map[id] && !state.data[col][id].deleted) { state.data[col][id].deleted = true; state.data[col][id].updatedAt = now; state.dirty[col + "/" + id] = 1; } });
      Object.keys(map).forEach((id) => { const r = Object.assign({}, map[id], { id, deleted: !!map[id].deleted, updatedAt: now }); state.data[col][id] = r; state.dirty[col + "/" + id] = 1; });
    });
    persist(); scheduleSync();
  }
  function exportBackup() {
    const blob = new Blob([JSON.stringify({ app: "malabar-crunch", v: 1, exportedAt: new Date().toISOString(), data: dataSnapshot() }, null, 2)], { type: "application/json" });
    download(blob, "Malabar_Crunch_Backup_" + todayIso() + ".json");
  }
  function download(blob, name) {
    const u = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000);
  }

  /* =====================================================================
     10. INVOICE, WHATSAPP, PDF
     ===================================================================== */
  function invoiceHtml(inv) {
    const b = S().biz;
    return '<div class="inv print-area"><div class="inv-h"><b>' + h(b.name) + "</b><div>" + h(b.tag) + "</div><div>" + h(b.place) + " | Ph: " + h(b.phone) + '</div></div><div class="inv-meta"><div><b>' + h(inv.shopName) + '</b><div class="muted">Ph: ' + h(inv.shopPhone || "-") + '</div></div><div class="right"><b class="mono">' + h(inv.billNo) + '</b><div class="muted">' + h(fmtDate(inv.date)) + "</div></div></div>" +
      '<table><thead><tr><th>ഇനം</th><th class="c">Nos</th><th class="c">Kg</th><th class="r">വില</th><th class="r">തുക</th></tr></thead><tbody>' + (inv.items || []).map((i) => "<tr><td><b>" + h(i.name) + '</b></td><td class="c">' + (i.nos || "-") + '</td><td class="c">' + (i.kg || "-") + '</td><td class="r">' + i.price + '</td><td class="r"><b>' + num(i.amount).toFixed(2) + "</b></td></tr>").join("") + "</tbody></table>" +
      '<div class="inv-t"><div class="big"><span>ആകെ ബിൽ</span><span>' + money(inv.totalBill) + "</span></div><div><span>ലഭിച്ചത്</span><span>" + money(inv.paidAmount) + "</span></div><div><span>ഈ ബില്ലിലെ കടം</span><b class=\"" + (inv.credit > 0 ? "neg" : "") + '">' + money(inv.credit) + "</b></div><div><span>കടയുടെ ആകെ ബാക്കി കടം</span><b>" + money(balanceOf(inv.shopId)) + '</b></div></div><div class="inv-foot">നന്ദി! വീണ്ടും വരിക 🙏</div></div>';
  }
  function showInvoice(id) {
    const inv = byId("sales", id); if (!inv) return;
    openModal({ title: "ബിൽ " + inv.billNo, wide: true, focus: false, invId: id, body: invoiceHtml(inv),
      footer: '<div class="acts n3"><button type="button" class="btn" data-act="inv-wa">' + ICON.msg + 'WhatsApp</button><button type="button" class="btn ghost" data-act="inv-pdf">' + ICON.file + 'PDF</button><button type="button" class="btn ghost" data-act="inv-print">' + ICON.print + 'Print</button></div><button type="button" class="btn ghost block" data-act="modal-cancel">അടയ്ക്കുക</button>' });
  }
  function openWa(phone, text) {
    const p = String(phone || "").replace(/\D/g, "");
    const u = p.length >= 10 ? "https://wa.me/91" + p.slice(-10) + "?text=" + encodeURIComponent(text) : "https://wa.me/?text=" + encodeURIComponent(text);
    window.open(u, "_blank");
  }
  function invoiceText(inv) {
    const b = S().biz;
    return ["*" + b.name + "*", b.tag, b.place + " | Ph: " + b.phone, "------------------------", "Bill No: *" + inv.billNo + "* | Date: " + inv.date, "Shop: *" + inv.shopName + "*", "------------------------"]
      .concat((inv.items || []).map((i) => "• " + i.name + ": " + (i.nos ? i.nos + " Nos " : "") + (i.kg ? i.kg + " Kg " : "") + "x ₹" + i.price + " = *₹" + num(i.amount).toFixed(2) + "*"))
      .concat(["------------------------", "*Total Bill: ₹" + inv.totalBill + "*", "Paid: ₹" + inv.paidAmount, "Bill Credit: ₹" + inv.credit, "Total Shop Balance: *₹" + balanceOf(inv.shopId) + "*", "", "Thank you!"]).join("\n");
  }

  /* --- canvas → JPEG → minimal PDF (works offline; browser shapes Malayalam correctly) --- */
  const PW = 1240, PH = 1754, MX = 80, TOP = 200, BOT = 110;
  const FONT = '"Noto Sans Malayalam","Noto Sans","Manjari","Meera","Nirmala UI","Kartika",system-ui,sans-serif';
  const fit = (ctx, str, maxW) => { if (ctx.measureText(str).width <= maxW) return str; const g = segs(str); while (g.length > 1 && ctx.measureText(g.join("") + "…").width > maxW) g.pop(); return g.join("") + "…"; };
  const rrect = (ctx, x, y, w, hh, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };

  class PdfDoc {
    constructor(title, subtitle) { this.title = title; this.subtitle = subtitle; this.pages = []; this.newPage(); }
    newPage() {
      const c = document.createElement("canvas"); c.width = PW; c.height = PH;
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, PW, PH);
      const g = x.createLinearGradient(0, 0, PW, 0); g.addColorStop(0, "#064e3b"); g.addColorStop(1, "#047857");
      x.fillStyle = g; x.fillRect(0, 0, PW, 170);
      x.fillStyle = "#fbbf24"; x.fillRect(0, 170, PW, 8);
      this.c = c; this.x = x; this.pages.push(c);
      const b = S().biz;
      this.t(b.name + "  •  " + b.place + "  •  " + b.phone, MX, 40, { size: 22, weight: 600, color: "#a7f3d0", maxW: PW - 2 * MX });
      this.t(this.title, MX, 92, { size: 44, weight: 800, color: "#fff", maxW: PW - 2 * MX });
      this.t(this.subtitle, MX, 140, { size: 27, weight: 600, color: "#d1fae5", maxW: PW - 2 * MX });
      this.y = TOP;
    }
    t(str, x, y, o) {
      o = o || {}; const ctx = this.x;
      ctx.font = (o.weight || 500) + " " + (o.size || 26) + "px " + FONT; ctx.fillStyle = o.color || "#0f172a"; ctx.textAlign = o.align || "left"; ctx.textBaseline = "middle";
      let s = String(str); if (o.maxW) s = fit(ctx, s, o.maxW); ctx.fillText(s, x, y);
    }
    ensure(hh) { if (this.y + hh > PH - BOT) this.newPage(); }
    heading(text) { this.ensure(110); this.y += 10; this.x.fillStyle = "#059669"; rrect(this.x, MX, this.y, 10, 46, 5); this.x.fill(); this.t(text, MX + 28, this.y + 24, { size: 33, weight: 800, color: "#064e3b", maxW: PW - 2 * MX - 28 }); this.y += 70; }
    kpis(list) {
      const w = (PW - 2 * MX - 20 * (list.length - 1)) / list.length; this.ensure(170);
      list.forEach((k, i) => { const x0 = MX + i * (w + 20), x = this.x; x.fillStyle = k.bg || "#ecfdf5"; rrect(x, x0, this.y, w, 140, 22); x.fill(); this.t(k.label, x0 + 22, this.y + 38, { size: 21, weight: 700, color: "#475569", maxW: w - 40 }); this.t(k.value, x0 + 22, this.y + 94, { size: 38, weight: 800, color: k.color || "#047857", maxW: w - 40 }); });
      this.y += 170;
    }
    table(cols, rows, o) {
      o = o || {}; const RH = 60, total = PW - 2 * MX;
      const xOf = (c, cx, w) => (c.align === "right" ? cx + w - 18 : c.align === "center" ? cx + w / 2 : cx + 18);
      const head = () => { this.ensure(RH * 2); this.x.fillStyle = "#d1fae5"; rrect(this.x, MX, this.y, total, RH - 8, 14); this.x.fill(); let cx = MX; cols.forEach((c) => { const w = c.w * total; this.t(c.label, xOf(c, cx, w), this.y + (RH - 8) / 2, { size: 22, weight: 800, color: "#064e3b", align: c.align, maxW: w - 30 }); cx += w; }); this.y += RH; };
      head();
      rows.forEach((r, i) => {
        if (this.y + RH > PH - BOT) { this.newPage(); head(); }
        this.x.fillStyle = r.hot ? "#fef3c7" : i % 2 ? "#f8fafc" : "#fff"; this.x.fillRect(MX, this.y, total, RH);
        this.x.fillStyle = "#e2e8f0"; this.x.fillRect(MX, this.y + RH - 1, total, 1);
        let cx = MX; cols.forEach((c, ci) => { const w = c.w * total; this.t(r.cells[ci], xOf(c, cx, w), this.y + RH / 2, { size: 25, weight: c.bold || r.bold ? 800 : 500, align: c.align, maxW: w - 30, color: (r.colors && r.colors[ci]) || c.color || "#0f172a" }); cx += w; });
        this.y += RH;
      });
      this.y += 26;
    }
    kv(label, value, o) {
      o = o || {}; this.ensure(70);
      if (o.line) { this.x.fillStyle = "#064e3b"; this.x.fillRect(PW / 2, this.y, PW / 2 - MX, 3); this.y += 10; }
      this.t(label, PW / 2 + 10, this.y + 28, { size: o.size || 27, weight: o.bold ? 800 : 600, color: "#334155" });
      this.t(value, PW - MX, this.y + 28, { size: o.size || 27, weight: 800, color: o.color || "#0f172a", align: "right" });
      this.y += o.gap || 54;
    }
    finish() {
      const n = this.pages.length;
      this.pages.forEach((c, i) => { const x = c.getContext("2d"); x.fillStyle = "#e2e8f0"; x.fillRect(MX, PH - 84, PW - 2 * MX, 2); x.font = "500 22px " + FONT; x.fillStyle = "#64748b"; x.textBaseline = "middle"; x.textAlign = "left"; x.fillText("തയ്യാറാക്കിയത്: " + fmtDate(todayIso()), MX, PH - 50); x.textAlign = "right"; x.fillText("പേജ് " + (i + 1) + " / " + n, PW - MX, PH - 50); });
      return this.pages;
    }
  }
  async function ensureFonts() { try { if (document.fonts && document.fonts.load) { await Promise.all([500, 600, 700, 800].map((w) => document.fonts.load(w + ' 26px "Noto Sans Malayalam"', "മലയാളം 1234"))); await document.fonts.ready; } } catch (e) { /* fallback fonts */ } }

  async function buildInvoicePdf(inv) {
    await ensureFonts();
    const doc = new PdfDoc("ബിൽ " + inv.billNo, inv.shopName + "  •  " + fmtDate(inv.date) + (inv.shopPhone ? "  •  Ph: " + inv.shopPhone : ""));
    doc.table([{ label: "ഇനം", w: 0.42 }, { label: "Nos", w: 0.1, align: "center" }, { label: "Kg", w: 0.12, align: "center" }, { label: "വില", w: 0.16, align: "right" }, { label: "തുക", w: 0.2, align: "right", bold: true, color: "#047857" }],
      (inv.items || []).map((i) => ({ cells: [i.name, i.nos ? String(i.nos) : "-", i.kg ? String(i.kg) : "-", num(i.price).toFixed(2), num(i.amount).toFixed(2)] })));
    doc.kv("ആകെ ബിൽ", money(inv.totalBill), { bold: true, size: 34, line: true, gap: 66 });
    doc.kv("ലഭിച്ചത്", money(inv.paidAmount), { color: "#047857" });
    doc.kv("ഈ ബില്ലിലെ കടം", money(inv.credit), { color: inv.credit > 0 ? "#be123c" : "#0f172a" });
    doc.kv("കടയുടെ ആകെ ബാക്കി കടം", money(balanceOf(inv.shopId)), { bold: true, color: "#be123c", line: true });
    if (inv.note) { doc.y += 10; doc.t("കുറിപ്പ്: " + inv.note, MX, doc.y + 20, { size: 24, color: "#475569", maxW: PW - 2 * MX }); }
    return pdfFromCanvases(doc.finish());
  }
  async function buildReportPdf(m) {
    await ensureFonts();
    const d = reportData(m); const rates = can("showPurchaseRates"), profit = can("showProfit");
    const doc = new PdfDoc("പ്രതിമാസ റിപ്പോർട്ട്", fmtMonth(m) + "  •  " + d.bills + " ബില്ലുകൾ  •  " + kgFmt(d.kg) + " Kg");
    const k = [{ label: "ആകെ വിൽപ്പന", value: money(d.sales) }];
    if (rates) k.push({ label: "ആകെ പർച്ചേസ്", value: money(d.purchase), bg: "#eff6ff", color: "#1d4ed8" });
    k.push({ label: "കളക്ഷൻ", value: money(d.collected), bg: "#fffbeb", color: "#b45309" });
    doc.kpis(k.slice(0, 3));
    const k2 = [{ label: "പുതിയ കടം", value: money(d.credit), bg: "#fff1f2", color: "#be123c" }];
    if (profit && rates) k2.push({ label: "ലാഭം (വിൽപ്പന − പർച്ചേസ്)", value: money(d.sales - d.purchase), color: d.sales - d.purchase >= 0 ? "#047857" : "#be123c" });
    doc.kpis(k2);
    doc.heading("ഇനം തിരിച്ചുള്ള വിൽപ്പന");
    doc.table([{ label: "ഇനം", w: 0.46 }, { label: "Nos", w: 0.14, align: "right" }, { label: "Kg", w: 0.18, align: "right" }, { label: "തുക", w: 0.22, align: "right", bold: true, color: "#047857" }],
      d.items.length ? d.items.map((r, i) => ({ hot: i === 0, cells: [r.name, String(r.nos), kgFmt(r.kg), money(r.amount)] })) : [{ cells: ["വിൽപ്പന ഇല്ല", "", "", ""] }]);
    doc.heading("കട തിരിച്ചുള്ള വിൽപ്പന");
    doc.table([{ label: "കട", w: 0.44 }, { label: "ബില്ലുകൾ", w: 0.14, align: "right" }, { label: "തുക", w: 0.22, align: "right", bold: true }, { label: "കടം", w: 0.2, align: "right", color: "#be123c" }],
      d.shops.length ? d.shops.map((r, i) => ({ hot: i === 0, cells: [r.name, String(r.bills), money(r.total), money(r.credit)] })) : [{ cells: ["വിൽപ്പന ഇല്ല", "", "", ""] }]);
    return pdfFromCanvases(doc.finish());
  }
  function pdfFromCanvases(canvases) {
    const enc = new TextEncoder(), chunks = [], offs = []; let pos = 0;
    const push = (d) => { const b = typeof d === "string" ? enc.encode(d) : d; chunks.push(b); pos += b.length; };
    const obj = (n, fn) => { offs[n] = pos; push(n + " 0 obj\n"); fn(); push("endobj\n"); };
    const n = canvases.length, W = 595.28, H = 841.89;
    push("%PDF-1.4\n");
    obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>\n"));
    obj(2, () => push("<< /Type /Pages /Kids [" + canvases.map((_, i) => 3 + i * 3 + " 0 R").join(" ") + "] /Count " + n + " >>\n"));
    canvases.forEach((c, i) => {
      const pg = 3 + i * 3, ct = pg + 1, im = pg + 2;
      const bin = atob(c.toDataURL("image/jpeg", 0.92).split(",")[1]); const bytes = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
      obj(pg, () => push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + W + " " + H + "] /Resources << /XObject << /Im0 " + im + " 0 R >> >> /Contents " + ct + " 0 R >>\n"));
      const content = "q " + W + " 0 0 " + H + " 0 0 cm /Im0 Do Q";
      obj(ct, () => push("<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream\n"));
      obj(im, () => { push("<< /Type /XObject /Subtype /Image /Width " + c.width + " /Height " + c.height + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + bytes.length + " >>\nstream\n"); push(bytes); push("\nendstream\n"); });
    });
    const total = 3 + n * 3, xref = pos; let x = "xref\n0 " + total + "\n0000000000 65535 f \n";
    for (let i = 1; i < total; i++) x += String(offs[i]).padStart(10, "0") + " 00000 n \n";
    push(x + "trailer\n<< /Size " + total + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF");
    const out = new Uint8Array(pos); let o = 0; chunks.forEach((c) => { out.set(c, o); o += c.length; }); return out;
  }

  /* =====================================================================
     11. FORMS (modals) & ACTIONS
     ===================================================================== */
  function shopModal(kind, rec) {
    const isC = kind === "customer"; const col = isC ? "customers" : "suppliers";
    openModal({
      title: (rec ? "എഡിറ്റ്: " : "പുതിയ ") + (isC ? "വിൽപ്പന കട" : "സപ്ലയർ"),
      body: '<label class="f">പേര്<input id="mf_name" class="in" value="' + h(rec ? rec.name : "") + '"></label><label class="f">ഫോൺ<input id="mf_phone" class="in" inputmode="tel" value="' + h(rec ? rec.phone : "") + '"></label><label class="f">സ്ഥലം<input id="mf_place" class="in" value="' + h(rec ? rec.place : "") + '"></label>' +
        (isC ? '<label class="f">പഴയ കടം / Opening Credit (₹)<input id="mf_open" class="in" type="number" step="0.01" inputmode="decimal" value="' + (rec ? num(rec.openingCredit) : 0) + '"></label>' : ""),
      onOk() {
        const name = clean(mv("name")); if (!name) return modalErr("പേര് നൽകുക.");
        const dup = live(col).some((x) => x.id !== (rec && rec.id) && norm(x.name) === norm(name));
        if (dup) return modalErr("ഈ പേരിൽ ഒരു കട നിലവിലുണ്ട്.");
        const r = Object.assign(rec ? {} : { id: uid(isC ? "cu" : "su"), deleted: false, createdAt: Date.now() }, rec || {}, { name, phone: clean(mv("phone")), place: clean(mv("place")) });
        if (isC) r.openingCredit = r2(num(mv("open")));
        save(col, r);
        // keep denormalised names in sync on edit
        if (rec) (isC ? live("sales") : live("purchases")).forEach((x) => { if (x.shopId === r.id && (x.shopName !== r.name || x.shopPhone !== r.phone)) { x.shopName = r.name; x.shopPhone = r.phone; save(isC ? "sales" : "purchases", x); } });
        toast("✅ സേവ് ചെയ്തു");
        render();
        const sel = $(isC ? "#s_shop" : "#p_shop"); if (sel && !rec) { sel.value = r.id; isC ? salesShopInfo() : purchaseShopInfo(); }
      }
    });
  }

  function itemsModal() {
    const row = (it) => '<div class="li" data-id="' + h(it ? it.id : "") + '" style="padding:8px 0;gap:8px"><input class="in sm c-name" style="flex:1" value="' + h(it ? it.name : "") + '" placeholder="ഇനത്തിന്റെ പേര്"><input class="in sm c-price" style="width:96px;text-align:right" type="number" step="0.01" inputmode="decimal" value="' + (it ? it.defaultPrice : "") + '" placeholder="വില"><button type="button" class="ib danger" data-act="cat-rm">' + ICON.x + "</button></div>";
    openModal({ title: "ഉൽപ്പന്ന ലിസ്റ്റ് & വില (₹/Kg)", wide: true, focus: false, body: '<div id="catRows">' + sortedItems().map(row).join("") + '</div><button type="button" class="btn ghost sm" style="justify-self:start" data-act="cat-add">' + ICON.plus + "പുതിയ ഇനം</button>", ok: "സേവ് ചെയ്യുക", rowTpl: row,
      onOk() {
        const rows = $$("#catRows .li"); const seen = new Set(); const keep = new Set(); let order = 0;
        for (const r of rows) {
          if (r.hidden) continue;
          const name = clean($(".c-name", r).value); if (!name) continue;
          if (seen.has(norm(name))) return modalErr('"' + name + '" ഒന്നിലധികം തവണ ഉണ്ട്.');
          seen.add(norm(name));
          const id = r.getAttribute("data-id") || uid("it"); keep.add(id);
          const old = state.data.items[id];
          save("items", Object.assign({}, old || { id, deleted: false }, { id, name, defaultPrice: r2(num($(".c-price", r).value)), order: ++order, deleted: false }));
        }
        live("items").forEach((it) => { if (!keep.has(it.id)) softDelete("items", it.id); });
        toast("✅ ഉൽപ്പന്ന ലിസ്റ്റ് അപ്ഡേറ്റ് ചെയ്തു"); render();
      } });
  }

  function ledgerEntries(c) {
    const e = [];
    if (num(c.openingCredit)) e.push({ date: "0000", t: 0, label: "പഴയ കടം (Opening)", debit: num(c.openingCredit), credit: 0 });
    live("sales").filter((s) => s.shopId === c.id).forEach((s) => e.push({ date: s.date, t: s.createdAt || 0, label: s.billNo + " — ബിൽ " + money(s.totalBill) + ", ലഭിച്ചത് " + money(s.paidAmount), debit: num(s.credit), credit: 0 }));
    live("payments").filter((p) => p.shopId === c.id).forEach((p) => e.push({ date: p.date, t: p.createdAt || 0, label: "പണം വരവ്" + (p.note ? " (" + p.note + ")" : ""), debit: 0, credit: num(p.amount), pid: p.id }));
    e.sort((a, b) => a.date.localeCompare(b.date) || a.t - b.t);
    let bal = 0; e.forEach((x) => { bal = r2(bal + x.debit - x.credit); x.bal = bal; });
    return e;
  }

  const actions = {
    pin(el) { if (pin.length >= 4) return; pin += el.dataset.k; updateDots(); pinMsg(""); if (pin.length === 4) setTimeout(verifyPin, 120); },
    "pin-clear"() { pin = ""; updateDots(); pinMsg(""); },
    "pin-back"() { pin = pin.slice(0, -1); updateDots(); },
    logout,
    tab(el) { ui.tab = el.dataset.tab; if (ui.tab !== "sales") ui.editSale = null; if (ui.tab !== "purchase") ui.editPurchase = null; render(); window.scrollTo(0, 0); },
    "reset-dash"() { ui.dDate = todayIso(); ui.dMonth = monthNow(); render(); },
    install: async function () { if (installPrompt) { installPrompt.prompt(); try { await installPrompt.userChoice; } catch (e) { /* ignore */ } installPrompt = null; } else toast("ബ്രൗസർ മെനുവിലെ 'Install app' / 'Add to Home Screen' ഉപയോഗിക്കുക."); },

    "add-supplier"() { shopModal("supplier"); },
    "edit-supplier"(el) { const r = byId("suppliers", el.dataset.id); if (r) shopModal("supplier", r); },
    "del-supplier"(el) { const r = byId("suppliers", el.dataset.id); if (!r || !can("allowDelete")) return; const p = supplierPayable(r.id); confirmBox("സപ്ലയറെ നീക്കം ചെയ്യണോ?", r.name + (p > 0 ? " — ഇവർക്ക് " + money(p) + " കൊടുക്കാനുണ്ട്." : "") + " പഴയ പർച്ചേസ് രേഖകൾ നിലനിൽക്കും.", "നീക്കം ചെയ്യുക", () => { softDelete("suppliers", r.id); toast("നീക്കം ചെയ്തു", "warn"); render(); }); },
    "add-customer"() { shopModal("customer"); },
    "edit-customer"(el) { const r = byId("customers", el.dataset.id); if (r) shopModal("customer", r); },
    "del-customer"(el) { const r = byId("customers", el.dataset.id); if (!r || !can("allowDelete")) return; const b = balanceOf(r.id); confirmBox("കടയെ നീക്കം ചെയ്യണോ?", r.name + (b > 0 ? " — ഇവരിൽ നിന്ന് " + money(b) + " കിട്ടാനുണ്ട്! നീക്കിയാൽ ആകെ കടത്തിൽ നിന്ന് ഒഴിവാകും." : "") + " പഴയ ബില്ലുകൾ നിലനിൽക്കും.", "നീക്കം ചെയ്യുക", () => { softDelete("customers", r.id); toast("നീക്കം ചെയ്തു", "warn"); render(); }); },

    "pay-credit"(el) {
      const c = byId("customers", el.dataset.id); if (!c) return; const b = balanceOf(c.id);
      openModal({ title: "പണം വരവ്", text: c.name + " — നിലവിലെ ബാക്കി കടം: " + money(b), ok: "വരവ് രേഖപ്പെടുത്തുക",
        body: '<label class="f">തുക (₹)<input id="mf_amt" class="in" type="number" min="0" step="0.01" inputmode="decimal" value="' + (b > 0 ? b : "") + '"></label><div class="g2"><label class="f">തീയതി<input id="mf_date" class="in" type="date" value="' + todayIso() + '"></label><label class="f">കുറിപ്പ്<input id="mf_note" class="in" placeholder="Cash / UPI"></label></div>',
        onOk() {
          const amt = r2(num(mv("amt"))); if (amt <= 0) return modalErr("ശരിയായ തുക നൽകുക.");
          if (amt > b + 0.005) return modalErr("തുക ബാക്കി കടത്തേക്കാൾ (" + money(b) + ") കൂടുതലാണ്.");
          save("payments", { id: uid("pay"), shopId: c.id, shopName: c.name, amount: amt, date: mv("date") || todayIso(), note: clean(mv("note")), deleted: false, createdAt: Date.now() });
          toast("✅ " + c.name + " — " + money(amt) + " വരവ് രേഖപ്പെടുത്തി"); render();
        } });
    },
    ledger(el) {
      const c = byId("customers", el.dataset.id); if (!c) return; const es = ledgerEntries(c), b = balanceOf(c.id);
      openModal({ title: c.name + " — അക്കൗണ്ട്", wide: true, focus: false, ledgerId: c.id,
        body: '<div class="banner ' + (b > 0 ? "red" : "green") + '">ബാക്കി കടം: <b>' + money(b) + '</b></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>തീയതി</th><th>വിവരം</th><th class="r">കടം +</th><th class="r">വരവ് −</th><th class="r">ബാക്കി</th></tr></thead><tbody>' + (es.length ? es.map((x) => "<tr><td>" + (x.date === "0000" ? "-" : h(fmtDate(x.date))) + "</td><td>" + h(x.label) + '</td><td class="r ' + (x.debit ? "neg" : "") + '">' + (x.debit ? money(x.debit) : "") + '</td><td class="r ' + (x.credit ? "pos" : "") + '">' + (x.credit ? money(x.credit) : "") + '</td><td class="r"><b>' + money(x.bal) + "</b></td></tr>").join("") : '<tr><td colspan="5" class="empty">ഇടപാടുകൾ ഇല്ല</td></tr>') + "</tbody></table></div>",
        footer: '<div class="acts"><button type="button" class="btn" data-act="ledger-wa">' + ICON.msg + 'WhatsApp</button><button type="button" class="btn ghost" data-act="modal-cancel">അടയ്ക്കുക</button></div>' });
    },
    "ledger-wa"() {
      const c = byId("customers", modal && modal.ledgerId); if (!c) return; const b = S().biz;
      openWa(c.phone, ["*" + b.name + "*", "അക്കൗണ്ട് സ്റ്റേറ്റ്‌മെന്റ് — *" + c.name + "*", "------------------------"].concat(ledgerEntries(c).slice(-12).map((x) => (x.date === "0000" ? "" : x.date + " ") + x.label + (x.debit ? " | +₹" + x.debit : "") + (x.credit ? " | −₹" + x.credit : "") + " | ബാക്കി ₹" + x.bal)).concat(["------------------------", "*ആകെ ബാക്കി കടം: ₹" + balanceOf(c.id) + "*", b.place + " | Ph: " + b.phone]).join("\n"));
    },

    /* purchases */
    "save-purchase"() {
      const shop = byId("suppliers", $("#p_shop").value), item = clean($("#p_item").value), kg = num($("#p_kg").value), rate = num($("#p_rate").value), date = $("#p_date").value;
      if (!shop) return toast("സപ്ലയറെ തിരഞ്ഞെടുക്കുക", "error");
      if (!item || kg <= 0) return toast("ഇനവും തൂക്കവും കൃത്യമായി നൽകുക", "error");
      if (!date) return toast("തീയതി നൽകുക", "error");
      const old = ui.editPurchase ? state.data.purchases[ui.editPurchase] : null;
      save("purchases", Object.assign({}, old || { id: uid("pu"), deleted: false, createdAt: Date.now() }, { date, shopId: shop.id, shopName: shop.name, shopPhone: shop.phone, item, kg, rate, total: r2(kg * rate), status: $("#p_status").value, notes: clean($("#p_notes").value) }));
      toast(old ? "✅ പർച്ചേസ് അപ്ഡേറ്റ് ചെയ്തു" : "✅ പുതിയ പർച്ചേസ് സേവ് ചെയ്തു");
      ui.editPurchase = null; render();
    },
    "edit-purchase"(el) { ui.editPurchase = el.dataset.id; render(); window.scrollTo({ top: 0, behavior: "smooth" }); },
    "cancel-purchase"() { ui.editPurchase = null; render(); },
    "del-purchase"(el) { const p = byId("purchases", el.dataset.id); if (!p || !can("allowDelete")) return; confirmBox("പർച്ചേസ് നീക്കം ചെയ്യണോ?", p.item + " — " + p.shopName + " (" + kgFmt(p.kg) + " Kg)", "നീക്കം ചെയ്യുക", () => { softDelete("purchases", p.id); toast("നീക്കം ചെയ്തു", "warn"); render(); }); },
    "pur-paid"(el) { const p = byId("purchases", el.dataset.id); if (p) { p.status = "Paid"; save("purchases", p); toast("Paid ആയി രേഖപ്പെടുത്തി"); render(); } },

    /* sales */
    "add-row"() { addRow(); },
    "rm-row"(el) { if ($$("#s_rows .irow").length <= 1) return toast("കുറഞ്ഞത് ഒരു ഇനമെങ്കിലും വേണം", "warn"); el.closest(".irow").remove(); recalcSale(); },
    "save-sale"() {
      const shop = byId("customers", $("#s_shop").value);
      if (!shop) return toast("കടയെ തിരഞ്ഞെടുക്കുക", "error");
      const date = $("#s_date").value; if (!date) return toast("തീയതി നൽകുക", "error");
      const items = [];
      $$("#s_rows .irow").forEach((row) => {
        const sel = $(".r-item", row); const nos = num($(".r-nos", row).value), kg = num($(".r-kg", row).value), price = num($(".r-price", row).value);
        const amount = lineAmount(nos, kg, price);
        if (nos > 0 || kg > 0) { const it = state.data.items[sel.value]; items.push({ itemId: sel.value, name: it ? it.name : sel.options[sel.selectedIndex].text, nos, kg, price, amount }); }
      });
      if (!items.length) return toast("കുറഞ്ഞത് ഒരു ഇനത്തിന്റെ എണ്ണമോ തൂക്കമോ നൽകുക", "error");
      const total = r2(sumBy(items, (i) => i.amount)); const raw = $("#s_paid").value; const paid = raw === "" ? total : r2(num(raw));
      if (paid < 0) return toast("ലഭിച്ച തുക ശരിയല്ല", "error");
      if (paid > total + 0.005) return toast("ലഭിച്ച തുക ബില്ലിനേക്കാൾ (" + money(total) + ") കൂടുതലാണ്. അധിക തുക 'പണം വരവ്' ആയി രേഖപ്പെടുത്തുക.", "error");
      const old = ui.editSale ? state.data.sales[ui.editSale] : null;
      let billNo = old ? old.billNo : $("#s_bill").value;
      if (!old && live("sales").some((s) => s.billNo === billNo)) billNo = nextBillNo();
      const rec = save("sales", Object.assign({}, old || { id: uid("sa"), deleted: false, createdAt: Date.now() }, { billNo, date, shopId: shop.id, shopName: shop.name, shopPhone: shop.phone, items, totalBill: total, paidAmount: paid, credit: Math.max(0, r2(total - paid)), note: clean($("#s_note").value) }));
      ui.editSale = null; render();
      toast("✅ ബിൽ " + billNo + " സേവ് ചെയ്തു");
      showInvoice(rec.id);
    },
    "edit-sale"(el) { ui.editSale = el.dataset.id; render(); window.scrollTo({ top: 0, behavior: "smooth" }); },
    "cancel-sale"() { ui.editSale = null; render(); },
    "del-sale"(el) { const s = byId("sales", el.dataset.id); if (!s || !can("allowDelete")) return; confirmBox("ബിൽ നീക്കം ചെയ്യണോ?", s.billNo + " — " + s.shopName + " (" + money(s.totalBill) + "). ഈ ബില്ലിലെ കടവും ഒഴിവാകും.", "നീക്കം ചെയ്യുക", () => { softDelete("sales", s.id); toast("ബിൽ നീക്കം ചെയ്തു", "warn"); render(); }); },
    "view-bill"(el) { showInvoice(el.dataset.id); },
    "inv-wa"() { const inv = byId("sales", modal && modal.invId); if (inv) openWa(inv.shopPhone, invoiceText(inv)); },
    "inv-print"() { window.print(); },
    async "inv-pdf"(el) { const inv = byId("sales", modal && modal.invId); if (!inv) return; el.disabled = true; try { download(new Blob([await buildInvoicePdf(inv)], { type: "application/pdf" }), inv.billNo + ".pdf"); toast("PDF ഡൗൺലോഡ് ചെയ്തു"); } catch (e) { toast("PDF നിർമ്മിക്കാൻ കഴിഞ്ഞില്ല", "error"); } el.disabled = false; },

    /* reports */
    async "report-pdf"(el) { el.disabled = true; try { download(new Blob([await buildReportPdf(ui.rMonth || monthNow())], { type: "application/pdf" }), "Malabar_Crunch_Report_" + (ui.rMonth || monthNow()) + ".pdf"); toast("PDF ഡൗൺലോഡ് ചെയ്തു"); } catch (e) { toast("PDF നിർമ്മിക്കാൻ കഴിഞ്ഞില്ല", "error"); } el.disabled = false; },
    "report-wa"() {
      const m = ui.rMonth || monthNow(), d = reportData(m), b = S().biz, rates = can("showPurchaseRates"), profit = can("showProfit");
      openWa("", ["*" + b.name + " — MONTHLY REPORT (" + m + ")*", b.place + " | " + b.phone, "------------------------", "Total Sales: *₹" + d.sales + "*", "Bills: " + d.bills + " | " + kgFmt(d.kg) + " Kg"].concat(rates ? ["Total Purchase: *₹" + d.purchase + "*"] : []).concat(["Collection: *₹" + d.collected + "*", "New Credit: ₹" + d.credit]).concat(profit && rates ? ["Net (Sales − Purchase): *₹" + r2(d.sales - d.purchase) + "*"] : []).join("\n"));
    },

    /* admin */
    perm(el) { if (!isAdmin()) return; const s = S(); s.perms[el.dataset.k] = !s.perms[el.dataset.k]; save("settings", s); toast("പെർമിഷൻ അപ്ഡേറ്റ് ചെയ്തു"); render(); },
    "save-pins"() {
      const a = $("#a_pin").value.trim(), p = $("#s_pin").value.trim(); const s = S();
      if (!a && !p) return toast("മാറ്റാൻ പുതിയ പിൻ നൽകുക", "error");
      if ((a && !/^\d{4}$/.test(a)) || (p && !/^\d{4}$/.test(p))) return toast("പിൻ 4 അക്ക നമ്പർ ആയിരിക്കണം", "error");
      const ah = a ? pinHash(a) : s.adminHash, ph = p ? pinHash(p) : s.staffHash;
      if (ah === ph) return toast("അഡ്മിൻ പിന്നും പാർട്ണർ പിന്നും ഒന്നാകാൻ പാടില്ല", "error");
      s.adminHash = ah; s.staffHash = ph; save("settings", s); toast("✅ പിൻ കോഡുകൾ മാറ്റി"); render();
    },
    "save-biz"() {
      const s = S(); const n = clean($("#b_name").value); if (!n) return toast("സ്ഥാപനത്തിന്റെ പേര് നൽകുക", "error");
      s.biz = { name: n, tag: clean($("#b_tag").value), place: clean($("#b_place").value), phone: clean($("#b_phone").value) };
      save("settings", s); toast("✅ സേവ് ചെയ്തു"); render();
    },
    "manage-items"() { itemsModal(); },
    "cat-add"() { $("#catRows").insertAdjacentHTML("beforeend", modal.rowTpl(null)); const l = $$("#catRows .c-name"); l[l.length - 1].focus(); },
    "cat-rm"(el) { el.closest(".li").hidden = true; },
    async "sync-now"(el) { el.disabled = true; const r = await sync(true); el.disabled = false; toast(r === "ok" ? "സിങ്ക് പൂർത്തിയായി" : r === "offline" ? "ഓഫ്‌ലൈൻ ആണ്" : "സിങ്ക് പരാജയപ്പെട്ടു: " + syncErr, r === "ok" ? "" : "error"); if (ui.tab === "admin") render(); },
    async snapshot() { await createSnapshot("Manual Backup (" + todayIso() + ")"); toast("✅ ഫോണിൽ ബാക്കപ്പ് എടുത്തു"); render(); },
    export() { exportBackup(); toast("📥 ബാക്കപ്പ് ഫയൽ ഡൗൺലോഡ് ചെയ്തു"); },
    "restore-snap"(el) { const b = snapCache.find((x) => x.id === el.dataset.id); if (!b) return; confirmBox("റീസ്റ്റോർ ചെയ്യണോ?", b.label + " (" + b.ts + ") — നിലവിലെ ഡാറ്റ ഈ ബാക്കപ്പ് കൊണ്ട് മാറ്റപ്പെടും.", "റീസ്റ്റോർ", () => { restoreData(b.data); toast("✅ റീസ്റ്റോർ ചെയ്തു"); render(); }); },

    "modal-cancel": closeModal,
    "modal-ok"() { if (!modal || !modal.onOk) return; const r = modal.onOk(); if (r !== false) closeModal(); }
  };

  /* =====================================================================
     12. EVENTS & BOOT
     ===================================================================== */
  let installPrompt = null, hiddenAt = 0;

  function wire() {
    document.addEventListener("click", (ev) => {
      const el = ev.target.closest("[data-act]"); if (!el) return;
      const act = el.dataset.act;
      if (act === "modal-bg") { if (ev.target === el) closeModal(); return; }
      if (actions[act]) { if (el.tagName === "A") return; actions[act](el, ev); }
    });
    document.addEventListener("input", (ev) => {
      const el = ev.target;
      if (el.classList.contains("calc-r") || el.classList.contains("calc-s")) recalcSale();
      else if (el.classList.contains("calc-p")) calcPurchase();
    });
    document.addEventListener("change", (ev) => {
      const el = ev.target, ch = el.dataset && el.dataset.ch;
      if (ch === "row-item") { const o = el.options[el.selectedIndex]; $(".r-price", el.closest(".irow")).value = o.getAttribute("data-price") || 0; recalcSale(); }
      else if (ch === "s-shop") salesShopInfo();
      else if (ch === "p-shop") purchaseShopInfo();
      else if (ch === "backup-time") { const s = S(); if (el.value) { s.backupTime = el.value; save("settings", s); toast("ഓട്ടോ ബാക്കപ്പ് സമയം " + el.value); } }
      else if (ch === "restore-file") {
        const f = el.files && el.files[0]; if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          try {
            const p = JSON.parse(rd.result); const data = p.data || p;
            if (!data.sales || !data.customers) throw new Error("bad");
            confirmBox("ഫയലിൽ നിന്ന് റീസ്റ്റോർ ചെയ്യണോ?", f.name + " — നിലവിലെ ഡാറ്റ ഈ ഫയൽ കൊണ്ട് മാറ്റപ്പെടും.", "റീസ്റ്റോർ", () => { restoreData(data); toast("✅ ബാക്കപ്പ് റീസ്റ്റോർ ചെയ്തു"); render(); });
          } catch (e) { toast("അസാധുവായ ബാക്കപ്പ് ഫയൽ!", "error"); }
          el.value = "";
        };
        rd.readAsText(f);
      } else if (el.dataset && el.dataset.ui) {
        ui[el.dataset.ui] = el.value;
        if (/^(pSearch|sSearch|pMonth|sMonth)$/.test(el.dataset.ui)) { const l = $("#liveList"); if (l) l.innerHTML = ui.tab === "sales" ? salesListInner() : purchaseListInner(); }
        else render();
      }
    });
    // live search while typing
    document.addEventListener("input", (ev) => {
      const el = ev.target; if (!el.dataset || (el.dataset.ui !== "pSearch" && el.dataset.ui !== "sSearch")) return;
      ui[el.dataset.ui] = el.value; const l = $("#liveList"); if (l) l.innerHTML = ui.tab === "sales" ? salesListInner() : purchaseListInner();
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && modal) { closeModal(); return; }
      if (!session && /^[0-9]$/.test(ev.key)) { actions.pin({ dataset: { k: ev.key } }); return; }
      if (!session && ev.key === "Backspace") { actions["pin-back"](); return; }
      if (ev.key === "Enter" && modal && ev.target.tagName === "INPUT" && modal.onOk) { ev.preventDefault(); actions["modal-ok"](); }
    });
    window.addEventListener("online", () => { updateStatus(); sync(false); });
    window.addEventListener("offline", updateStatus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); persistNow(); }
      else {
        if (session && hiddenAt && Date.now() - hiddenAt > CFG.AUTOLOCK_MS) { logout(); toast("സുരക്ഷയ്ക്കായി ലോക്ക് ചെയ്തു"); }
        if (online()) sync(false);
      }
    });
    window.addEventListener("pagehide", persistNow);
    window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; });
    window.addEventListener("appinstalled", () => { installPrompt = null; render(); toast("ആപ്പ് ഇൻസ്റ്റാൾ ചെയ്തു"); });
  }

  async function boot() {
    await loadState();
    wire();
    render();
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) navigator.serviceWorker.register("sw.js").catch(() => {});
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if (online()) sync(false);
    setInterval(() => { if (online() && document.visibilityState === "visible" && !syncing) sync(false); }, CFG.POLL_MS);
    if (window.__MC_TEST) {
      window.__MC = { state: () => state, setSession: (r) => { session = r ? { role: r } : null; }, ui: () => ui, render, actions, balanceOf, nextBillNo, mergeRemote, fixDuplicateBills, save, restoreData, dataSnapshot, buildInvoicePdf, buildReportPdf, reportData, pinHash, verifyPin, setPin: (p) => { pin = p; }, todayIso, lineAmount, supplierPayable, ledgerEntries, S, live, collectedOn };
    }
  }
  boot();
})();
