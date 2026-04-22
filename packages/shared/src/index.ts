export type UserRole = "FOUNDER" | "USER";
export type CampaignStatus = "ACTIVE" | "PAUSED" | "ENDED";
export type SocialPlatform = "TWITTER" | "LINKEDIN" | "INSTAGRAM";
export type PostStatus = "PENDING" | "VERIFIED" | "REJECTED";
export type PayoutStatus = "PENDING" | "COMPLETED" | "FAILED";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  role: UserRole;
  walletAddress?: string | null;
}

export interface ApiHealthResponse {
  status: "ok";
  service: string;
  timestamp: string;
  campaigns: number;
}

export interface CampaignSummary {
  id: string;
  title: string;
  description: string;
  totalBudget: number;
  remainingBudget: number;
  status: CampaignStatus;
  productUrl: string;
  founderId: string;
  createdAt: string;
  endsAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  userAvatar?: string | null;
  score: number;
  postCount: number;
  change: "up" | "down" | "same";
}
