// Câu 1: đọc API, dựng XML bằng mô hình DOM, bổ sung màu sắc, kích cỡ, tồn kho rồi lưu file.
const API_URL = "https://fakestoreapi.com/products";

const COLORS = {
  black: { name: "Đen", hex: "#1f1f1f" },
  white: { name: "Trắng", hex: "#f5f5f5" },
  navy: { name: "Xanh navy", hex: "#1f3a5f" },
  gray: { name: "Xám", hex: "#8a8f98" },
  khaki: { name: "Be", hex: "#b9a27c" },
  red: { name: "Đỏ", hex: "#c0392b" },
  pink: { name: "Hồng", hex: "#e58fa8" },
  gold: { name: "Vàng", hex: "#d4af37" },
  silver: { name: "Bạc", hex: "#c0c4cc" },
  rose: { name: "Vàng hồng", hex: "#c98a7a" },
};

const OPTIONS_BY_CATEGORY = {
  "men's clothing": { colors: ["black", "navy", "gray", "khaki"], sizes: ["S", "M", "L", "XL"] },
  "women's clothing": { colors: ["black", "white", "red", "pink"], sizes: ["S", "M", "L", "XL"] },
  jewelery: { colors: ["gold", "silver", "rose"], sizes: ["Free size"] },
  electronics: { colors: ["black", "silver"], sizes: ["Tiêu chuẩn"] },
};

let xmlText = "";

// Công thức theo id để mỗi lần chạy lại đều ra cùng một bộ dữ liệu.
function pickColors(product, all) {
  const count = 2 + (product.id % (all.length - 1));
  const start = product.id % all.length;
  return Array.from({ length: count }, (_, i) => all[(start + i) % all.length]);
}

function calcStock(productId, colorIndex, sizeIndex) {
  const seed = productId * 7 + colorIndex * 13 + sizeIndex * 5;
  return seed % 11 === 0 ? 0 : (seed % 38) + 3;
}

function appendText(doc, parent, tag, value) {
  const el = doc.createElement(tag);
  el.textContent = value;
  parent.appendChild(el);
  return el;
}

function buildProductNode(doc, product) {
  const options = OPTIONS_BY_CATEGORY[product.category];
  const colorCodes = pickColors(product, options.colors);
  const sku = `FS-${String(product.id).padStart(3, "0")}`;

  const node = doc.createElement("product");
  node.setAttribute("id", product.id);
  node.setAttribute("sku", sku);
  node.setAttribute("category", product.category);
  node.setAttribute("status", "active");

  appendText(doc, node, "title", product.title);
  appendText(doc, node, "price", product.price);
  appendText(doc, node, "description", product.description);
  // Ảnh gốc được nén thành WebP và lưu cùng website để trang tải nhanh.
  appendText(doc, node, "image", `images/products/${product.id}.webp`);
  appendText(doc, node, "sourceImage", product.image);

  const apiRating = doc.createElement("apiRating");
  apiRating.setAttribute("rate", product.rating.rate);
  apiRating.setAttribute("count", product.rating.count);
  node.appendChild(apiRating);

  const colors = doc.createElement("colors");
  colorCodes.forEach((code) => {
    const color = doc.createElement("color");
    color.setAttribute("code", code);
    color.setAttribute("name", COLORS[code].name);
    color.setAttribute("hex", COLORS[code].hex);
    colors.appendChild(color);
  });
  node.appendChild(colors);

  const sizes = doc.createElement("sizes");
  options.sizes.forEach((size) => appendText(doc, sizes, "size", size));
  node.appendChild(sizes);

  const variants = doc.createElement("variants");
  let totalStock = 0;
  colorCodes.forEach((code, colorIndex) => {
    options.sizes.forEach((size, sizeIndex) => {
      const stock = calcStock(product.id, colorIndex, sizeIndex);
      totalStock += stock;
      const variant = doc.createElement("variant");
      variant.setAttribute("sku", `${sku}-${code}-${sizeIndex}`);
      variant.setAttribute("color", code);
      variant.setAttribute("size", size);
      variant.setAttribute("stock", stock);
      variants.appendChild(variant);
    });
  });
  node.appendChild(variants);
  appendText(doc, node, "stock", totalStock);

  return node;
}

// Thêm xuống dòng và thụt lề bằng text node để file XML dễ đọc.
function indentNode(doc, node, level = 0) {
  const children = Array.from(node.children);
  if (children.length === 0) return;
  children.forEach((child) => {
    node.insertBefore(doc.createTextNode(`\n${"  ".repeat(level + 1)}`), child);
    indentNode(doc, child, level + 1);
  });
  node.appendChild(doc.createTextNode(`\n${"  ".repeat(level)}`));
}

function buildXml(products) {
  const doc = document.implementation.createDocument("", "products", null);
  const root = doc.documentElement;
  root.setAttribute("source", API_URL);
  root.setAttribute("currency", "USD");
  root.setAttribute("total", products.length);
  products.forEach((product) => root.appendChild(buildProductNode(doc, product)));
  indentNode(doc, root);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(doc)}\n`;
}

const fetchBtn = document.getElementById("fetchBtn");
const saveBtn = document.getElementById("saveBtn");
const statusEl = document.getElementById("toolStatus");
const previewEl = document.getElementById("xmlPreview");

fetchBtn.addEventListener("click", async () => {
  statusEl.textContent = "Đang đọc dữ liệu từ API...";
  fetchBtn.disabled = true;
  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error(`API trả về mã ${response.status}`);
    const products = await response.json();
    xmlText = buildXml(products);
    previewEl.textContent = xmlText;
    saveBtn.disabled = false;
    statusEl.textContent = `Đã dựng XML cho ${products.length} sản phẩm.`;
  } catch (error) {
    statusEl.textContent = `Không đọc được API: ${error.message}`;
  } finally {
    fetchBtn.disabled = false;
  }
});

saveBtn.addEventListener("click", () => {
  const blob = new Blob([xmlText], { type: "application/xml" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "products.xml";
  link.click();
  URL.revokeObjectURL(link.href);
  statusEl.textContent = "Đã lưu products.xml. Hãy đặt file này vào thư mục data/.";
});
