// Câu 7: form thanh toán kiểm tra bằng Regex, gọi API giả lập và lưu đơn hàng vào localStorage.
import { KEYS, store, delay, escapeHtml, formatUSD, roundMoney } from "./common.js";
import { Cart } from "./cart.js";

// Số di động Việt Nam: 0 hoặc +84, theo sau là đầu số hợp lệ và 7 chữ số.
const PHONE_REGEX = /^(?:0|\+?84)(?:3[2-9]|5[2689]|7[06-9]|8[1-9]|9\d)\d{7}$/;
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

const RULES = {
  shipName: (value) => (value.trim().length >= 2 ? "" : "Vui lòng nhập họ tên, tối thiểu 2 ký tự."),
  shipPhone: (value) => {
    if (!value.trim()) return "Vui lòng nhập số điện thoại.";
    return PHONE_REGEX.test(value.replace(/[\s.-]/g, "")) ? "" : "Số điện thoại Việt Nam không hợp lệ, ví dụ 0912345678.";
  },
  shipEmail: (value) => {
    if (!value.trim()) return "Vui lòng nhập email.";
    return EMAIL_REGEX.test(value.trim()) ? "" : "Email không đúng định dạng, ví dụ ban@example.com.";
  },
  shipAddress: (value) => (value.trim().length >= 10 ? "" : "Vui lòng nhập địa chỉ đầy đủ, tối thiểu 10 ký tự."),
};

function validateField(input) {
  const message = RULES[input.id](input.value);
  const messageEl = document.getElementById(`${input.id}Msg`);
  input.classList.toggle("is-invalid", Boolean(message));
  input.classList.toggle("is-valid", !message);
  input.setAttribute("aria-invalid", String(Boolean(message)));
  messageEl.className = `field-msg ${message ? "error" : "ok"}`;
  messageEl.textContent = message || "Hợp lệ";
  return !message;
}

// Giả lập cổng thanh toán: trả về kết quả sau một khoảng trễ như API thật.
async function fakePaymentApi(order) {
  await delay(900);
  return { success: true, transactionId: `TXN${Date.now()}`, code: order.code };
}

function buildOrder(formData, customer) {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  return {
    code: `DH${stamp}-${String(now.getTime()).slice(-5)}`,
    createdAt: now.toISOString(),
    status: "processing",
    source: "website",
    employee: { id: "", name: "Website" },
    customer: {
      id: customer?.id ?? "",
      name: formData.get("fullName").trim(),
      phone: formData.get("phone").replace(/[\s.-]/g, ""),
      email: formData.get("email").trim(),
      address: formData.get("address").trim(),
    },
    paymentMethod: formData.get("paymentMethod"),
    items: Cart.items.map((item) => ({
      productId: item.productId,
      title: item.title,
      color: item.color,
      colorName: item.colorName,
      size: item.size,
      quantity: item.quantity,
      unitPrice: item.price,
      lineTotal: roundMoney(item.price * item.quantity),
    })),
    total: Cart.total(),
  };
}

function recordSoldStock(order, products) {
  const sold = store.get(KEYS.soldBySku, {});
  order.items.forEach((item) => {
    const product = products.find((entry) => entry.id === item.productId);
    const variant = product?.variants.find((entry) => entry.color === item.color && entry.size === item.size);
    if (variant) sold[variant.sku] = (sold[variant.sku] ?? 0) + item.quantity;
  });
  store.set(KEYS.soldBySku, sold);
}

export function setupCheckout({ getProducts, getCustomer, onPaid }) {
  const dialog = document.getElementById("checkoutDialog");
  const form = document.getElementById("checkoutForm");
  const formView = document.getElementById("checkoutFormView");
  const successView = document.getElementById("checkoutSuccessView");
  const summary = document.getElementById("orderSummary");
  const payBtn = document.getElementById("payBtn");
  const payError = document.getElementById("payError");
  const inputs = Object.keys(RULES).map((id) => document.getElementById(id));

  // Kiểm tra ngay khi gõ phím (keyup) và khi rời ô nhập (blur).
  inputs.forEach((input) => {
    input.addEventListener("keyup", (event) => {
      if (event.key !== "Tab") validateField(input);
    });
    input.addEventListener("blur", () => validateField(input));
  });

  function resetFieldStates() {
    inputs.forEach((input) => {
      input.classList.remove("is-invalid", "is-valid");
      input.removeAttribute("aria-invalid");
      document.getElementById(`${input.id}Msg`).textContent = "";
    });
  }

  function renderSummary() {
    summary.innerHTML = `
      <h3>Đơn hàng của bạn</h3>
      ${Cart.items
        .map(
          (item) => `<div class="summary-line">
            <div>${escapeHtml(item.title)}<small>${escapeHtml(item.colorName)} / ${escapeHtml(item.size)} × ${item.quantity}</small></div>
            <div>${formatUSD(item.price * item.quantity)}</div>
          </div>`
        )
        .join("")}
      <div class="summary-total"><span>Tổng tiền</span><span>${formatUSD(Cart.total())}</span></div>`;
  }

  dialog.addEventListener("click", (event) => {
    if (event.target.closest("[data-close]")) dialog.close();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    payError.textContent = "";
    const results = inputs.map(validateField);
    const firstInvalid = inputs[results.indexOf(false)];
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    payBtn.disabled = true;
    payBtn.textContent = "Đang xử lý thanh toán...";
    const order = buildOrder(new FormData(form), getCustomer());
    try {
      const result = await fakePaymentApi(order);
      order.transactionId = result.transactionId;
      store.set(KEYS.orders, [...store.get(KEYS.orders, []), order]);
      recordSoldStock(order, getProducts());
      Cart.clear();
      formView.hidden = true;
      successView.hidden = false;
      successView.innerHTML = `
        <h2>Thanh toán thành công</h2>
        <p>Mã đơn hàng: <strong id="successCode">${escapeHtml(order.code)}</strong></p>
        <p>Tổng tiền: <strong>${formatUSD(order.total)}</strong></p>
        <p>Đơn hàng đã được lưu vào LocalStorage của trình duyệt.</p>
        <button type="button" class="btn btn-primary" data-close>Tiếp tục mua sắm</button>`;
      onPaid(order);
    } catch {
      payError.textContent = "Không thể thanh toán lúc này, vui lòng thử lại.";
    } finally {
      payBtn.disabled = false;
      payBtn.textContent = "Xác nhận thanh toán";
    }
  });

  return {
    open() {
      if (Cart.items.length === 0) return;
      formView.hidden = false;
      successView.hidden = true;
      form.reset();
      resetFieldStates();
      payError.textContent = "";

      const customer = getCustomer();
      if (customer) {
        document.getElementById("shipName").value = customer.fullName;
        document.getElementById("shipPhone").value = customer.phone;
        document.getElementById("shipEmail").value = customer.email;
        document.getElementById("shipAddress").value = customer.address;
      }
      renderSummary();
      dialog.showModal();
    },
  };
}
