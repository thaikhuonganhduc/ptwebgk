// Tiện ích dùng chung cho trang cửa hàng và trang quản trị.
export const KEYS = {
  cart: "ducmart_cart",
  orders: "ducmart_orders",
  soldBySku: "ducmart_sold_by_sku",
  customer: "ducmart_customer",
  admin: "ducmart_admin",
  orderStatus: "ducmart_order_status",
};

// localStorage có thể bị chặn ở một số trình duyệt nên luôn đọc ghi trong try/catch.
export const store = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      console.warn(`Không lưu được dữ liệu ${key}`);
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      console.warn(`Không xóa được dữ liệu ${key}`);
    }
  },
};

export const formatUSD = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export const formatDate = (iso) =>
  new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

export const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

export const roundMoney = (value) => Math.round(value * 100) / 100;

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function starsText(value) {
  const full = Math.round(value);
  return "★".repeat(full) + "☆".repeat(5 - full);
}

export async function loadXml(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Không tải được ${url} (mã ${response.status})`);
  const doc = new DOMParser().parseFromString(await response.text(), "application/xml");
  if (doc.querySelector("parsererror")) throw new Error(`File ${url} không đúng định dạng XML`);
  return doc;
}

export async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Không tải được ${url} (mã ${response.status})`);
  return response.json();
}

const textOf = (parent, tag) => parent.querySelector(tag)?.textContent.trim() ?? "";

export async function loadProducts(url = "data/products.xml") {
  const doc = await loadXml(url);
  return Array.from(doc.querySelectorAll("product")).map((node) => ({
    id: Number(node.getAttribute("id")),
    sku: node.getAttribute("sku"),
    category: node.getAttribute("category"),
    title: textOf(node, "title"),
    price: Number(textOf(node, "price")),
    description: textOf(node, "description"),
    image: textOf(node, "image"),
    colors: Array.from(node.querySelectorAll("colors > color")).map((color) => ({
      code: color.getAttribute("code"),
      name: color.getAttribute("name"),
      hex: color.getAttribute("hex"),
    })),
    sizes: Array.from(node.querySelectorAll("sizes > size")).map((size) => size.textContent.trim()),
    variants: Array.from(node.querySelectorAll("variants > variant")).map((variant) => ({
      sku: variant.getAttribute("sku"),
      color: variant.getAttribute("color"),
      size: variant.getAttribute("size"),
      stock: Number(variant.getAttribute("stock")),
    })),
  }));
}

export function findVariant(product, color, size) {
  return product.variants.find((variant) => variant.color === color && variant.size === size);
}

// Tồn kho hiện tại = tồn kho trong XML trừ số lượng đã bán trên trình duyệt này.
export function availableStock(variant) {
  const sold = store.get(KEYS.soldBySku, {});
  return variant ? Math.max(variant.stock - (sold[variant.sku] ?? 0), 0) : 0;
}
