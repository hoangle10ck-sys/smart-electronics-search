import { Product, formatVND } from '../api';

const ICONS: Record<string, string> = {
  laptop: '💻', phone: '📱', tablet: '📲', headphone: '🎧', watch: '⌚', speaker: '🔊',
  mouse: '🖱️', keyboard: '⌨️', monitor: '🖥️', tv: '📺', charger: '🔋',
};
const SPEC_LABELS: Record<string, string> = { cpu: 'CPU', gpu: 'GPU', screen: 'Màn hình', battery: 'Pin', camera: 'Camera' };

function specChips(p: Product): string[] {
  const chips: string[] = [];
  if (p.specs.ram) chips.push(`RAM ${p.specs.ram}GB`);
  if (p.specs.storage) chips.push(`${p.specs.storage}GB`);
  for (const k of Object.keys(SPEC_LABELS)) if (p.specs[k]) chips.push(String(p.specs[k]));
  return chips.slice(0, 4);
}

export default function ProductCard({ p }: { p: Product }) {
  const discount = p.originalPrice && p.originalPrice > p.price ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;
  return (
    <article className="card">
      <div className="thumb" aria-hidden>{ICONS[p.category] ?? '🔌'}</div>
      <div className="body">
        <p className="brand">{p.brand}</p>
        <h3>{p.name}</h3>
        <p className="price">
          {formatVND(p.price)}
          {discount > 0 && <span className="old">{formatVND(p.originalPrice!)}</span>}
          {discount > 0 && <span className="off">-{discount}%</span>}
        </p>
        <p className="meta">★ {p.rating.toFixed(1)} · Đã bán {p.sold.toLocaleString('vi-VN')}</p>
        <ul className="specs">{specChips(p).map((c) => <li key={c}>{c}</li>)}</ul>
        {p.reasons && p.reasons.length > 0 && (
          <ul className="reasons">{p.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        )}
      </div>
    </article>
  );
}
