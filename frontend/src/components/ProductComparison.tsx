import { Product, formatVND } from '../api';
import { getProductDisplayName } from '../productDisplayName';

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
  const validPrices = products.map((p) => productPrice(p)).filter((p): p is number => p != null && p > 0);
  const minPrice = validPrices.length >= 2 ? Math.min(...validPrices) : null;

  return (
    <section className="comparison-panel" id="product-comparison" aria-label="Bảng so sánh sản phẩm">
      <div className="comparison-heading">
        <div>
          <p className="eyebrow">SO SÁNH SẢN PHẨM</p>
          <h3>Đặt cạnh nhau để chọn đúng mẫu</h3>
          <p>Giá và cấu hình được lấy từ nguồn đang hiển thị trên từng sản phẩm.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {products.length >= 2 && (
            <button
              type="button"
              style={{
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: '9px',
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
              onClick={() => {
                const names = products.map((p) => getProductDisplayName(p)).join(' vs ');
                const query = `Hãy so sánh chi tiết và tư vấn giúp tôi nên chọn mẫu nào giữa: ${names}`;
                window.dispatchEvent(new CustomEvent('techfind:ask-advisor', { detail: { query } }));
              }}
            >
              <span>🤖</span> Nhờ AI tư vấn chọn mẫu
            </button>
          )}
          <button type="button" className="comparison-clear" onClick={onClear}>Bỏ chọn tất cả</button>
        </div>
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
                    <span>{getProductDisplayName(product)}</span>
                    <button type="button" aria-label={`Bỏ ${getProductDisplayName(product)} khỏi so sánh`} onClick={() => onRemove(product._id)}>×</button>
                  </div>
                </th>)}
              </tr>
            </thead>
            <tbody>
              <tr><th scope="row">Giá tham khảo</th>{products.map((product) => {
                const price = productPrice(product);
                const isLowest = minPrice !== null && price === minPrice;
                return (
                  <td key={product._id}>
                    {price != null ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <strong>{formatVND(price)}</strong>
                        {isLowest && (
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: 'var(--success, #16a34a)',
                            background: 'rgba(22, 163, 74, 0.12)',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            Giá tốt nhất
                          </span>
                        )}
                      </div>
                    ) : 'Chưa có giá'}
                  </td>
                );
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
