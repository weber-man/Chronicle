export type Precision = 'year' | 'month' | 'day';
export type UserRole = 'admin' | 'user';

export interface TimelineDate {
  precision: Precision;
  year: number;
  month?: number | null;
  day?: number | null;
}

export interface User {
  id: number;
  name: string;
  color: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface LifeEvent {
  id: number;
  userId: number;
  title: string;
  description: string;
  category: string;
  startDate: TimelineDate;
  endDate: TimelineDate | null;
  isOngoing: boolean;
  createdAt: string;
  updatedAt: string;
  sortStart: string;
  sortEnd: string;
}

export interface Summary {
  totalUsers: number;
  totalEvents: number;
  rangeLabel: string;
  ongoingEvents: number;
}
