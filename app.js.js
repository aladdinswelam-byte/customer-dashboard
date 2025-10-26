/* =========================================================
 * app.js  –  Customer-analytics dashboard
 * Reads a local JSON file (data.json) instead of Google Sheets
 * =========================================================*/

/* ---------- 1.  GLOBAL STATE ---------- */
let customerData = {};   // keyed by phone
let rawRows      = [];   // original rows from JSON
let charts       = {};   // Chart.js instances
const DATA_URL   = 'data.json';   // <-- put your file here

/* ---------- 2.  BOOTSTRAP ---------- */
document.addEventListener('DOMContentLoaded', () => {
  /* ---- UI bindings ---- */
  document.getElementById('loadBtn').addEventListener('click', loadLocalJson);
  document.getElementById('copyShare').addEventListener('click', copyShareUrl);

  /* ---- auto-load if ?sheet=xxx is present (keeps old share-links alive) ---- */
  const params = new URLSearchParams(location.search);
  if (params.has('sheet')) {
    document.getElementById('sheetInput').value = params.get('sheet');
    loadLocalJson();                 // we ignore the value—just trigger load
  }
});

/* ---------- 3.  LOAD LOCAL JSON ---------- */
async function loadLocalJson() {
  showLoading(true);
  customerData = {};
  rawRows      = [];

  try {
    const res  = await fetch(DATA_URL);
    if (!res.ok) throw new Error('Network response was not ok');
    const json = await res.json();   // expect SAME format as gviz-json.table
    rawRows    = json.rows || [];
    processRows(rawRows);
    generateShareable();
  } catch (err) {
    console.error(err);
    alert('Could not load data.json – check console and file path.');
  } finally {
    showLoading(false);
  }
}

/* ---------- 4.  BUSINESS LOGIC (unchanged) ---------- */
function processRows(rows) {
  let totalOrders  = 0;
  let totalRevenue = 0;

  rows.forEach(r => {
    const phone = (r['Account Phones'] || r['Account Phone'] || r['Phone'] || '').toString().trim();
    if (!phone) return;

    const name      = r['Account Name'] || r['Name'] || '';
    const restaurant= r['Resturant']    || r['Restaurant'] || '';
    const payment   = r['Payment Method']|| r['Payment']   || '';
    const priceRaw  = r['Total Price']  || r['Amount'] || r['Price'] || 0;
    const price     = Number(String(priceRaw).replace(/[^\d.-]/g,'')) || 0;
    const dateRaw   = r['Created Date'] || r['Order Date'] || r['Date'] || '';
    const date      = tryParseDate(dateRaw);

    if (!customerData[phone]) {
      customerData[phone] = { phone, name, orders:[], totalSpent:0 };
    }
    const cust = customerData[phone];
    cust.orders.push({ date, restaurant, payment, amount:price });
    cust.totalSpent += price;
    totalOrders  += 1;
    totalRevenue += price;
  });

  /* aggregates */
  Object.values(customerData).forEach(c => {
    c.totalOrders  = c.orders.length;
    c.avgOrder     = c.totalOrders ? (c.totalSpent / c.totalOrders) : 0;
    c.orders.sort((a,b)=>(b.date||0)-(a.date||0));
    c.lastOrder    = c.orders[0]?.date || null;
    c.mostRestaurant= mode(c.orders.map(o=>o.restaurant).filter(Boolean)) || '';
    c.mostPayment   = mode(c.orders.map(o=>o.payment).filter(Boolean))    || '';
  });

  updateStatistics(totalOrders, totalRevenue);
  renderTable();
  renderCharts();
}

/* ---------- 5.  UI HELPERS (unchanged) ---------- */
function updateStatistics(totalOrders, totalRevenue) {
  document.getElementById('totalCustomers').textContent = Object.keys(customerData).length.toLocaleString();
  document.getElementById('totalOrders').textContent    = totalOrders.toLocaleString();
  document.getElementById('totalRevenue').textContent   = '$' + totalRevenue.toFixed(2);
  document.getElementById('avgOrder').textContent       = '$' + (totalOrders ? (totalRevenue/totalOrders) : 0).toFixed(2);
}

function renderTable() {
  const tbody = document.getElementById('customerTable');
  tbody.innerHTML = '';
  const list = Object.values(customerData).sort((a,b)=>b.totalSpent - a.totalSpent);
  list.forEach(c=>{
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.onclick = () => showCustomerDetail(c.phone);
    tr.innerHTML = `
      <td>${escapeHtml(c.phone)}</td>
      <td>${escapeHtml(c.name)}</td>
      <td><span class="badge bg-info text-dark">${c.totalOrders}</span></td>
      <td>$${c.avgOrder.toFixed(2)}</td>
      <td><strong>$${c.totalSpent.toFixed(2)}</strong></td>
      <td>${c.lastOrder ? formatDate(new Date(c.lastOrder)) : 'N/A'}</td>`;
    tbody.appendChild(tr);
  });
}

