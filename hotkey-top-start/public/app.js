const state = {
  boot: null,
  mode: null,
  client: null,
  courier: null,
  support: null,
  orderForm: {
    storeName: '', storeAddress: '', deliveryAddress: '', deliveryComment: '', replacementsMode: 'SIMILAR_ONLY',
    items: [{ name: '', qty: 1, unitEstimatedPrice: '' }],
  },
  message: null,
  error: null,
};

const $app = document.getElementById('app');
const tg = window.Telegram?.WebApp;
if (tg) { try { tg.ready(); tg.expand(); } catch {} }

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function qs() { return window.location.search || ''; }
function formatRub(cents) { return `${(Number(cents||0)/100).toFixed(0)} ₽`; }
function isNightNow() { const h = new Date().toLocaleString('en-US', { timeZone: 'Europe/Moscow', hour:'2-digit', hour12:false }).slice(0,2); return Number(h) < 6; }
function orderCalc() {
  const items = state.orderForm.items.filter(i => i.name.trim() && Number(i.qty) > 0 && Number(i.unitEstimatedPrice) > 0);
  const goods = items.reduce((s,i)=>s+Number(i.qty)*Number(i.unitEstimatedPrice),0);
  const night = isNightNow();
  const delivery = night ? (goods > 1000 ? Math.round(399 + goods*0.1) : 399) : 99;
  return { goods, delivery, total: goods + delivery };
}
async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (tg?.initData) headers['x-telegram-init-data'] = tg.initData;
  const res = await fetch(path + (path.includes('?') ? '&' : '?') + qs().replace(/^\?/, ''), { ...options, headers });
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.error || 'Ошибка');
  return data.data;
}

function setMessage(msg, isError=false){ state.message = isError?null:msg; state.error = isError?msg:null; render(); }
function renderFlash(){
  const parts=[];
  if (state.error) parts.push(`<div class="error">${esc(state.error)}</div>`);
  if (state.message) parts.push(`<div class="ok">${esc(state.message)}</div>`);
  return parts.join('');
}

async function loadBoot(){
  state.boot = await api('/api/bootstrap');
  state.mode = null;
  render();
}

async function loadClient(){ state.client = await api('/api/client/me'); }
async function loadCourier(){ state.courier = await api('/api/courier/me'); }
async function loadSupport(){ state.support = await api('/api/support/dashboard'); }

function modeScreen(){
  const opts = state.boot.modeOptions.map(o => `<button class="mode-card" onclick="window.setMode('${o.key}')"><strong>${o.title}</strong><span class="sub">${o.key==='client'?'Оформить доставку':o.key==='courier'?'Взять заказ в работу':o.key==='support'?'Очереди, оплаты, поддержка':'Роли и управление'}</span></button>`).join('');
  return `<div class="page"><div class="header"><div><div class="title">${esc(state.boot.cityName)}</div><div class="sub">Старт продукта · время города</div></div><span class="pill ${isNightNow()?'night':'good'}">${isNightNow()?'Ночная доставка':'Дневная доставка'}</span></div>${renderFlash()}<div class="grid two">${opts}</div></div>`;
}

function clientHome(){
  const wallet = state.client.wallet || { balance:0, reservedBalance:0, transactions:[] };
  const available = wallet.balance - wallet.reservedBalance;
  const active = (state.client.clientOrders || []).find(o => !['DELIVERED','CANCELLED'].includes(o.status));
  const tx = (wallet.transactions || []).slice(0,8).map(t=>`<div class="kv"><span class="k">${esc(t.type)}</span><strong>${t.direction==='DEBIT'?'-':'+'}${formatRub(t.amount)}</strong></div>`).join('');
  return `<div class="page">
    <div class="header"><div><div class="title">Заказать</div><div class="sub">Клиентский режим</div></div><button class="btn ghost" onclick="window.backToModes()">Меню</button></div>
    ${renderFlash()}
    <div class="card"><div class="grid two"><div><div class="label">Баланс</div><div class="money">${formatRub(wallet.balance)}</div><div class="sub">Доступно: ${formatRub(available)}</div></div><div class="stack"><button class="btn primary" onclick="window.openOrderForm()">Создать заказ</button><button class="btn" onclick="window.openTopup()">Пополнить</button></div></div></div>
    ${active ? `<div class="card"><div class="header"><strong>Активный заказ ${esc(active.orderNumber)}</strong><span class="pill">${esc(active.status)}</span></div><div class="stack"><div class="kv"><span class="k">Магазин</span><strong>${esc(active.storeName)}</strong></div><div class="kv"><span class="k">Адрес магазина</span><strong>${esc(active.storeAddress)}</strong></div><div class="kv"><span class="k">Доставка</span><strong>${esc(active.deliveryAddress)}</strong></div>${active.receiptTotal?`<div class="kv"><span class="k">Итог по чеку</span><strong>${formatRub(active.receiptTotal + active.deliveryFee)}</strong></div>`:''}<div class="row wrap"><a class="btn" href="https://t.me/${esc(state.boot.supportLink.split('/').pop())}" target="_blank">Поддержка</a></div></div></div>`:''}
    <div class="card"><div class="header"><strong>Последние операции</strong></div><div class="stack">${tx || '<div class="sub">Пока пусто</div>'}</div></div>
  </div>`;
}

