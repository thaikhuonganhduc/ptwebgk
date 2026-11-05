// Câu 8: đăng nhập nhân viên, thống kê đơn hàng và sản phẩm đã bán.
import {
  KEYS, store, formatUSD, formatDate, escapeHtml, roundMoney,
  loadJson, loadXml, loadProducts, availableStock,
} from "./common.js";

const STATUS = {
  processing: { label: "Đang xử lý", icon: "◔" },
  shipping: { label: "Đang giao", icon: "➜" },
  completed: { label: "Hoàn thành", icon: "✓" },
  cancelled: { label: "Đã hủy", icon: "✕" },
};
const PAYMENT = { COD: "COD", BANK: "Chuyển khoản", EWALLET: "Ví điện tử" };
const LOW_STOCK = 5;

const state = { orders: [], products: [], employees: [] };

const statusPill = (status) =>
  `<span class="status-pill status-${status}">${STATUS[status].icon} ${STATUS[status].label}</span>`;

// ---------- Đọc hóa đơn từ carts.xml và đơn đặt trên website (localStorage) ----------
function parseCartNode(node) {
  const text = (selector) => node.querySelector(selector)?.textContent.trim() ?? "";
  return {
    code: node.getAttribute("code"),
    createdAt: node.getAttribute("createdAt"),
    status: node.getAttribute("status"),
    paymentMethod: text("paymentMethod"),
    employee: { id: node.querySelector("employee").getAttribute("id"), name: text("employee > name") },
    customer: {
      id: node.querySelector("customer").getAttribute("id"),
      name: text("customer > name"),
      phone: text("customer > phone"),
      email: text("customer > email"),
      address: text("customer > address"),
    },
    items: Array.from(node.querySelectorAll("items > item")).map((item) => ({
      productId: Number(item.getAttribute("product_id")),
      title: item.querySelector("title").textContent,
      colorName: item.getAttribute("colorName"),
      size: item.getAttribute("size"),
      quantity: Number(item.getAttribute("quantity")),
      unitPrice: Number(item.getAttribute("unitPrice")),
      lineTotal: Number(item.getAttribute("lineTotal")),
    })),
    total: Number(text("total")),
  };
}

