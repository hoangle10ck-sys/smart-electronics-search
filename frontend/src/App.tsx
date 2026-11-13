import { useEffect, useMemo, useRef, useState } from 'react';
import { getCategories, getProducts, Product, SearchResponse, formatShort, formatVND, searchProducts } from './api';
import AdminConsole from './components/AdminConsole';
import Icon, { IconName } from './components/Icon';
import ProductCard from './components/ProductCard';
import ProductComparison from './components/ProductComparison';
import ProductDetailDialog from './components/ProductDetailDialog';
import ProductAdvisorWidget from './components/ProductAdvisorWidget';
import SearchBar from './components/SearchBar';
import ThemeToggle, { ThemePreference, useThemePreference } from './components/ThemeToggle';

const EXAMPLES = [
  'laptop gaming dưới 20 triệu',
  'điện thoại chụp ảnh đẹp 8–15 triệu',
  'tai nghe chống ồn giá rẻ',
  'MacBook pin trâu 25 triệu',
  'laptop văn phòng RAM 16GB',
  'đồng hồ theo dõi sức khỏe',
];
const PAGE_SIZE = 12;

type Sort = 'relevance' | 'price_asc' | 'price_desc' | 'rating';
type Filters = { category: string; brand: string; minPrice: string; maxPrice: string; minRam: string };
const EMPTY_FILTERS: Filters = { category: '', brand: '', minPrice: '', maxPrice: '', minRam: '' };

const CATEGORY_LABELS: Record<string, string> = {
  laptop: 'Laptop', smartphone: 'Điện thoại', phone: 'Điện thoại', tablet: 'Máy tính bảng',
  cpu: 'Bộ xử lý', gpu: 'Card đồ họa', monitor: 'Màn hình', smartwatch: 'Đồng hồ thông minh',
  headphone: 'Tai nghe', headphones: 'Tai nghe', earphone: 'Tai nghe', keyboard: 'Bàn phím',
  mouse: 'Chuột', camera: 'Máy ảnh', speaker: 'Loa', television: 'Tivi', storage: 'Lưu trữ',
  desktop: 'Máy tính để bàn', drone: 'Flycam', ereader: 'Máy đọc sách', gaming_console: 'Máy chơi game',
  microphone: 'Micro', projector: 'Máy chiếu', smart_home: 'Nhà thông minh', streaming_capture: 'Thiết bị livestream',
  vr_ar: 'Kính thực tế ảo', webcam: 'Webcam',
};
const CATEGORY_ICONS: Record<string, IconName> = {
  laptop: 'laptop', smartphone: 'phone', phone: 'phone', tablet: 'tablet', cpu: 'cpu', gpu: 'gpu',
  monitor: 'monitor', smartwatch: 'watch', headphone: 'headphones', headphones: 'headphones',
  earphone: 'headphones', keyboard: 'keyboard', camera: 'camera', desktop: 'laptop',
  microphone: 'microphone', webcam: 'camera', vr_ar: 'vr', gaming_console: 'gamepad',
  drone: 'drone', ereader: 'book', projector: 'projector', smart_home: 'home',
  streaming_capture: 'camera', storage: 'database',
};

