// Trang cửa hàng: tải dữ liệu, hiển thị sản phẩm, lọc, giỏ hàng và các hộp thoại.
import {
  KEYS, store, formatUSD, formatDate, escapeHtml, starsText, delay,
  loadJson, loadProducts, findVariant, availableStock,
} from "./common.js";
import { fetchReviewsXml, parseReviews, attachRatingBadges } from "./reviews.js";
import { Cart } from "./cart.js";
import { setupCheckout } from "./checkout.js";

const SKELETON_CARDS = 8;
const SIMULATED_LATENCY = 900; // Giả lập độ trễ mạng để thấy rõ hiệu ứng Skeleton

const state = {
  products: [],
  reviews: new Map(),
  customers: [],
  customer: store.get(KEYS.customer, null),
  selected: new Map(), // id sản phẩm -> { color, size } đang chọn trên thẻ
  filters: { keyword: "", category: "all", priceMin: 0, priceMax: 1000, color: "all", minRating: 0 },
  sort: "default",
};

const grid = document.getElementById("productGrid");
const resultCount = document.getElementById("resultCount");
const searchForm = document.getElementById("searchForm");
const miniCart = document.getElementById("miniCart");
const cartWrap = document.getElementById("cartWrap");
const cartToggle = document.getElementById("cartToggle");
const cartCount = document.getElementById("cartCount");
const quickViewDialog = document.getElementById("quickViewDialog");
const ratingDialog = document.getElementById("ratingDialog");
const loginDialog = document.getElementById("loginDialog");
const toastEl = document.getElementById("toast");

let toastTimer;
function showToast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
}

const getProduct = (id) => state.products.find((product) => product.id === Number(id));

// ---------- Câu 3: Skeleton Loading ----------
function renderSkeleton() {
  grid.setAttribute("aria-busy", "true");
  grid.innerHTML = Array.from({ length: SKELETON_CARDS }, () => `
    <div class="product-card skeleton-card" aria-hidden="true">
      <div class="skeleton-block skeleton-media"></div>
      <div class="card-body">
        <div class="skeleton-block skeleton-line short"></div>
        <div class="skeleton-block skeleton-line"></div>
        <div class="skeleton-block skeleton-line medium"></div>
        <div class="skeleton-block skeleton-button"></div>
        <div class="skeleton-block skeleton-button"></div>
      </div>
    </div>`).join("");
}

// ---------- Hiển thị danh sách sản phẩm ----------
function defaultSelection(product) {
  const inStock = product.variants.find((variant) => availableStock(variant) > 0) ?? product.variants[0];
  return { color: inStock.color, size: inStock.size };
}

function getSelection(product) {
  if (!state.selected.has(product.id)) state.selected.set(product.id, defaultSelection(product));
  return state.selected.get(product.id);
}

function colorButtons(product, selection) {
  return product.colors.map((color) => {
    const active = color.code === selection.color;
    return `<button type="button" class="swatch${active ? " is-active" : ""}" data-action="pick-color" data-color="${color.code}"
      style="--swatch:${color.hex}" title="${escapeHtml(color.name)}" aria-label="Màu ${escapeHtml(color.name)}" aria-pressed="${active}"></button>`;
  }).join("");
}

function sizeButtons(product, selection) {
  return product.sizes.map((size) => {
    const active = size === selection.size;
    return `<button type="button" class="size-chip${active ? " is-active" : ""}" data-action="pick-size" data-size="${escapeHtml(size)}" aria-pressed="${active}">${escapeHtml(size)}</button>`;
  }).join("");
}

function stockInfo(product, selection) {
  const stock = availableStock(findVariant(product, selection.color, selection.size));
  return { stock, text: stock > 0 ? `Còn ${stock} sản phẩm` : "Hết hàng ở lựa chọn này" };
}