async function loadOrders() {
  const doc = await loadXml("data/carts.xml");
  const fromXml = Array.from(doc.querySelectorAll("cart")).map(parseCartNode);
  const fromWebsite = store.get(KEYS.orders, []);
  const overrides = store.get(KEYS.orderStatus, {});
  return [...fromXml, ...fromWebsite]
    .map((order) => ({ ...order, status: overrides[order.code] ?? order.status }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const activeOrders = () => state.orders.filter((order) => order.status !== "cancelled");

// ---------- Tổng quan ----------
function renderKpis() {
  const active = activeOrders();
  const revenue = roundMoney(active.reduce((sum, order) => sum + order.total, 0));
  const units = active.reduce((sum, order) => sum + order.items.reduce((n, item) => n + item.quantity, 0), 0);
  const average = active.length ? revenue / active.length : 0;
  const cards = [
    ["Doanh thu", formatUSD(revenue), "kpiRevenue"],
    ["Tổng số đơn hàng", state.orders.length, "kpiOrders"],
    ["Sản phẩm đã bán", units, "kpiUnits"],
    ["Giá trị đơn trung bình", formatUSD(average), "kpiAverage"],
  ];
  document.getElementById("kpiGrid").innerHTML = cards.map(([label, value, id]) => `
    <div class="kpi-card">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value" id="${id}">${value}</div>
    </div>`).join("");

  document.getElementById("statusRow").innerHTML = Object.keys(STATUS).map((status) => {
    const count = state.orders.filter((order) => order.status === status).length;
    return `<span class="status-pill status-${status}">${STATUS[status].icon} ${STATUS[status].label}: ${count}</span>`;
  }).join("");
}

function monthlyRevenue() {
  const months = new Map();
  activeOrders().forEach((order) => {
    const month = order.createdAt.slice(0, 7);
    months.set(month, roundMoney((months.get(month) ?? 0) + order.total));
  });
  return [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, revenue]) => ({ month, revenue }));
}

const monthLabel = (month) => `${month.slice(5)}/${month.slice(0, 4)}`;

function niceMax(value) {
  const magnitude = 10 ** Math.floor(Math.log10(value || 1));
  const step = [1, 2, 4, 6, 8, 10].find((n) => n * magnitude >= value);
  return step * magnitude;
}

function renderRevenueChart() {
  const data = monthlyRevenue();
  const chart = document.getElementById("revenueChart");
  const width = 640;
  const height = 280;
  const margin = { top: 24, right: 8, bottom: 28, left: 56 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxY = niceMax(Math.max(...data.map((row) => row.revenue), 1));
  const y = (value) => margin.top + plotHeight - (value / maxY) * plotHeight;
  const band = plotWidth / Math.max(data.length, 1);
  const barWidth = Math.min(44, band * 0.6);
  const peak = Math.max(...data.map((row) => row.revenue));

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = maxY * ratio;
    return `<line class="grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${y(value)}" y2="${y(value)}"></line>
      <text x="${margin.left - 8}" y="${y(value) + 4}" text-anchor="end">$${value.toLocaleString("en-US")}</text>`;
  }).join("");

  const bars = data.map((row, index) => {
    const x = margin.left + band * index + (band - barWidth) / 2;
    const top = y(row.revenue);
    const base = y(0);
    const radius = Math.min(4, base - top);
    // Bo góc 4px ở đầu cột, chân cột giữ vuông để bám trục.
    const path = `M${x},${base} V${top + radius} Q${x},${top} ${x + radius},${top} H${x + barWidth - radius} Q${x + barWidth},${top} ${x + barWidth},${top + radius} V${base} Z`;
    return `<g class="bar-group" tabindex="0" data-month="${monthLabel(row.month)}" data-value="${formatUSD(row.revenue)}" data-x="${x + barWidth / 2}" data-y="${top}"
        aria-label="Tháng ${monthLabel(row.month)}: ${formatUSD(row.revenue)}">
      <rect class="hit" x="${margin.left + band * index}" y="${margin.top}" width="${band}" height="${plotHeight}"></rect>
      <path class="bar" d="${path}"></path>
      ${row.revenue === peak ? `<text class="peak-label" x="${x + barWidth / 2}" y="${top - 6}" text-anchor="middle">${formatUSD(row.revenue)}</text>` : ""}
      <text x="${x + barWidth / 2}" y="${height - 8}" text-anchor="middle">${monthLabel(row.month)}</text>
    </g>`;
  }).join("");

  chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Biểu đồ cột doanh thu theo tháng">${gridLines}${bars}</svg>`;

  document.getElementById("revenueTable").innerHTML = `
    <table class="data-table">
      <thead><tr><th>Tháng</th><th class="num">Doanh thu</th></tr></thead>
      <tbody>${data.map((row) => `<tr><td>${monthLabel(row.month)}</td><td class="num">${formatUSD(row.revenue)}</td></tr>`).join("")}</tbody>
    </table>`;

  const svg = chart.querySelector("svg");
  const tooltip = document.getElementById("chartTooltip");
  const showTooltip = (group) => {
    const svgBox = svg.getBoundingClientRect();
    const panelBox = chart.parentElement.getBoundingClientRect();
    const scale = svgBox.width / width;
    tooltip.textContent = `Tháng ${group.dataset.month}: ${group.dataset.value}`;
    tooltip.style.left = `${svgBox.left - panelBox.left + Number(group.dataset.x) * scale}px`;
    tooltip.style.top = `${svgBox.top - panelBox.top + Number(group.dataset.y) * scale - 8}px`;
    tooltip.hidden = false;
  };
  svg.querySelectorAll(".bar-group").forEach((group) => {
    group.addEventListener("mouseenter", () => showTooltip(group));
    group.addEventListener("focus", () => showTooltip(group));
    group.addEventListener("mouseleave", () => { tooltip.hidden = true; });
    group.addEventListener("blur", () => { tooltip.hidden = true; });
  });
}