function orderFormScreen(){
  const { goods, delivery, total } = orderCalc();
  const itemRows = state.orderForm.items.map((it, idx) => `<div class="card"><div class="item-row"><div class="field"><label class="label">Товар</label><input class="input" value="${esc(it.name)}" oninput="window.editItem(${idx},'name',this.value)" placeholder="Например, вода 1.5л"></div><div class="field"><label class="label">Кол-во</label><input class="input" inputmode="numeric" value="${esc(it.qty)}" oninput="window.editItem(${idx},'qty',this.value)"></div><div class="field"><label class="label">Цена за 1 шт</label><input class="input" inputmode="numeric" value="${esc(it.unitEstimatedPrice)}" oninput="window.editItem(${idx},'unitEstimatedPrice',this.value)" placeholder="100"></div><button class="btn" onclick="window.removeItem(${idx})">✕</button></div><div class="item-total">Итого по позиции: ~${formatRub((Number(it.qty)||0)*(Number(it.unitEstimatedPrice)||0)*100)}</div></div>`).join('');
  return `<div class="page"><div class="header"><div><div class="title">Новый заказ</div><div class="sub">Отдельный экран без лагов клавиатуры</div></div><button class="btn ghost" onclick="window.closeOrderForm()">Назад</button></div>${renderFlash()}
    <div class="card stack">
      <div class="field"><label class="label">Название магазина</label><input class="input" value="${esc(state.orderForm.storeName)}" oninput="window.setOrderField('storeName',this.value)" placeholder="Пятёрочка"></div>
      <div class="field"><label class="label">Адрес магазина</label><input class="input" value="${esc(state.orderForm.storeAddress)}" oninput="window.setOrderField('storeAddress',this.value)" placeholder="Ленина 123"></div>
    </div>
    <div class="stack">${itemRows}</div>
    <button class="btn" onclick="window.addItem()">+ Добавить товар</button>
    <div class="card stack">
      <div class="label">Если товара нет</div>
      <div class="tabs">${[['NO_REPLACEMENTS','Без замен'],['SIMILAR_ONLY','Только похожие'],['ANY_REASONABLE','Можно любые']].map(([v,t])=>`<button class="tab ${state.orderForm.replacementsMode===v?'active':''}" onclick="window.setOrderField('replacementsMode','${v}')">${t}</button>`).join('')}</div>
      <div class="field"><label class="label">Адрес доставки</label><textarea class="textarea" oninput="window.setOrderField('deliveryAddress',this.value)" placeholder="Ленина 321, кв 14">${esc(state.orderForm.deliveryAddress)}</textarea></div>
      <div class="field"><label class="label">Комментарий</label><textarea class="textarea" oninput="window.setOrderField('deliveryComment',this.value)" placeholder="Домофон 12">${esc(state.orderForm.deliveryComment)}</textarea></div>
    </div>
    <div class="card sticky"><div class="totals"><div class="row"><span>Товары</span><strong>~${formatRub(goods*100)}</strong></div><div class="row"><span>${isNightNow()?'Ночная доставка':'Примерная доставка'}</span><strong>${formatRub(delivery*100)}</strong></div><div class="row"><span>К списанию</span><strong>${formatRub(total*100)}</strong></div><div class="sub">${isNightNow()?'Ночной режим 00:00–06:00 · по времени Горячего Ключа':'Днём: заказ от 350 ₽ · ночью: от 500 ₽'}</div></div><div style="height:10px"></div><button class="btn primary" onclick="window.submitOrder()">Создать заказ</button></div>
  </div>`;
}

