import { ChangeEvent, useCallback, useState } from 'react';

type Source = {
  sourceKey: string;
  name: string;
  adapter: string;
  domain?: string | null;
  status: string;
  note?: string | null;
  dataUsageAuthorized: boolean;
  imageUsageAuthorized: boolean;
  products?: number;
  offers?: number;
  pendingReview?: number;
  lastRunStats?: Record<string, number> | null;
  latestRun?: { status: string; startedAt: string; stats?: Record<string, number> } | null;
};

type ReviewItem = { _id: string; source: string; sourceKey: string; reasons: string[]; name: string | null; brand: string | null; category: string | null; model?: string | null; modelNumber?: string | null; family?: string | null; generation?: string | null; productUrl?: string | null; specificationSourceUrl?: string | null; specifications?: Record<string, unknown> | null; sourceEvidence?: Array<{ evidenceType?: string; sourceName?: string; sourceUrl?: string; notes?: string }>; imageCandidate?: { imageUrl?: string; filePageUrl?: string; license?: string; author?: string; visualIdentityChecked?: boolean } | null; imageReady?: boolean };
type Category = { key: string; label: string };
type CatalogTaxonomy = { brands: string[]; families: string[]; generations: string[] };
type CoverageModel = { model: string; status: 'verified' | 'pending'; productVerificationStatus: string; imageVerificationStatus: string; urlVerificationStatus: string; publicationStatus: string; evidenceComplete: boolean; imageRights: boolean; hasSpecifications: boolean; hasProductAndSpecsUrls: boolean; variants: number };
type CoverageGeneration = { generation: string; models: CoverageModel[] };
type CoverageFamily = { family: string; totalModels: number; verifiedModels: number; pendingModels: number; generations: CoverageGeneration[] };
type CoverageBrand = { brand: string; totalModels: number; verifiedModels: number; pendingModels: number; families: CoverageFamily[] };
type CoverageCategory = { category: string; label: string; totalModels: number; verifiedModels: number; pendingModels: number; publishedModels: number; publicationPendingModels: number; hiddenModels: number; imageVerifiedModels: number; urlVerifiedModels: number; missingImages: number; missingSpecifications: number; missingUrls: number; brands: CoverageBrand[] };
type CoverageSnapshot = { generatedAt: string; source: 'MongoDB'; totals: Record<string, number>; categories: CoverageCategory[] };
type CatalogOffer = { _id: string; sellerName: string; source: string; price: number | null; originalPrice: number | null; currency: string | null; productUrl: string | null; affiliateUrl: string | null; availability: string | null; verified: boolean; priceVerificationStatus?: 'verified' | 'pending' | 'rejected'; verificationNote?: string | null; lastUpdated: string };
type CatalogProduct = { _id: string; name: string; brand: string; model: string; modelNumber?: string | null; family?: string | null; generation?: string | null; releaseYear?: number | null; productStatus?: string; productVerificationStatus: 'verified' | 'pending' | 'rejected'; imageVerificationStatus: 'verified' | 'pending' | 'rejected'; urlVerificationStatus: 'verified' | 'pending' | 'rejected'; publicationStatus: 'published' | 'pending' | 'hidden'; imageVisualIdentityChecked?: boolean; category: string; imageUrl: string; imageUsagePermission: string; productUrl: string; imageSource: string; imageSourceUrl?: string | null; imageAuthor?: string | null; imageRetrievedAt?: string | null; imageLicense: string; imageLicenseUrl: string; imageAttribution: string; specificationSourceUrl: string; specifications: Record<string, unknown>; specs: Record<string, string | number>; variants?: Array<Record<string, unknown>>; sourceEvidence?: Array<Record<string, unknown>>; offers?: CatalogOffer[]; price: number | null; verified: boolean };

