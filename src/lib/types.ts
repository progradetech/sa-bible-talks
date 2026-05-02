export type AdminRole = 'super_admin' | 'admin';

export interface AdminContext {
  userId: string;
  adminUserId: string;
  email: string;
  role: AdminRole;
  ip?: string;
  userAgent?: string;
}

export interface PublicContext {
  ip?: string;
  userAgent?: string;
}

export interface Coords {
  lat: number;
  lng: number;
}

export type Ministry = 'Family' | 'YoPro' | 'Campus' | 'Singles' | 'Spanish';
export type Language = 'English' | 'Spanish' | 'Bilingual';

export interface PublicLeader {
  id: string;
  ministry: Ministry;
  language: Language;
  kidFriendly: boolean;
  meetingInfo: string | null;
  groupName: string | null;
  approxLat: number;
  approxLng: number;
  jitterMiles: number | null;
}

export interface PrivateLeader extends PublicLeader {
  name: string;
  address: string;
  email: string;
  phone: string | null;
  adminNotes: string | null;
  exactLat: number;
  exactLng: number;
  showGroupName: boolean;
  hideFromPublicMap: boolean;
  isPaused: boolean;
  isActive: boolean;
}

export interface CreateLeaderInput {
  ministry: Ministry;
  language: Language;
  kidFriendly: boolean;
  meetingInfo?: string;
  groupName?: string;
  showGroupName: boolean;
  name: string;
  address: string;
  email: string;
  phone?: string;
  adminNotes?: string;
  exactLat: number;
  exactLng: number;
  jitterMiles?: number;
}

export type UpdateLeaderInput = Partial<CreateLeaderInput> & {
  hideFromPublicMap?: boolean;
  isPaused?: boolean;
  isActive?: boolean;
};

export interface VisitorRequestInput {
  targetBibleTalkId: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone?: string;
  message: string;
  turnstileToken: string;
}