function topupScreen(){
  return `<div class="page"><div class="header"><div><div class="title">Пополнить баланс</div><div class="sub">Через саппорта</div></div><button class="btn ghost" onclick="window.closeTopup()">Назад</button></div>${renderFlash()}<div class="card stack"><div class="sub"><strong>Перед пополнением</strong><br>Днём: заказ от 350 ₽<br>Примерная доставка днём: от … ₽<br>Ночью: заказ от 500 ₽<br>Ночная доставка: от 399 ₽<br>Ночной режим: 00:00–06:00</div><div class="grid two">${[500,1000,1500].map(v=>`<button class="btn" onclick="window.pickTopup(${v})">${v} ₽</button>`).join('')}<input id="manualTopup" class="input" placeholder="Другая сумма"></div><div class="field"><label class="label">Телефон, с которого пополнили</label><input id="payerPhone" class="input" placeholder="+7..."></div><div class="row wrap"><button class="btn primary" onclick="window.sendTopup()">Я оплатил</button><a class="btn" href="${esc(state.boot.supportLink)}" target="_blank">Поддержка</a></div></div></div>`;
}

function courierHome(){
  const profile = state.courier.courierProfile;
  const active = (state.courier.courierOrders || [])[0];
  if (!profile) return courierRegister();
  if (active) return courierActive(active);
  const cards = (state.courierList || []).map(o=>`<div class="card order-card"><div class="header"><strong>${esc(o.orderNumber)}</strong><div class="money">${formatRub(o.courierPayout)}</div></div><div class="kv"><span class="k">Магазин</span><strong>${esc(o.storeName)}</strong></div><div class="kv"><span class="k">Адрес магазина</span><strong>${esc(o.storeAddress)}</strong></div><div class="kv"><span class="k">Доставка</span><strong>${esc(o.deliveryAddress)}</strong></div><div class="divider"></div><div class="stack">${o.items.slice(0,3).map(i=>`<div>${esc(i.name)} × ${i.qty}</div>`).join('')}</div><div class="row wrap"><span class="pill ${o.isNight?'night':'good'}">${o.isNight?'Ночной':'Дневной'}</span>${o.estimatedGoodsTotal>100000?'<span class="pill">Крупный заказ</span>':''}</div><button class="btn primary" onclick="window.claimOrder('${o.id}')">Взять заказ</button></div>`).join('');
  return `<div class="page"><div class="header"><div><div class="title">К работе</div><div class="sub">${esc(profile.effectiveTransport)} · trust ${esc(profile.trustLevel)}</div></div><button class="btn ghost" onclick="window.backToModes()">Меню</button></div>${renderFlash()}<div class="card"><div class="row space wrap"><div><strong>${esc(state.boot.cityName)}</strong><div class="sub">Доступные заказы списком</div></div><button class="btn" onclick="window.refreshCourierOrders()">Обновить</button></div></div><div class="stack">${cards || '<div class="card"><div class="sub">Свободных заказов пока нет</div></div>'}</div></div>`;
}

function courierRegister(){
  return `<div class="page"><div class="header"><div><div class="title">Профиль курьера</div><div class="sub">Заполняется один раз</div></div><button class="btn ghost" onclick="window.backToModes()">Меню</button></div>${renderFlash()}<div class="card stack"><div class="grid two"><div class="field"><label class="label">Имя</label><input id="cfn" class="input" placeholder="Имя"></div><div class="field"><label class="label">Фамилия</label><input id="cln" class="input" placeholder="Фамилия"></div></div><div class="grid two"><div class="field"><label class="label">Дата рождения</label><input id="cbd" type="date" class="input"></div><div class="field"><label class="label">Телефон</label><input id="cph" class="input" placeholder="+7..."></div></div><div class="label">Транспорт</div><div class="tabs"><button class="tab active" id="walkTab" onclick="window.pickTransport('WALK')">Пешком</button><button class="tab" id="bikeTab" onclick="window.pickTransport('BIKE')">Велосипед</button></div><div class="sub">Велосипед подтверждается саппортом отдельно.</div><button class="btn primary" onclick="window.submitCourierProfile()">Создать профиль</button></div></div>`;
}

