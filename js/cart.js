// Câu 6: đối tượng JavaScript lưu trạng thái giỏ hàng.
import { KEYS, store, roundMoney } from "./common.js";

export const Cart = {
  items: [],

  load() {
    this.items = store.get(KEYS.cart, []);
  },

  save() {
    store.set(KEYS.cart, this.items);
  },

  // Cùng sản phẩm, cùng màu và size thì tăng số lượng, ngược lại thêm dòng mới.
  add(product, color, size, stock) {
    const existing = this.items.find(
      (item) => item.productId === product.id && item.color === color.code && item.size === size
    );
    const nextQuantity = (existing?.quantity ?? 0) + 1;
    if (nextQuantity > stock) return { ok: false, created: false };

    if (existing) {
      existing.quantity = nextQuantity;
    } else {
      this.items.push({
        key: `${product.id}|${color.code}|${size}`,
        productId: product.id,
        title: product.title,
        image: product.image,
        price: product.price,
        color: color.code,
        colorName: color.name,
        size,
        quantity: 1,
      });
    }
    this.save();
    return { ok: true, created: !existing };
  },

  setQuantity(key, quantity) {
    const item = this.items.find((entry) => entry.key === key);
    if (!item) return;
    if (quantity <= 0) {
      this.remove(key);
      return;
    }
    item.quantity = quantity;
    this.save();
  },

  remove(key) {
    this.items = this.items.filter((entry) => entry.key !== key);
    this.save();
  },

  clear() {
    this.items = [];
    this.save();
  },

  count() {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  },

  total() {
    return roundMoney(this.items.reduce((sum, item) => sum + item.price * item.quantity, 0));
  },
};
