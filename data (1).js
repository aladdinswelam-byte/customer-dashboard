// app.js — reads Google Sheets (gviz JSON), groups by Account Phones, and renders charts

let customerData = {}; // keyed by phone
let rawRows = [];
let charts = {};
let currentSheetId = '';

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loadBtn').onclick = () => {
    const input = document.getElementById('sheetInput').value.trim();
    // accept either full URL or just ID
    const id = extractSheetId(input);
    if (!id) return alert('Please paste a valid Google Sheet ID or full URL.');
    currentSheetId = id;
    loadSheet(id);
  };

  document.getElementById('copyShare').onclick = () => {
    const urlInput = document.getElementById('shareUrl');
    if (!urlInput.value) return;
    navigator.clipboard.writeText(urlInput.value).then(()=> {
      urlInput.value = 'Copied!';
      setTimeout(()=> urlInput.value = shareUrlFor(currentSheetId), 1500);
    });
  };

  // If ?sheet=ID present in URL, auto-fill and load
  const params = new URLSearchParams(window.location.search);
  if (params.get('sheet')) {
    const id = params.get('sheet');
    document.getElementById('sheetInput').value = id;
    currentSheetId = id;
    loadSheet(id);
  }
});

function extractSheetId(input) {
  if (!input) return null;
  // if user pasted URL, extract between /d/ and /edit
  const urlMatch = input.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch) return urlMatch[1];
  // maybe they already pasted id
  if (/^[a-zA-Z0-9-_]{20,}$/.test(input)) return input;
  return null;
}

async function loadSheet(sheetId) {
  showLoading(true);
  customerData = {};
  rawRows = [];
  try {
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;
    const r = await fetch(sheetUrl);
    const txt = await r.text();
    const json = JSON.parse(txt.substring(txt.indexOf('{'), txt.lastIndexOf('}')+1));
    // columns info & rows
    const cols = json.table.cols.map(c => (c.label||'').trim());
    const rows = json.table.rows || [];
    // convert rows to objects
    rows.forEach(row => {
      const obj = {};
      (row.c || []).forEach((cell, i) => {
        obj[cols[i] || `col${i}`] = cell ? cell.v : '';
      });
      rawRows.push(obj);
    });

    // required column names from your sheet:
    // Account Name, Account Phones, Resturant, Payment Method, Total Price, Created Date
    processRows(rawRows);
    generateShareable();
    showLoading(false);
  } catch (e) {
    console.error(e);
    showLoading(false);
    alert('Error loading data. Check your Sheet ID and sharing settings (must be "Anyone with the link → Viewer").');
  }
}

function processRows(rows) {
  customerData = {};
  let totalOrders = 0;
  let totalRevenue = 0;

  rows.forEach(r => {
    const phone = (r['Account Phones'] || r['Account Phone'] || r['Phone'] || '').toString().trim();
    if (!phone) return; // skip rows without phone
    const name = r['Account Name'] || r['Name'] || '';
    const restaurant = r['Resturant'] || r['Restaurant'] || '';
    const payment = r['Payment Method'] || r['Payment'] || '';
    const priceRaw = r['Total Price'] || r['Amount'] || r['Price'] || 0;
    const price = Number(String(priceRaw).replace(/[^\d.-]/g,'')) || 0;
    const dateRaw = r['Created Date'] || r['Order Date'] || r['Date'] || '';
    const date = tryParseDate(dateRaw);

    if (!customerData[phone]) {
      customerData[phone] = {
        phone,
        name,
        orders: [],
        totalSpent: 0,
      };
    }
    customerData[phone].orders.push({ date, restaurant, payment, amount: price });
    customerData[phone].totalSpent += price;
    totalOrders += 1;
    totalRevenue += price;
  });

  // compute aggregates
  Object.values(customerData).forEach(c => {
    c.totalOrders = c.orders.length;
    c.avgOrder = c.totalOrders ? (c.totalSpent / c.totalOrders) : 0;
    c.orders.sort((a,b) => (b.date||0) - (a.date||0));
    c.lastOrder = c.orders.length ? c.orders[0].date : null;
    // compute most frequent restaurant and payment
    c.mostRestaurant = mode(c.orders.map(o=>o.restaurant).filter(Boolean)) || '';
    c.mostPayment = mode(c.orders.map(o=>o.payment).filter(Boolean)) || '';
  });

  // update UI
  updateStatistics(totalOrders, totalRevenue);
  renderTable();
  renderCharts();
}

function updateStatistics(totalOrders, totalRevenue) {
  document.getElementById('totalCustomers').textContent = Object.keys(customerData).length.toLocaleString();
  document.getElementById('totalOrders').textContent = totalOrders.toLocaleString();
  document.getElementById('totalRevenue').textContent = '$' + totalRevenue.toFixed(2);
  const avg = totalOrders ? (totalRevenue / totalOrders) : 0;
  document.getElementById('avgOrder').textContent = '$' + avg.toFixed(2);
}

function renderTable() {
  const tbody = document.getElementById('customerTable');
  tbody.innerHTML = '';
  const customers = Object.values(customerData).sort((a,b)=> b.totalSpent - a.totalSpent);
  customers.forEach(c => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.onclick = () => showCustomerDetail(c.phone);
    const last = c.lastOrder ? formatDate(new Date(c.lastOrder)) : 'N/A';
    tr.innerHTML = `
      <td>${escapeHtml(c.phone)}</td>
      <td>${escapeHtml(c.name)}</td>
      <td><span class="badge bg-info text-dark">${c.totalOrders}</span></td>
      <td>$${c.avgOrder.toFixed(2)}</td>
      <td><strong>$${c.totalSpent.toFixed(2)}</strong></td>
      <td>${last}</td>
    `;
    tbody.appendChild(tr);
  });
}

