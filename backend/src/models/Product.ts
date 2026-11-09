import { Schema, model } from 'mongoose';

const productSchema = new Schema(
  {
    name: { type: String, required: true },
    brand: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    price: { type: Number, required: true, index: true },
    originalPrice: Number,
    description: { type: String, default: '' },
    specs: { type: Schema.Types.Mixed, default: {} }, // ram, storage (GB), cpu, gpu, screen, battery...
    tags: { type: [String], default: [], index: true }, // gaming, office, camera, battery...
    rating: { type: Number, default: 4 },
    sold: { type: Number, default: 0 },
    stock: { type: Number, default: 10 },
    searchText: { type: String, default: '' }, // văn bản đã bỏ dấu để so khớp
  },
  { timestamps: true }
);

export const Product = model('Product', productSchema);
