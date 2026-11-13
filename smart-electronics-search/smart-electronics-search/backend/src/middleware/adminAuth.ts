import { timingSafeEqual } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.ADMIN_API_TOKEN;
  const supplied = req.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!expected) return res.status(503).json({ message: 'Chưa cấu hình ADMIN_API_TOKEN ở backend' });
  if (!supplied) return res.status(401).json({ message: 'Cần xác thực Admin' });
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    return res.status(401).json({ message: 'Cần xác thực Admin' });
  }
  next();
}