function productCard(product) {
  const selection = getSelection(product);
  const variant = `${selection.color}|${selection.size}`;
  const { stock, text } = stockInfo(product, selection);
  const reviewCount = state.reviews.get(product.id)?.reviews.length ?? 0;
  return `
    <article class="product-card" data-id="${product.id}">
      <div class="card-media">
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}" loading="lazy">
      </div>
      <div class="card-body">
        <p class="card-category">${escapeHtml(product.category)}</p>
        <h3 class="card-title" title="${escapeHtml(product.title)}">${escapeHtml(product.title)}</h3>
        <div class="card-meta">
          <span class="card-price">${formatUSD(product.price)}</span>
          <button type="button" class="rating-link" data-action="rating-detail" data-id="${product.id}">Rating Detail (${reviewCount})</button>
        </div>
        <div class="option-row" role="group" aria-label="Chọn màu">${colorButtons(product, selection)}</div>
        <div class="option-row" role="group" aria-label="Chọn kích cỡ">${sizeButtons(product, selection)}</div>
        <p class="stock-note${stock > 0 ? "" : " is-out"}">${text}</p>
        <div class="card-actions">
          <button type="button" class="btn btn-primary" data-action="add-to-cart" data-id="${product.id}" data-variant="${escapeHtml(variant)}" ${stock > 0 ? "" : "disabled"}>Thêm vào giỏ hàng</button>
          <button type="button" class="btn" data-action="quick-view" data-id="${product.id}" data-variant="${escapeHtml(variant)}">Xem nhanh</button>
        </div>
      </div>
    </article>`;
}

function filteredProducts() {
  const { keyword, category, priceMin, priceMax, color, minRating } = state.filters;
  const term = keyword.trim().toLowerCase();
  const list = state.products.filter((product) => {
    const average = state.reviews.get(product.id)?.average ?? 0;
    return (!term || product.title.toLowerCase().includes(term) || product.description.toLowerCase().includes(term))
      && (category === "all" || product.category === category)
      && product.price >= priceMin && product.price <= priceMax
      && (color === "all" || product.colors.some((entry) => entry.code === color))
      && average >= minRating;
  });

  const averageOf = (product) => state.reviews.get(product.id)?.average ?? 0;
  const sorters = {
    "price-asc": (a, b) => a.price - b.price,
    "price-desc": (a, b) => b.price - a.price,
    "rating-desc": (a, b) => averageOf(b) - averageOf(a),
  };
  return sorters[state.sort] ? [...list].sort(sorters[state.sort]) : list;
}

function renderProducts() {
  const list = filteredProducts();
  grid.setAttribute("aria-busy", "false");
  resultCount.textContent = `Tìm thấy ${list.length} / ${state.products.length} sản phẩm`;
  if (list.length === 0) {
    grid.innerHTML = `<div class="empty-state">
      <p>Không có sản phẩm phù hợp với bộ lọc.</p>
      <button type="button" class="btn" data-action="clear-filters">Xóa bộ lọc</button>
    </div>`;
    return;
  }
  grid.innerHTML = list.map(productCard).join("");
  attachRatingBadges(grid, state.reviews);
}

