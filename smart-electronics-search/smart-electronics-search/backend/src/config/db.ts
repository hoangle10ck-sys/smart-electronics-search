import mongoose from 'mongoose';

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Thiếu MONGODB_URI trong file .env');
  await mongoose.connect(uri);
  console.log(`✅ Đã kết nối MongoDB (db: ${mongoose.connection.name})`);
}
