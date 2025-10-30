let rawRows = [];          // every single order
let aggData = [];          // rolled-up per customer+restaurant
const today   = new Date();

document.getElementById('fileInput').addEventListener('change', handleFile);
document.getElementById('applyBtn').addEventListener('click', applyFilters);

function handleFile(e){
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = function(evt){
    const wb = XLSX.read(evt.target.result, {type:'binary'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    rawRows = XLSX.utils.sheet_to_json(ws, {defval:''});
    aggregate();
    populateDropdowns();
    applyFilters();
  };
  reader.readAsBinaryString(file);
}

function aggregate(){
  const map = {};
  rawRows.forEach(r=>{
    const k = r['Account Name'] + '|' + r['Resturant'];  // spelling matches your sheet
    if(!map[k]) map[k] = {
      name  : r['Account Name'],
      number: r['Account Number'],
      phone : r['Account Phones'],
      rest  : r['Resturant'],
      orders: [],
      total : 0
    };
    const amt = parseFloat(r['Total Price'])||0;
    map[k].orders.push({date: new Date(r['Created']), value: amt});
    map[k].total += amt;
  });

  aggData = Object.values(map).map(x=>{
    x.orders.sort((a,b)=>a.date-b.date);
    const last = x.orders[x.orders.length-1].date;
    const days = Math.floor((today - last)/(864e5));
    return{
      accountName : x.name,
      accountNo   : x.number,
      phone       : x.phone,
      restaurant  : x.rest,
      orders      : x.orders.length,
      totalSpent  : x.total,
      avgSpent    : x.total/x.orders.length,
      lastOrder   : last,
      daysAgo     : days,
      year        : last.getFullYear()
    };
  });
}

function populateDropdowns(){
  const rests = ['All', ...new Set(aggData.map(x=>x.restaurant))].sort();
  const years = ['All', ...new Set(aggData.map(x=>x.year))].sort((a,b)=>b-a);
  document.getElementById('restFilter').innerHTML = rests.map(r=>`<option>${r}</option>`).join('');
  document.getElementById('yearFilter').innerHTML = years.map(y=>`<option>${y}</option>`).join('');
}

function applyFilters(){
  const restSel  = document.getElementById('restFilter').value;
  const yearSel  = document.getElementById('yearFilter').value;
  const avgMin   = parseFloat(document.getElementById('avgMin').value)||0;
  const avgMax   = parseFloat(document.getElementById('avgMax').value)||Infinity;
  const totMin   = parseFloat(document.getElementById('totMin').value)||0;
  const totMax   = parseFloat(document.getElementById('totMax').value)||Infinity;
  const lastMin  = parseInt(document.getElementById('lastMin').value)||0;
  const lastMax  = parseInt(document.getElementById('lastMax').value)||Infinity;
  const lostOnly = document.getElementById('lostOnly').checked;

  let out = aggData.filter(x=>
    (restSel==='All' || x.restaurant===restSel) &&
    (yearSel==='All' || x.year===parseInt(yearSel)) &&
    x.avgSpent>=avgMin && x.avgSpent<=avgMax &&
    x.totalSpent>=totMin && x.totalSpent<=totMax &&
    x.daysAgo>=lastMin && x.daysAgo<=lastMax &&
    (!lostOnly || x.daysAgo>90)
  );
  out.sort((a,b)=>b.orders-a.orders);          // most orders first
  drawTable(out);
}

function drawTable(data){
  const tbody=document.querySelector('#mainTable tbody');
  tbody.innerHTML='';
  data.forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${r.accountName}</td>
      <td>${r.accountNo}</td>
      <td>${r.phone}</td>
      <td>${r.restaurant}</td>
      <td>${r.orders}</td>
      <td>${r.totalSpent.toFixed(2)}</td>
      <td>${r.avgSpent.toFixed(2)}</td>
      <td>${r.lastOrder.toLocaleDateString()}</td>
      <td>${r.daysAgo}</td>`;
    tbody.appendChild(tr);
  });
  document.getElementById('stats').textContent=`Showing ${data.length} accounts`;
}