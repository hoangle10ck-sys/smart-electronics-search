// Từ điển (đã chuẩn hoá: không dấu, chữ thường) để hiểu truy vấn tiếng Việt.

export const CATEGORIES: Record<string, { label: string; terms: string[] }> = {
  laptop: { label: 'Laptop', terms: ['laptop', 'may tinh xach tay', 'notebook', 'macbook'] },
  phone: { label: 'Điện thoại', terms: ['dien thoai', 'smartphone', 'iphone', 'phone', 'dt'] },
  tablet: { label: 'Máy tính bảng', terms: ['may tinh bang', 'tablet', 'ipad'] },
  headphone: { label: 'Tai nghe', terms: ['tai nghe', 'headphone', 'earbuds', 'airpods'] },
  watch: { label: 'Đồng hồ thông minh', terms: ['dong ho thong minh', 'smartwatch', 'dong ho', 'vong tay', 'watch'] },
  speaker: { label: 'Loa', terms: ['loa', 'speaker'] },
  mouse: { label: 'Chuột', terms: ['chuot', 'mouse'] },
  keyboard: { label: 'Bàn phím', terms: ['ban phim', 'keyboard'] },
  monitor: { label: 'Màn hình', terms: ['man hinh', 'monitor'] },
  tv: { label: 'Tivi', terms: ['tivi', 'tv', 'smart tv'] },
  charger: { label: 'Sạc & pin dự phòng', terms: ['sac du phong', 'pin du phong', 'power bank', 'powerbank', 'cu sac', 'sac nhanh', 'sac'] },
};

export const BRANDS: Record<string, string[]> = {
  Apple: ['apple', 'iphone', 'macbook', 'ipad', 'airpods'],
  Samsung: ['samsung', 'galaxy'],
  Xiaomi: ['xiaomi', 'redmi'],
  Asus: ['asus', 'rog'],
  Dell: ['dell'],
  HP: ['hp'],
  Lenovo: ['lenovo', 'thinkpad'],
  Acer: ['acer'],
  MSI: ['msi'],
  Sony: ['sony'],
  JBL: ['jbl'],
  Logitech: ['logitech'],
  Oppo: ['oppo'],
  LG: ['lg'],
  Anker: ['anker'],
  Razer: ['razer'],
  Realme: ['realme'],
  Keychron: ['keychron'],
};

// Từ khoá là tên dòng sản phẩm: dùng để suy ra hãng/loại nhưng vẫn giữ lại làm từ khoá chấm điểm.
export const KEEP_AS_KEYWORD = new Set(['iphone', 'macbook', 'ipad', 'airpods', 'galaxy', 'redmi', 'rog', 'thinkpad', 'watch']);

export const TAGS: Record<string, { label: string; terms: string[] }> = {
  gaming: { label: 'Chơi game', terms: ['gaming', 'game', 'choi game', 'chien game'] },
  office: { label: 'Văn phòng / học tập', terms: ['van phong', 'hoc tap', 'sinh vien', 'lam viec', 'hoc online'] },
  camera: { label: 'Chụp ảnh đẹp', terms: ['chup anh', 'chup hinh', 'quay phim', 'selfie', 'camera'] },
  battery: { label: 'Pin trâu', terms: ['pin trau', 'pin khoe', 'pin lau', 'pin ben', 'dung luong lon'] },
  design: { label: 'Đồ hoạ / thiết kế', terms: ['do hoa', 'thiet ke', 'dung phim', 'render', 'sang tao'] },
  portable: { label: 'Mỏng nhẹ', terms: ['mong nhe', 'nho gon', 'di chuyen', 'mang di'] },
  anc: { label: 'Chống ồn', terms: ['chong on'] },
  wireless: { label: 'Không dây', terms: ['khong day', 'bluetooth'] },
  budget: { label: 'Giá rẻ', terms: ['gia re', 'tiet kiem', 'binh dan', 'phan khuc re'] },
  premium: { label: 'Cao cấp', terms: ['cao cap', 'flagship', 'sang trong'] },
  music: { label: 'Nghe nhạc', terms: ['nghe nhac', 'am thanh hay', 'bass'] },
  fitness: { label: 'Thể thao / sức khoẻ', terms: ['the thao', 'chay bo', 'suc khoe', 'theo doi suc khoe'] },
};

export const STOPWORDS = new Set([
  'tim', 'kiem', 'mua', 'can', 'cho', 'toi', 'minh', 'muon', 'nao', 'nhat', 'tot', 'gia', 'la', 'co', 'va', 'de', 'o',
  'voi', 'nen', 'loai', 'mot', 'cai', 'chiec', 'may', 'dang', 'nhung', 'cac', 'thi', 'duoc', 'hay', 'giup', 'bao',
  'nhieu', 'khoang', 'tam', 'duoi', 'tren', 'tu', 'den', 'trieu', 'tr', 'k', 'ban', 'chay', 're', 'dat', 'san', 'pham',
  'ram', 'tro', 'len', 'xuong', 'sp', 'goi', 'y', 'dung', 'phu', 'hop',
]);
