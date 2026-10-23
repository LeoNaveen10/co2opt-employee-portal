export type User = {
  id: string;
  email: string;
  name: string;
  role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN' | string;
  birthday: string | null;
  joinedOn: string | null;
  showBirthday: boolean;
};

export type LeaveSummary = {
  userId: string;
  name: string;
  role: string;
  allocation: number;
  approved: number;
  pending: number;
  remaining: number;
};

export type LeaveRequest = {
  id: string;
  employeeId: string;
  reviewerId?: string | null;
  startDate: string;
  endDate: string;
  days: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  note?: string | null;
  createdAt: string;
  employee: { id: string; name: string; email: string };
  reviewer?: { id: string; name: string; email: string } | null;
};

export type Holiday = { id?: number; date: string; name: string };

export type Recommendation = {
  id: string;
  type: 'MOVIE' | 'SERIES' | 'BOOK' | 'MUSIC' | string;
  title: string;
  url?: string | null;
  note?: string | null;
  author: { id: string; name: string };
  likes: { userId: string; recommendationId: string }[];
  ratings: { userId: string; recommendationId: string; score: number }[];
  createdAt: string;
};

export type Kudos = {
  id: string;
  message: string;
  from: { id: string; name: string };
  to: { id: string; name: string };
  createdAt: string;
};

export type Poll = {
  id: string;
  question: string;
  optionsJson: string;
  closesAt: string;
  createdAt: string;
  creator: { id: string; name: string };
  votes: { pollId: string; userId: string; optionIndex: number }[];
};

export type WheelPreset = {
  id: string;
  name: string;
  optionsJson: string;
  creator: { id: string; name: string };
  createdAt: string;
};