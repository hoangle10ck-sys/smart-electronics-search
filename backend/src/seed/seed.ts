import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import { Product } from '../models/Product';
import { buildSearchText, normalize } from '../utils/text';

type S = Record<string, string | number>;
const p = (name: string, brand: string, category: string, price: number, tags: string[], specs: S, description: string, rating: number, sold: number, originalPrice?: number) =>
  ({ name, brand, category, price, tags, specs, description, rating, sold, originalPrice, stock: 20 });

const data = [
  // Laptop
  p('ASUS ROG Strix G16 G614', 'Asus', 'laptop', 32990000, ['gaming', 'design'], { ram: 16, storage: 512, cpu: 'Intel Core i7-13650HX', gpu: 'RTX 4060', screen: '16" 165Hz' }, 'Laptop gaming hiệu năng cao, tản nhiệt tốt, màn hình 165Hz.', 4.7, 320, 35990000),
  p('Acer Nitro 5 Tiger AN515', 'Acer', 'laptop', 19990000, ['gaming', 'budget'], { ram: 16, storage: 512, cpu: 'Intel Core i5-12500H', gpu: 'RTX 3050', screen: '15.6" 144Hz' }, 'Laptop gaming tầm trung chơi mượt các game eSports.', 4.5, 540, 22990000),
  p('MSI Thin GF63 12VE', 'MSI', 'laptop', 17990000, ['gaming', 'budget'], { ram: 16, storage: 512, cpu: 'Intel Core i5-12450H', gpu: 'RTX 4050', screen: '15.6" 144Hz' }, 'Laptop gaming giá tốt, card RTX 4050 mới.', 4.4, 410),
  p('Lenovo LOQ 15IRH8', 'Lenovo', 'laptop', 22990000, ['gaming'], { ram: 16, storage: 512, cpu: 'Intel Core i5-13420H', gpu: 'RTX 4050', screen: '15.6" 144Hz' }, 'Laptop gaming cân bằng giữa hiệu năng và nhiệt độ.', 4.6, 260),
  p('MacBook Air 13 M2 2022', 'Apple', 'laptop', 24990000, ['office', 'portable', 'battery', 'premium'], { ram: 8, storage: 256, cpu: 'Apple M2', screen: '13.6" Liquid Retina', battery: 'Đến 18 giờ' }, 'Mỏng nhẹ, pin cả ngày, phù hợp học tập và văn phòng.', 4.8, 700, 27990000),
  p('MacBook Pro 14 M3 Pro', 'Apple', 'laptop', 48990000, ['design', 'premium'], { ram: 18, storage: 512, cpu: 'Apple M3 Pro', screen: '14.2" Liquid Retina XDR' }, 'Máy dựng video, đồ hoạ chuyên nghiệp.', 4.9, 150),
  p('Dell XPS 13 9340', 'Dell', 'laptop', 38990000, ['office', 'portable', 'premium'], { ram: 16, storage: 512, cpu: 'Intel Core Ultra 7', screen: '13.4" OLED' }, 'Laptop cao cấp siêu mỏng, màn hình OLED.', 4.6, 90),
  p('HP Pavilion 15 eg3', 'HP', 'laptop', 14490000, ['office', 'budget'], { ram: 8, storage: 512, cpu: 'Intel Core i5-1335U', screen: '15.6" FHD' }, 'Laptop văn phòng bền bỉ, giá dễ tiếp cận.', 4.3, 380),
  p('Dell Inspiron 15 3520', 'Dell', 'laptop', 12990000, ['office', 'budget'], { ram: 8, storage: 256, cpu: 'Intel Core i3-1215U', screen: '15.6" FHD' }, 'Laptop sinh viên giá rẻ, đủ dùng học online.', 4.1, 620),
  p('Asus Vivobook 14 OLED', 'Asus', 'laptop', 15490000, ['office', 'portable', 'design'], { ram: 16, storage: 512, cpu: 'AMD Ryzen 5 7530U', screen: '14" OLED' }, 'Màn OLED đẹp, mỏng nhẹ, hợp sáng tạo nội dung cơ bản.', 4.5, 300),
  p('Lenovo ThinkPad E14 Gen 5', 'Lenovo', 'laptop', 18990000, ['office'], { ram: 16, storage: 512, cpu: 'Intel Core i5-1335U', screen: '14" FHD' }, 'Bàn phím tốt, bền bỉ cho dân văn phòng.', 4.4, 170),
  p('Acer Swift Go 14', 'Acer', 'laptop', 19490000, ['office', 'portable', 'battery'], { ram: 16, storage: 512, cpu: 'Intel Core i5-13500H', screen: '14" OLED 2.8K' }, 'Mỏng nhẹ, pin lâu, màn OLED sắc nét.', 4.5, 210),
  // Điện thoại
  p('iPhone 15 Pro Max 256GB', 'Apple', 'phone', 29990000, ['camera', 'premium', 'gaming'], { ram: 8, storage: 256, cpu: 'A17 Pro', screen: '6.7" OLED', camera: 'Tele 5x' }, 'Flagship khung titan, camera zoom 5x, chơi game đỉnh.', 4.8, 980, 34990000),
  p('iPhone 15 128GB', 'Apple', 'phone', 19990000, ['camera', 'premium'], { ram: 6, storage: 128, cpu: 'A16 Bionic', screen: '6.1" OLED' }, 'Dynamic Island, camera 48MP, cổng USB-C.', 4.7, 1200, 22990000),
  p('Samsung Galaxy S24 Ultra', 'Samsung', 'phone', 28990000, ['camera', 'premium', 'gaming', 'battery'], { ram: 12, storage: 256, cpu: 'Snapdragon 8 Gen 3', screen: '6.8" AMOLED 120Hz', camera: '200MP', battery: '5000mAh' }, 'Camera 200MP, bút S Pen, hiệu năng đỉnh cao.', 4.8, 640, 33990000),
  p('Samsung Galaxy A55 5G', 'Samsung', 'phone', 9990000, ['camera', 'budget', 'battery'], { ram: 8, storage: 128, screen: '6.6" Super AMOLED', battery: '5000mAh' }, 'Tầm trung thiết kế đẹp, pin bền, chụp ảnh tốt.', 4.4, 870),
  p('Xiaomi 14T Pro', 'Xiaomi', 'phone', 14990000, ['camera', 'gaming'], { ram: 12, storage: 256, cpu: 'Dimensity 9300+', screen: '6.67" AMOLED 144Hz', camera: 'Leica' }, 'Camera Leica, sạc nhanh 120W, hiệu năng mạnh.', 4.6, 430),
  p('Xiaomi Redmi Note 13 Pro', 'Xiaomi', 'phone', 7490000, ['budget', 'camera', 'battery'], { ram: 8, storage: 256, screen: '6.67" AMOLED', camera: '200MP', battery: '5100mAh' }, 'Camera 200MP, pin lớn, giá rất tốt.', 4.5, 1500),
  p('OPPO Reno11 F 5G', 'Oppo', 'phone', 8990000, ['camera', 'portable'], { ram: 8, storage: 256, screen: '6.7" AMOLED', camera: 'Chân dung 64MP' }, 'Chuyên chụp chân dung, thiết kế mỏng nhẹ.', 4.3, 520),
  p('realme GT 6', 'Realme', 'phone', 14490000, ['gaming', 'battery'], { ram: 12, storage: 256, cpu: 'Snapdragon 8s Gen 3', screen: '6.78" AMOLED 120Hz', battery: '5500mAh' }, 'Hiệu năng mạnh, pin 5500mAh, sạc 120W.', 4.5, 190),
  // Máy tính bảng
  p('iPad Air M2 11 inch', 'Apple', 'tablet', 16990000, ['design', 'office', 'portable'], { ram: 8, storage: 128, cpu: 'Apple M2', screen: '11" Liquid Retina' }, 'Vẽ, ghi chú, học tập với Apple Pencil.', 4.8, 260),
  p('Samsung Galaxy Tab S9 FE', 'Samsung', 'tablet', 9990000, ['office', 'budget'], { ram: 6, storage: 128, screen: '10.9" 90Hz' }, 'Có bút S Pen, kháng nước IP68, phù hợp học tập.', 4.4, 310),
  p('Xiaomi Pad 6', 'Xiaomi', 'tablet', 7490000, ['budget', 'office', 'gaming'], { ram: 6, storage: 128, screen: '11" 144Hz' }, 'Màn hình 144Hz mượt, giá hợp lý.', 4.4, 350),
  // Tai nghe
  p('AirPods Pro 2 USB-C', 'Apple', 'headphone', 5990000, ['anc', 'wireless', 'music'], { battery: '6 giờ (30 giờ với hộp sạc)' }, 'Chống ồn chủ động mạnh, âm thanh không gian.', 4.8, 900, 6490000),
  p('Sony WH-1000XM5', 'Sony', 'headphone', 7490000, ['anc', 'wireless', 'music', 'premium'], { battery: '30 giờ' }, 'Tai nghe chụp tai chống ồn hàng đầu.', 4.8, 410),
  p('JBL Tune 520BT', 'JBL', 'headphone', 990000, ['budget', 'wireless', 'music', 'battery'], { battery: '57 giờ' }, 'Bass JBL đặc trưng, pin siêu lâu, giá rẻ.', 4.3, 1300),
  p('Razer BlackShark V2 X', 'Razer', 'headphone', 1490000, ['gaming'], { screen: '', connection: 'Có dây 3.5mm' }, 'Tai nghe gaming nhẹ, mic rõ, âm thanh vòm 7.1.', 4.4, 280),
  p('Samsung Galaxy Buds2 Pro', 'Samsung', 'headphone', 3990000, ['anc', 'wireless', 'music'], { battery: '5 giờ (18 giờ với hộp sạc)' }, 'Chống ồn, âm thanh Hi-Fi 24-bit.', 4.5, 330),
  // Đồng hồ
  p('Apple Watch Series 9 41mm', 'Apple', 'watch', 9990000, ['fitness', 'premium'], { screen: 'OLED Always-On', battery: '18 giờ' }, 'Theo dõi sức khoẻ, nhịp tim, ôxy máu, ECG.', 4.7, 340),
  p('Samsung Galaxy Watch6 40mm', 'Samsung', 'watch', 6490000, ['fitness'], { screen: 'AMOLED', battery: '40 giờ' }, 'Đo thành phần cơ thể, theo dõi giấc ngủ.', 4.4, 220),
  p('Xiaomi Smart Band 8', 'Xiaomi', 'watch', 990000, ['budget', 'fitness', 'battery'], { screen: 'AMOLED 1.62"', battery: '16 ngày' }, 'Vòng tay thể thao pin 16 ngày, giá rẻ.', 4.4, 1800),
  // Loa
  p('JBL Flip 6', 'JBL', 'speaker', 2990000, ['music', 'wireless', 'portable'], { battery: '12 giờ' }, 'Loa bluetooth chống nước IP67, bass mạnh.', 4.7, 750),
  // Phụ kiện
  p('Logitech G502 X Plus', 'Logitech', 'mouse', 3290000, ['gaming', 'wireless'], { dpi: 25600 }, 'Chuột gaming không dây, cảm biến HERO 25K.', 4.7, 240),
  p('Logitech MX Master 3S', 'Logitech', 'mouse', 2490000, ['office', 'wireless'], { dpi: 8000 }, 'Chuột văn phòng cao cấp, cuộn siêu êm.', 4.8, 430),
  p('Keychron K2 Pro', 'Keychron', 'keyboard', 2490000, ['office', 'wireless'], { layout: '75%', switch: 'Hot-swap' }, 'Bàn phím cơ không dây, hỗ trợ Mac/Windows.', 4.6, 260),
  p('LG UltraGear 27GP850', 'LG', 'monitor', 8490000, ['gaming'], { screen: '27" QHD 165Hz', response: '1ms' }, 'Màn gaming IPS 165Hz, độ phản hồi 1ms.', 4.6, 180),
  p('Dell UltraSharp U2723QE', 'Dell', 'monitor', 13990000, ['design', 'office'], { screen: '27" 4K IPS Black' }, 'Màu chuẩn xác cho đồ hoạ, cổng USB-C 90W.', 4.7, 95),
  p('Samsung Smart TV Crystal UHD 55"', 'Samsung', 'tv', 11990000, ['budget'], { screen: '55" 4K' }, 'Tivi 4K giá tốt, hệ điều hành Tizen.', 4.4, 400),
  p('Sony Bravia X75K 55"', 'Sony', 'tv', 13490000, ['premium', 'gaming'], { screen: '55" 4K 120Hz' }, 'Hình ảnh 4K, Google TV, hỗ trợ chơi game PS5.', 4.5, 210),
  p('Anker 737 Power Bank 24000mAh', 'Anker', 'charger', 2790000, ['battery', 'portable'], { battery: '24000mAh', power: '140W' }, 'Pin dự phòng sạc nhanh 140W cho cả laptop.', 4.7, 330),
  p('Xiaomi Power Bank 20000mAh', 'Xiaomi', 'charger', 590000, ['budget', 'battery', 'portable'], { battery: '20000mAh', power: '22.5W' }, 'Pin dự phòng dung lượng lớn, giá rẻ.', 4.4, 1100),
];

(async () => {
  await connectDB();
  const operations = data.map((d) => {
    const sourceKey = `sample:${normalize(d.name).replace(/\s+/g, '-')}`;
    return {
      updateOne: {
        filter: { $or: [{ dedupeKey: sourceKey }, { name: d.name, $or: [{ source: 'sample' }, { source: { $exists: false } }] }] },
        update: { $set: { ...d, source: 'sample', sourceKey, dedupeKey: sourceKey, electronicStatus: 'approved', imageUrl: null, searchText: buildSearchText(d) } },
        upsert: true,
      },
    };
  });
  const result = await Product.bulkWrite(operations as any);
  console.log(`🌱 Đã nạp/cập nhật sản phẩm mẫu: ${result.upsertedCount} mới, ${result.modifiedCount} cập nhật; không xóa dữ liệu cũ.`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
