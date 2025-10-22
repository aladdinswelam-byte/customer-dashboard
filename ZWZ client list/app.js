let customerData = {};

document.getElementById("loadDataBtn").addEventListener("click", async () => {
  const sheetId = document.getElementById("sheetId").value.trim();
  if (!sheetId) return alert("Please enter your Google Sheet ID");

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;
  try {
    const res = await fetch(url);
    const text = await res.text();
    const json = JSON.parse(text.substring(47).slice(0, -2));
    const rows = json.table.rows;
    processData(rows);
  } catch (err) {
    alert("Error loading data. Check your Sheet ID and sharing settings.");
  }
});

function processData(rows) {
  customerData = {};
  let totalOrders = 0, totalRevenue = 0;

  rows.slice(1).forEach(r => {
    const c = r.c;
    const phone = c[4]?.v || "";
    const name = c[2]?.v || "";
    const date = c[15]?.v || "";
    const amount = parseFloat(c[8]?.v || 0);

    if (!phone) return;

    if (!customerData[phone]) {
      customerData[phone] = { name, phone, orders: [], total: 0 };
    }
    customerData[phone].orders.push({ date, amount });
    customerData[phone].total += amount;
    totalOrders++;
    totalRevenue += amount;
  });

  for (let p in customerData) {
    const c = customerData[p];
    c.totalOrders = c.orders.length;
    c.avgValue = (c.total / c.totalOrders).toFixed(2);
    c.lastOrder = c.orders.sort((a,b) => new Date(b.date) - new Date(a.date))[0].date;
    c.monthlyFreq = c.totalOrders.toFixed(2);
  }

  updateStats(totalOrders, totalRevenue);
  showTable();
}

function updateStats(totalOrders, totalRevenue) {
  const count = Object.keys(customerData).length;
  document.getElementById("totalCustomers").textContent = count;
  document.getElementById("totalOrders").textContent = totalOrders;
  document.getElementById("avgOrderValue").textContent = "$" + (totalRevenue / totalOrders).toFixed(2);
  document.getElementById("avgFrequency").textContent = (totalOrders / count).toFixed(2);
  document.getElementById("stats").style.display = "flex";
}

function showTable() {
  const tbody = document.getElementById("customerTable");
  tbody.innerHTML = "";
  Object.values(customerData).forEach(c => {
    tbody.innerHTML += `
      <tr>
        <td>${c.phone}</td>
        <td>${c.name}</td>
        <td>${new Date(c.lastOrder).toLocaleDateString()}</td>
        <td>${c.totalOrders}</td>
        <td>${c.monthlyFreq}</td>
        <td>$${c.avgValue}</td>
        <td><strong>$${c.total.toFixed(2)}</strong></td>
      </tr>
    `;
  });
  document.getElementById("tableSection").style.display = "block";
}