function showCustomerDetail(phone) {
  const c = customerData[phone];
  if (!c) return;
  document.getElementById('selectedPhoneInfo').textContent = `${c.name || '(no name)'} • ${phone}`;
  const tbody = document.getElementById('orderHistory');
  tbody.innerHTML = '';
  c.orders.sort((a,b)=> (b.date||0) - (a.date||0)).forEach(o => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${o.date ? formatDate(new Date(o.date)) : 'N/A'}</td>
                    <td>${escapeHtml(o.restaurant)}</td>
                    <td>${escapeHtml(o.payment)}</td>
                    <td>$${o.amount.toFixed(2)}</td>`;
    tbody.appendChild(tr);
  });
}

// ===== Charts =====
function renderCharts() {
  // prepare orders per month
  const monthMap = {}; // YYYY-MM -> count
  const restaurantMap = {};
  const paymentMap = {};
  Object.values(customerData).forEach(c=>{
    c.orders.forEach(o=>{
      if (!o.date) return;
      const dt = new Date(o.date);
      const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
      monthMap[key] = (monthMap[key]||0) + 1;
      if (o.restaurant) restaurantMap[o.restaurant] = (restaurantMap[o.restaurant]||0) + o.amount;
      if (o.payment) paymentMap[o.payment] = (paymentMap[o.payment]||0) + 1;
    });
  });

  // orders per month chart
  const months = Object.keys(monthMap).sort();
  const counts = months.map(m=>monthMap[m]);
  chartReplace('ordersMonthChart', { type:'bar', data:{ labels: months.map(m=>prettyMonth(m)), datasets:[{ label:'Orders', data:counts, backgroundColor:'#6c4ef8' }]}, options:{maintainAspectRatio:false, plugins:{legend:{display:false}} }});

  // avg check top customers
  const topCustomers = Object.values(customerData).sort((a,b)=> b.avgOrder - a.avgOrder).slice(0,6);
  chartReplace('avgCheckChart', { type:'bar', data:{ labels: topCustomers.map(c=>shortName(c.name||c.phone)), datasets:[{ label:'Avg Check', data: topCustomers.map(c=>c.avgOrder.toFixed(2)), backgroundColor:'#3ab1ff' }]}, options:{maintainAspectRatio:false, plugins:{legend:{display:false}} }});

  // payment methods pie
  const paymentLabels = Object.keys(paymentMap);
  const paymentValues = paymentLabels.map(k=>paymentMap[k]);
  chartReplace('paymentChart', { type:'doughnut', data:{ labels: paymentLabels, datasets:[{ data: paymentValues, backgroundColor: generateColors(paymentLabels.length) }]}, options:{maintainAspectRatio:false, plugins:{legend:{position:'bottom'}} }});

  // restaurant spending pie
  const restLabels = Object.keys(restaurantMap);
  const restValues = restLabels.map(k=>restaurantMap[k]);
  chartReplace('restaurantChart', { type:'pie', data:{ labels: restLabels, datasets:[{ data: restValues, backgroundColor: generateColors(restLabels.length) }]}, options:{maintainAspectRatio:false, plugins:{legend:{position:'bottom'}} }});
}

function chartReplace(canvasId, config) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(ctx, config);
}

// ===== Helpers =====
function tryParseDate(v) {
  if (!v) return null;
  // if already a number (maybe JS date serial?), try Date
  // Accept common formats
  const d = new Date(v);
  if (!isNaN(d)) return d.toISOString();
  // try dd/mm/yyyy or dd-mm-yyyy
  const m = String(v).match(/(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    // guess which is year by length
    let y = m[3], mo = m[2], day = m[1];
    if (y.length===2) y = '20'+y;
    const iso = new Date(`${y}-${String(mo).padStart(2,'0')}-${String(day).padStart(2,'0')}`);
    if (!isNaN(iso)) return iso.toISOString();
  }
  return null;
}

function formatDate(d) {
  if (!d) return 'N/A';
  const D = new Date(d);
  return D.toLocaleDateString();
}

function prettyMonth(key) {
  // key "YYYY-MM"
  const [y,m] = key.split('-');
  const mm = new Date(y, Number(m)-1, 1).toLocaleString('en-US', { month: 'short' });
  return `${mm} ${y}`;
}

function mode(arr) {
  if (!arr.length) return null;
  const map = {};
  arr.forEach(x => map[x] = (map[x]||0)+1);
  return Object.keys(map).sort((a,b)=> map[b]-map[a])[0];
}

function shortName(s) {
  if (!s) return '';
  return s.length > 12 ? s.slice(0,12)+'…' : s;
}

function generateColors(n) {
  const palette = ['#6c4ef8','#3ab1ff','#ff7ab6','#ffb86b','#8affc1','#c4b5fd','#ff6b6b','#7be0ff'];
  const out = [];
  for (let i=0;i<n;i++) out.push(palette[i % palette.length]);
  return out;
}

function escapeHtml(s) {
  return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

function shareUrlFor(id) {
  if (!id) return '';
  return `${location.origin}${location.pathname}?sheet=${encodeURIComponent(id)}`;
}

function generateShareable() {
  const u = shareUrlFor(currentSheetId);
  document.getElementById('shareUrl').value = u;
  document.getElementById('shareRow').style.display = 'block';
}

// small util for replacing entire file if commit via UI
function showLoading(on) {
  // simple UX: disable button
  const btn = document.getElementById('loadBtn');
  btn.disabled = on;
  btn.textContent = on ? 'Loading…' : 'Load Data';
}