function courierActive(order){
  const qr = (order.attachments||[]).find(a=>a.type==='PAYMENT_QR' && !a.deletedAt);
  const receipt = (order.attachments||[]).find(a=>a.type==='RECEIPT' && !a.deletedAt);
  return `<div class="page"><div class="header"><div><div class="title">${esc(order.orderNumber)}</div><div class="sub">Активный заказ</div></div><button class="btn ghost" onclick="window.backToModes()">Меню</button></div>${renderFlash()}<div class="card stack"><div class="money">${formatRub(order.courierPayout || 0)}</div><div class="kv"><span class="k">Статус</span><strong>${esc(order.status)}</strong></div><div class="kv"><span class="k">Магазин</span><strong>${esc(order.storeName)}</strong></div><div class="kv"><span class="k">Адрес магазина</span><strong>${esc(order.storeAddress)}</strong></div><div class="kv"><span class="k">Доставка</span><strong>${esc(order.deliveryAddress)}</strong></div><div class="divider"></div><div class="stack">${order.items.map(i=>`<div>${esc(i.name)} × ${i.qty}</div>`).join('')}</div></div>
    <div class="card stack">
      <div class="grid two"><button class="btn" onclick="window.courierStep('${order.id}','arrive_store')">Я в магазине</button><button class="btn" onclick="window.courierStep('${order.id}','collecting')">Собрал заказ</button></div>
      <div class="grid two"><button class="btn" onclick="window.openQrUpload('${order.id}')">Загрузить QR</button><button class="btn" onclick="window.courierStep('${order.id}','delivering')">Еду к клиенту</button></div>
      <div class="grid two"><button class="btn good" onclick="window.openReceiptUpload('${order.id}')">Загрузить чек</button><button class="btn primary" onclick="window.courierStep('${order.id}','delivered')">Доставил</button></div>
      <div class="grid two"><button class="btn warn" onclick="window.courierStep('${order.id}','amount_higher')">Сумма выше</button><button class="btn warn" onclick="window.courierStep('${order.id}','no_item')">Нет товара</button></div>
      <div class="row wrap">${qr?`<a class="btn" target="_blank" href="${esc(qr.storageRef)}">Открыть QR</a>`:''}${receipt?`<a class="btn" target="_blank" href="${esc(receipt.storageRef)}">Открыть чек</a>`:''}<a class="btn" href="${esc(state.boot.supportLink)}" target="_blank">Поддержка</a></div>
    </div></div>`;
}

function supportHome(){
  const s = state.support;
  const topups = (s.topups||[]).map(t=>`<div class="card stack"><div class="header"><strong>${esc(t.user.telegramUsername || t.user.firstName || t.user.telegramId)}</strong><strong>${formatRub(t.amount)}</strong></div><div class="sub">TG ID: ${esc(t.user.telegramId)} · Телефон: ${esc(t.payerPhone || '—')}</div><div class="row wrap"><button class="btn good" onclick="window.topupAction('${t.id}','confirm')">Подтвердить</button><button class="btn" onclick="window.topupAction('${t.id}','reject')">Отклонить</button></div></div>`).join('');
  const orders = (s.orders||[]).map(o=>`<div class="card stack"><div class="header"><strong>${esc(o.orderNumber)}</strong><span class="pill">${esc(o.status)}</span></div><div class="kv"><span class="k">Клиент</span><strong>${esc(o.clientUser.telegramUsername || o.clientUser.telegramId)}</strong></div><div class="kv"><span class="k">Курьер</span><strong>${esc(o.courierUser?.telegramUsername || 'не назначен')}</strong></div><div class="kv"><span class="k">Сумма товаров</span><strong>${formatRub(o.estimatedGoodsTotal)}</strong></div><div class="row wrap"><button class="btn good" onclick="window.orderSupportAction('${o.id}','confirm_payment')">Подтвердить оплату</button><button class="btn" onclick="window.openEditItems('${o.id}')">Срезать позиции</button></div></div>`).join('');
  const couriers = (s.couriers||[]).map(c=>`<div class="card stack"><div class="header"><strong>${esc(c.firstName || '')} ${esc(c.lastName || '')}</strong><span class="pill">${esc(c.courierProfile?.trustLevel || 'NONE')}</span></div><div class="sub">${esc(c.telegramUsername || c.telegramId)} · ${esc(c.phone || 'без телефона')}</div><div class="row wrap"><button class="btn" onclick="window.courierAction('${c.id}','verify_profile')">Подтвердить профиль</button><button class="btn" onclick="window.courierAction('${c.id}','verify_bike')">Подтвердить велик</button><button class="btn" onclick="window.setCourierTrust('${c.id}')">Trust</button></div></div>`).join('');
  return `<div class="page"><div class="header"><div><div class="title">Саппорт</div><div class="sub">Ручное управление продуктом</div></div><button class="btn ghost" onclick="window.backToModes()">Меню</button></div>${renderFlash()}<div class="tabs"><button class="tab active">Пополнения</button><button class="tab">Заказы</button><button class="tab">Курьеры</button></div><div class="stack">${topups || '<div class="card"><div class="sub">Нет заявок на пополнение</div></div>'}${orders || ''}${couriers || ''}</div></div>`;
}

