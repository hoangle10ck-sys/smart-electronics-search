# Độ phủ catalog local

Kiểm kê ngày 17-11-2026 trên cơ sở dữ liệu cô lập `smart_electronics_local`, sau khi nạp các lô nghiên cứu đã qua kiểm tra.

## Tóm tắt

- 137 sản phẩm công khai trong 21/35 danh mục chuẩn, với 37 cặp danh mục–thương hiệu.
- PendingProduct có 135 hồ sơ lịch sử; 109 hồ sơ vẫn đang chờ duyệt và 26 hồ sơ đã duyệt được giữ lại cùng lịch sử.
- Có 2 Offer đã xác minh từ FPT Shop: Xiaomi 15 12/256 giá 24.540.000đ và OPPO Find X9 12/256 giá 22.990.000đ (giá gốc 28.990.000đ), ghi nhận ngày 17-11-2026. Trang bán có thể đổi giá; trạng thái còn hàng không được xác nhận.
- Trong 137 sản phẩm công khai, hiện không thiếu ảnh, thông tin quyền dùng ảnh, mô tả, thông số hoặc URL sản phẩm/thông số. Có 111 ảnh từ catalog tĩnh chưa được rà soát nhận diện model bằng mắt; 135 sản phẩm chưa có Offer giá được xác minh.
- Catalog tĩnh ban đầu có 111 sản phẩm; trong đó 72 sản phẩm mang thương hiệu Apple.
- 26 sản phẩm mở rộng có ảnh được đối chiếu model và giấy phép: 18 sản phẩm đã ghi trong lô trước, Xiaomi 15, OPPO Find X9, OnePlus 15, HONOR 400 Pro bản Trung Quốc (DNP-AN00), Keychron K8 Non-Backlight, TP-Link Archer BE9700, Anker 521 Power Bank và Kingston FURY Impact KF556S40IBK2-64.
- 111 ảnh trong catalog tĩnh ban đầu chưa có `imageVisualIdentityChecked`. Chúng đang được giữ nguyên; cần rà soát từng ảnh trước khi coi là đã xác minh nhận diện đầy đủ.
- Còn 14 danh mục chưa có sản phẩm công khai. Trong số đó, 8 danh mục có hồ sơ chờ ảnh hoặc nguồn kiểm chứng; 6 danh mục hiện chưa có ứng viên trong hàng chờ.

## Danh mục và thương hiệu

| Danh mục | Sản phẩm công khai | Thương hiệu công khai | Hồ sơ còn chờ |
|---|---:|---|---|
| Laptop | 30 | Apple, ASUS, Dell, HP, Lenovo | 1 Acer |
| Máy lạnh | 0 | — | — |
| Máy tính để bàn | 6 | Apple | — |
| Điện thoại | 37 | Apple, Google, HONOR, OPPO, OnePlus, Samsung, Xiaomi | — |
| Máy tính bảng | 30 | Apple, Microsoft, Samsung | — |
| Đồng hồ thông minh | 1 | Apple | — |
| CPU | 12 | AMD | 86: AMD (21), Intel (65) |
| SoC / chipset | 0 | — | — |
| GPU | 3 | ASUS, Intel, Sapphire | 13: AMD (5), Intel (1), NVIDIA (7) |
| RAM | 1 | Kingston | — |
| Lưu trữ | 1 | Samsung | — |
| Bo mạch chủ | 0 | — | — |
| Tai nghe | 1 | Apple | — |
| Loa | 0 | — | — |
| Chuột | 2 | Logitech | — |
| Bàn phím | 1 | Keychron | — |
| Màn hình | 1 | Dell | — |
| Webcam | 1 | Logitech | — |
| Máy ảnh | 3 | Canon, Nikon | — |
| Tivi | 0 | — | — |
| Thiết bị mạng | 1 | TP-Link | — |
| Bộ sạc / pin dự phòng | 1 | Anker | — |
| Phụ kiện điện tử | 0 | — | — |
| Máy chơi game | 2 | Microsoft, Sony | 1 Sony |
| Máy chiếu | 0 | — | 1 Epson |
| Máy in / máy quét | 0 | — | 1 Brother |
| VR / AR | 1 | Meta | — |
| Drone | 1 | DJI | — |
| NAS | 0 | — | 1 Synology |
| Nhà thông minh | 0 | — | 1 Google |
| UPS | 0 | — | 1 APC by Schneider Electric |
| Micro | 1 | Shure | — |
| Streaming / capture | 0 | — | 1 Elgato |
| Máy đọc sách điện tử | 0 | — | 1 Amazon |
| Âm thanh chuyên nghiệp | 0 | — | 1 Focusrite |

Hồ sơ trong cột “còn chờ” chưa xuất hiện trong kết quả tìm kiếm công khai. Ví dụ, 13 mẫu GPU mới và laptop Acer đã có dữ liệu model/thông số để rà soát tiếp nhưng chưa có ảnh được cấp quyền và xác minh nhận diện.

## Hướng mở rộng

1. Ưu tiên tìm dữ liệu có nguồn cho 6 danh mục đang không có sản phẩm công khai lẫn hồ sơ chờ: máy lạnh, SoC, bo mạch chủ, loa, tivi và phụ kiện điện tử.
2. Hoàn tất ảnh và kiểm tra model cho các ứng viên Acer, NVIDIA, AMD, Amazon và những hồ sơ đang chờ khác trước khi đưa vào tìm kiếm.
3. Tăng số thương hiệu có nguồn xác minh ở điện thoại, máy tính bảng, desktop, CPU và GPU; catalog hiện có thêm Microsoft và Sony trong máy chơi game cùng Sapphire trong GPU.
4. Bổ sung Offer chỉ khi có URL bán, nhà bán, giá và thời điểm quan sát được kiểm chứng; không suy giá từ thông số hay giá cũ.
5. Rà soát 111 ảnh gốc chưa có kiểm tra nhận diện riêng.
