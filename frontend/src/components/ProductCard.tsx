import { useState } from 'react';
import { Product, formatVND } from '../api';
import { getProductDisplayName } from '../productDisplayName';
import Icon, { IconName } from './Icon';

const CATEGORY_ICONS: Record<string, IconName> = {
  laptop: 'laptop', smartphone: 'phone', phone: 'phone', tablet: 'tablet',
  headphone: 'headphones', headphones: 'headphones', smartwatch: 'watch', watch: 'watch',
  monitor: 'monitor', cpu: 'cpu', gpu: 'gpu', keyboard: 'keyboard', camera: 'camera',
};
const SPEC_LABELS: Record<string, string> = {
  cpu: 'CPU', gpu: 'GPU', ram: 'RAM', storage: 'Lưu trữ', screen: 'Màn hình', display: 'Màn hình',
  battery: 'Pin', camera: 'Camera', resolution: 'Độ phân giải', megapixels: 'Độ phân giải',
  coolingCapacityHp: 'Công suất', coolingCapacityBtuH: 'Công suất', refrigerant: 'Gas', technology: 'Công nghệ',
  refreshRateHz: 'Tần số quét', panelType: 'Tấm nền', batteryCapacityMah: 'Dung lượng pin', wifiGeneration: 'Wi-Fi', connectivity: 'Kết nối',
};

const CATEGORY_SPEC_KEYS: Record<string, string[]> = {
  laptop: ['cpu', 'ram', 'gpu', 'storage', 'display', 'screen', 'battery'],
  desktop: ['cpu', 'ram', 'gpu', 'storage'],
  phone: ['camera', 'resolution', 'ram', 'storage', 'screen', 'battery'],
  tablet: ['screen', 'ram', 'storage', 'battery'],
  camera: ['megapixels', 'resolution', 'camera', 'sensor'],
  air_conditioner: ['coolingCapacityHp', 'coolingCapacityBtuH', 'technology', 'refrigerant'],
  monitor: ['screen', 'display', 'resolution', 'refreshRateHz', 'panelType'],
  tv: ['screen', 'display', 'resolution', 'refreshRateHz', 'panelType'],
  networking: ['wifiGeneration', 'connectivity'],
};

function safeLink(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\/catalog-images\/[a-z0-9][a-z0-9._-]*\.(jpg|jpeg|png|webp)$/i.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}

function wikimediaRawFallback(url: string): string | null {
  if (!url.includes('upload.wikimedia.org') || !url.includes('/thumb/')) return null;
  const raw = url.replace(/\/thumb\//, '/').replace(/\/\d+px-[^/]+$/, '');
  return raw !== url ? raw : null;
}

function specChips(product: Product): string[] {
  const sources = [product.specifications, product.specs].filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object'));
  const aliases: Record<string, string[]> = {
    ram: ['ram', 'ramGB', 'RAM'], storage: ['storage', 'storageGB', 'SSD', 'HDD'],
    screen: ['screen', 'display', 'screenSizeInches'], display: ['display', 'screen', 'screenSizeInches'],
    camera: ['camera'], resolution: ['resolution', 'videoResolution', 'megapixels'],
    battery: ['battery', 'batteryCapacityMah'], connectivity: ['connectivity', 'wireless'],
  };
  const keys = CATEGORY_SPEC_KEYS[product.category] ?? ['cpu', 'gpu', 'ram', 'storage', 'screen', 'display', 'battery', 'resolution'];
  const values: string[] = [];
  for (const key of keys) {
    const names = aliases[key] ?? [key];
    let value: unknown;
    for (const source of sources) {
      const entry = Object.entries(source).find(([sourceKey]) => names.some((name) => sourceKey.toLowerCase() === name.toLowerCase()));
      if (entry) { value = entry[1]; break; }
    }
    if (value == null || !['string', 'number'].includes(typeof value) || !String(value).trim()) continue;
    let display = String(value).trim();
    const suffixes: Record<string, string> = { ram: 'GB', storage: 'GB', coolingCapacityHp: ' HP', coolingCapacityBtuH: ' BTU', refreshRateHz: ' Hz', megapixels: ' MP', batteryCapacityMah: ' mAh' };
    const suffix = suffixes[key];
    if (suffix && typeof value === 'number') display += suffix;
    values.push(`${SPEC_LABELS[key] ?? key} · ${display}`);
    if (values.length === 3) break;
  }
  return [...new Set(values)];
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
  const [retriedRaw, setRetriedRaw] = useState(false);
  const offer = p.bestOffer;
  const price = offer?.verified === true && offer.priceStatus === 'current_verified' && typeof offer.price === 'number' && offer.price > 0 ? offer.price : null;
  const imageUrl = safeLink(p.imageUrl);
  const effectiveImageUrl = retriedRaw && imageUrl ? (wikimediaRawFallback(imageUrl) ?? imageUrl) : imageUrl;
  const hasRealImage = Boolean(effectiveImageUrl && !effectiveImageUrl.endsWith('/no-image.png'));
  const canDisplayImage = p.imageUsagePermission === 'granted' || (p.localOnlyAsset === true && p.imageVerificationStatus === 'pending');
  const purchaseUrl = safeLink(offer?.productUrl) ?? safeLink(offer?.affiliateUrl) ?? safeLink(p.productUrl) ?? safeLink(p.sourceUrl);
  const chips = specChips(p);
  const categoryIcon = CATEGORY_ICONS[p.category.toLocaleLowerCase('vi-VN')] ?? 'image';

  return (
    <article className="product-card">
      <div className="product-card-media">
        {canDisplayImage && hasRealImage && effectiveImageUrl && !imageFailed
          ? <img src={effectiveImageUrl} alt={getProductDisplayName(p)} loading="lazy" referrerPolicy="no-referrer" onError={() => {
              if (!retriedRaw && effectiveImageUrl && wikimediaRawFallback(effectiveImageUrl)) setRetriedRaw(true);
              else setImageFailed(true);
            }} />
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
            aria-label={`${compared ? 'Bỏ' : 'Thêm'} ${getProductDisplayName(p)} ${compared ? 'khỏi' : 'vào'} danh sách so sánh`}
            onClick={() => onToggleCompare(p)}
          >
            {compared ? <Icon name="check" size={16} /> : <Icon name="compare" size={16} />}
            <span>{compared ? 'Đã chọn' : 'So sánh'}</span>
          </button>
        )}
      </div>

      <div className="product-card-body">
        <div className="product-heading">
          <p className="product-brand">{p.brand || 'Thương hiệu chưa có'}</p>
        </div>
        <h3>{getProductDisplayName(p)}</h3>
        {chips.length > 0 && <ul className="product-specs" aria-label="Một số thông số">{chips.map((chip) => <li key={chip}>{chip}</li>)}</ul>}
        {price != null && <div className="product-price-block"><strong>{formatVND(price)}</strong></div>}
        <div className="product-card-actions">
          {onViewDetails && <button className="button-secondary" type="button" onClick={() => onViewDetails(p)}>Chi tiết</button>}
          {purchaseUrl && <a className="button-primary" href={purchaseUrl} target="_blank" rel="noopener noreferrer">Xem nơi bán <Icon name="external" size={15} /></a>}
        </div>
      </div>
    </article>
  );
}
