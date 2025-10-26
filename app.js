/* ==========  CONFIG  ========== */
const DATA_URL = 'data.json';          // MUST be in same folder as this file

/* ==========  STATE  ========== */
let customerData = {};                 // keyed by phone
let rawRows      = [];

/* ==========  BOOT  ========== */
document.addEventListener('DOMContentLoaded', () => {
  loadLocalJson();                     // auto-load on open
});

/* ==========  LOAD JSON  ========== */
async function loadLocalJson() {
  try {
    const res  = await fetch(DATA_URL);
    if (!res.ok) throw new Error('Network response was not ok');
    rawRows = await res.json();        // expect array of objects
    processRows(rawRows);
  } catch (err) {
    console.error(err);
    alert('Could not load data.json – check console and file path.');
  }
}

/* ==========  PROCESS DATA  ========== */
function processRows(rows) {
  let totalOrders  = 0;
  let totalRevenue = 0;

  rows.forEach(r => {
    const phone = (r['Account Phones'] || r['Account Phone'] || r['Phone'] || '').toString().trim();
    if (!phone) return;

    const name       = r['Account Name'] || r['Name'] || '';
    const restaurant = r['Resturant']    || r['Restaurant'] || '';
    const payment    = r['Payment Method']|| r['Payment']   || '';
    const priceRaw   = r['Total Price']  || r['Amount'] || r['Price'] || 0;
    const price      = Number(String(priceRaw).replace(/[^\d.-]/g,'')) || 0;
    const dateRaw    = r['Created Date'] || r['Order Date'] || r['Date'] || '';
    const date       = tryParseDate(dateRaw);

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
    c.mostRestaurant = mode(c.orders.map(o=>o.restaurant).filter(Boolean)) || '';
    c.mostPayment    = mode(c.orders.map(o=>o.payment).filter(Boolean)) || '';
  });

  updateStatistics(totalOrders, totalRevenue);
  renderTable();
}

/* ==========  UI  ========== */
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
  /* =====  open the collapsible pane  ===== */
  new bootstrap.Collapse('#detailPane', { toggle: false }).show();
}

/* ==========  UTILS  ========== */
function tryParseDate(v) {
  if (!v) return null;
  if (typeof v === 'number') return new Date(v).toISOString();          // Unix ms
  if (String(v).match(/^\d{10,}$/)) return new Date(Number(v)).toISOString();
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
function escapeHtml(s)   { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function mode(arr)       { if(!arr.length)return null; const o={}; arr.forEach(x=>o[x]=(o[x]||0)+1); return Object.keys(o).sort((a,b)=>o[b]-o[a])[0]; }