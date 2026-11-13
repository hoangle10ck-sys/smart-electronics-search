import { useState } from 'react';
import { Product, formatVND } from '../api';
import Icon, { IconName } from './Icon';

const CATEGORY_ICONS: Record<string, IconName> = {
  laptop: 'laptop', smartphone: 'phone', phone: 'phone', tablet: 'tablet',
  headphone: 'headphones', headphones: 'headphones', smartwatch: 'watch', watch: 'watch',
  monitor: 'monitor', cpu: 'cpu', gpu: 'gpu', keyboard: 'keyboard', camera: 'camera',
};
const SPEC_LABELS: Record<string, string> = {
  cpu: 'CPU', gpu: 'GPU', ram: 'RAM', storage: 'Lưu trữ', screen: 'Màn hình',
  display: 'Màn hình', battery: 'Pin', camera: 'Camera', resolution: 'Độ phân giải',
};

function safeLink(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\/catalog-images\/[a-z0-9][a-z0-9._-]*\.(jpg|jpeg|png|webp)$/i.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

function specChips(product: Product): string[] {
  const values: string[] = [];
  const ram = product.specs?.ram ?? product.specifications?.ram ?? product.specifications?.RAM;
  const storage = product.specs?.storage ?? product.specifications?.storage ?? product.specifications?.SSD;
  if (ram) values.push(`RAM ${ram}${String(ram).match(/\d$/) ? 'GB' : ''}`);
  if (storage) values.push(`${storage}${String(storage).match(/\d$/) ? 'GB' : ''}`);
  for (const key of ['cpu', 'gpu', 'screen', 'display']) {
    const value = product.specs?.[key] ?? product.specifications?.[key];
    if (value != null && String(value).trim()) values.push(`${SPEC_LABELS[key]} · ${String(value)}`);
  }
  return [...new Set(values)].slice(0, 3);
}

function formatUpdatedAt(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(date);
}

export default function ProductCard({
  p,
  compared = false,
  onToggleCompare,
  onViewDetails,
}: {
  p: Product;
  compared?: boolean;
  onToggleCompare?: (product: Product) => void;
  onViewDetails?: (product: Product) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const offer = p.bestOffer;
  const price = offer?.verified === true && offer.priceStatus === 'current_verified' && typeof offer.price === 'number' && offer.price > 0 ? offer.price : null;
  const originalPrice = price != null && typeof offer?.originalPrice === 'number' ? offer.originalPrice : null;
  const discount = price && originalPrice && originalPrice > price ? Math.round((1 - price / originalPrice) * 100) : 0;
  const imageUrl = safeLink(p.imageUrl);
  const canDisplayImage = p.imageUsagePermission === 'granted' || (p.localOnlyAsset === true && p.imageVerificationStatus === 'pending');
  const attributionUrl = safeLink(p.imageSource) ?? safeLink(p.imageSourceUrl);
  const purchaseUrl = safeLink(offer?.productUrl) ?? safeLink(offer?.affiliateUrl) ?? safeLink(p.productUrl) ?? safeLink(p.sourceUrl);
  const chips = specChips(p);
  const updatedAt = formatUpdatedAt(offer?.observedAt ?? offer?.lastUpdated);
  const categoryIcon = CATEGORY_ICONS[p.category.toLocaleLowerCase('vi-VN')] ?? 'image';

  return (
    <article className="product-card">
      <div className="product-card-media">
        {canDisplayImage && imageUrl && !imageFailed
          ? <img src={imageUrl} alt={p.name} loading="lazy" onError={() => setImageFailed(true)} />
          : <div className="product-image-placeholder" aria-label="Chưa có hình ảnh sản phẩm">
              <Icon name={categoryIcon} size={36} />
              <span>Chưa có hình ảnh</span>
            </div>}
        {p.verified && <span className="verified-badge"><Icon name="shield" size={13} /> {p.verificationScope === 'retailer_feed' ? 'Nguồn bán xác minh' : 'Đã xác minh'}</span>}
        {onToggleCompare && (
          <button
            className={`compare-toggle${compared ? ' selected' : ''}`}
            type="button"
            aria-pressed={compared}
            aria-label={`${compared ? 'Bỏ' : 'Thêm'} ${p.name} ${compared ? 'khỏi' : 'vào'} danh sách so sánh`}
            onClick={() => onToggleCompare(p)}
          >
            {compared ? <Icon name="check" size={16} /> : <Icon name="compare" size={16} />}
            <span>{compared ? 'Đã chọn' : 'So sánh'}</span>
          </button>
        )}
      </div>

      {canDisplayImage && p.imageAttribution && (
        <small className="product-credit">
          Ảnh: {attributionUrl
            ? <a href={attributionUrl} target="_blank" rel="noopener noreferrer">{p.imageAttribution}</a>
            : p.imageAttribution}
        </small>
      )}
      {p.imageVerificationStatus === 'pending' && (
        <small className="image-status">{p.localOnlyAsset ? 'Ảnh nội bộ để tham khảo' : 'Ảnh chưa xác minh quyền sử dụng'}</small>
      )}

      <div className="product-card-body">
        <div className="product-heading">
          <p className="product-brand">{p.brand || 'Thương hiệu chưa có'}</p>
          {p.releaseYear && <span className="product-year">{p.releaseYear}</span>}
        </div>
        <h3>{p.name}</h3>
        {(p.model || p.modelNumber) && (p.model !== p.name || p.modelNumber) && <p className="product-model">{[p.model !== p.name ? p.model : null, p.modelNumber].filter(Boolean).join(' · ')}</p>}
        <ul className="product-specs" aria-label="Một số thông số">
          {chips.map((chip) => <li key={chip}>{chip}</li>)}
          {!chips.length && <li>Thông số chi tiết trong sản phẩm</li>}
        </ul>

        <div className="product-price-block">
          <div className="product-price-row">
            <strong className={price == null ? 'price-unavailable' : ''}>{price != null ? formatVND(price) : 'Chưa có giá xác minh'}</strong>
            {discount > 0 && <span className="discount-badge">−{discount}%</span>}
          </div>
          {discount > 0 && <span className="product-old-price">Giá cũ {formatVND(originalPrice!)}</span>}
          {price == null && p.priceEvidence?.status === 'historical' && <small>Giá này được ghi nhận trước đây; cần xác minh lại trước khi mua.</small>}
          {price == null && p.priceEvidence?.status === 'reference' && <small>Giá tham khảo, chưa đủ căn cứ xác minh là giá hiện hành.</small>}
          {price == null && p.priceEvidence?.status === 'expired' && <small>Giá đã hết hiệu lực.</small>}
          {price != null && <small>Giá hiện hành đã xác minh bằng VND.</small>}
          {price != null && (offer?.sellerName || updatedAt) && (
            <span className="product-offer-meta">{[offer?.sellerName, offer?.variantLabel, updatedAt && `Cập nhật ${updatedAt}`].filter(Boolean).join(' · ')}</span>
          )}
        </div>

        {p.advisorFit
          ? <div className="advisor-product-fit"><strong>Phù hợp {p.advisorFit.score}/100</strong><span>{p.advisorFit.reasons.slice(0, 2).join(' ')}</span></div>
          : p.reasons && p.reasons.length > 0 && <p className="product-fit"><Icon name="check" size={15} /> {p.reasons[0]}</p>}
        {p.advisorFit?.dataConfidence != null && <small>Độ tin cậy dữ liệu {p.advisorFit.dataConfidence}% · Điểm phù hợp {p.advisorFit.matchScore ?? p.advisorFit.score}/100</small>}
        {p.advisorFit?.matchingStatus === 'incomplete' && <small>Catalog chưa đủ dữ liệu để xác minh mọi tiêu chí bắt buộc.</small>}
        {p.advisorFit?.matchingStatus === 'historical_reference' && <small>Sản phẩm thuộc kết quả tìm kiếm trước.</small>}
        <div className="product-card-actions">
          {onViewDetails && <button className="button-secondary" type="button" onClick={() => onViewDetails(p)}>Chi tiết</button>}
          {purchaseUrl && <a className="button-primary" href={purchaseUrl} target="_blank" rel="noopener noreferrer">Xem nơi bán <Icon name="external" size={15} /></a>}
        </div>
      </div>
    </article>
  );
}
