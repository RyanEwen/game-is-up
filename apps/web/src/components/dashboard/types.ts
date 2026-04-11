export type Notice = {
  tone: 'neutral' | 'success' | 'danger';
  message: string;
};

export type DashboardTab = 'overview' | 'discovery' | 'library' | 'play';
export type PlayIntentTimingMode = 'preset' | 'custom' | 'end-time';

export type FriendTarget = {
  id: string;
  displayName: string;
  friendEligible: boolean;
};

export type DashboardToast = {
  id: string;
  notice: Notice;
  dismiss: () => void;
};