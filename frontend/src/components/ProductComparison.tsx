import { useEffect, useState } from 'react';
import { CompatibilityReport, Product, checkCompatibility, formatVND } from '../api';
import { getProductDisplayName } from '../productDisplayName';

const PC_PART_CATEGORIES = new Set(['cpu', 'motherboard', 'ram', 'gpu', 'power_supply', 'pc_case']);

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

function extractNumericSpec(product: Product, field: string): number | null {
  const key = field.toLowerCase();
  const rawVal = product.specs?.[field] ?? product.specifications?.[field];
  const rawStr = rawVal != null ? String(rawVal) : '';

  if (key === 'ram' || key === 'ramgb') {
    if (typeof product.normalizedSpecs?.ramGB === 'number' && product.normalizedSpecs.ramGB > 0) return product.normalizedSpecs.ramGB;
    const m = rawStr.match(/(\d+(?:\.\d+)?)\s*(tb|gb)?/i);
    if (!m) return null;
    const val = Number(m[1]);
    return m[2]?.toLowerCase() === 'tb' ? val * 1024 : val;
  }
  if (key === 'storage' || key === 'storagegb' || key === 'capacity') {
    if (typeof product.normalizedSpecs?.storageGB === 'number' && product.normalizedSpecs.storageGB > 0) return product.normalizedSpecs.storageGB;
    const m = rawStr.match(/(\d+(?:\.\d+)?)\s*(tb|gb)/i);
    if (!m) return null;
    const val = Number(m[1]);
    return m[2].toLowerCase() === 'tb' ? val * 1024 : val;
  }
  if (key === 'refreshrate' || key === 'refresh_rate' || key === 'refreshratehz') {
    if (typeof product.normalizedSpecs?.refreshRateHz === 'number' && product.normalizedSpecs.refreshRateHz > 0) return product.normalizedSpecs.refreshRateHz;
    const m = rawStr.match(/(\d+(?:\.\d+)?)\s*hz/i);
    return m ? Number(m[1]) : null;
  }
  if (key === 'battery' || key === 'batterymah') {
    if (typeof product.normalizedSpecs?.batteryMah === 'number' && product.normalizedSpecs.batteryMah > 0) return product.normalizedSpecs.batteryMah;
    const m = rawStr.match(/(\d{3,5})\s*mah/i);
    return m ? Number(m[1]) : null;
  }
  if (key === 'vram' || key === 'vramgb') {
    if (typeof product.normalizedSpecs?.vramGB === 'number' && product.normalizedSpecs.vramGB > 0) return product.normalizedSpecs.vramGB;
    const m = rawStr.match(/(\d+(?:\.\d+)?)\s*gb/i);
    return m ? Number(m[1]) : null;
  }
  return null;
}

function getBestSpecIds(products: Product[], field: string): Set<string> {
  if (products.length < 2) return new Set();
  const entries = products
    .map((p) => ({ id: p._id, val: extractNumericSpec(p, field) }))
    .filter((e): e is { id: string; val: number } => e.val != null && Number.isFinite(e.val) && e.val > 0);
  if (entries.length < 2) return new Set();
  const max = Math.max(...entries.map((e) => e.val));
  const min = Math.min(...entries.map((e) => e.val));
  if (max <= min) return new Set();
  return new Set(entries.filter((e) => e.val === max).map((e) => e.id));
}

function hasRowDifference(values: string[]): boolean {
  if (values.length < 2) return true;
  return new Set(values.map((v) => v.trim().toLowerCase())).size > 1;
}

