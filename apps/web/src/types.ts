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
  allocation: number;
  taken: number;
  remaining: number;
};

export type LeaveRequest = {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  days: number;
  status?: string;
  note?: string | null;
  createdAt: string;
  employee: { id: string; name: string; email: string };
};

export type Recommendation = {
  id: string;
  type: 'MOVIE' | 'SERIES' | 'BOOK' | 'MUSIC' | string;
  title: string;
  url?: string | null;
  imageUrl?: string | null;
  note?: string | null;
  author: { id: string; name: string };
  likes: { userId: string; recommendationId: string }[];
  ratings: { userId: string; recommendationId: string; score: number }[];
  createdAt: string;
};

export type RecommendationSearchResult = {
  id: string;
  title: string;
  artist?: string;
  url?: string;
  imageUrl: string;
};

export type Kudos = {
  id: string;
  message: string;
  from: { id: string; name: string };
  to: { id: string; name: string };
  createdAt: string;
};
