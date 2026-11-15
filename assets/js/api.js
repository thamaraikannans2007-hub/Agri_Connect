/* AgriVision AI – Centralized API Client
   Connects the frontend to the Django REST backend at http://127.0.0.1:8000/api
   This file must be loaded AFTER data.js and BEFORE ui.js. */

/* ---------- Constants ---------- */
// Local dev → Django on localhost. Production (Vercel/static host) → Render backend.
// Override at runtime by setting window.AGRIVISION_API_ORIGIN before this script loads.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const IS_LOCAL = typeof window !== 'undefined' && LOCAL_HOSTS.includes(window.location.hostname);
const SERVER_ORIGIN = (typeof window !== 'undefined' && window.AGRIVISION_API_ORIGIN)
  ? window.AGRIVISION_API_ORIGIN.replace(/\/$/, '')
  : (IS_LOCAL ? 'http://127.0.0.1:8000' : 'https://agri-connect-huxm.onrender.com');
const API_BASE = SERVER_ORIGIN + '/api';
const TOKEN_KEY = 'av-access-token';
const REFRESH_KEY = 'av-refresh-token';
const USER_KEY = 'av-user';

/* ---------- Token / Session Management ---------- */
const Auth = {
  getAccess: () => {
    const t = localStorage.getItem(TOKEN_KEY);
    return (t && t !== 'undefined' && t !== 'null') ? t : null;
  },
  getRefresh: () => {
    const t = localStorage.getItem(REFRESH_KEY);
    return (t && t !== 'undefined' && t !== 'null') ? t : null;
  },
  setTokens: (access, refresh) => {
    if (access && access !== 'undefined' && access !== 'null') {
      localStorage.setItem(TOKEN_KEY, access);
    }
    if (refresh && refresh !== 'undefined' && refresh !== 'null') {
      localStorage.setItem(REFRESH_KEY, refresh);
    }
  },
  getUser: () => {
    try {
      const u = JSON.parse(localStorage.getItem(USER_KEY));
      return (u && typeof u === 'object') ? u : null;
    } catch { return null; }
  },
  setUser: (u) => {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  },
  isLoggedIn: () => {
    const t = Auth.getAccess();
    return !!t;
  },
};

/* ---------- Core fetch wrapper ---------- */
async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const token = Auth.getAccess();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  let res = await fetch(API_BASE + path, { ...options, headers });

  // Auto-refresh on 401
  if (res.status === 401 && Auth.getRefresh()) {
    try {
      const r = await fetch(API_BASE + '/auth/token/refresh/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: Auth.getRefresh() })
      });
      if (r.ok) {
        const d = await r.json();
        const newAccess = d.access || d.tokens?.access;
        const newRefresh = d.refresh || d.tokens?.refresh || Auth.getRefresh();
        Auth.setTokens(newAccess, newRefresh);
        headers['Authorization'] = 'Bearer ' + newAccess;
        res = await fetch(API_BASE + path, { ...options, headers });
      } else {
        Auth.clear();
        return res;
      }
    } catch {
      Auth.clear();
      return res;
    }
  }
  return res;
}

/* ---------- API namespace ---------- */
window.API = {
  /* Auth */
  login: async (email, pass) => {
    const r = await apiFetch('/auth/login/', { method: 'POST', body: JSON.stringify({ email, password: pass }) });
    return r;
  },
  register: async (data) => {
    const r = await apiFetch('/auth/register/', { method: 'POST', body: JSON.stringify(data) });
    return r;
  },
  getProfile: async () => apiFetch('/auth/profile/'),
  updateProfile: async (data) => apiFetch('/auth/profile/', { method: 'PATCH', body: JSON.stringify(data) }),
  refreshToken: async (refresh) => apiFetch('/auth/token/refresh/', { method: 'POST', body: JSON.stringify({ refresh }) }),

  /* Products */
  getProducts: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch('/products/' + (q ? '?' + q : ''));
  },
  getProduct: async (id) => apiFetch('/products/' + id + '/'),
  createProduct: async (formData) => apiFetch('/products/', { method: 'POST', body: formData }),
  updateProduct: async (id, data) => apiFetch('/products/' + id + '/', { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProduct: async (id) => apiFetch('/products/' + id + '/', { method: 'DELETE' }),

  /* Quality & Crop Disease Assessment (CNN EfficientNet-B2) */
  assessQuality: async (formData) => apiFetch('/ai/quality-assessment/', { method: 'POST', body: formData }),
  predictCropDisease: async (data) => {
    try {
      const isFormData = data instanceof FormData;
      const opts = isFormData
        ? { method: 'POST', body: data }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
      const res = await fetch(`${SERVER_ORIGIN}/predict-crop-disease`, opts);
      if (res.ok) return await res.json();
    } catch (e) {}
    if (data instanceof FormData) {
      return apiFetch('/ai/quality-assessment/', { method: 'POST', body: data });
    }
    return apiFetch('/ai/quality-assessment/', { method: 'POST', body: JSON.stringify(data) });
  },
  getCropDiseaseInfo: async () => {
    try {
      const res = await fetch(`${SERVER_ORIGIN}/crop-disease-info`);
      if (res.ok) return await res.json();
    } catch (e) {}
    return null;
  },

  /* Buyers */
  getBuyers: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch('/buyers/' + (q ? '?' + q : ''));
  },
  getNearbyBuyers: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch('/buyers/nearby/' + (q ? '?' + q : ''));
  },
  getBuyer: async (id) => apiFetch('/buyers/' + id + '/'),

  /* Bids */
  getBids: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch('/bids/' + (q ? '?' + q : ''));
  },
  createBid: async (data) => apiFetch('/bids/', { method: 'POST', body: JSON.stringify(data) }),
  acceptBid: async (id) => apiFetch('/bids/' + id + '/accept/', { method: 'POST' }),
  rejectBid: async (id) => apiFetch('/bids/' + id + '/reject/', { method: 'POST' }),
  counterBid: async (id, data) => apiFetch('/bids/' + id + '/counter/', { method: 'POST', body: JSON.stringify(data) }),

  /* Orders */
  getOrders: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch('/orders/' + (q ? '?' + q : ''));
  },
  getOrder: async (id) => apiFetch('/orders/' + id + '/'),
  dispatchOrder: async (id) => apiFetch('/orders/' + id + '/dispatch/', { method: 'POST' }),
  deliverOrder: async (id) => apiFetch('/orders/' + id + '/deliver/', { method: 'POST' }),
  paymentStatus: async (id) => apiFetch('/orders/' + id + '/payment-status/', { method: 'POST' }),

  /* Market */
  getPrices: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch('/market/prices/' + (q ? '?' + q : ''));
  },
  getRecommendations: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch('/market/recommendations/' + (q ? '?' + q : ''));
  },
  getDemand: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch('/market/demand/' + (q ? '?' + q : ''));
  },

  /* Admin */
  getAdminAnalytics: async () => apiFetch('/admin/analytics/'),
  getAdminUsers: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch('/admin/users/' + (q ? '?' + q : ''));
  },
  verifyUser: async (id) => apiFetch('/admin/users/' + id + '/verify/', { method: 'PATCH' }),
  suspendUser: async (id) => apiFetch('/admin/users/' + id + '/suspend/', { method: 'PATCH' }),
  reactivateUser: async (id) => apiFetch('/admin/users/' + id + '/reactivate/', { method: 'PATCH' }),
  getAdminProducts: async (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiFetch('/admin/products/' + (q ? '?' + q : ''));
  },
  getAdminTransactions: async () => apiFetch('/admin/transactions/'),
  getAdminModels: async () => apiFetch('/admin/models/'),

  /* Auth reference */
  Auth,
};