function showCustomerDetail(phone) {
  const c = customerData[phone];
  if (!c) return;
  document.getElementById('selectedPhoneInfo').textContent = `${c.name||'(no name)'} • ${phone}`;
  const tbody = document.getElementById('orderHistory');
  tbody.innerHTML = '';
  c.orders.forEach(o=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${o.date ? formatDate(new Date(o.date)) : 'N/A'}</td>
      <td>${escapeHtml(o.restaurant)}</td>
      <td>${escapeHtml(o.payment)}</td>
      <td>$${o.amount.toFixed(2)}</td>`;
    tbody.appendChild(tr);
  });
  new bootstrap.Collapse('#detailPane', { toggle: false }).show();
}
}

/* ---------- 6.  CHARTS ---------- */
function renderCharts() {
  const monthMap     = {};
  const restaurantMap= {};
  const paymentMap   = {};

  Object.values(customerData).forEach(c=>{
    c.orders.forEach(o=>{
      if (!o.date) return;
      const dt  = new Date(o.date);
      const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      monthMap[key] = (monthMap[key]||0) + 1;
      if (o.restaurant) restaurantMap[o.restaurant] = (restaurantMap[o.restaurant]||0) + o.amount;
      if (o.payment)    paymentMap[o.payment]      = (paymentMap[o.payment]||0) + 1;
    });
  });

  /* orders per month */
  const months  = Object.keys(monthMap).sort();
  const counts  = months.map(m=>monthMap[m]);
  chartReplace('ordersMonthChart', {
    type:'bar',
    data:{ labels: months.map(prettyMonth), datasets:[{ label:'Orders', data:counts, backgroundColor:'#6c4ef8' }] },
    options:{ maintainAspectRatio:false, plugins:{ legend:{ display:false } } }
  });

  /* avg check top-6 */
  const top = Object.values(customerData).sort((a,b)=>b.avgOrder - a.avgOrder).slice(0,6);
  chartReplace('avgCheckChart', {
    type:'bar',
    data:{ labels: top.map(c=>shortName(c.name||c.phone)), datasets:[{ label:'Avg Check', data:top.map(c=>c.avgOrder.toFixed(2)), backgroundColor:'#3ab1ff' }] },
    options:{ maintainAspectRatio:false, plugins:{ legend:{ display:false } } }
  });

  /* payment methods doughnut */
  const payLabels = Object.keys(paymentMap);
  const payValues = payLabels.map(k=>paymentMap[k]);
  chartReplace('paymentChart', {
    type:'doughnut',
    data:{ labels: payLabels, datasets:[{ data:payValues, backgroundColor:generateColors(payLabels.length) }] },
    options:{ maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } } }
  });

  /* restaurant spending pie */
  const restLabels = Object.keys(restaurantMap);
  const restValues = restLabels.map(k=>restaurantMap[k]);
  chartReplace('restaurantChart', {
    type:'pie',
    data:{ labels: restLabels, datasets:[{ data:restValues, backgroundColor:generateColors(restLabels.length) }] },
    options:{ maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } } }
  });
}

function chartReplace(canvasId, cfg) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(ctx, cfg);
}

/* ---------- 7.  UTILITIES ---------- */
function tryParseDate(v) {
  if (!v) return null;

  // 1. Unix-time number (ms)
  if (typeof v === 'number') return new Date(v).toISOString();

  // 2. String that is only digits
  if (String(v).match(/^\d{10,}$/)) return new Date(Number(v)).toISOString();

  // 3. Normal ISO or d/m/y strings
  const d = new Date(v);
  if (!isNaN(d)) return d.toISOString();

  const m = String(v).match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    let [_, day, mo, yr] = m;
    if (yr.length === 2) yr = '20' + yr;
    const iso = new Date(`${yr}-${String(mo).padStart(2,'0')}-${String(day).padStart(2,'0')}`);
    if (!isNaN(iso)) return iso.toISOString();
  }
  return null;
}
function formatDate(d)   { return new Date(d).toLocaleDateString(); }
function prettyMonth(k)  { const [y,m]=k.split('-'); return new Date(y,m-1).toLocaleString('en',{month:'short'})+' '+y; }
function mode(arr)       { if(!arr.length)return null; const o={}; arr.forEach(x=>o[x]=(o[x]||0)+1); return Object.keys(o).sort((a,b)=>o[b]-o[a])[0]; }
function shortName(s)    { return s&&s.length>12 ? s.slice(0,12)+'…' : s||''; }
function generateColors(n){ const p=['#6c4ef8','#3ab1ff','#ff7ab6','#ffb86b','#8affc1','#c4b5fd','#ff6b6b','#7be0ff']; return Array.from({length:n},(_,i)=>p[i%p.length]); }
function escapeHtml(s)   { return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

/* ---------- 8.  SHARE LINK (kept for backward compatibility) ---------- */
function shareUrlFor(id) {
  return id ? `${location.origin}${location.pathname}?sheet=${encodeURIComponent(id)}` : '';
}
function generateShareable() {
  const u = shareUrlFor('local');   // dummy id
  document.getElementById('shareUrl').value = u;
  document.getElementById('shareRow').style.display = 'block';
}
function copyShareUrl() {
  const input = document.getElementById('shareUrl');
  if (!input.value) return;
  navigator.clipboard.writeText(input.value).then(()=>{
    input.value='Copied!';
    setTimeout(()=>input.value=shareUrlFor('local'),1200);
  });
}

/* ---------- 9.  LOADING INDICATOR ---------- */
function showLoading(on) {
  const btn = document.getElementById('loadBtn');
  btn.disabled = on;
  btn.textContent = on ? 'Loading…' : 'Load Data';

}
