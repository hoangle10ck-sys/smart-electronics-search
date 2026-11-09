import { useMemo, useRef, useState } from 'react';
import { SearchResponse, formatShort, searchProducts } from './api';
import SearchBar from './components/SearchBar';
import ProductCard from './components/ProductCard';

const EXAMPLES = [
  'laptop gaming dưới 20 triệu',
  'điện thoại chụp ảnh đẹp 8–15 triệu',
  'tai nghe chống ồn giá rẻ',
  'macbook pin trâu 25 triệu',
  'laptop văn phòng RAM 16GB',
  'đồng hồ theo dõi sức khoẻ',
];

type Sort = 'relevance' | 'price_asc' | 'price_desc' | 'rating';

export default function App() {
  const [query, setQuery] = useState('');
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<Sort>('relevance');
  const ctrl = useRef<AbortController | null>(null);

  const run = async (q: string) => {
    ctrl.current?.abort();
    ctrl.current = new AbortController();
    setQuery(q); setLoading(true); setError(''); setSort('relevance');
    try {
      setData(await searchProducts(q, ctrl.current.signal));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const items = useMemo(() => {
    if (!data) return [];
    const list = [...data.items];
    if (sort === 'price_asc') list.sort((a, b) => a.price - b.price);
    if (sort === 'price_desc') list.sort((a, b) => b.price - a.price);
    if (sort === 'rating') list.sort((a, b) => b.rating - a.rating);
    return list;
  }, [data, sort]);

  const i = data?.intent;
  const readout: [string, string][] = [];
  if (i) {
    if (i.category) readout.push(['Loại', i.category]);
    if (i.brands.length) readout.push(['Hãng', i.brands.join(', ')]);
    if (i.minPrice || i.maxPrice) {
      const price = i.minPrice && i.maxPrice
        ? `${formatShort(i.minPrice)} – ${formatShort(i.maxPrice)}`
        : i.maxPrice ? `đến ${formatShort(i.maxPrice)}` : `từ ${formatShort(i.minPrice!)}`;
      readout.push(['Giá', price]);
    }
    if (i.ram) readout.push(['RAM', `từ ${i.ram}GB`]);
    if (i.tags.length) readout.push(['Nhu cầu', i.tags.join(', ')]);
    if (i.keywords.length) readout.push(['Từ khoá', i.keywords.join(' ')]);
  }

  return (
    <main className="page">
      <nav className="topbar" aria-label="Điều hướng chính">
        <a className="brandmark" href="#" aria-label="TechFind trang chủ">
          <span className="brandmark-icon">✳</span>
          <span>tech<span>find</span></span>
        </a>
        <div className="topbar-meta">
          <span className="live-dot" />
          <span>TÌM KIẾM ĐIỆN TỬ THÔNG MINH</span>
        </div>
      </nav>

      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span>✦</span> MUA SẮM THÔNG MINH HƠN</p>
          <h1>Tìm đúng món đồ.<br /><span>Đúng nhu cầu của bạn.</span></h1>
          <p className="hero-description">
            Mô tả điều bạn đang tìm bằng ngôn ngữ tự nhiên. TechFind sẽ phân tích và gợi ý sản phẩm phù hợp.
          </p>
          <SearchBar value={query} loading={loading} onChange={setQuery} onSubmit={run} />
          <div className="examples">
            <span className="examples-label">THỬ TÌM:</span>
            {EXAMPLES.map((e) => <button key={e} onClick={() => run(e)}>{e}</button>)}
          </div>
          <div className="hero-proof">
            <span><b>✦</b> Hiểu ngôn ngữ tự nhiên</span>
            <span><b>✓</b> Gợi ý theo ngân sách</span>
            <span><b>↗</b> So sánh nhanh</span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-glow" />
          <div className="art-card art-card-phone"><span>📱</span><small>SMARTPHONE</small></div>
          <div className="art-card art-card-laptop"><span>💻</span><small>LAPTOP</small></div>
          <div className="art-card art-card-audio"><span>🎧</span></div>
          <div className="art-spark spark-one">✦</div>
          <div className="art-spark spark-two">✳</div>
          <div className="art-caption"><span className="live-dot" /> AI GỢI Ý SẢN PHẨM</div>
        </div>
      </header>

      {error && <p className="error" role="alert">{error}</p>}

      {data && (
        <section className="results-section" aria-live="polite">
          <div className="section-heading">
            <div>
              <p className="eyebrow">KẾT QUẢ TÌM KIẾM</p>
              <h2>Gợi ý dành cho bạn <span className="result-spark">✦</span></h2>
            </div>
            <span className="result-count">{data.total} sản phẩm</span>
          </div>
          <dl className="readout">
            <dt className="readout-title"><span>✦</span> Hệ thống hiểu yêu cầu của bạn</dt>
            {readout.length === 0 && <dd className="muted">Chưa nhận ra bộ lọc nào, đang hiển thị sản phẩm phổ biến.</dd>}
            {readout.map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          {data.notes.map((n) => <p className="note" key={n}>{n}</p>)}

          <div className="toolbar">
            <p>{data.total} sản phẩm phù hợp với mô tả của bạn</p>
            <label>
              <span>Sắp xếp theo</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="relevance">Phù hợp nhất</option>
                <option value="price_asc">Giá thấp đến cao</option>
                <option value="price_desc">Giá cao đến thấp</option>
                <option value="rating">Đánh giá cao</option>
              </select>
            </label>
          </div>

          {items.length === 0 ? (
            <p className="empty">Không tìm thấy sản phẩm. Thử bỏ bớt điều kiện hoặc tăng ngân sách.</p>
          ) : (
            <div className="grid">{items.map((p) => <ProductCard key={p._id} p={p} />)}</div>
          )}
        </section>
      )}
    </main>
  );
}
