export type Notice = {
  tone: 'neutral' | 'success' | 'danger';
  message: string;
};

export type DashboardTab = 'overview' | 'discovery' | 'library' | 'play';
export type PlayIntentTimingMode = 'preset' | 'custom' | 'end-time';

export type FriendTarget = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  friendEligible: boolean;
};

export type DashboardLibraryQuickAddGame = {
  gameId: string;
  title: string;
  coverUrl: string | null;
  platformLabels: string[];
};

export type DashboardToast = {
  id: string;
  notice: Notice;
  dismiss: () => void;
};