// Câu 5: dùng DOMParser đọc reviews.xml, tính điểm trung bình theo product_id và gắn lên ảnh sản phẩm.
export async function fetchReviewsXml(url = "data/reviews.xml") {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Không tải được ${url} (mã ${response.status})`);
  return response.text();
}

export function parseReviews(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("File reviews.xml không đúng định dạng XML");

  const byProduct = new Map();
  doc.querySelectorAll("review").forEach((node) => {
    const productId = Number(node.querySelector("product_id").textContent);
    if (!byProduct.has(productId)) byProduct.set(productId, { reviews: [], total: 0 });

    const rating = Number(node.querySelector("rating").textContent);
    const entry = byProduct.get(productId);
    entry.total += rating;
    entry.reviews.push({
      id: node.getAttribute("id"),
      customerName: node.querySelector("customer_name").textContent,
      rating,
      date: node.querySelector("date").textContent,
      comment: node.querySelector("comment").textContent,
    });
  });

  byProduct.forEach((entry) => {
    entry.average = entry.total / entry.reviews.length;
  });
  return byProduct;
}

// Tạo mới thẻ span chứa số sao trung bình rồi chèn lên ảnh của từng sản phẩm.
export function attachRatingBadges(container, reviewsByProduct) {
  container.querySelectorAll(".product-card").forEach((card) => {
    const summary = reviewsByProduct.get(Number(card.dataset.id));
    if (!summary) return;
    const badge = document.createElement("span");
    badge.className = "rating-badge";
    badge.textContent = `★ ${summary.average.toFixed(1)}`;
    badge.title = `Điểm trung bình từ ${summary.reviews.length} đánh giá`;
    card.querySelector(".card-media").appendChild(badge);
  });
}
