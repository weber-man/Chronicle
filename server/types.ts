export type Role = 'admin' | 'user';

export type TimelineDate = {
  precision: 'year' | 'month' | 'day';
  year: number;
  month?: number | null;
  day?: number | null;
};

export type SanitizedUser = {
  id: number;
  name: string;
  color: string;
  email: string;
  role: Role;
  createdAt: string;
};

export type UserRow = {
  id: number;
  name: string;
  color: string;
  email: string;
  passwordHash: string | null;
  role: Role;
  sessionVersion: number;
  createdAt: string;
  updatedAt: string | null;
};

export type AuthUser = SanitizedUser & {
  sessionVersion: number;
};

declare global {
  namespace Express {
    interface Request {
      auth?: SanitizedUser;
      requestId?: string;
    }
  }
}
