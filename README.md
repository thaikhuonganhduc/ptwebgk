# Đức Mart: website bán hàng giả lập

Bài kiểm tra giữa kỳ, học phần Phát triển web kinh doanh.

Sinh viên: **Thái Khương Anh Đức**, MSSV **K234161828**.

Trang web: https://thaikhuonganhduc.github.io/ptwebgk/

## Cách chạy trên máy

Trang đọc dữ liệu XML/JSON bằng `fetch` nên cần chạy qua web server, không mở trực tiếp file:

```
python -m http.server 8000
```

Sau đó mở http://localhost:8000.

## Tài khoản mẫu

Toàn bộ tài khoản và dữ liệu khách hàng đều là dữ liệu giả lập. Website không có máy chủ, nên việc đăng nhập chỉ mang tính minh họa.

| Trang | Tên đăng nhập | Mật khẩu |
|---|---|---|
| Quản trị (`admin.html`) | `admin` | `Admin@123` |
| Quản trị, nhân viên | `nhanvien1` | `Nhanvien@123` |
| Cửa hàng, khách hàng | `khach1` | `Khach@123` |

## Vị trí từng câu

| Câu | Nội dung | File chính |
|---|---|---|
| 1 | Dữ liệu XML/JSON | `tools/build-products.html`, `js/build-products.js`, `data/` |
| 2 | Layout semantic, form tìm kiếm | `index.html` |
| 3 | Grid, responsive, skeleton | `css/style.css` |
| 4 | Event delegation | `js/shop.js` |
| 5 | Đọc XML đánh giá bằng DOMParser | `js/reviews.js`, `data/reviews.xml` |
| 6 | Đối tượng giỏ hàng, mini-cart | `js/cart.js`, `js/shop.js` |
| 7 | Regex, thanh toán giả lập | `js/checkout.js` |
| 8 | Trang quản trị | `admin.html`, `js/admin.js`, `css/admin.css` |

## Nguồn dữ liệu

Sản phẩm và ảnh lấy từ [Fake Store API](https://fakestoreapi.com/products). Font Be Vietnam Pro theo giấy phép SIL Open Font License.