export default function ProductComparison({ products, onRemove, onClear }: {
  products: Product[];
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const [showDiffOnly, setShowDiffOnly] = useState(false);
  const [compatReport, setCompatReport] = useState<CompatibilityReport | null>(null);
  const pcParts = products.filter((p) => PC_PART_CATEGORIES.has(p.category));
  const hasPcPartPair = pcParts.length >= 2 && new Set(pcParts.map((p) => p.category)).size >= 2;

  useEffect(() => {
    if (!hasPcPartPair) {
      setCompatReport(null);
      return;
    }
    const controller = new AbortController();
    checkCompatibility(pcParts.map((p) => p._id), controller.signal)
      .then((report) => setCompatReport(report))
      .catch(() => { if (!controller.signal.aborted) setCompatReport(null); });
    return () => controller.abort();
  }, [products.map((p) => `${p._id}:${p.category}`).join('|')]);

  if (!products.length) return null;
  const fields = technicalFields(products);
  const validPrices = products.map((p) => productPrice(p)).filter((p): p is number => p != null && p > 0);
  const minPrice = validPrices.length >= 2 && new Set(validPrices).size > 1 ? Math.min(...validPrices) : null;

  const visibleFields = showDiffOnly
    ? fields.filter((field) => hasRowDifference(products.map((p) => display(p.specs?.[field] ?? p.specifications?.[field]))))
    : fields;

  const showPriceRow = !showDiffOnly || hasRowDifference(products.map((p) => { const pr = productPrice(p); return pr != null ? String(pr) : 'unknown'; }));
  const showSellerRow = !showDiffOnly || hasRowDifference(products.map((p) => p.bestOffer?.sellerName ?? ''));
  const showBrandRow = !showDiffOnly || hasRowDifference(products.map((p) => {
    const model = p.model !== p.name ? p.model : null;
    return [p.brand, model, p.modelNumber].filter(Boolean).join(' · ');
  }));
  const showCategoryRow = !showDiffOnly || hasRowDifference(products.map((p) => p.category));

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
            <>
              <button
                type="button"
                aria-pressed={showDiffOnly}
                onClick={() => setShowDiffOnly((prev) => !prev)}
                style={{
                  background: showDiffOnly ? 'rgba(37, 99, 235, 0.12)' : 'var(--surface-subtle)',
                  color: showDiffOnly ? 'var(--primary)' : 'var(--ink)',
                  border: `1px solid ${showDiffOnly ? 'var(--primary)' : 'var(--line)'}`,
                  padding: '8px 12px',
                  borderRadius: '9px',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {showDiffOnly ? '✓ Chỉ điểm khác biệt' : 'Chỉ xem điểm khác biệt'}
              </button>
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
                  window.dispatchEvent(new CustomEvent('techfind:ask-advisor', { detail: { query, productIds: products.map((p) => p._id) } }));
                }}
              >
                <span>🤖</span> Nhờ AI tư vấn chọn mẫu
              </button>
            </>
          )}
          <button type="button" className="comparison-clear" onClick={onClear}>Bỏ chọn tất cả</button>
        </div>
      </div>
      {compatReport && compatReport.checks.length > 0 && (
        <div
          role="status"
          style={{
            marginBottom: '12px',
            padding: '10px 14px',
            borderRadius: '10px',
            border: `1px solid ${compatReport.overallStatus === 'COMPATIBLE' ? 'rgba(22, 163, 74, 0.35)' : compatReport.overallStatus === 'INCOMPATIBLE' ? 'rgba(220, 38, 38, 0.35)' : 'var(--line)'}`,
            background: compatReport.overallStatus === 'COMPATIBLE' ? 'rgba(22, 163, 74, 0.08)' : compatReport.overallStatus === 'INCOMPATIBLE' ? 'rgba(220, 38, 38, 0.08)' : 'var(--surface-subtle)',
            fontSize: '0.78rem',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '6px', color: compatReport.overallStatus === 'COMPATIBLE' ? '#15803d' : compatReport.overallStatus === 'INCOMPATIBLE' ? '#b91c1c' : 'var(--ink)' }}>
            {compatReport.overallStatus === 'COMPATIBLE' ? '✓ Tương thích phần cứng: ' : compatReport.overallStatus === 'INCOMPATIBLE' ? '✕ Cảnh báo không tương thích: ' : 'ⓘ Kiểm tra tương thích: '}
            {compatReport.summary}
          </div>
          <ul style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '4px' }}>
            {compatReport.checks.map((c) => (
              <li key={`${c.pair}-${c.reason}`}>
                <strong>{c.label}:</strong> [{c.status}] {c.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {products.length < 2
        ? <p className="comparison-hint">Chọn thêm ít nhất một sản phẩm để bắt đầu so sánh. Có thể chọn tối đa 4 mẫu.</p>
        : <div className="comparison-scroll" tabIndex={0} aria-label="Bảng so sánh có thể cuộn ngang">
          <table className="comparison-table">
            <thead>
              <tr>
                <th scope="col">Thông tin</th>
                {products.map((product) => <th scope="col" key={product._id}>
                  <div className="comparison-product">
                    {(product.imageUsagePermission === 'granted' || (product.localOnlyAsset && product.imageVerificationStatus === 'pending')) && safeImageHref(product.imageUrl) && !safeImageHref(product.imageUrl)!.endsWith('/no-image.png') && <img src={safeImageHref(product.imageUrl)!} alt="" loading="lazy" referrerPolicy="no-referrer" />}
                    <span>{getProductDisplayName(product)}</span>
                    <button type="button" aria-label={`Bỏ ${getProductDisplayName(product)} khỏi so sánh`} onClick={() => onRemove(product._id)}>×</button>
                  </div>
                </th>)}
              </tr>
            </thead>
            <tbody>
              {showPriceRow && <tr><th scope="row">Giá tham khảo</th>{products.map((product) => {
                const price = productPrice(product);
                const isLowest = minPrice !== null && price === minPrice;
                return (
                  <td key={product._id} style={isLowest ? { background: 'rgba(22, 163, 74, 0.06)' } : undefined}>
                    {price != null ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <strong>{formatVND(price)}</strong>
                        {isLowest && (
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: 'var(--success, #16a34a)',
                            background: 'rgba(22, 163, 74, 0.14)',
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
              })}</tr>}
              {showSellerRow && <tr><th scope="row">Cửa hàng</th>{products.map((product) => <td key={product._id}>{product.bestOffer?.sellerName ?? 'Chưa có nguồn giá'}</td>)}</tr>}
              {showBrandRow && <tr><th scope="row">Hãng / model</th>{products.map((product) => { const model = product.model !== product.name ? product.model : null; return <td key={product._id}>{[product.brand, model, product.modelNumber].filter(Boolean).join(' · ') || 'Chưa có dữ liệu'}</td>; })}</tr>}
              {showCategoryRow && <tr><th scope="row">Danh mục</th>{products.map((product) => <td key={product._id}>{product.category}</td>)}</tr>}
              {visibleFields.map((field) => {
                const bestIds = getBestSpecIds(products, field);
                return (
                  <tr key={field}>
                    <th scope="row">{LABELS[field] ?? field.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())}</th>
                    {products.map((product) => {
                      const isBest = bestIds.has(product._id);
                      return (
                        <td
                          key={product._id}
                          style={isBest ? { background: 'rgba(22, 163, 74, 0.08)', color: 'var(--success, #15803d)', fontWeight: 600 } : undefined}
                        >
                          {display(product.specs?.[field] ?? product.specifications?.[field])}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {showDiffOnly && !showPriceRow && !showSellerRow && !showBrandRow && !showCategoryRow && visibleFields.length === 0 && (
                <tr>
                  <td colSpan={products.length + 1} style={{ textAlign: 'center', color: 'var(--muted)', padding: '16px' }}>
                    Các sản phẩm có thông số hoàn toàn giống nhau ở những mục đang hiển thị.
                  </td>
                </tr>
              )}
              {!showDiffOnly && (
                <>
                  <tr><th scope="row">Nguồn giá</th>{products.map((product) => {
                    const href = safeHref(product.bestOffer?.productUrl);
                    return <td key={product._id}>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{product.bestOffer?.sellerName} · Xem giá</a> : 'Chưa có liên kết'}</td>;
                  })}</tr>
                  <tr><th scope="row">Lần cập nhật giá</th>{products.map((product) => <td key={product._id}>{product.bestOffer?.lastUpdated ? new Date(product.bestOffer.lastUpdated).toLocaleString('vi-VN') : 'Chưa có dữ liệu'}</td>)}</tr>
                </>
              )}
            </tbody>
          </table>
        </div>}
    </section>
  );
}