// Convenient lowercase alias
window.api = window.API;

/* ---------- Backend → Frontend data adapters ---------- */
/* Maps backend JSON response shapes to what db / views.js expects. */
window.APIAdapter = {
  user: (u) => ({
    id: u.id,
    role: u.role,
    name: u.role === 'farmer'
      ? (u.farmer_profile?.farm_name || u.full_name)
      : (u.buyer_profile?.company_name || u.full_name),
    fullName: u.full_name,
    email: u.email,
    phone: u.phone || '',
    farm: u.farmer_profile?.farm_name || '',
    village: u.farmer_profile?.village || '',
    city: u.farmer_profile?.city || u.buyer_profile?.city || '',
    district: u.farmer_profile?.district || u.buyer_profile?.district || '',
    state: u.farmer_profile?.state || u.buyer_profile?.state || 'Karnataka',
    acres: u.farmer_profile?.farm_size || 0,
    interests: u.buyer_profile?.interested_crops || [],
    business: u.buyer_profile?.business_type || '',
    contact: u.buyer_profile?.contact_person || '',
    verified: u.is_verified,
    status: u.account_status,
    locShare: u.farmer_profile?.location_sharing_enabled ?? u.buyer_profile?.location_sharing_enabled ?? true,
    joined: u.created_at ? u.created_at.slice(0, 10) : '',
    prefs: { notifyBids: true, notifyPrices: false },
  }),

  listing: (l) => ({
    id: l.id,
    farmer: l.farmer_id || (typeof l.farmer === 'object' && l.farmer !== null ? l.farmer.id : l.farmer),
    name: l.product_name,
    crop: l.crop,
    qty: l.quantity,
    ask: l.asking_price,
    grade: l.quality_grade,
    conf: l.quality_confidence,
    status: l.status,
    district: l.district,
    harvest: l.harvest_date,
    listedAt: l.created_at ? l.created_at.slice(0, 10) : '',
    img: l.image || null,
    unit: l.unit || 'kg',
  }),

  bid: (d) => ({
    id: d.id,
    listing: d.listing_id || (typeof d.listing === 'object' && d.listing !== null ? d.listing.id : d.listing),
    farmerId: d.farmer_id || (typeof d.farmer === 'object' && d.farmer !== null ? d.farmer.id : d.farmer),
    buyerId: d.buyer_id || (typeof d.buyer === 'object' && d.buyer !== null ? d.buyer.id : d.buyer),
    farmerName: d.farmer_name || '',
    buyerName: d.buyer_company || d.buyer_name || '',
    initiator: d.initiated_by || 'farmer',
    price: Number(d.offered_price),
    qty: Number(d.quantity),
    status: d.status || 'pending',
    by: d.current_responder === 'farmer' ? 'buyer' : (d.current_responder === 'buyer' ? 'farmer' : (d.initiated_by || 'farmer')),
    stage: d.delivery_status || null,
    paid: d.payment_status === 'paid',
    t: d.created_at ? new Date(d.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    message: d.message || '',
    rounds: d.counter_offer_rounds || 1,
  }),

  order: (o) => ({
    id: o.id,
    listing: o.listing_id || (typeof o.listing === 'object' && o.listing !== null ? o.listing.id : o.listing),
    farmerId: o.farmer_id || (typeof o.farmer === 'object' && o.farmer !== null ? o.farmer.id : o.farmer),
    buyerId: o.buyer_id || (typeof o.buyer === 'object' && o.buyer !== null ? o.buyer.id : o.buyer),
    price: Number(o.agreed_price),
    qty: Number(o.quantity),
    total: Number(o.total_amount),
    stage: o.delivery_status,
    paid: o.payment_status === 'paid',
    t: o.created_at ? new Date(o.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
  }),
};
