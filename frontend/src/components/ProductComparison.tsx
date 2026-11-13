import { Product, formatVND } from '../api';

const LABELS: Record<string, string> = {
  cpu: 'CPU', gpu: 'GPU', ram: 'RAM', storage: 'Lưu trữ', screen: 'Màn hình', display: 'Màn hình',
  battery: 'Pin', camera: 'Camera', os: 'Hệ điều hành', weight: 'Trọng lượng', resolution: 'Độ phân giải',
  refreshRate: 'Tần số quét', connectivity: 'Kết nối', printSpeed: 'Tốc độ in', capacity: 'Dung lượng',
};

function safeHref(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

function safeImageHref(value: string | null | undefined) {
  if (value && /^\/catalog-images\/[a-z0-9][a-z0-9._-]*\.(jpg|jpeg|png|webp)$/i.test(value)) return value;
  return safeHref(value);
}

function display(value: unknown): string {
  if (value == null || value === '') return 'Chưa có dữ liệu';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function productPrice(product: Product) {
  if (product.bestOffer?.verified && product.bestOffer.priceStatus === 'current_verified' && typeof product.bestOffer.price === 'number') return product.bestOffer.price;
  return null;
}

function technicalFields(products: Product[]) {
  const keys = new Set<string>();
  for (const product of products) {
    for (const key of Object.keys(product.specs ?? {})) keys.add(key);
    for (const key of Object.keys(product.specifications ?? {})) keys.add(key);
  }
  return [...keys].sort((a, b) => {
    const common = ['cpu', 'gpu', 'ram', 'storage', 'screen', 'display', 'battery', 'camera', 'resolution', 'connectivity'];
    return (common.indexOf(a) < 0 ? 100 : common.indexOf(a)) - (common.indexOf(b) < 0 ? 100 : common.indexOf(b)) || a.localeCompare(b);
  }).slice(0, 14);
}

export default function ProductComparison({ products, onRemove, onClear }: {
  products: Product[];
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  if (!products.length) return null;
  const fields = technicalFields(products);
  return (
    <section className="comparison-panel" id="product-comparison" aria-label="Bảng so sánh sản phẩm">
      <div className="comparison-heading">
        <div>
          <p className="eyebrow">SO SÁNH SẢN PHẨM</p>
          <h3>Đặt cạnh nhau để chọn đúng mẫu</h3>
          <p>Giá và cấu hình được lấy từ nguồn đang hiển thị trên từng sản phẩm.</p>
        </div>
        <button type="button" className="comparison-clear" onClick={onClear}>Bỏ chọn tất cả</button>
      </div>
      {products.length < 2
        ? <p className="comparison-hint">Chọn thêm ít nhất một sản phẩm để bắt đầu so sánh. Có thể chọn tối đa 4 mẫu.</p>
        : <div className="comparison-scroll" tabIndex={0} aria-label="Bảng so sánh có thể cuộn ngang">
          <table className="comparison-table">
            <thead>
              <tr>
                <th scope="col">Thông tin</th>
                {products.map((product) => <th scope="col" key={product._id}>
                  <div className="comparison-product">
                    {(product.imageUsagePermission === 'granted' || (product.localOnlyAsset && product.imageVerificationStatus === 'pending')) && safeImageHref(product.imageUrl) && <img src={safeImageHref(product.imageUrl)!} alt="" loading="lazy" />}
                    <span>{product.name}</span>
                    <button type="button" aria-label={`Bỏ ${product.name} khỏi so sánh`} onClick={() => onRemove(product._id)}>×</button>
                  </div>
                </th>)}
              </tr>
            </thead>
            <tbody>
              <tr><th scope="row">Giá tham khảo</th>{products.map((product) => {
                const price = productPrice(product);
                return <td key={product._id}>{price != null ? formatVND(price) : 'Chưa có giá'}</td>;
              })}</tr>
              <tr><th scope="row">Cửa hàng</th>{products.map((product) => <td key={product._id}>{product.bestOffer?.sellerName ?? 'Chưa có nguồn giá'}</td>)}</tr>
              <tr><th scope="row">Hãng / model</th>{products.map((product) => { const model = product.model !== product.name ? product.model : null; return <td key={product._id}>{[product.brand, model, product.modelNumber].filter(Boolean).join(' · ') || 'Chưa có dữ liệu'}</td>; })}</tr>
              <tr><th scope="row">Danh mục</th>{products.map((product) => <td key={product._id}>{product.category}</td>)}</tr>
              {fields.map((field) => <tr key={field}>
                <th scope="row">{LABELS[field] ?? field.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())}</th>
                {products.map((product) => <td key={product._id}>{display(product.specs?.[field] ?? product.specifications?.[field])}</td>)}
              </tr>)}
              <tr><th scope="row">Nguồn giá</th>{products.map((product) => {
                const href = safeHref(product.bestOffer?.productUrl);
                return <td key={product._id}>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{product.bestOffer?.sellerName} · Xem giá</a> : 'Chưa có liên kết'}</td>;
              })}</tr>
              <tr><th scope="row">Lần cập nhật giá</th>{products.map((product) => <td key={product._id}>{product.bestOffer?.lastUpdated ? new Date(product.bestOffer.lastUpdated).toLocaleString('vi-VN') : 'Chưa có dữ liệu'}</td>)}</tr>
            </tbody>
          </table>
        </div>}
    </section>
  );
}
