# Quy tắc làm việc cho SMART ELECTRONICS SEARCH

## Trước khi sửa

- Xác định repository root bằng `git rev-parse --show-toplevel` và đọc `git status --short --branch` trước khi chỉnh sửa. Giữ nguyên các thay đổi chưa commit của người dùng; không reset, checkout đè, stash, xóa hoặc định dạng lại hàng loạt file ngoài phạm vi.
- Đọc phần code, test, kiểu dữ liệu, route/API và tài liệu liên quan trước khi sửa. Với AI Advisor, tối thiểu đọc `backend/src/services/productAdvisor.ts`, `backend/src/routes/advisorChat.ts`, `backend/SEARCH_ENGINE.md`, widget/API frontend và các test liên quan.
- Xác định baseline test/build trước khi sửa khi môi trường cho phép. Ghi riêng lỗi đã tồn tại trước nhiệm vụ và lỗi phát sinh từ thay đổi hiện tại.
- Ưu tiên thay đổi nhỏ, phù hợp kiến trúc hiện có. Không viết lại toàn bộ ứng dụng hoặc thay đổi công nghệ cốt lõi nếu chưa được yêu cầu.

## Dữ liệu và cấu hình

- Không xóa collection, Product, Offer, PendingProduct, vector, conversation hoặc dữ liệu MongoDB khác. Không xóa collection Qdrant nếu một môi trường nào đó đang dùng nó.
- Không chạy seed, import, migration, backfill, reset hoặc lệnh ghi dữ liệu lên môi trường dùng chung nếu nhiệm vụ không yêu cầu rõ. Khi có yêu cầu ghi dữ liệu, xem trước tác động, giữ khả năng chạy lặp an toàn và tạo backup trước thay đổi lớn.
- Không ghi đè, in, commit hoặc đưa bí mật từ `.env` vào log/báo cáo. Dùng `.env.example` cho cấu hình mẫu; chỉ thay đổi file này khi cần và không sao chép giá trị bí mật từ `.env`.
- Không bịa sản phẩm, giá, tồn kho, ảnh, thông số, nguồn hoặc quyền sử dụng. Chỉ nhập dữ kiện có nguồn phù hợp; giữ nguồn, thời điểm và trạng thái xác minh tách bạch.
- Không tạo dữ liệu sản phẩm giả trong MongoDB hoặc catalog. Unit test có thể dùng mock tối thiểu, cách ly khỏi database và không được trình bày như dữ liệu catalog thật.
- Không tự ý thêm Qdrant hoặc thay MongoDB Atlas Vector Search, Ollama, Express, React hay công nghệ cốt lõi khác bằng lựa chọn mới.

## Thay đổi và kiểm thử

- Với thay đổi chức năng, thêm hoặc cập nhật test bao phủ hành vi mới và trường hợp lỗi liên quan.
- Sau khi sửa, chạy các kiểm tra phù hợp và regression checks:
  - Backend unit tests: từ `backend/`, chạy `npm test`.
  - Backend typecheck/build: từ `backend/`, chạy `npm run build` (`tsc`).
  - Frontend typecheck/build: từ `frontend/`, chạy `npm run build` (`tsc && vite build`).
  - Nếu thay đổi ảnh hưởng tích hợp search/catalog, chạy thêm `npm run evaluate:search` và/hoặc `npm run verify:search-coverage` từ `backend/` khi phụ thuộc môi trường sẵn sàng.
- Chỉ báo một lệnh PASS khi đã chạy lệnh đó và xem exit code/kết quả. Không suy đoán test, build, lint, typecheck hay integration đã thành công.
- Nếu kiểm tra thất bại do thay đổi trong phạm vi, sửa và chạy lại. Nếu bị chặn bởi service, credentials, mạng hoặc cấu hình ngoài phạm vi, ghi chính xác lệnh và blocker thực tế.
- Báo cáo rõ những lệnh đã chạy, kết quả, giới hạn của test và các lỗi baseline có trước; không gán lỗi có sẵn cho thay đổi mới.

## Lệnh và môi trường hiện tại

- Repository không có `package.json` ở root. Backend và frontend có package riêng.
- Chạy backend dev server từ `backend/` bằng `npm run dev` (mặc định cổng 5000); chạy frontend từ `frontend/` bằng `npm run dev` (Vite, cổng 5173, proxy `/api` tới backend).
- Backend `npm test` hiện chạy `tsx --test src/services/*.test.ts tests/*.test.ts`; các test hiện tại không cần dịch vụ ngoài.
- Frontend hiện chỉ có `dev`, `build`, và `preview`; chưa có script lint hoặc test frontend riêng. Kiểm tra lại package scripts trước mỗi nhiệm vụ vì cấu hình có thể thay đổi.
- Vector search đang dùng MongoDB Atlas Vector Search; không mặc định giả định rằng Qdrant được cấu hình.
