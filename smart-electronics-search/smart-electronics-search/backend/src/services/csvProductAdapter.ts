import { DatafeedItem } from './accesstradeClient';
import { normalizeSpecs } from '../utils/specs';

export interface ParsedCsvProducts {
  items: DatafeedItem[];
  rejectedRows: number;
  errors: string[];
}

function rowsFromCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (quoted) throw new Error('CSV có dấu ngoặc kép chưa đóng');
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows.filter((current) => current.some((value) => value.trim() !== ''));
}

export function parseProductCsv(csv: string, maxRows = 20): ParsedCsvProducts {
  if (!csv.trim()) throw new Error('CSV rỗng');
  if (csv.length > 2_000_000) throw new Error('CSV vượt giới hạn 2MB');
  const rows = rowsFromCsv(csv);
  if (rows.length < 2) throw new Error('CSV cần có dòng tiêu đề và ít nhất một sản phẩm');
  const headers = rows[0].map((name) => name.trim().replace(/^\uFEFF/, '').toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error('CSV có tên cột trùng nhau');
  const required = ['name', 'category'];
  const missing = required.filter((name) => !headers.includes(name));
  if (missing.length) throw new Error(`CSV thiếu cột bắt buộc: ${missing.join(', ')}`);
  if (rows.length - 1 > maxRows) throw new Error(`Mỗi lần thử nghiệm nhận tối đa ${maxRows} sản phẩm`);

  const items: DatafeedItem[] = [];
  const errors: string[] = [];
  let rejectedRows = 0;
  for (let index = 1; index < rows.length; index += 1) {
    const cells = rows[index];
    if (cells.length !== headers.length) { rejectedRows += 1; errors.push(`Dòng ${index + 1}: số cột không khớp tiêu đề`); continue; }
    const record = Object.fromEntries(headers.map((header, column) => [header, cells[column].trim()]));
    if (!record.name || !record.category) { rejectedRows += 1; errors.push(`Dòng ${index + 1}: thiếu name/category`); continue; }
    let specifications: unknown = undefined;
    if (record.specifications) {
      try {
        specifications = JSON.parse(record.specifications);
        if (!specifications || typeof specifications !== 'object' || Array.isArray(specifications)) throw new Error();
      } catch { rejectedRows += 1; errors.push(`Dòng ${index + 1}: specifications phải là JSON object hợp lệ`); continue; }
    }
    let variants: unknown = undefined;
    if (record.variants) {
      try {
        variants = JSON.parse(record.variants);
        if (!Array.isArray(variants) || variants.some((variant) => !variant || typeof variant !== 'object' || Array.isArray(variant))) throw new Error();
      } catch { rejectedRows += 1; errors.push(`Invalid variants JSON on row ${index + 1}`); continue; }
    }
    items.push({
      product_id: record.sourceproductid || undefined,
      sku: record.sku || undefined,
      name: record.name,
      brand: record.brand || undefined,
      model: record.model || undefined,
      model_number: record.modelnumber || undefined,
      family: record.family || undefined,
      generation: record.generation || undefined,
      release_year: record.releaseyear || undefined,
      product_status: record.productstatus || undefined,
      cate: record.category,
      desc: record.description || undefined,
      specifications,
      specs: normalizeSpecs(specifications),
      variants,
      image: record.imageurl || undefined,
      url: record.producturl || undefined,
      aff_link: record.affiliateurl || undefined,
      price: record.originalprice || record.price || undefined,
      discount: record.originalprice && record.price ? record.price : undefined,
      currency: record.currency || undefined,
      campaign: record.sellername || undefined,
      merchant: record.sellername || undefined,
      availability: record.availability || undefined,
      update_time: record.lastupdated || undefined,
    });
  }
  return { items, rejectedRows, errors };
}