function categoryLabel(category: string) {
  const key = category.toLocaleLowerCase('vi-VN');
  return CATEGORY_LABELS[key] ?? category.replace(/[_-]/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function verifiedPrice(product: Product) {
  const price = product.bestOffer?.verified === true ? product.bestOffer.price : null;
  return typeof price === 'number' && price > 0 ? price : null;
}

function productRam(product: Product) {
  const raw = product.specs?.ram ?? product.specifications?.ram ?? product.specifications?.RAM;
  if (raw == null) return null;
  const match = String(raw).trim().match(/^(\d+(?:\.\d+)?)\s*(?:gb)?$/i);
  return match ? Number(match[1]) : null;
}

function SiteHeader({
  preference,
  onThemeChange,
  isAdmin,
}: {
  preference: ThemePreference;
  onThemeChange: () => void;
  isAdmin: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const home = isAdmin ? '/' : '#home';
  const nav = isAdmin ? [
    { href: '/', label: 'Về tìm kiếm' },
    { href: '/admin', label: 'Quản trị' },
  ] : [
    { href: '#home', label: 'Trang chủ' },
    { href: '#categories', label: 'Danh mục' },
    { href: '#products', label: 'Sản phẩm' },
    { href: '#assistant', label: 'Trợ lý AI' },
    { href: '/admin', label: 'Quản trị' },
  ];

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <a className="site-brand" href={home} aria-label="TechFind — trang chủ">
          <span className="site-brand-icon"><Icon name="search" size={20} /></span>
          <span className="site-brand-copy"><strong>TechFind</strong><small>SMART ELECTRONICS SEARCH</small></span>
        </a>
        <nav className={`site-nav${menuOpen ? ' is-open' : ''}`} aria-label="Điều hướng chính">
          {nav.map((item) => <a href={item.href} key={item.href} onClick={() => setMenuOpen(false)}>{item.label}</a>)}
        </nav>
        <div className="site-header-actions">
          <ThemeToggle preference={preference} onChange={onThemeChange} />
          <button className="mobile-menu-button" type="button" aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
            <Icon name={menuOpen ? 'close' : 'menu'} size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div><strong>TechFind</strong><p>Tìm kiếm và so sánh sản phẩm điện tử theo nhu cầu thực tế.</p></div>
        <nav aria-label="Liên kết cuối trang"><a href="#home">Tìm kiếm</a><a href="#categories">Danh mục</a><a href="#assistant">Trợ lý AI</a><a href="/admin">Quản trị</a></nav>
        <small>Thông tin sản phẩm và giá được lấy từ catalog cùng nguồn bán đã xác minh.</small>
      </div>
    </footer>
  );
}

function QueryChips({ data }: { data: SearchResponse }) {
  const intent = data.intent;
  const items: Array<{ label: string; value: string }> = [];
  if (intent.category) items.push({ label: 'Danh mục', value: categoryLabel(intent.category) });
  if (intent.brands.length) items.push({ label: 'Thương hiệu', value: intent.brands.join(', ') });
  if (intent.minPrice !== undefined || intent.maxPrice !== undefined) {
    const budget = intent.minPrice !== undefined && intent.maxPrice !== undefined
      ? `${formatShort(intent.minPrice)} – ${formatShort(intent.maxPrice)}`
      : intent.maxPrice !== undefined ? `Đến ${formatShort(intent.maxPrice)}` : `Từ ${formatShort(intent.minPrice!)}`;
    items.push({ label: 'Ngân sách', value: budget });
  }
  if (intent.ram) items.push({ label: 'RAM', value: `Từ ${intent.ram}GB` });
  if (intent.storageType) items.push({ label: 'Lưu trữ', value: intent.storageType.toUpperCase() });
  if (intent.storageGB) items.push({ label: 'Dung lượng', value: `Từ ${intent.storageGB}GB` });
  if (intent.vramGB) items.push({ label: 'VRAM', value: `Từ ${intent.vramGB}GB` });
  if (intent.displayInches) items.push({ label: 'Màn hình', value: `${intent.displayInches} inch` });
  if (intent.tags.length) items.push({ label: 'Nhu cầu', value: intent.tags.join(', ') });
  if (intent.keywords.length) items.push({ label: 'Từ khóa', value: intent.keywords.join(' ') });

  return (
    <section className="understanding-card" aria-label="Nhu cầu đã nhận diện">
      <div className="understanding-heading"><span className="small-icon"><Icon name="sparkles" size={17} /></span><div><strong>Đã hiểu yêu cầu</strong><small>{data.queryUnderstanding?.status === 'active' ? 'Phân tích ngôn ngữ tự nhiên' : 'Đang dùng tiêu chí nhận diện từ câu tìm kiếm'}</small></div></div>
      {items.length
        ? <div className="understanding-chips">{items.map((item) => <span className="understanding-chip" key={`${item.label}-${item.value}`}><small>{item.label}</small><strong>{item.value}</strong></span>)}</div>
        : <p className="understanding-empty">Chưa nhận ra bộ lọc cụ thể. Kết quả vẫn được lấy từ catalog sản phẩm.</p>}
    </section>
  );
}

function SearchFilters({
  filters,
  categories,
  brands,
  onChange,
  onReset,
  onClose,
  isOpen = false,
}: {
  filters: Filters;
  categories: string[];
  brands: string[];
  onChange: (key: keyof Filters, value: string) => void;
  onReset: () => void;
  onClose?: () => void;
  isOpen?: boolean;
}) {
  return (
    <aside className={`filter-panel${isOpen ? ' is-open' : ''}`} aria-label="Bộ lọc kết quả">
      <div className="filter-panel-heading"><div><span className="small-icon"><Icon name="sliders" size={17} /></span><h3>Bộ lọc</h3></div>{onClose && <button type="button" className="icon-button filter-close" aria-label="Đóng bộ lọc" onClick={onClose}><Icon name="close" size={18} /></button>}</div>
      <label className="filter-field"><span>Danh mục</span><select value={filters.category} onChange={(event) => onChange('category', event.target.value)}><option value="">Tất cả danh mục</option>{categories.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}</select></label>
      <label className="filter-field"><span>Thương hiệu</span><select value={filters.brand} onChange={(event) => onChange('brand', event.target.value)}><option value="">Tất cả thương hiệu</option>{brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}</select></label>
      <fieldset className="filter-field"><legend>Khoảng giá (₫)</legend><div className="filter-range"><label><span className="visually-hidden">Giá thấp nhất</span><input type="number" min="0" inputMode="numeric" placeholder="Từ" value={filters.minPrice} onChange={(event) => onChange('minPrice', event.target.value)} /></label><span aria-hidden="true">–</span><label><span className="visually-hidden">Giá cao nhất</span><input type="number" min="0" inputMode="numeric" placeholder="Đến" value={filters.maxPrice} onChange={(event) => onChange('maxPrice', event.target.value)} /></label></div></fieldset>
      <label className="filter-field"><span>RAM tối thiểu</span><select value={filters.minRam} onChange={(event) => onChange('minRam', event.target.value)}><option value="">Mọi dung lượng</option><option value="8">8GB trở lên</option><option value="16">16GB trở lên</option><option value="32">32GB trở lên</option></select></label>
      <p className="filter-note">Bộ lọc áp dụng cho các sản phẩm đã tải từ catalog.</p>
      <button className="filter-reset" type="button" onClick={onReset}>Xóa bộ lọc</button>
    </aside>
  );
}

function SearchApp() {
  const [query, setQuery] = useState('');
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<Sort>('relevance');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [homeProducts, setHomeProducts] = useState<Product[]>([]);
  const [homeLoading, setHomeLoading] = useState(true);
  const [comparison, setComparison] = useState<Product[]>([]);
  const [compareNotice, setCompareNotice] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([getCategories(controller.signal), getProducts(1, 8, controller.signal)]).then(([categoryResult, productResult]) => {
      if (controller.signal.aborted) return;
      if (categoryResult.status === 'fulfilled') setCategories(categoryResult.value);
      if (productResult.status === 'fulfilled') setHomeProducts(productResult.value.items);
      setHomeLoading(false);
    });
    return () => controller.abort();
  }, []);

  const run = async (rawQuery: string) => {
    const value = rawQuery.trim();
    if (!value) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setQuery(value);
    setLoading(true);
    setError('');
    setData(null);
    setFilters(EMPTY_FILTERS);
    setSort('relevance');
    setPage(1);
    setMobileFiltersOpen(false);
    try {
      const result = await searchProducts(value, controller.signal, 60);
      if (controller.signal.aborted) return;
      setData(result);
      window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Không thể tải kết quả tìm kiếm.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  useEffect(() => () => requestRef.current?.abort(), []);

  const sourceItems = data?.items ?? [];
  const availableCategories = useMemo(() => [...new Set(sourceItems.map((product) => product.category).filter(Boolean))].sort(), [sourceItems]);
  const availableBrands = useMemo(() => [...new Set(sourceItems.map((product) => product.brand).filter((brand): brand is string => Boolean(brand)))].sort((a, b) => a.localeCompare(b, 'vi')), [sourceItems]);

  const filteredItems = useMemo(() => {
    if (!data) return [];
    let result = data.items.filter((product) => {
      if (filters.category && product.category !== filters.category) return false;
      if (filters.brand && product.brand !== filters.brand) return false;
      const price = verifiedPrice(product);
      const min = filters.minPrice === '' ? null : Number(filters.minPrice);
      const max = filters.maxPrice === '' ? null : Number(filters.maxPrice);
      if (min != null && (!price || price < min)) return false;
      if (max != null && (!price || price > max)) return false;
      const minRam = filters.minRam === '' ? null : Number(filters.minRam);
      if (minRam != null) {
        const ram = productRam(product);
        if (ram == null || ram < minRam) return false;
      }
      return true;
    });
    if (sort === 'price_asc') result = [...result].sort((a, b) => (verifiedPrice(a) ?? Number.POSITIVE_INFINITY) - (verifiedPrice(b) ?? Number.POSITIVE_INFINITY));
    if (sort === 'price_desc') result = [...result].sort((a, b) => (verifiedPrice(b) ?? 0) - (verifiedPrice(a) ?? 0));
    if (sort === 'rating') result = [...result].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    return result;
  }, [data, filters, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const visibleItems = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const toggleComparison = (product: Product) => {
    setCompareNotice('');
    if (comparison.some((item) => item._id === product._id)) {
      setComparison((current) => current.filter((item) => item._id !== product._id));
    } else if (comparison.length >= 4) {
      setCompareNotice('Có thể so sánh tối đa 4 sản phẩm cùng lúc.');
    } else {
      setComparison((current) => [...current, product]);
    }
  };

  const jumpToComparison = () => document.getElementById('product-comparison')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const intent = data?.intent;

  return (
    <main className="app-main" id="home">
      <section className="hero-search" aria-labelledby="hero-title">
        <div className="hero-search-copy">
          <p className="eyebrow"><span className="eyebrow-mark"><Icon name="sparkle" size={14} /></span> TÌM KIẾM ĐIỆN TỬ THÔNG MINH</p>
          <h1 id="hero-title">Tìm đúng thiết bị.<br /><span>Chọn đúng nhu cầu.</span></h1>
          <p className="hero-description">Mô tả điều bạn cần bằng ngôn ngữ tự nhiên. TechFind lọc sản phẩm từ catalog đã xác minh để bạn dễ chọn hơn.</p>
          <SearchBar id="main-search" value={query} loading={loading} onChange={setQuery} onSubmit={run} />
          <div className="quick-searches" aria-label="Tìm kiếm gợi ý"><span>Gợi ý</span>{EXAMPLES.map((example) => <button key={example} type="button" onClick={() => void run(example)}>{example}</button>)}</div>
          <div className="hero-assurances"><span><Icon name="shield" size={16} /> Nguồn sản phẩm rõ ràng</span><span><Icon name="compare" size={16} /> So sánh cấu hình</span></div>
        </div>
        <aside className="hero-guide" aria-label="Cách TechFind hỗ trợ tìm sản phẩm">
          <div className="guide-icon"><Icon name="sparkles" size={22} /></div>
          <p className="guide-kicker">TỪ NHU CẦU ĐẾN LỰA CHỌN</p>
          <h2>Thông tin rõ ràng, quyết định dễ hơn.</h2>
          <ol className="guide-steps">
            <li><span>01</span><div><strong>Mô tả điều bạn cần</strong><small>Ngân sách, mục đích, thông số</small></div></li>
            <li><span>02</span><div><strong>Lọc sản phẩm phù hợp</strong><small>Giá và cấu hình từ catalog</small></div></li>
            <li><span>03</span><div><strong>So sánh trước khi chọn</strong><small>Đặt tối đa 4 sản phẩm cạnh nhau</small></div></li>
          </ol>
          <p className="guide-footnote"><Icon name="check" size={15} /> Giá chỉ hiển thị khi có offer xác minh.</p>
        </aside>
      </section>

      {error && <div className="request-error" role="alert"><span><Icon name="refresh" size={18} /></span><div><strong>Không thể tải kết quả</strong><p>{error}</p></div><button className="button-secondary" type="button" onClick={() => void run(query)}>Thử lại</button></div>}
      {loading && <section className="loading-results" aria-live="polite" aria-busy="true"><div className="loading-heading"><span className="spinner" /><div><strong>Đang tìm sản phẩm phù hợp</strong><small>Đang lọc theo nhu cầu và dữ liệu catalog</small></div></div><div className="skeleton-grid">{Array.from({ length: 4 }, (_, index) => <div className="product-skeleton" key={index}><span /><div><i /><i /><i /></div></div>)}</div></section>}

      {data && (
        <section className="search-results" ref={resultsRef} aria-live="polite" aria-labelledby="results-title">
          <div className="results-heading">
            <div><p className="eyebrow">KẾT QUẢ TÌM KIẾM</p><h2 id="results-title">Kết quả cho <span>“{data.query}”</span></h2></div>
            <div className="results-total"><strong>{data.total.toLocaleString('vi-VN')}</strong><span>sản phẩm phù hợp</span></div>
          </div>

          <QueryChips data={data} />
          {!!data.notes.length && <div className="search-notes">{data.notes.map((note, index) => <p key={`${index}-${note}`}><Icon name="shield" size={16} />{note}</p>)}</div>}

          <div className="mobile-filter-row"><button type="button" className="button-secondary" aria-expanded={mobileFiltersOpen} onClick={() => setMobileFiltersOpen(true)}><Icon name="filter" size={17} /> Bộ lọc{activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}</button><span>{filteredItems.length} kết quả đã tải</span></div>
          {mobileFiltersOpen && <button className="filter-backdrop" type="button" aria-label="Đóng bộ lọc" onClick={() => setMobileFiltersOpen(false)} />}

          <div className="results-layout">
            <SearchFilters filters={filters} categories={availableCategories} brands={availableBrands} onChange={updateFilter} onReset={() => { setFilters(EMPTY_FILTERS); setPage(1); }} onClose={() => setMobileFiltersOpen(false)} isOpen={mobileFiltersOpen} />
            <div className="results-content">
              <div className="results-toolbar">
                <div><strong>{filteredItems.length.toLocaleString('vi-VN')}</strong><span> sản phẩm trong danh sách đã tải</span></div>
                <label className="sort-control"><span>Sắp xếp</span><select value={sort} onChange={(event) => { setSort(event.target.value as Sort); setPage(1); }}><option value="relevance">Phù hợp nhất</option><option value="price_asc">Giá thấp đến cao</option><option value="price_desc">Giá cao đến thấp</option><option value="rating">Đánh giá cao</option></select></label>
              </div>
              {data.total > data.items.length && <p className="result-limit-note">Đang hiển thị {data.items.length} sản phẩm đầu trong {data.total} kết quả. Hãy thêm tiêu chí tìm kiếm để thu hẹp danh sách.</p>}

              {comparison.length > 0 && <div className="compare-bar"><span><strong>{comparison.length}/4</strong> sản phẩm được chọn</span>{compareNotice && <span className="compare-notice" role="status">{compareNotice}</span>}<button type="button" onClick={jumpToComparison}>{comparison.length > 1 ? 'Xem so sánh' : 'Chọn thêm'} <Icon name="arrow" size={16} /></button></div>}
              <ProductComparison products={comparison} onRemove={(id) => setComparison((current) => current.filter((item) => item._id !== id))} onClear={() => { setComparison([]); setCompareNotice(''); }} />

              {visibleItems.length
                ? <div className="product-grid">{visibleItems.map((product) => <ProductCard key={product._id} p={product} compared={comparison.some((item) => item._id === product._id)} onToggleCompare={toggleComparison} onViewDetails={setSelectedProduct} />)}</div>
                : <div className="empty-state"><span className="empty-icon"><Icon name="search" size={25} /></span><h3>{activeFilterCount ? 'Không có kết quả với bộ lọc này' : 'Chưa tìm thấy sản phẩm phù hợp'}</h3><p>{activeFilterCount ? 'Hãy xóa bớt một vài bộ lọc hoặc thử khoảng giá khác.' : 'Thử nới rộng ngân sách hoặc mô tả nhu cầu bằng từ khóa khác.'}</p><button className="button-secondary" type="button" onClick={() => { setFilters(EMPTY_FILTERS); if (!activeFilterCount) { setQuery(''); setData(null); } }}>Tìm kiếm lại</button></div>}

              {pageCount > 1 && <nav className="pagination" aria-label="Phân trang kết quả"><button type="button" className="button-secondary" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Trước</button><span>Trang <strong>{page}</strong> / {pageCount}</span><button type="button" className="button-secondary" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Tiếp</button></nav>}

              {!!data.budgetUnknownItems?.length && <section className="reference-section"><div className="reference-heading"><div><p className="eyebrow">CẦN XÁC MINH THÊM</p><h3>Sản phẩm phù hợp, chưa có giá xác minh</h3></div><span>{data.budgetUnknownTotal} sản phẩm</span></div><p>Thông tin model hoặc nhu cầu có thể phù hợp, nhưng catalog chưa có giá bán xác minh để đối chiếu ngân sách.</p><div className="product-grid">{data.budgetUnknownItems.map((product) => <ProductCard key={product._id} p={product} compared={comparison.some((item) => item._id === product._id)} onToggleCompare={toggleComparison} onViewDetails={setSelectedProduct} />)}</div></section>}

              {!!data.catalogDiscovery?.length && <section className="reference-section"><div className="reference-heading"><div><p className="eyebrow">NGUỒN THAM KHẢO</p><h3>Thêm model để khám phá</h3></div><span>Chưa xác minh trong catalog</span></div><p>Thông số dưới đây được ghi trong TechAPI và chưa được TechFind đối chiếu độc lập. Đây chưa phải sản phẩm đã xác minh; giá hiện hành chưa có. Ảnh tham khảo có ghi license và attribution của nguồn nhưng chưa được đối chiếu trực quan với đúng model.</p><ul className="source-list">{data.catalogDiscovery.map((candidate) => <li key={candidate.sourceUrl}><a href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer">{candidate.name}<Icon name="external" size={14} /></a><small>{[candidate.brand, candidate.category, candidate.releaseDate].filter(Boolean).join(' · ')} · <a href={candidate.dataSourceUrl} target="_blank" rel="noopener noreferrer">{candidate.dataAttribution}</a> · <a href={candidate.dataLicenseUrl} target="_blank" rel="noopener noreferrer">{candidate.dataLicense}</a></small>{candidate.imageReference && <figure className="discovery-image"><img src={candidate.imageReference.imageUrl} alt={candidate.name + " image reference; model not verified"} loading="lazy" referrerPolicy="no-referrer" /><figcaption>Ảnh tham khảo · {candidate.imageReference.license} · {candidate.imageReference.attribution} · <a href={candidate.imageReference.filePageUrl} target="_blank" rel="noopener noreferrer">Wikimedia file page</a></figcaption></figure>}{!!candidate.specificationHighlights?.length && <p className="source-details">{candidate.specificationHighlights.join(' · ')}</p>}{!!candidate.sourceUrls?.length && <small>Nguồn: {candidate.sourceUrls.map((url, index) => <span key={url}><a href={url} target="_blank" rel="noopener noreferrer">{index ? `, ${index + 1}` : index + 1}</a></span>)}</small>}</li>)}</ul></section>}

              {!!data.webSearch?.length && <section className="reference-section"><div className="reference-heading"><div><p className="eyebrow">NGUỒN WEB</p><h3>Liên kết tham khảo</h3></div><span>Chưa xác minh thành sản phẩm</span></div><p>TechFind chưa xác minh model, thông số hoặc quyền sử dụng hình ảnh tại các liên kết này.</p><ul className="source-list">{data.webSearch.map((candidate) => <li key={candidate.url}><a href={candidate.url} target="_blank" rel="noopener noreferrer">{candidate.title}<Icon name="external" size={14} /></a><small>{candidate.source}{candidate.snippet ? ` · ${candidate.snippet}` : ''}</small></li>)}</ul></section>}
            </div>
          </div>
        </section>
      )}

      {!data && !loading && (
        <>
          <section className="discovery-section" id="categories" aria-labelledby="categories-heading">
            <div className="section-heading"><div><p className="eyebrow">KHÁM PHÁ THEO DANH MỤC</p><h2 id="categories-heading">Bắt đầu từ thiết bị bạn cần</h2></div><span className="section-support">Danh mục từ catalog sản phẩm</span></div>
            {categories.length
              ? <div className="category-grid">{categories.map((category) => <button className="category-tile" key={category} type="button" onClick={() => void run(category)}><span className="category-icon"><Icon name={CATEGORY_ICONS[category.toLocaleLowerCase('vi-VN')] ?? 'database'} size={22} /></span><span>{categoryLabel(category)}</span><Icon name="arrow" size={17} className="category-arrow" /></button>)}</div>
              : <p className="discovery-empty">{homeLoading ? 'Đang tải danh mục…' : 'Danh mục hiện chưa tải được từ catalog.'}</p>}
          </section>

          <section className="discovery-section products-discovery" id="products" aria-labelledby="products-heading">
            <div className="section-heading"><div><p className="eyebrow">TỪ CATALOG ĐÃ XÁC MINH</p><h2 id="products-heading">Khám phá sản phẩm</h2></div><span className="section-support">Thông tin lấy trực tiếp từ sản phẩm và offer</span></div>
            {homeLoading
              ? <div className="skeleton-grid">{Array.from({ length: 4 }, (_, index) => <div className="product-skeleton" key={index}><span /><div><i /><i /><i /></div></div>)}</div>
              : homeProducts.length
                ? <div className="product-grid">{homeProducts.slice(0, 4).map((product) => <ProductCard key={product._id} p={product} compared={comparison.some((item) => item._id === product._id)} onToggleCompare={toggleComparison} onViewDetails={setSelectedProduct} />)}</div>
                : <p className="discovery-empty">Chưa có sản phẩm để hiển thị từ catalog.</p>}
          </section>
        </>
      )}

      {comparison.length > 0 && !data && <div className="compare-bar home-compare-bar"><span><strong>{comparison.length}/4</strong> sản phẩm được chọn</span>{compareNotice && <span className="compare-notice" role="status">{compareNotice}</span>}<button type="button" onClick={jumpToComparison}>Xem so sánh <Icon name="arrow" size={16} /></button></div>}
      {!data && <ProductComparison products={comparison} onRemove={(id) => setComparison((current) => current.filter((item) => item._id !== id))} onClear={() => { setComparison([]); setCompareNotice(''); }} />}

      <section className="assistant-section" id="assistant" aria-labelledby="assistant-title">
        <div className="assistant-copy"><span className="assistant-symbol"><Icon name="sparkles" size={20} /></span><p className="eyebrow">NHÂN VIÊN TƯ VẤN AI</p><h2 id="assistant-title">Cùng tìm thiết bị hợp với cách bạn sử dụng.</h2><p>Trao đổi tự nhiên về nhu cầu, vấn đề, ngân sách và tiêu chí ưu tiên. Trợ lý sẽ hỏi thêm khi cần, đối chiếu sản phẩm thật trong catalog rồi giải thích lựa chọn.</p><div className="assistant-points"><span><Icon name="check" size={15} /> Có ngữ cảnh trong phiên</span><span><Icon name="check" size={15} /> So sánh tối đa 4 mẫu</span></div></div>
        <div className="assistant-launch-card"><span className="assistant-launch-icon"><Icon name="shield" size={19} /></span><div><strong>Thông tin có căn cứ</strong><p>Giá, thông số và thẻ sản phẩm lấy từ catalog đã xác minh. Trợ lý sẽ báo rõ khi dữ liệu còn thiếu.</p></div><button type="button" className="button-primary" onClick={() => window.dispatchEvent(new Event('techfind:open-advisor'))}>Bắt đầu tư vấn <Icon name="arrow" size={16} /></button></div>
      </section>

      <ProductAdvisorWidget comparedIds={comparison.map((product) => product._id)} onToggleCompare={toggleComparison} onViewProduct={setSelectedProduct} />
      {selectedProduct && <ProductDetailDialog initialProduct={selectedProduct} onClose={() => setSelectedProduct(null)} onSelectProduct={setSelectedProduct} />}
    </main>
  );
}

export default function App() {
  const { preference, cyclePreference } = useThemePreference();
  const isAdmin = window.location.pathname.startsWith('/admin');

  return (
    <div className="app-shell">
      <SiteHeader preference={preference} onThemeChange={cyclePreference} isAdmin={isAdmin} />
      {isAdmin ? <AdminConsole /> : <SearchApp />}
      <SiteFooter />
    </div>
  );
}