function productStats() {
  const stats = new Map();
  activeOrders().forEach((order) => {
    order.items.forEach((item) => {
      const entry = stats.get(item.productId) ?? { quantity: 0, revenue: 0 };
      entry.quantity += item.quantity;
      entry.revenue = roundMoney(entry.revenue + item.lineTotal);
      stats.set(item.productId, entry);
    });
  });
  return state.products
    .map((product) => ({
      product,
      quantity: stats.get(product.id)?.quantity ?? 0,
      revenue: stats.get(product.id)?.revenue ?? 0,
      stock: product.variants.reduce((sum, variant) => sum + availableStock(variant), 0),
    }))
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue);
}

function renderTopProducts() {
  const top = productStats().slice(0, 5);
  const max = Math.max(...top.map((row) => row.quantity), 1);
  document.getElementById("topProducts").innerHTML = top.map((row) => `
    <div class="top-row">
      <div class="top-row-head">
        <span class="top-row-title" title="${escapeHtml(row.product.title)}">${escapeHtml(row.product.title)}</span>
        <span class="top-row-value">${row.quantity}</span>
      </div>
      <div class="top-bar" style="width:${(row.quantity / max) * 100}%"></div>
    </div>`).join("");
}

// ---------- Đơn hàng ----------
const orderFilterForm = document.getElementById("orderFilterForm");
const orderDialog = document.getElementById("orderDialog");

function renderOrderMonths() {
  const months = [...new Set(state.orders.map((order) => order.createdAt.slice(0, 7)))].sort().reverse();
  document.getElementById("orderMonth").insertAdjacentHTML(
    "beforeend",
    months.map((month) => `<option value="${month}">Tháng ${monthLabel(month)}</option>`).join("")
  );
}

function renderOrders() {
  const data = new FormData(orderFilterForm);
  const keyword = data.get("keyword").trim().toLowerCase();
  const status = data.get("status");
  const month = data.get("month");
  const list = state.orders.filter((order) =>
    (!keyword || order.code.toLowerCase().includes(keyword) || order.customer.name.toLowerCase().includes(keyword))
    && (status === "all" || order.status === status)
    && (month === "all" || order.createdAt.startsWith(month))
  );

  document.getElementById("orderCount").textContent = `Hiển thị ${list.length} / ${state.orders.length} đơn hàng`;
  document.getElementById("ordersBody").innerHTML = list.length === 0
    ? `<tr><td colspan="8">Không có đơn hàng phù hợp.</td></tr>`
    : list.map((order) => `
      <tr>
        <td>${escapeHtml(order.code)}</td>
        <td>${formatDate(order.createdAt)}</td>
        <td>${escapeHtml(order.customer.name)}</td>
        <td>${escapeHtml(order.employee.name)}</td>
        <td class="num">${order.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
        <td class="num">${formatUSD(order.total)}</td>
        <td>${statusPill(order.status)}</td>
        <td><button type="button" class="btn" data-order="${escapeHtml(order.code)}">Chi tiết</button></td>
      </tr>`).join("");
}

function openOrder(code) {
  const order = state.orders.find((entry) => entry.code === code);
  const rows = order.items.map((item) => `
    <tr>
      <td>${escapeHtml(item.title)}<br><small>${escapeHtml(item.colorName)} / ${escapeHtml(item.size)}</small></td>
      <td class="num">${item.quantity}</td>
      <td class="num">${formatUSD(item.unitPrice)}</td>
      <td class="num">${formatUSD(item.lineTotal)}</td>
    </tr>`).join("");
  const options = Object.entries(STATUS).map(([value, { label }]) =>
    `<option value="${value}" ${value === order.status ? "selected" : ""}>${label}</option>`).join("");

  orderDialog.innerHTML = `
    <div class="modal-head">
      <h2 id="orderDialogTitle">Đơn hàng ${escapeHtml(order.code)}</h2>
      <button type="button" class="icon-btn" data-close aria-label="Đóng">×</button>
    </div>
    <div class="order-info">
      <div><span class="label">Khách hàng:</span> ${escapeHtml(order.customer.name)}</div>
      <div><span class="label">Điện thoại:</span> ${escapeHtml(order.customer.phone)}</div>
      <div><span class="label">Email:</span> ${escapeHtml(order.customer.email)}</div>
      <div><span class="label">Địa chỉ:</span> ${escapeHtml(order.customer.address)}</div>
      <div><span class="label">Ngày tạo:</span> ${formatDate(order.createdAt)}</div>
      <div><span class="label">Nhân viên:</span> ${escapeHtml(order.employee.name)}</div>
      <div><span class="label">Thanh toán:</span> ${escapeHtml(PAYMENT[order.paymentMethod] ?? order.paymentMethod)}</div>
    </div>
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>Sản phẩm</th><th class="num">SL</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="order-total"><span>Tổng tiền</span><span>${formatUSD(order.total)}</span></div>
    <form class="order-status-box" id="orderStatusForm" data-code="${escapeHtml(order.code)}">
      <div class="field">
        <label for="orderStatusSelect">Cập nhật trạng thái</label>
        <select id="orderStatusSelect" name="status">${options}</select>
      </div>
      <button type="submit" class="btn btn-primary">Lưu trạng thái</button>
    </form>`;
  orderDialog.showModal();
}

