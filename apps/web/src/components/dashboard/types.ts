export type Notice = {
  tone: 'neutral' | 'success' | 'danger';
  message: string;
};

export type DashboardTab = 'overview' | 'network' | 'friends' | 'library' | 'discovery' | 'play' | 'debug';
export type PlayIntentStartMode = 'now' | 'scheduled';
export type PlayIntentTimingMode = 'preset' | 'custom' | 'end-time';
export type PlayIntentVoiceMode = 'none' | 'existing' | 'temporary';

export type FriendTarget = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  discordUserId?: string | null;
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