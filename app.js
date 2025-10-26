// ==========  minimal loader  ==========
const DATA_URL = 'data.json';

let customerData = {};   // phone -> {name, orders[], totalSpent}

document.addEventListener('DOMContentLoaded', () => {
  fetch(DATA_URL)
    .then(r => r.json())
    .then(rows => buildDashboard(rows))
    .catch(err => alert('data.json problem\n' + err));
});

function buildDashboard(rows) {
  // 1. group by phone
  rows.forEach(r => {
    const phone = (r['Account Phones'] || r['Phone'] || '').toString().trim();
    if (!phone) return;
    const name  = r['Account Name'] || '';
    const rest  = r['Resturant'] || r['Restaurant'] || '';
    const pay   = r['Payment Method'] || '';
    const price = Number(String(r['Total Price'] || 0).replace(/[^\d.-]/g,'')) || 0;
    const date  = new Date(r['Created Date'] || r['Date'] || 0);   // handles Unix ms

    if (!customerData[phone]) customerData[phone] = {phone, name, orders:[], totalSpent:0};
    const c = customerData[phone];
    c.orders.push({date, restaurant:rest, payment:pay, amount:price});
    c.totalSpent += price;
  });

  // 2. calc aggregates
  Object.values(customerData).forEach(c => {
    c.orderCount = c.orders.length;
    c.lastOrder  = c.orders.sort((a,b) => b.date - a.date)[0]?.date || null;
  });

  // 3. render table
  const tbody = document.getElementById('customerTable');
  const list  = Object.values(customerData).sort((a,b) => b.totalSpent - a.totalSpent);
  document.getElementById('totCustomers').textContent = list.length;

  list.forEach(c => {
    const tr = document.createElement('tr');
    tr.onclick = () => showDetail(c);
    tr.innerHTML = `
      <td>${c.phone}</td>
      <td>${c.name}</td>
      <td>${c.orderCount}</td>
      <td>$${c.totalSpent.toFixed(2)}</td>
      <td>${c.lastOrder ? c.lastOrder.toLocaleDateString() : 'N/A'}</td>`;
    tbody.appendChild(tr);
  });
}

function showDetail(c) {
  document.getElementById('selInfo').textContent = `${c.name} • ${c.phone}`;
  const oh = document.getElementById('orderHistory');
  oh.innerHTML = '';
  c.orders.sort((a,b) => b.date - a.date).forEach(o => {
    oh.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${o.date.toLocaleDateString()}</td>
        <td>${o.restaurant}</td>
        <td>${o.payment}</td>
        <td>$${o.amount.toFixed(2)}</td>
      </tr>`);
  });
  new bootstrap.Collapse('#detailPane', {toggle:false}).show();
}