function adminHome(){
  return `<div class="page"><div class="header"><div><div class="title">Админка</div><div class="sub">Роли и доступы</div></div><button class="btn ghost" onclick="window.backToModes()">Меню</button></div>${renderFlash()}<div class="card"><div class="sub">Назначение support/admin вынесено в backend routes и саппорт-панель. Для MVP это отдельная ручка /api/admin/users/:id/roles.</div></div></div>`;
}

function render(){
  if (!state.boot) { $app.innerHTML = '<div class="page"><div class="card">Загрузка…</div></div>'; return; }
  let html = '';
  if (!state.mode) html = modeScreen();
  else if (state.mode === 'client') html = state.clientView === 'topup' ? topupScreen() : state.clientView === 'orderForm' ? orderFormScreen() : clientHome();
  else if (state.mode === 'courier') html = courierHome();
  else if (state.mode === 'support') html = supportHome();
  else if (state.mode === 'admin') html = adminHome();
  $app.innerHTML = html;
}

window.setMode = async (mode) => {
  state.error = null; state.message = null; state.mode = mode;
  if (mode === 'client') { state.clientView = 'home'; await loadClient(); }
  if (mode === 'courier') { await loadCourier(); await refreshCourierOrders(); }
  if (mode === 'support') { await loadSupport(); }
  if (mode === 'admin') {}
  render();
};
window.backToModes = () => { state.mode = null; state.clientView='home'; render(); };
window.openOrderForm = () => { state.clientView = 'orderForm'; render(); };
window.closeOrderForm = () => { state.clientView = 'home'; render(); };
window.openTopup = () => { state.clientView = 'topup'; render(); };
window.closeTopup = () => { state.clientView = 'home'; render(); };
window.setOrderField = (k, v) => { state.orderForm[k] = v; render(); };
window.addItem = () => { state.orderForm.items.push({ name:'', qty:1, unitEstimatedPrice:'' }); render(); };
window.removeItem = (idx) => { state.orderForm.items.splice(idx,1); if (!state.orderForm.items.length) state.orderForm.items.push({ name:'', qty:1, unitEstimatedPrice:'' }); render(); };
window.editItem = (idx,key,val) => { state.orderForm.items[idx][key] = val; render(); };
window.submitOrder = async () => {
  try {
    const payload = { ...state.orderForm, items: state.orderForm.items.map(i => ({ name: i.name, qty: Number(i.qty), unitEstimatedPrice: Number(i.unitEstimatedPrice) * 100 })) };
    await api('/api/client/orders', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload) });
    state.orderForm = { storeName:'', storeAddress:'', deliveryAddress:'', deliveryComment:'', replacementsMode:'SIMILAR_ONLY', items:[{name:'',qty:1,unitEstimatedPrice:''}] };
    state.clientView='home';
    await loadClient();
    setMessage('Заказ создан');
  } catch (e) { setMessage(e.message, true); }
};
window.pickTopup = (v) => { document.getElementById('manualTopup').value = v; };
window.sendTopup = async () => {
  try {
    const amount = Number(document.getElementById('manualTopup').value || 0) * 100;
    const payerPhone = document.getElementById('payerPhone').value;
    await api('/api/client/topups/request', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ amount, payerPhone }) });
    state.clientView='home'; await loadClient(); setMessage('Заявка на пополнение отправлена саппорту');
  } catch(e){ setMessage(e.message, true); }
};
window.pickTransport = (v) => {
  document.getElementById('walkTab')?.classList.toggle('active', v==='WALK');
  document.getElementById('bikeTab')?.classList.toggle('active', v==='BIKE');
  window.__transport = v;
};
window.submitCourierProfile = async () => {
  try {
    await api('/api/courier/profile', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({
      firstName: document.getElementById('cfn').value,
      lastName: document.getElementById('cln').value,
      birthDate: document.getElementById('cbd').value,
      phone: document.getElementById('cph').value,
      requestedTransport: window.__transport || 'WALK',
    }) });
    await loadCourier(); await refreshCourierOrders(); setMessage('Профиль курьера создан');
  } catch(e){ setMessage(e.message, true); }
};
async function refreshCourierOrders(){ state.courierList = await api('/api/courier/orders'); render(); }
window.refreshCourierOrders = refreshCourierOrders;
window.claimOrder = async (id) => { try { await api(`/api/courier/orders/${id}/claim`, { method:'POST' }); await loadCourier(); await refreshCourierOrders(); setMessage('Заказ закреплён'); } catch(e){ setMessage(e.message, true); } };
window.courierStep = async (id, action) => { try { await api(`/api/courier/orders/${id}/step`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ action }) }); await loadCourier(); setMessage('Статус обновлён'); } catch(e){ setMessage(e.message, true); } };
window.openQrUpload = (id) => {
  const input = document.createElement('input'); input.type='file'; input.accept='image/*'; input.onchange = async () => { const fd = new FormData(); fd.append('file', input.files[0]); try { await api(`/api/courier/orders/${id}/upload-qr`, { method:'POST', body: fd }); await loadCourier(); setMessage('QR загружен'); } catch(e){ setMessage(e.message, true); } }; input.click();
};
window.openReceiptUpload = (id) => {
  const total = prompt('Итог по чеку, ₽');
  const input = document.createElement('input'); input.type='file'; input.accept='image/*'; input.onchange = async () => { const fd = new FormData(); fd.append('receiptTotal', Number(total||0) * 100); fd.append('file', input.files[0]); try { await api(`/api/courier/orders/${id}/upload-receipt`, { method:'POST', body: fd }); await loadCourier(); setMessage('Чек загружен'); } catch(e){ setMessage(e.message, true); } }; input.click();
};
window.topupAction = async (id, action) => { try { await api(`/api/support/topups/${id}/${action}`, { method:'POST' }); await loadSupport(); setMessage('Готово'); } catch(e){ setMessage(e.message, true); } };
window.orderSupportAction = async (id, action) => { try { await api(`/api/support/orders/${id}/action`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ action }) }); await loadSupport(); setMessage('Готово'); } catch(e){ setMessage(e.message, true); } };
window.openEditItems = async (id) => {
  const order = (state.support.orders || []).find(o=>o.id===id); if (!order) return;
  const patches = order.items.map(i => ({ id: i.id, actualQty: i.qty, actualUnitPrice: Math.round(i.unitEstimatedPrice*0.9/100)*100/100, itemStatus:'active' }));
  try { await api(`/api/support/orders/${id}/action`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ action:'edit_items', items: patches }) }); await loadSupport(); setMessage('Заказ отправлен на согласование'); } catch(e){ setMessage(e.message, true); }
};
window.courierAction = async (id, action) => { try { await api(`/api/support/couriers/${id}/action`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ action }) }); await loadSupport(); setMessage('Готово'); } catch(e){ setMessage(e.message, true); } };
window.setCourierTrust = async (id) => {
  const trustLevel = prompt('Уровень trust: NONE / BASIC / TRUSTED / PREMIUM', 'BASIC');
  if (!trustLevel) return;
  try { await api(`/api/support/couriers/${id}/action`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ action:'set_trust', trustLevel }) }); await loadSupport(); setMessage('Trust обновлён'); } catch(e){ setMessage(e.message, true); }
};

loadBoot().catch(e => { $app.innerHTML = `<div class="page"><div class="error">${esc(e.message)}</div></div>`; });