export default function AdminConsole() {
  const [token, setToken] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [catalogTaxonomy, setCatalogTaxonomy] = useState<CatalogTaxonomy>({ brands: [], families: [], generations: [] });
  const [coverage, setCoverage] = useState<CoverageSnapshot | null>(null);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [selectedOfferProductId, setSelectedOfferProductId] = useState<string | null>(null);
  const [offerForm, setOfferForm] = useState({ _id: '', sellerName: '', source: 'manual', price: '', originalPrice: '', currency: 'VND', productUrl: '', affiliateUrl: '', availability: '', verificationNote: '', verified: false });
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('');
  const [catalogBrand, setCatalogBrand] = useState('');
  const [catalogFamily, setCatalogFamily] = useState('');
  const [catalogGeneration, setCatalogGeneration] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [catalogForm, setCatalogForm] = useState({ name: '', brand: '', model: '', modelNumber: '', family: '', generation: '', releaseYear: '', productStatus: 'unknown', productVerificationStatus: 'pending', imageVerificationStatus: 'pending', urlVerificationStatus: 'pending', imageVisualIdentityChecked: false, category: 'laptop', imageUrl: '', imageSource: '', imageSourceUrl: '', imageAuthor: '', imageRetrievedAt: '', imageLicense: '', imageLicenseUrl: '', imageAttribution: '', imageUsagePermission: 'not_authorized', productUrl: '', specificationSourceUrl: '', specifications: '{}', specs: '{}', variants: '[]', sourceEvidence: '[]', price: '' });
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({
    sourceKey: 'accesstrade-fptshop', name: 'ACCESSTRADE · FPT Shop', adapter: 'accesstrade', domain: 'fptshop.com.vn',
    sellerName: 'FPT Shop', termsUrl: '', dataUsageAuthorized: false, dataPermissionEvidence: '',
    imageUsageAuthorized: false, imagePermissionEvidence: '', legalReviewed: false,
  });

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(`/api/admin/collector${path}`, { ...init, headers });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try { message = (await response.json()).message ?? message; } catch { /* keep status */ }
      throw new Error(message);
    }
    return response;
  }, [token]);

  const catalogRequest = useCallback(async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(`/api/admin/catalog${path}`, { ...init, headers });
    if (!response.ok) throw new Error((await response.json()).message ?? `HTTP ${response.status}`);
    return response;
  }, [token]);

  const refresh = useCallback(async () => {
    if (!token) { setNotice('Nhập ADMIN_API_TOKEN để mở bảng quản trị.'); return; }
    setBusy(true); setNotice('');
    try {
      const catalogParams = new URLSearchParams();
      if (catalogQuery) catalogParams.set('q', catalogQuery);
      if (catalogCategory) catalogParams.set('category', catalogCategory);
      if (catalogBrand) catalogParams.set('brand', catalogBrand);
      if (catalogFamily) catalogParams.set('family', catalogFamily);
      if (catalogGeneration) catalogParams.set('generation', catalogGeneration);
      const catalogSuffix = catalogParams.size ? `?${catalogParams.toString()}` : '';
      const [sourceResponse, reviewResponse, categoryResponse, catalogResponse, taxonomyResponse, coverageResponse] = await Promise.all([
        request('/sources'), request('/review'), request('/categories'), catalogRequest(`/products${catalogSuffix}`), catalogRequest('/taxonomy'), catalogRequest('/coverage'),
      ]);
      setSources(await sourceResponse.json());
      setReviews(await reviewResponse.json());
      setCategories(await categoryResponse.json());
      setCatalog(await catalogResponse.json());
      setCatalogTaxonomy(await taxonomyResponse.json());
      setCoverage(await coverageResponse.json());
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  }, [catalogBrand, catalogCategory, catalogFamily, catalogGeneration, catalogQuery, catalogRequest, request, token]);

  const resetCatalogForm = () => {
    setEditingId(null);
    setCatalogForm({ name: '', brand: '', model: '', modelNumber: '', family: '', generation: '', releaseYear: '', productStatus: 'unknown', productVerificationStatus: 'pending', imageVerificationStatus: 'pending', urlVerificationStatus: 'pending', imageVisualIdentityChecked: false, category: 'laptop', imageUrl: '', imageSource: '', imageSourceUrl: '', imageAuthor: '', imageRetrievedAt: '', imageLicense: '', imageLicenseUrl: '', imageAttribution: '', imageUsagePermission: 'not_authorized', productUrl: '', specificationSourceUrl: '', specifications: '{}', specs: '{}', variants: '[]', sourceEvidence: '[]', price: '' });
  };

  const editCatalogProduct = (product: CatalogProduct) => {
    setEditingId(product._id);
    setCatalogForm({
      name: product.name, brand: product.brand, model: product.model, modelNumber: product.modelNumber ?? '',
      family: product.family ?? '', generation: product.generation ?? '', releaseYear: product.releaseYear == null ? '' : String(product.releaseYear),
      productStatus: product.productStatus ?? 'unknown', category: product.category,
      productVerificationStatus: product.productVerificationStatus, imageVerificationStatus: product.imageVerificationStatus,
      urlVerificationStatus: product.urlVerificationStatus, imageVisualIdentityChecked: product.imageVisualIdentityChecked ?? false,
      imageUrl: product.imageUrl, imageSource: product.imageSource, imageSourceUrl: product.imageSourceUrl ?? '',
      imageAuthor: product.imageAuthor ?? '', imageRetrievedAt: product.imageRetrievedAt ? product.imageRetrievedAt.slice(0, 10) : '', imageLicense: product.imageLicense,
      imageLicenseUrl: product.imageLicenseUrl, imageAttribution: product.imageAttribution,
      imageUsagePermission: product.imageUsagePermission,
      productUrl: product.productUrl, specificationSourceUrl: product.specificationSourceUrl,
      specifications: JSON.stringify(product.specifications ?? {}, null, 2), specs: JSON.stringify(product.specs ?? {}, null, 2),
      variants: JSON.stringify(product.variants ?? [], null, 2), sourceEvidence: JSON.stringify(product.sourceEvidence ?? [], null, 2),
      price: product.price == null ? '' : String(product.price),
    });
  };

  const saveCatalogProduct = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      const body = { ...catalogForm, releaseYear: catalogForm.releaseYear ? Number(catalogForm.releaseYear) : null, price: catalogForm.price ? Number(catalogForm.price) : null, specifications: JSON.parse(catalogForm.specifications), specs: JSON.parse(catalogForm.specs), variants: JSON.parse(catalogForm.variants), sourceEvidence: JSON.parse(catalogForm.sourceEvidence) };
      await catalogRequest(editingId ? `/products/${editingId}` : '/products', { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(body) });
      await refresh();
      setNotice(editingId ? 'Catalog item updated.' : 'Catalog item added.');
      resetCatalogForm();
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  };

  const deleteCatalogProduct = async (product: CatalogProduct) => {
    if (!window.confirm(`Delete ${product.brand} ${product.model}?`)) return;
    setBusy(true); setNotice('');
    try { await catalogRequest(`/products/${product._id}`, { method: 'DELETE' }); await refresh(); setNotice('Catalog item deleted.'); }
    catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  };

  const refreshOffers = async (productId: string) => {
    const response = await catalogRequest(`/products/${productId}/offers`);
    const offers = await response.json() as CatalogOffer[];
    setCatalog((current) => current.map((product) => product._id === productId ? { ...product, offers } : product));
  };

  const manageOffers = async (product: CatalogProduct) => {
    setSelectedOfferProductId(product._id);
    setOfferForm({ _id: '', sellerName: '', source: 'manual', price: '', originalPrice: '', currency: 'VND', productUrl: '', affiliateUrl: '', availability: '', verificationNote: '', verified: false });
    try { await refreshOffers(product._id); }
    catch (error) { setNotice((error as Error).message); }
  };

  const editOffer = (offer: CatalogOffer) => setOfferForm({
    _id: offer._id, sellerName: offer.sellerName, source: offer.source,
    price: offer.price == null ? '' : String(offer.price), originalPrice: offer.originalPrice == null ? '' : String(offer.originalPrice),
    currency: offer.currency ?? '', productUrl: offer.productUrl ?? '', affiliateUrl: offer.affiliateUrl ?? '',
    availability: offer.availability ?? '', verificationNote: offer.verificationNote ?? '', verified: offer.verified,
  });

  const saveOffer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedOfferProductId) return;
    setBusy(true); setNotice('');
    try {
      const { _id: offerId, ...offerValues } = offerForm;
      const body = { ...offerValues, price: offerForm.price ? Number(offerForm.price) : null, originalPrice: offerForm.originalPrice ? Number(offerForm.originalPrice) : null };
      await catalogRequest(`/products/${selectedOfferProductId}/offers${offerId ? `/${offerId}` : ''}`, { method: offerId ? 'PUT' : 'POST', body: JSON.stringify(body) });
      await refreshOffers(selectedOfferProductId);
      setOfferForm({ _id: '', sellerName: '', source: 'manual', price: '', originalPrice: '', currency: 'VND', productUrl: '', affiliateUrl: '', availability: '', verificationNote: '', verified: false });
      setNotice('Offer saved. Only offers with a verified seller URL, price, and currency can affect public price filters.');
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  };

  const saveSource = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      await request('/sources', { method: 'POST', body: JSON.stringify(form) });
      setNotice('Đã lưu nguồn và bằng chứng quyền sử dụng.');
      await refresh();
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  };

  const run = async (source: Source, mode: 'dry-run' | 'import' | 'update' | 'price-dry-run' | 'price-sync') => {
    setBusy(true); setNotice('');
    try {
      const file = files[source.sourceKey];
      const path = `/sources/${encodeURIComponent(source.sourceKey)}/run?mode=${mode}`;
      const response = source.adapter === 'csv'
        ? await request(path, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: file ? await file.text() : '' })
        : await request(path, { method: 'POST', body: JSON.stringify({ mode, page: 1 }) });
      const result = await response.json();
      const s = result.stats ?? {};
      setNotice(mode.startsWith('price-')
        ? `${mode}: lấy ${s.fetched ?? 0}, có giá ${s.priced ?? 0}, khớp chính xác ${s.exactMatches ?? 0}, Offer đã ghi ${s.offersCreatedOrUpdated ?? 0}, không khớp ${s.unmatchedProducts ?? 0}, model mơ hồ ${s.ambiguousProducts ?? 0}, giá cũ ${s.stalePrices ?? 0}, thiếu/không hợp lệ ${s.invalidPrices ?? 0}.`
        : `${mode}: lấy ${s.fetched ?? 0}, hợp lệ ${s.validElectronic ?? 0}, chờ duyệt ${s.pendingReview ?? 0}, loại ${s.rejected ?? 0}, có ảnh được phép ${s.withPermittedImage ?? 0}.`);
      await refresh();
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  };

  const chooseFile = (sourceKey: string, event: ChangeEvent<HTMLInputElement>) => {
    setFiles((current) => ({ ...current, [sourceKey]: event.target.files?.[0] ?? null }));
  };

  const review = async (item: ReviewItem, decision: 'approve' | 'reject', category?: string) => {
    setBusy(true); setNotice('');
    try {
      await request(`/review/${encodeURIComponent(item._id)}`, { method: 'POST', body: JSON.stringify({ decision, category }) });
      setNotice(`Đã ${decision === 'approve' ? 'duyệt' : 'từ chối'} mục ${item.name ?? item._id}.`);
      await refresh();
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  };

  const exportCsv = async () => {
    setBusy(true); setNotice('');
    try {
      const response = await request('/export.csv');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'electronics-products.csv'; link.click(); URL.revokeObjectURL(url);
      setNotice('Đã xuất catalog sản phẩm đã xác minh.');
    } catch (error) { setNotice((error as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div><p className="eyebrow">TECHFIND · ADMIN</p><h1>Product Data Collector</h1><p>Import licensed product feeds or CSV files with recorded data permission.</p></div>
        <a href="/">Về tìm kiếm</a>
      </header>
      <section className="admin-auth">
        <label>Admin token
          <input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="ADMIN_API_TOKEN" />
        </label>
        <button type="button" disabled={busy || !token} onClick={() => void refresh()}>{busy ? 'Đang tải…' : 'Kết nối / làm mới'}</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void exportCsv()}>Xuất CSV</button>
      </section>
      {notice && <p className="admin-notice" role="status">{notice}</p>}

      {coverage && <section className="admin-section">
        <div className="admin-section-heading"><div><h2>Product coverage · MongoDB live</h2><p>Nguồn số liệu: {coverage.source} · cập nhật {new Date(coverage.generatedAt).toLocaleString('vi-VN')}.</p></div></div>
        <div className="coverage-metrics">
          <div><strong>{coverage.totals.uniqueModels}</strong><span>model đã nhận diện</span></div>
          <div><strong>{coverage.totals.verifiedModels}</strong><span>đủ điều kiện cấu trúc</span></div>
          <div><strong>{coverage.totals.publishedModels}</strong><span>đã xuất bản</span></div>
          <div><strong>{coverage.totals.imageVerificationVerified}</strong><span>ảnh xác minh</span></div>
          <div><strong>{coverage.totals.urlVerificationVerified}</strong><span>URL xác minh</span></div>
          <div><strong>{coverage.totals.pendingModels}</strong><span>model chờ bổ sung</span></div>
          <div><strong>{coverage.totals.evidenceCompleteModels}</strong><span>đủ evidence theo V3</span></div>
          <div><strong>{coverage.totals.brandCount}</strong><span>brand</span></div>
          <div><strong>{coverage.totals.familyCount}</strong><span>family</span></div>
          <div><strong>{coverage.totals.generationCount}</strong><span>generation</span></div>
          <div><strong>{coverage.totals.variants}</strong><span>variant</span></div>
          <div><strong>{coverage.totals.modelsMissingImages}</strong><span>thiếu quyền ảnh</span></div>
          <div><strong>{coverage.totals.modelsMissingSpecifications}</strong><span>thiếu thông số</span></div>
          <div><strong>{coverage.totals.modelsMissingUrls}</strong><span>thiếu URL</span></div>
          <div><strong>{coverage.totals.unidentifiedRecords}</strong><span>record thiếu model</span></div>
          <div><strong>{coverage.totals.offers}</strong><span>Offer · {coverage.totals.verifiedPricedOffers} giá xác minh</span></div>
        </div>
        <div className="coverage-tree">{coverage.categories.map((category) => <details key={category.category}>
          <summary>{category.label} · {category.totalModels} model · {category.verifiedModels} verified · published {category.publishedModels} · publication pending {category.publicationPendingModels} · hidden {category.hiddenModels} · thiếu ảnh {category.missingImages} · thiếu specs {category.missingSpecifications} · thiếu URL {category.missingUrls}</summary>
          {category.brands.length === 0 ? <p>Chưa phát hiện model trong MongoDB.</p> : category.brands.map((brand) => <details key={brand.brand}>
            <summary>{brand.brand} · {brand.totalModels} model</summary>
            {brand.families.map((family) => <details key={family.family}>
              <summary>{family.family} · {family.totalModels} model</summary>
              {family.generations.map((generation) => <details key={generation.generation}>
                <summary>{generation.generation} · {generation.models.length} model</summary>
                <ul>{generation.models.map((model) => <li key={model.model}>
                  <span className={`status-pill ${model.status === 'verified' ? 'authorized' : ''}`}>{model.status}</span> {model.model}
                  <small> · product {model.productVerificationStatus} · image {model.imageVerificationStatus} · URL {model.urlVerificationStatus} · publication {model.publicationStatus} · V3 evidence {model.evidenceComplete ? 'đủ' : 'thiếu'} · image rights {model.imageRights ? 'đủ' : 'thiếu'} · specs {model.hasSpecifications ? 'có' : 'thiếu'} · URL {model.hasProductAndSpecsUrls ? 'có' : 'thiếu'} · variants {model.variants}</small>
                </li>)}</ul>
              </details>)}
            </details>)}
          </details>) }
        </details>)}</div>
      </section>}

      <section className="admin-section">
        <div className="admin-section-heading"><div><h2>Nguồn dữ liệu</h2><p>Dry-run chỉ đọc và thống kê. Import/Update yêu cầu bằng chứng quyền dữ liệu.</p></div></div>
        <div className="admin-sources">
          {sources.map((source) => (
            <article className="admin-source" key={source.sourceKey}>
              <div className="admin-source-title"><div><h3>{source.name}</h3><code>{source.domain ?? source.sourceKey}</code></div><span className={`status-pill ${source.dataUsageAuthorized ? 'authorized' : ''}`}>{source.status}</span></div>
              {source.note && <p>{source.note}</p>}
              <div className="admin-stats"><span>Products: {source.products ?? 0}</span><span>Offers: {source.offers ?? 0}</span><span>Chờ duyệt: {source.pendingReview ?? 0}</span></div>
              {source.latestRun && <small>Lần gần nhất: {new Date(source.latestRun.startedAt).toLocaleString('vi-VN')} · {source.latestRun.status}</small>}
              {source.adapter === 'csv' && <label className="file-picker">Chọn CSV (tối đa 20 hàng)<input type="file" accept=".csv,text/csv" onChange={(event) => chooseFile(source.sourceKey, event)} /></label>}
              <div className="admin-actions">
                <button disabled={busy || !['accesstrade', 'csv'].includes(source.adapter) || (source.adapter === 'csv' && !files[source.sourceKey])} onClick={() => void run(source, 'dry-run')}>Dry-run</button>
                <button disabled={busy || !source.dataUsageAuthorized || !['accesstrade', 'csv'].includes(source.adapter) || (source.adapter === 'csv' && !files[source.sourceKey])} onClick={() => void run(source, 'import')}>Import</button>
                <button className="secondary-button" disabled={busy || !source.dataUsageAuthorized || source.adapter !== 'accesstrade'} onClick={() => void run(source, 'update')}>Update existing</button>
                {source.adapter === 'accesstrade' && <button className="secondary-button" disabled={busy} onClick={() => void run(source, 'price-dry-run')}>Preview prices</button>}
                {source.adapter === 'accesstrade' && <button disabled={busy || !source.dataUsageAuthorized} title={!source.dataUsageAuthorized ? 'Cần quyền lưu dữ liệu feed đã được xác nhận.' : undefined} onClick={() => void run(source, 'price-sync')}>Sync prices</button>}
              </div>
              {source.lastRunStats && <small>Gần nhất: {source.lastRunStats.fetched ?? 0} lấy · {source.lastRunStats.validElectronic ?? 0} hợp lệ · {source.lastRunStats.withPermittedImage ?? 0} ảnh được phép</small>}
            </article>
          ))}
        </div>
      </section>

      <section className="admin-section">
        <h2>Đăng ký feed/CSV được cấp phép</h2>
        <p>Đây là xác nhận của Admin, không tự thay thế hợp đồng hoặc cấp quyền của nhà cung cấp.</p>
        <form className="source-form" onSubmit={saveSource}>
          <label>Source key<input required value={form.sourceKey} onChange={(e) => setForm({ ...form, sourceKey: e.target.value })} /></label>
          <label>Tên nguồn<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>Adapter<select value={form.adapter} onChange={(e) => setForm({ ...form, adapter: e.target.value })}><option value="accesstrade">ACCESSTRADE Datafeeds</option><option value="csv">CSV được cấp phép</option></select></label>
          <label>Domain / source domain<input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} /></label>
          <label>Nhà bán hàng<input value={form.sellerName} onChange={(e) => setForm({ ...form, sellerName: e.target.value })} /></label>
          <label>Terms URL<input type="url" value={form.termsUrl} onChange={(e) => setForm({ ...form, termsUrl: e.target.value })} /></label>
          {form.adapter === 'accesstrade' && <label className="check-field"><input type="checkbox" checked={form.legalReviewed} onChange={(e) => setForm({ ...form, legalReviewed: e.target.checked })} />I reviewed source terms and confirmed the data/feed permission</label>}
          <label className="check-field"><input type="checkbox" checked={form.dataUsageAuthorized} onChange={(e) => setForm({ ...form, dataUsageAuthorized: e.target.checked })} />Đã được phép lưu và sử dụng product data</label>
          <label>Bằng chứng quyền dữ liệu<input value={form.dataPermissionEvidence} onChange={(e) => setForm({ ...form, dataPermissionEvidence: e.target.value })} placeholder="Mã hợp đồng, ticket hoặc URL văn bản cấp phép" /></label>
          <label className="check-field"><input type="checkbox" checked={form.imageUsageAuthorized} onChange={(e) => setForm({ ...form, imageUsageAuthorized: e.target.checked })} />Đã được phép dùng ảnh sản phẩm</label>
          <label>Bằng chứng quyền ảnh<input value={form.imagePermissionEvidence} onChange={(e) => setForm({ ...form, imagePermissionEvidence: e.target.value })} /></label>
          <button disabled={busy}>Lưu cấu hình nguồn</button>
        </form>
      </section>

      <section className="admin-section">
        <h2>Hàng chờ kiểm duyệt ({reviews.length})</h2>
        {reviews.length === 0 ? <p>Không có sản phẩm chờ duyệt.</p> : reviews.map((item) => (
          <ReviewRow key={item._id} item={item} categories={categories} disabled={busy} onReview={review} />
        ))}
      </section>
      <section className="admin-section">
        <div className="admin-section-heading"><div><h2>Verified product catalog</h2><p>Products need a verified model, product page, spec source, and image license before appearing in search.</p></div></div>
        <div className="catalog-search">
          <input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Search name, brand, model, or SKU" />
          <select value={catalogCategory} onChange={(event) => setCatalogCategory(event.target.value)}><option value="">All categories</option>{categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
          <select value={catalogBrand} onChange={(event) => setCatalogBrand(event.target.value)}><option value="">All brands</option>{catalogTaxonomy.brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}</select>
          <select value={catalogFamily} onChange={(event) => setCatalogFamily(event.target.value)}><option value="">All families</option>{catalogTaxonomy.families.map((family) => <option key={family} value={family}>{family}</option>)}</select>
          <select value={catalogGeneration} onChange={(event) => setCatalogGeneration(event.target.value)}><option value="">All generations</option>{catalogTaxonomy.generations.map((generation) => <option key={generation} value={generation}>{generation}</option>)}</select>
          <button type="button" disabled={busy} onClick={() => void refresh()}>Search catalog</button>
        </div>
        <form className="source-form" onSubmit={saveCatalogProduct}>
          <label>Name<input required value={catalogForm.name} onChange={(e) => setCatalogForm({ ...catalogForm, name: e.target.value })} /></label>
          <label>Brand<input required value={catalogForm.brand} onChange={(e) => setCatalogForm({ ...catalogForm, brand: e.target.value })} /></label>
          <label>Model<input required value={catalogForm.model} onChange={(e) => setCatalogForm({ ...catalogForm, model: e.target.value })} /></label>
          <label>Model number / SKU<input value={catalogForm.modelNumber} onChange={(e) => setCatalogForm({ ...catalogForm, modelNumber: e.target.value })} /></label>
          <label>Product family<input value={catalogForm.family} onChange={(e) => setCatalogForm({ ...catalogForm, family: e.target.value })} placeholder="e.g. Galaxy S" /></label>
          <label>Generation<input value={catalogForm.generation} onChange={(e) => setCatalogForm({ ...catalogForm, generation: e.target.value })} placeholder="e.g. Galaxy S25 generation" /></label>
          <label>Release year<input type="number" min="1800" max="2100" value={catalogForm.releaseYear} onChange={(e) => setCatalogForm({ ...catalogForm, releaseYear: e.target.value })} /></label>
          <label>Product lifecycle<select value={catalogForm.productStatus} onChange={(e) => setCatalogForm({ ...catalogForm, productStatus: e.target.value })}><option value="unknown">Unknown</option><option value="active">Active</option><option value="discontinued">Discontinued</option><option value="end_of_life">End of life</option></select></label>
          <label>Category<select value={catalogForm.category} onChange={(e) => setCatalogForm({ ...catalogForm, category: e.target.value })}>{categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
          <label>Image URL<input required type="url" value={catalogForm.imageUrl} onChange={(e) => setCatalogForm({ ...catalogForm, imageUrl: e.target.value })} /></label>
          <label>Image source page<input required type="url" value={catalogForm.imageSource} onChange={(e) => setCatalogForm({ ...catalogForm, imageSource: e.target.value })} /></label>
          <label>Image author<input value={catalogForm.imageAuthor} onChange={(e) => setCatalogForm({ ...catalogForm, imageAuthor: e.target.value })} /></label>
          <label>Image retrieved date<input type="date" value={catalogForm.imageRetrievedAt} onChange={(e) => setCatalogForm({ ...catalogForm, imageRetrievedAt: e.target.value })} /></label>
          <label>Image license<input value={catalogForm.imageLicense} onChange={(e) => setCatalogForm({ ...catalogForm, imageLicense: e.target.value })} placeholder="CC BY 4.0" /></label>
          <label>License URL<input type="url" value={catalogForm.imageLicenseUrl} onChange={(e) => setCatalogForm({ ...catalogForm, imageLicenseUrl: e.target.value })} /></label>
          <label>Image attribution<input value={catalogForm.imageAttribution} onChange={(e) => setCatalogForm({ ...catalogForm, imageAttribution: e.target.value })} /></label>
          <label>Product URL<input required type="url" value={catalogForm.productUrl} onChange={(e) => setCatalogForm({ ...catalogForm, productUrl: e.target.value })} /></label>
          <label>Specification source URL<input required type="url" value={catalogForm.specificationSourceUrl} onChange={(e) => setCatalogForm({ ...catalogForm, specificationSourceUrl: e.target.value })} /></label>
          <label>Price (optional)<input type="number" min="1" value={catalogForm.price} onChange={(e) => setCatalogForm({ ...catalogForm, price: e.target.value })} /></label>
          <label>Specifications JSON<textarea required rows={5} value={catalogForm.specifications} onChange={(e) => setCatalogForm({ ...catalogForm, specifications: e.target.value })} /></label>
          <label>Search specs JSON<textarea rows={5} value={catalogForm.specs} onChange={(e) => setCatalogForm({ ...catalogForm, specs: e.target.value })} /></label>
          <label>Variants JSON<textarea rows={4} value={catalogForm.variants} onChange={(e) => setCatalogForm({ ...catalogForm, variants: e.target.value })} placeholder='[{"sku":"...","attributes":{"storage":"256GB"}}]' /></label>
          <label>Source evidence JSON<textarea rows={7} value={catalogForm.sourceEvidence} onChange={(e) => setCatalogForm({ ...catalogForm, sourceEvidence: e.target.value })} placeholder='[{"evidenceType":"identity","sourceName":"Manufacturer","sourceUrl":"https://...","retrievedAt":"2026-11-10T00:00:00Z","verifiedAt":"2026-11-10T00:00:00Z"}]' /></label>
          <label className="check-field"><input type="checkbox" checked={catalogForm.imageUsagePermission === 'granted'} onChange={(e) => setCatalogForm({ ...catalogForm, imageUsagePermission: e.target.checked ? 'granted' : 'not_authorized' })} />I have rights to display this image under the listed license</label>
          <label>Product verification<select value={catalogForm.productVerificationStatus} onChange={(e) => setCatalogForm({ ...catalogForm, productVerificationStatus: e.target.value })}><option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option></select></label>
          <label>Image verification<select value={catalogForm.imageVerificationStatus} onChange={(e) => setCatalogForm({ ...catalogForm, imageVerificationStatus: e.target.value })}><option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option></select></label>
          <label>URL verification<select value={catalogForm.urlVerificationStatus} onChange={(e) => setCatalogForm({ ...catalogForm, urlVerificationStatus: e.target.value })}><option value="pending">Pending</option><option value="verified">Verified (live check on save)</option><option value="rejected">Rejected</option></select></label>
          <label className="check-field"><input type="checkbox" checked={catalogForm.imageVisualIdentityChecked} onChange={(e) => setCatalogForm({ ...catalogForm, imageVisualIdentityChecked: e.target.checked })} />I visually confirmed this image matches the exact model</label>
          <div><button disabled={busy}>{editingId ? 'Save product' : 'Add product'}</button>{editingId && <button type="button" className="secondary-button" onClick={resetCatalogForm}>Cancel edit</button>}</div>
        </form>
        <div className="admin-catalog-grid">{catalog.map((product) => <article className="admin-catalog-item" key={product._id}>
          {product.imageUrl && product.imageUsagePermission === 'granted' && <img src={product.imageUrl} alt={product.name} loading="lazy" />}
          <b>{product.name}</b><small>{product.brand} · {product.model} · {product.category}</small>
          <div><a href={product.productUrl} target="_blank" rel="noopener noreferrer">Product page</a> · Product {product.productVerificationStatus} · Image {product.imageVerificationStatus} · URL {product.urlVerificationStatus} · Publication {product.publicationStatus}</div>
          <div className="admin-actions"><button type="button" onClick={() => editCatalogProduct(product)}>Edit</button><button type="button" onClick={() => void manageOffers(product)}>Manage offers ({product.offers?.length ?? 0})</button><button type="button" className="danger-button" disabled={busy} onClick={() => void deleteCatalogProduct(product)}>Delete</button></div>
          {selectedOfferProductId === product._id && <div className="offer-manager">
            <h3>Offers for {product.brand} {product.model}</h3>
            {product.offers?.map((offer) => <p key={offer._id}>{offer.sellerName} · {offer.price ?? 'No price'} {offer.currency ?? ''} · {offer.priceVerificationStatus ?? (offer.verified ? 'verified' : 'pending')}{offer.verificationNote ? ` · ${offer.verificationNote}` : ''} <button type="button" onClick={() => editOffer(offer)}>Edit</button></p>)}
            <form className="source-form" onSubmit={saveOffer}>
              <label>Seller<input required value={offerForm.sellerName} onChange={(e) => setOfferForm({ ...offerForm, sellerName: e.target.value })} /></label>
              <label>Source key<input required value={offerForm.source} onChange={(e) => setOfferForm({ ...offerForm, source: e.target.value })} /></label>
              <label>Price<input type="number" min="1" value={offerForm.price} onChange={(e) => setOfferForm({ ...offerForm, price: e.target.value })} /></label>
              <label>Original price<input type="number" min="1" value={offerForm.originalPrice} onChange={(e) => setOfferForm({ ...offerForm, originalPrice: e.target.value })} /></label>
              <label>Currency<input maxLength={3} value={offerForm.currency} onChange={(e) => setOfferForm({ ...offerForm, currency: e.target.value.toUpperCase() })} /></label>
              <label>Seller product URL<input required type="url" value={offerForm.productUrl} onChange={(e) => setOfferForm({ ...offerForm, productUrl: e.target.value })} /></label>
              <label>Affiliate URL (optional)<input type="url" value={offerForm.affiliateUrl} onChange={(e) => setOfferForm({ ...offerForm, affiliateUrl: e.target.value })} /></label>
              <label>Availability<input value={offerForm.availability} onChange={(e) => setOfferForm({ ...offerForm, availability: e.target.value })} /></label>
              <label>Price verification note<input value={offerForm.verificationNote} onChange={(e) => setOfferForm({ ...offerForm, verificationNote: e.target.value })} /></label>
              <label className="check-field"><input type="checkbox" checked={offerForm.verified} onChange={(e) => setOfferForm({ ...offerForm, verified: e.target.checked })} />Price and seller link checked</label>
              <div><button disabled={busy}>{offerForm._id ? 'Update offer' : 'Save offer'}</button><button type="button" className="secondary-button" onClick={() => setSelectedOfferProductId(null)}>Close</button></div>
            </form>
          </div>}
        </article>)}</div>
      </section>
    </main>
  );
}

function ReviewRow({ item, categories, disabled, onReview }: { item: ReviewItem; categories: Category[]; disabled: boolean; onReview: (item: ReviewItem, decision: 'approve' | 'reject', category?: string) => void }) {
  const [category, setCategory] = useState(categories[0]?.key ?? '');
  const researchImageMissing = item.source === 'web_research' && !item.imageReady;
  const imageLabel = item.imageCandidate
    ? 'Ảnh ứng viên: ' + (item.imageCandidate.license ?? 'chưa rõ license') + ' · ' + (item.imageCandidate.author ?? 'chưa rõ tác giả') + ' · ' + (item.imageCandidate.visualIdentityChecked ? 'đã xem' : 'chưa kiểm tra trực quan')
    : null;
  return (
    <article className="review-row">
      <div>
        <b>{item.name ?? 'Sản phẩm chưa có tên'}</b>
        <p>{item.brand ?? 'Chưa có hãng'} · {item.model ?? 'Chưa có model'} · {item.category ?? 'Chưa phân loại'} · {item.source}</p>
        {(item.family || item.generation || item.modelNumber) && <p>{[item.family, item.generation, item.modelNumber].filter(Boolean).join(' · ')}</p>}
        <small>{item.reasons.join(' · ')}</small>
        {(item.productUrl || item.specificationSourceUrl) && <p>{item.productUrl && <a href={item.productUrl} target="_blank" rel="noopener noreferrer">Product source</a>}{item.productUrl && item.specificationSourceUrl && ' · '}{item.specificationSourceUrl && <a href={item.specificationSourceUrl} target="_blank" rel="noopener noreferrer">Specifications</a>}</p>}
        {item.specifications && <details><summary>Thông số kỹ thuật</summary><pre>{JSON.stringify(item.specifications, null, 2)}</pre></details>}
        {item.sourceEvidence?.length ? <details><summary>Nguồn kiểm chứng ({item.sourceEvidence.length})</summary>{item.sourceEvidence.map((source, index) => <p key={String(source.sourceUrl ?? index)}><a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">{source.evidenceType ?? source.sourceName ?? 'Source'}</a>{source.notes ? ' · ' + source.notes : ''}</p>)}</details> : null}
        {imageLabel && <p>{imageLabel}{item.imageCandidate?.filePageUrl && <> · <a href={item.imageCandidate.filePageUrl} target="_blank" rel="noopener noreferrer">File page</a></>}</p>}
        {item.imageReady && item.imageCandidate?.imageUrl && <img className="review-image-preview" src={item.imageCandidate.imageUrl} alt={`${item.model ?? 'Product'} verified image candidate`} loading="lazy" />}
      </div>
      <select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select>
      <button disabled={disabled || !category || researchImageMissing} title={researchImageMissing ? 'Cần ảnh đúng model và bằng chứng quyền sử dụng trước khi duyệt.' : undefined} onClick={() => onReview(item, 'approve', category)}>Duyệt</button>
      <button className="danger-button" disabled={disabled} onClick={() => onReview(item, 'reject')}>Từ chối</button>
    </article>
  );
}
