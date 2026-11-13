# Hệ thống tìm kiếm sản phẩm điện tử thông minh

See [DATA_COLLECTOR.md](DATA_COLLECTOR.md) for source permissions, CSV format, Admin setup, and collector workflows.
See [PRODUCT_CATALOG.md](PRODUCT_CATALOG.md) for the verified MongoDB catalog, seed script, and Admin CRUD.
See [backend/SEARCH_ENGINE.md](backend/SEARCH_ENGINE.md) for normalization, vector search setup, and evaluation workflows.

- **Frontend:** React + TypeScript (Vite) — `frontend/`
- **Backend:** Node.js + Express + TypeScript + MongoDB Atlas (Mongoose) — `backend/`

## Cách hoạt động
Người dùng gõ câu tự nhiên, ví dụ `laptop gaming dưới 20 triệu RAM 16GB`.
Backend (`services/queryParser.ts`) bỏ dấu tiếng Việt rồi tách loại sản phẩm, hãng, khoảng giá,
RAM, nhu cầu và từ khoá model. `searchService.ts` chỉ trả sản phẩm verified có ảnh được phép dùng,
nguồn thông số và link sản phẩm. Điều kiện RAM và ngân sách được giữ nguyên; ngân sách chỉ so với
Offer VND có trạng thái verified. Khi thiếu giá xác minh, API báo không có kết quả trong ngân sách.

Khi MongoDB chưa trả đủ ba sản phẩm phù hợp, backend có thể gọi Tavily hoặc Brave nếu `SEARCH_PROVIDER`
và API key server-side đã được cấu hình. Nếu không có provider, API nói rõ live search chưa bật. Kết quả
web chỉ xuất hiện như liên kết nguồn tham khảo; backend không tự chuyển snippet thành Product đã xác minh,
không lưu vào MongoDB và không gán ảnh/giá khi chưa kiểm tra model, nội dung trang và quyền ảnh. Kết quả
được cache trong 10 phút và giới hạn mặc định 8 lượt tìm web mỗi IP mỗi phút.

## Chạy dự án
```bash
# 1) Backend
cd backend
npm install
npm run seed:catalog  # kiểm tra URL và upsert catalog có giấy phép
npm run dev           # http://localhost:5000

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

## Cấu hình MongoDB
- Mẫu `backend/.env.example` dùng MongoDB local tại `127.0.0.1`. Backend tests hiện không cần kết nối MongoDB hay dịch vụ lưu trữ/crawl ngoài.
- Không dùng Atlas cho test hoặc cấu hình local. Bộ test hiện tại dùng unit tests và service mocks, không tự kết nối database.
- Không mở MongoDB ra Internet hoặc dùng allowlist `0.0.0.0/0`. Nếu một môi trường ngoài phạm vi này cần Atlas, hãy cấu hình riêng với xác thực và network allowlist hẹp theo quy trình của chủ dự án.
- Chuỗi kết nối cục bộ nằm trong `backend/.env` (đã được `.gitignore`). Không đẩy file này lên GitHub.
- Để bật live source search, cấu hình `SEARCH_PROVIDER=auto` cùng `TAVILY_API_KEY` hoặc `BRAVE_SEARCH_API_KEY` trong `backend/.env`. Provider có thể đặt rõ `tavily`, `brave` hoặc `none`; API key không được gửi về frontend.

## Đồng bộ sản phẩm ACCESSTRADE
- Backend đọc `ACCESSTRADE_API_KEY`, `ACCESSTRADE_BASE_URL` và `ACCESSTRADE_DOMAIN` từ `backend/.env`; domain mặc định là `fptshop.com.vn`.
- API key chỉ được gửi từ backend đến `GET /v1/datafeeds` bằng header `Authorization: Token ...`. Mỗi trang tối đa 200 sản phẩm.
- Đồng bộ thủ công qua `POST /api/admin/accesstrade/sync`; cần cấu hình thêm `ADMIN_API_TOKEN` trong `backend/.env` và gửi header `Authorization: Bearer <ADMIN_API_TOKEN>`. Xem trạng thái gần nhất tại `GET /api/admin/accesstrade/status` với cùng xác thực.
- Đồng bộ dùng upsert, lưu Offers riêng, đưa sản phẩm chưa phân loại chắc chắn vào hàng chờ kiểm tra và không xóa dữ liệu cũ. Tìm kiếm công khai chỉ trả về sản phẩm đã nhập từ ACCESSTRADE; dữ liệu mẫu cũ được giữ nguyên trong database nhưng không dùng thay kết quả live.
- Chạy test backend bằng `npm test` trong `backend/`.
- `npm run audit:catalog` thống kê 33 loại canonical cùng model, family, generation, variant, evidence, Offer và URL coverage trực tiếp từ MongoDB; script tạo `PRODUCT_CATALOG_REPORT.md`, `PRODUCT_COVERAGE.json` và `IMPORT_HISTORY.md`.
- `npm run verify:catalog` kiểm tra model metadata cùng URL ảnh, URL sản phẩm và URL thông số mà không ghi DB.
- `npm run backup:db` sao lưu các collection MongoDB sang thư mục tạm của hệ điều hành trước khi thay đổi dữ liệu.
- `watch` được chuẩn hóa thành `smartwatch`; endpoint category cũ vẫn được chấp nhận như alias.