function renderProductStats() {
  document.getElementById("productStatsBody").innerHTML = productStats().map(({ product, quantity, revenue, stock }) => `
    <tr>
      <td>${escapeHtml(product.sku)}</td>
      <td>${escapeHtml(product.title)}</td>
      <td>${escapeHtml(product.category)}</td>
      <td class="num">${formatUSD(product.price)}</td>
      <td class="num">${quantity}</td>
      <td class="num">${formatUSD(revenue)}</td>
      <td class="num${stock <= LOW_STOCK ? " low-stock" : ""}">${stock}${stock <= LOW_STOCK ? " (cần nhập)" : ""}</td>
    </tr>`).join("");
}

function renderAll() {
  renderKpis();
  renderRevenueChart();
  renderTopProducts();
  renderOrders();
  renderProductStats();
}

// ---------- Sự kiện ----------
orderFilterForm.addEventListener("input", renderOrders);
orderFilterForm.addEventListener("submit", (event) => event.preventDefault());

document.getElementById("ordersBody").addEventListener("click", (event) => {
  const button = event.target.closest("[data-order]");
  if (button) openOrder(button.dataset.order);
});

orderDialog.addEventListener("click", (event) => {
  if (event.target === orderDialog || event.target.closest("[data-close]")) orderDialog.close();
});

orderDialog.addEventListener("submit", (event) => {
  event.preventDefault();
  const { code } = event.target.dataset;
  const status = new FormData(event.target).get("status");
  store.set(KEYS.orderStatus, { ...store.get(KEYS.orderStatus, {}), [code]: status });
  state.orders.find((order) => order.code === code).status = status;
  orderDialog.close();
  renderAll();
});

document.getElementById("adminNav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  document.querySelectorAll("#adminNav [data-view]").forEach((item) => {
    item.classList.toggle("is-active", item === button);
  });
  ["overview", "orders", "products"].forEach((view) => {
    document.getElementById(`view-${view}`).hidden = view !== button.dataset.view;
  });
});

// ---------- Đăng nhập ----------
const loginScreen = document.getElementById("loginScreen");
const adminShell = document.getElementById("adminShell");
const loginError = document.getElementById("adminLoginError");

async function showDashboard(session) {
  loginScreen.hidden = true;
  adminShell.hidden = false;
  document.getElementById("adminUserName").textContent = `${session.fullName} (${session.role})`;
  [state.products, state.orders] = await Promise.all([loadProducts(), loadOrders()]);
  renderOrderMonths();
  renderAll();
}

document.getElementById("adminLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  try {
    if (state.employees.length === 0) state.employees = await loadJson("data/employees.json");
  } catch {
    loginError.textContent = "Không tải được dữ liệu nhân viên.";
    return;
  }
  const employee = state.employees.find(
    (entry) => entry.username === data.get("username").trim() && entry.password === data.get("password")
  );
  if (!employee) {
    loginError.textContent = "Sai tên đăng nhập hoặc mật khẩu.";
    return;
  }
  if (!employee.active) {
    loginError.textContent = "Tài khoản này đã bị khóa.";
    return;
  }
  const session = { id: employee.id, fullName: employee.fullName, role: employee.role };
  store.set(KEYS.admin, session);
  loginError.textContent = "";
  showDashboard(session);
});

document.getElementById("adminLogoutBtn").addEventListener("click", () => {
  store.remove(KEYS.admin);
  location.reload();
});

const savedSession = store.get(KEYS.admin, null);
if (savedSession) showDashboard(savedSession);
