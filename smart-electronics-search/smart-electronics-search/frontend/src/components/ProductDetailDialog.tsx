import { useEffect, useMemo, useRef, useState } from 'react';
import { getProductById, getSimilarProducts, Product, formatVND } from '../api';
import Icon from './Icon';

function safeHref(value: string | null | undefined) {
  if (!value) return null;
  if (/^\/catalog-images\/[a-z0-9][a-z0-9._-]*\.(jpg|jpeg|png|webp)$/i.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

function valueText(value: unknown) {
  if (value == null || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function displayDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(date);
}

function variantAttributes(attributes: Record<string, unknown> | undefined) {
  return Object.entries(attributes ?? {})
    .map(([key, value]) => {
      const text = valueText(value);
      return text ? `${key}: ${text}` : '';
    })
    .filter(Boolean)
    .join(' · ');
}

export default function ProductDetailDialog({
  initialProduct,
  onClose,
  onSelectProduct,
}: {
  initialProduct: Product;
  onClose: () => void;
  onSelectProduct: (product: Product) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [product, setProduct] = useState(initialProduct);
  const [similar, setSimilar] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [similarLoading, setSimilarLoading] = useState(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setProduct(initialProduct);
    setLoading(true);
    setError('');
    setSimilar([]);
    setSimilarLoading(true);
    getProductById(initialProduct._id, controller.signal)
      .then(setProduct)
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Không tải được chi tiết sản phẩm.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    getSimilarProducts(initialProduct._id, 4, controller.signal)
      .then(setSimilar)
      .catch(() => { if (!controller.signal.aborted) setSimilar([]); })
      .finally(() => { if (!controller.signal.aborted) setSimilarLoading(false); });
    return () => controller.abort();
  }, [initialProduct]);

  const specs = useMemo(() => {
    const entries = new Map<string, string>();
    for (const [key, value] of Object.entries(product.specs ?? {})) {
      const text = valueText(value);
      if (text) entries.set(key, text);
    }
    for (const [key, value] of Object.entries(product.specifications ?? {})) {
      const text = valueText(value);
      if (text && !entries.has(key)) entries.set(key, text);
    }
    return [...entries.entries()].slice(0, 32);
  }, [product]);

  const offer = product.bestOffer?.verified && product.bestOffer.priceStatus === 'current_verified' ? product.bestOffer : null;
  const price = offer && typeof offer.price === 'number' && offer.price > 0 ? offer.price : null;
  const imageAllowed = product.imageUsagePermission === 'granted' || (product.localOnlyAsset === true && product.imageVerificationStatus === 'pending');
  const imageUrl = imageAllowed ? safeHref(product.imageUrl) : null;
  const purchaseUrl = safeHref(offer?.productUrl) ?? safeHref(offer?.affiliateUrl) ?? safeHref(product.productUrl) ?? safeHref(product.sourceUrl);
  const specSource = safeHref(product.specificationSourceUrl);
  const productSource = safeHref(product.productUrl);

  return (
    <dialog
      ref={dialogRef}
      className="product-dialog"
      aria-labelledby="product-dialog-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="product-dialog-shell">
        <button className="dialog-close" type="button" aria-label="Đóng chi tiết sản phẩm" onClick={onClose}><Icon name="close" size={20} /></button>
        {loading && <div className="dialog-loading" role="status"><span className="spinner" /> Đang tải thông tin sản phẩm…</div>}
        {error && <div className="inline-error" role="alert">{error}</div>}

        <div className="detail-overview">
          <div className="detail-image">
            {imageUrl
              ? <img src={imageUrl} alt={product.name} />
              : <div className="product-image-placeholder"><Icon name="image" size={42} /><span>Chưa có hình ảnh</span></div>}
          </div>
          <div className="detail-summary">
            <p className="product-brand">{product.brand || 'Sản phẩm điện tử'}</p>
            <h2 id="product-dialog-title">{product.name}</h2>
            {(product.model || product.modelNumber) && (product.model !== product.name || product.modelNumber) && <p className="detail-model">{[product.model !== product.name ? product.model : null, product.modelNumber].filter(Boolean).join(' · ')}</p>}
            {product.verified && <span className="verified-inline"><Icon name="shield" size={15} /> {product.verificationScope === 'retailer_feed' ? 'Tên sản phẩm và ưu đãi từ feed nhà bán' : 'Thông tin sản phẩm đã xác minh'}</span>}
            <p className="detail-price">{price != null ? formatVND(price) : 'Chưa có giá xác minh'}</p>
            {offer && <p className="detail-offer-meta">{[offer.sellerName, displayDate(offer.lastUpdated) && `Cập nhật ${displayDate(offer.lastUpdated)}`].filter(Boolean).join(' · ')}</p>}
            {product.description && <p className="detail-description">{product.description}</p>}
            <div className="detail-actions">
              {purchaseUrl && <a className="button-primary" href={purchaseUrl} target="_blank" rel="noopener noreferrer">Xem nơi bán <Icon name="external" size={16} /></a>}
              {productSource && <a className="button-secondary" href={productSource} target="_blank" rel="noopener noreferrer">Trang sản phẩm</a>}
              {specSource && <a className="button-secondary" href={specSource} target="_blank" rel="noopener noreferrer">Nguồn thông số</a>}
            </div>
            {product.imageAttribution && <p className="detail-credit">Ảnh: {product.imageAttribution}{product.imageLicense ? ` · ${product.imageLicense}` : ''}</p>}
          </div>
        </div>

        {!!product.variants?.length && <section className="detail-section" aria-labelledby="variants-heading">
          <div className="detail-section-heading"><div><p className="eyebrow">CẤU HÌNH LỰA CHỌN</p><h3 id="variants-heading">Phiên bản sản phẩm</h3></div></div>
          <ul className="detail-variant-list">{product.variants.map((variant, index) => {
            const attributes = variantAttributes(variant.attributes);
            return <li key={`${variant.sku ?? variant.modelNumber ?? variant.name ?? 'variant'}-${index}`}>
              <strong>{variant.name || variant.modelNumber || variant.sku || `Phiên bản ${index + 1}`}</strong>
              {(variant.sku || variant.modelNumber) && <small>{[variant.sku && `SKU ${variant.sku}`, variant.modelNumber && `Model ${variant.modelNumber}`].filter(Boolean).join(' · ')}</small>}
              {attributes && <p>{attributes}</p>}
            </li>;
          })}</ul>
        </section>}

        <section className="detail-section" aria-labelledby="specification-heading">
          <div className="detail-section-heading"><div><p className="eyebrow">THÔNG TIN SẢN PHẨM</p><h3 id="specification-heading">Thông số kỹ thuật</h3></div></div>
          {specs.length
            ? <dl className="detail-spec-grid">{specs.map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, ' $1')}</dt><dd>{value}</dd></div>)}</dl>
            : <p className="detail-muted">Chưa có thông số chi tiết trong catalog.</p>}
        </section>

        {!!product.sourceEvidence?.length && <section className="detail-section" aria-labelledby="evidence-heading">
          <div className="detail-section-heading"><div><p className="eyebrow">CĂN CỨ DỮ LIỆU</p><h3 id="evidence-heading">Nguồn xác minh</h3></div></div>
          <ul className="detail-evidence-list">{product.sourceEvidence.map((evidence, index) => {
            const href = safeHref(evidence.sourceUrl);
            return <li key={`${evidence.sourceName}-${evidence.evidenceType}-${index}`}>
              <div className="detail-evidence-heading"><span><Icon name="shield" size={16} />{evidence.sourceName}</span>{href && <a href={href} target="_blank" rel="noopener noreferrer">Mở nguồn <Icon name="external" size={13} /></a>}</div>
              <small>{[evidence.evidenceType, displayDate(evidence.verifiedAt) && `Xác minh ${displayDate(evidence.verifiedAt)}`, displayDate(evidence.retrievedAt) && `Thu thập ${displayDate(evidence.retrievedAt)}`].filter(Boolean).join(' · ')}</small>
              {evidence.notes && <p>{evidence.notes}</p>}
            </li>;
          })}</ul>
        </section>}

        <section className="detail-section" aria-labelledby="similar-heading">
          <div className="detail-section-heading"><div><p className="eyebrow">KHÁM PHÁ THÊM</p><h3 id="similar-heading">Sản phẩm tương tự</h3></div></div>
          {similarLoading
            ? <div className="similar-loading" role="status">Đang tìm sản phẩm phù hợp…</div>
            : similar.length
              ? <ul className="similar-list">{similar.map((item) => (
                  <li key={item._id}>
                    <div><span>{item.brand ?? item.category}</span><strong>{item.name}</strong><small>{item.bestOffer?.verified && item.bestOffer.price ? formatVND(item.bestOffer.price) : 'Chưa có giá xác minh'}</small></div>
                    <button className="button-secondary" type="button" onClick={() => onSelectProduct(item)}>Xem <Icon name="arrow" size={15} /></button>
                  </li>
                ))}</ul>
              : <p className="detail-muted">Chưa có sản phẩm tương tự phù hợp trong catalog.</p>}
        </section>
      </div>
    </dialog>
  );
}
