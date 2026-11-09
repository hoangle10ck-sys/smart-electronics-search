# Hệ thống tìm kiếm sản phẩm điện tử thông minh

- **Frontend:** React + TypeScript (Vite) — `frontend/`
- **Backend:** Node.js + Express + TypeScript + MongoDB Atlas (Mongoose) — `backend/`

## Cách hoạt động
Người dùng gõ câu tự nhiên, ví dụ `laptop gaming dưới 20 triệu RAM 16GB`.
Backend (`services/queryParser.ts`) bỏ dấu tiếng Việt rồi tách thành: loại sản phẩm, hãng, khoảng giá,
RAM, nhu cầu (gaming, pin trâu, chụp ảnh...), từ khoá model. Sau đó `searchService.ts`:
1. Lọc trong MongoDB theo loại / hãng / giá / RAM.
2. Nếu không có kết quả thì nới dần điều kiện (RAM, giá ±25%, hãng) và báo cho người dùng.
3. Chấm điểm theo nhu cầu, từ khoá, đánh giá, lượt bán rồi trả kèm lý do gợi ý.

## Chạy dự án
```bash
# 1) Backend
cd backend
npm install
npm run seed     # nạp 40 sản phẩm mẫu vào MongoDB
npm run dev      # http://localhost:5000

# 2) Frontend (terminal khác)
cd frontend
npm install
npm run dev      # http://localhost:5173
```

## API
| Method | Đường dẫn | Mô tả |
|---|---|---|
| GET | `/api/products/search?q=...&sort=price_asc` | Tìm kiếm thông minh |
| GET | `/api/products/suggest?q=...` | Gợi ý khi gõ |
| GET | `/api/products?category=laptop&page=1` | Danh sách |
| GET | `/api/products/:id` | Chi tiết |
| POST | `/api/products` | Thêm sản phẩm |

## Lưu ý MongoDB Atlas
- Vào **Network Access** và thêm IP của bạn (hoặc `0.0.0.0/0` khi học tập) nếu không sẽ bị lỗi kết nối.
- Chuỗi kết nối nằm trong `backend/.env` (đã được `.gitignore`). Không đẩy file này lên GitHub.