// Chỉ cập nhật thẻ đang thao tác và ghi lại data-variant mới lên hai nút hành động.
function syncCard(card, product) {
  const selection = getSelection(product);
  const variant = `${selection.color}|${selection.size}`;
  const { stock, text } = stockInfo(product, selection);

  card.querySelectorAll(".swatch").forEach((button) => {
    const active = button.dataset.color === selection.color;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  card.querySelectorAll(".size-chip").forEach((button) => {
    const active = button.dataset.size === selection.size;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  card.querySelectorAll("[data-variant]").forEach((button) => { button.dataset.variant = variant; });
  card.querySelector("[data-action='add-to-cart']").disabled = stock <= 0;

  const stockNote = card.querySelector(".stock-note");
  stockNote.textContent = text;
  stockNote.classList.toggle("is-out", stock <= 0);
}

// ---------- Câu 4: Event Delegation, chỉ một listener trên container cha ----------
grid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || !grid.contains(button)) return;

  const { action } = button.dataset;
  if (action === "clear-filters") {
    searchForm.reset();
    applyFilters();
    return;
  }

  const card = button.closest(".product-card");
  const product = getProduct(card.dataset.id);

  switch (action) {
    case "pick-color":
      getSelection(product).color = button.dataset.color;
      syncCard(card, product);
      break;
    case "pick-size":
      getSelection(product).size = button.dataset.size;
      syncCard(card, product);
      break;
    case "add-to-cart": {
      const { id, variant } = button.dataset;
      console.log("Thêm vào giỏ hàng", { "data-id": id, "data-variant": variant });
      addToCart(getProduct(id), variant);
      break;
    }
    case "quick-view": {
      const { id, variant } = button.dataset;
      console.log("Xem nhanh", { "data-id": id, "data-variant": variant });
      openQuickView(getProduct(id), variant);
      break;
    }
    case "rating-detail":
      openRatingDetail(product);
      break;
  }
});

// ---------- Câu 6: cập nhật giỏ hàng và hiển thị Mini-cart ----------
function addToCart(product, variantValue) {
  const [colorCode, size] = variantValue.split("|");
  const color = product.colors.find((entry) => entry.code === colorCode);
  const stock = availableStock(findVariant(product, colorCode, size));
  const result = Cart.add(product, color, size, stock);
  if (!result.ok) {
    showToast(`Chỉ còn ${stock} sản phẩm ở lựa chọn này.`);
    return false;
  }
  renderMiniCart();
  setMiniCartOpen(true);
  showToast(result.created ? "Đã thêm sản phẩm mới vào giỏ." : "Đã tăng số lượng trong giỏ.");
  return true;
}

function renderMiniCart() {
  cartCount.textContent = Cart.count();
  const head = `<div class="mini-cart-head">
      <h2>Giỏ hàng (${Cart.count()})</h2>
      <button type="button" class="icon-btn" data-cart-action="close" aria-label="Đóng giỏ hàng">×</button>
    </div>`;

  if (Cart.items.length === 0) {
    miniCart.innerHTML = `${head}<p class="empty-cart">Giỏ hàng đang trống.</p>`;
    return;
  }

  const rows = Cart.items.map((item) => {
    const product = getProduct(item.productId);
    const stock = product ? availableStock(findVariant(product, item.color, item.size)) : item.quantity;
    return `<tr>
      <td>
        <div class="mini-cart-item">
          <img src="${escapeHtml(item.image)}" alt="">
          <div>
            <div class="mini-cart-title">${escapeHtml(item.title)}</div>
            <div class="mini-cart-variant">${escapeHtml(item.colorName)} / ${escapeHtml(item.size)}</div>
            <button type="button" class="link-btn" data-cart-action="remove" data-key="${escapeHtml(item.key)}">Xóa</button>
          </div>
        </div>
      </td>
      <td>
        <div class="qty-stepper">
          <button type="button" data-cart-action="decrease" data-key="${escapeHtml(item.key)}" aria-label="Giảm số lượng">−</button>
          <span>${item.quantity}</span>
          <button type="button" data-cart-action="increase" data-key="${escapeHtml(item.key)}" aria-label="Tăng số lượng" ${item.quantity >= stock ? "disabled" : ""}>+</button>
        </div>
      </td>
      <td class="num">${formatUSD(item.price * item.quantity)}</td>
    </tr>`;
  }).join("");

  miniCart.innerHTML = `${head}
    <table class="mini-cart-table">
      <thead><tr><th>Sản phẩm</th><th>SL</th><th class="num">Thành tiền</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="mini-cart-total"><span>Tổng tiền</span><strong id="cartTotal">${formatUSD(Cart.total())}</strong></div>
    <button type="button" class="btn btn-primary btn-block" data-cart-action="checkout">Thanh toán</button>`;
}

function setMiniCartOpen(open) {
  miniCart.hidden = !open;
  cartToggle.setAttribute("aria-expanded", String(open));
}

cartToggle.addEventListener("click", () => setMiniCartOpen(miniCart.hidden));

miniCart.addEventListener("click", (event) => {
  const button = event.target.closest("[data-cart-action]");
  if (!button) return;
  const { cartAction, key } = button.dataset;
  const item = Cart.items.find((entry) => entry.key === key);

  if (cartAction === "close") setMiniCartOpen(false);
  if (cartAction === "remove") Cart.remove(key);
  if (cartAction === "increase") Cart.setQuantity(key, item.quantity + 1);
  if (cartAction === "decrease") Cart.setQuantity(key, item.quantity - 1);
  if (cartAction === "checkout") {
    setMiniCartOpen(false);
    checkout.open();
    return;
  }
  renderMiniCart();
});

// Bấm ra ngoài thì đóng Mini-cart, trừ khi đang thao tác trong lưới sản phẩm.
document.addEventListener("click", (event) => {
  const path = event.composedPath();
  if (!path.includes(cartWrap) && !path.includes(grid)) setMiniCartOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setMiniCartOpen(false);
});

// ---------- Xem nhanh ----------
let quickView = null; // { product, color, size }

function renderQuickView() {
  const { product, color, size } = quickView;
  const selection = { color, size };
  const { stock, text } = stockInfo(product, selection);
  quickViewDialog.innerHTML = `
    <div class="modal-head">
      <h2 id="quickViewTitle">${escapeHtml(product.title)}</h2>
      <button type="button" class="icon-btn" data-close aria-label="Đóng">×</button>
    </div>
    <div class="quick-view">
      <div class="quick-view-media"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}"></div>
      <div class="quick-view-info">
        <p class="card-category">${escapeHtml(product.category)} · ${escapeHtml(product.sku)}</p>
        <p class="card-price">${formatUSD(product.price)}</p>
        <p class="quick-view-desc">${escapeHtml(product.description)}</p>
        <div>
          <p class="option-label">Màu sắc</p>
          <div class="option-row">${colorButtons(product, selection)}</div>
        </div>
        <div>
          <p class="option-label">Kích cỡ</p>
          <div class="option-row">${sizeButtons(product, selection)}</div>
        </div>
        <p class="stock-note${stock > 0 ? "" : " is-out"}">${text}</p>
        <p class="variant-trace" id="variantTrace">data-id: ${product.id} · data-variant: ${escapeHtml(color)}|${escapeHtml(size)}</p>
        <button type="button" class="btn btn-primary" data-action="quick-add" ${stock > 0 ? "" : "disabled"}>Thêm vào giỏ hàng</button>
      </div>
    </div>`;
}

function openQuickView(product, variantValue) {
  const [color, size] = variantValue.split("|");
  quickView = { product, color, size };
  renderQuickView();
  quickViewDialog.showModal();
}

quickViewDialog.addEventListener("click", (event) => {
  if (event.target === quickViewDialog || event.target.closest("[data-close]")) {
    quickViewDialog.close();
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "pick-color") quickView.color = button.dataset.color;
  if (button.dataset.action === "pick-size") quickView.size = button.dataset.size;
  if (button.dataset.action === "quick-add") {
    if (addToCart(quickView.product, `${quickView.color}|${quickView.size}`)) quickViewDialog.close();
    return;
  }
  renderQuickView();
});

// ---------- Câu 5: danh sách khách hàng đánh giá ----------
function openRatingDetail(product) {
  const summary = state.reviews.get(product.id);
  const reviews = summary?.reviews ?? [];
  const rows = [...reviews].sort((a, b) => b.date.localeCompare(a.date)).map((review) => `
    <tr>
      <td>${escapeHtml(review.customerName)}</td>
      <td><span class="stars" aria-label="${review.rating} trên 5 sao">${starsText(review.rating)}</span></td>
      <td>${formatDate(review.date)}</td>
      <td>${escapeHtml(review.comment)}</td>
    </tr>`).join("");

  ratingDialog.innerHTML = `
    <div class="modal-head">
      <h2 id="ratingTitle">Rating Detail: ${escapeHtml(product.title)}</h2>
      <button type="button" class="icon-btn" data-close aria-label="Đóng">×</button>
    </div>
    <div class="rating-summary">
      <span class="rating-score">${(summary?.average ?? 0).toFixed(1)}</span>
      <div>
        <div class="stars">${starsText(summary?.average ?? 0)}</div>
        <div class="result-count">${reviews.length} khách hàng đã đánh giá</div>
      </div>
    </div>
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>Khách hàng</th><th>Số sao</th><th>Ngày</th><th>Nhận xét</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  ratingDialog.showModal();
}

[ratingDialog, loginDialog].forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog || event.target.closest("[data-close]")) dialog.close();
  });
});

// ---------- Câu 2: form tìm kiếm nâng cao ----------
function renderColorOptions() {
  const unique = new Map();
  state.products.forEach((product) => product.colors.forEach((color) => unique.set(color.code, color)));
  const html = [...unique.values()].map((color) => `
    <label class="color-option">
      <input type="radio" name="color" value="${color.code}">
      <span class="color-dot" style="--swatch:${color.hex}"></span>
      <span>${escapeHtml(color.name)}</span>
    </label>`).join("");
  document.getElementById("colorOptions").insertAdjacentHTML("beforeend", html);
}

function applyFilters() {
  const data = new FormData(searchForm);
  state.filters = {
    keyword: data.get("keyword"),
    category: data.get("category"),
    priceMin: Number(data.get("priceMin")),
    priceMax: Number(data.get("priceMax")),
    color: data.get("color"),
    minRating: Number(data.get("minRating")),
  };

  // Khi lọc theo màu, thẻ sản phẩm chọn sẵn màu đó.
  if (state.filters.color !== "all") {
    state.products.forEach((product) => {
      if (product.colors.some((entry) => entry.code === state.filters.color)) {
        getSelection(product).color = state.filters.color;
      }
    });
  }

  document.querySelectorAll("#mainNav [data-category]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.category === state.filters.category);
  });
  document.getElementById("minRatingOutput").textContent = state.filters.minRating;
  renderProducts();
}

const priceMinInput = document.getElementById("priceMin");
const priceMaxInput = document.getElementById("priceMax");

function checkPriceRange() {
  const invalid = Number(priceMinInput.value) > Number(priceMaxInput.value);
  priceMaxInput.setCustomValidity(invalid ? "Giá đến phải lớn hơn hoặc bằng giá từ." : "");
}
priceMinInput.addEventListener("input", checkPriceRange);
priceMaxInput.addEventListener("input", checkPriceRange);

const minRatingInput = document.getElementById("minRating");
minRatingInput.addEventListener("input", () => {
  document.getElementById("minRatingOutput").textContent = minRatingInput.value;
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  applyFilters();
  searchForm.classList.remove("is-open");
  document.getElementById("filterToggle").setAttribute("aria-expanded", "false");
});

searchForm.addEventListener("reset", () => {
  // Sự kiện reset chạy trước khi form đổi giá trị nên đợi sang lượt tiếp theo mới đọc lại.
  setTimeout(() => {
    checkPriceRange();
    applyFilters();
  });
});

document.getElementById("filterToggle").addEventListener("click", (event) => {
  const open = searchForm.classList.toggle("is-open");
  event.currentTarget.setAttribute("aria-expanded", String(open));
});

document.getElementById("sortSelect").addEventListener("change", (event) => {
  state.sort = event.target.value;
  renderProducts();
});

document.getElementById("mainNav").addEventListener("click", (event) => {
  const link = event.target.closest("[data-category]");
  if (!link) return;
  document.getElementById("category").value = link.dataset.category;
  applyFilters();
});

// ---------- Đăng nhập khách hàng ----------
const accountBox = document.getElementById("accountBox");

function renderAccount() {
  if (state.customer) {
    accountBox.innerHTML = `<span class="account-name">Chào, ${escapeHtml(state.customer.fullName)}</span>
      <button type="button" class="btn btn-ghost" id="logoutBtn">Đăng xuất</button>`;
  } else {
    accountBox.innerHTML = `<button type="button" class="btn btn-ghost" id="loginOpenBtn">Đăng nhập</button>`;
  }
}

accountBox.addEventListener("click", (event) => {
  if (event.target.closest("#loginOpenBtn")) {
    document.getElementById("customerLoginForm").reset();
    document.getElementById("custLoginError").textContent = "";
    loginDialog.showModal();
  }
  if (event.target.closest("#logoutBtn")) {
    state.customer = null;
    store.remove(KEYS.customer);
    renderAccount();
    showToast("Đã đăng xuất.");
  }
});

document.getElementById("customerLoginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.target);
  const customer = state.customers.find(
    (entry) => entry.username === data.get("username").trim() && entry.password === data.get("password")
  );
  if (!customer) {
    document.getElementById("custLoginError").textContent = "Sai tên đăng nhập hoặc mật khẩu.";
    return;
  }
  // Không lưu mật khẩu vào localStorage.
  const { password, ...profile } = customer;
  state.customer = profile;
  store.set(KEYS.customer, profile);
  renderAccount();
  loginDialog.close();
  showToast(`Xin chào ${profile.fullName}.`);
});

// ---------- Câu 7: thanh toán ----------
const checkout = setupCheckout({
  getProducts: () => state.products,
  getCustomer: () => state.customer,
  onPaid() {
    renderMiniCart();
    renderProducts();
  },
});

// ---------- Khởi động ----------
async function init() {
  renderSkeleton();
  Cart.load();
  renderAccount();
  try {
    const [products, reviewsXml, customers] = await Promise.all([
      loadProducts(),
      fetchReviewsXml(),
      loadJson("data/customers.json"),
      delay(SIMULATED_LATENCY),
    ]);
    state.products = products;
    state.reviews = parseReviews(reviewsXml);
    state.customers = customers;
    renderColorOptions();
    renderMiniCart();
    renderProducts();
  } catch (error) {
    console.error(error);
    grid.setAttribute("aria-busy", "false");
    resultCount.textContent = "Không tải được sản phẩm";
    grid.innerHTML = `<div class="load-error">
      <p>Không tải được dữ liệu. Nếu đang mở file trực tiếp, hãy chạy trang qua một web server (ví dụ GitHub Pages hoặc Live Server).</p>
      <button type="button" class="btn" onclick="location.reload()">Thử lại</button>
    </div>`;
  }
}

init();
