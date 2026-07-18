import type { CareType } from './care-stages';

export type AdminRole = 'super_admin' | 'admin' | 'leader';

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
  leaderAdminUserId: string | null;
}

// What the admin map dashboard receives, for every role. Staff see all rows
// unredacted. A leader-role user gets full PII only for their own talk;
// other talks have PII fields blanked server-side and exactLat/exactLng set
// to the approximate coords, so real PII never reaches their browser.
export interface MapLeader extends PrivateLeader {
  isOwn: boolean;
  redacted: boolean;
  claimable: boolean;
  // Staff only: email of the linked leader account, for the drawer's
  // "Managed by …" line. Null when unlinked or when viewer is a leader.
  linkedLeaderEmail: string | null;
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

export interface CareEntry {
  id: string;
  bibleTalkId: string | null;
  type: CareType;
  stage: string;
  personName: string | null;
  contact: string | null;
  details: string | null;
  outcome: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface CreateCareEntryInput {
  bibleTalkId?: string | null;
  type: CareType;
  stage?: string;
  personName?: string;
  contact?: string;
  details?: string;
}

export interface CareTalkOption {
  id: string;
  label: string;
}

export interface UpdateCareEntryInput {
  bibleTalkId?: string | null;
  stage?: string;
  personName?: string | null;
  contact?: string | null;
  details?: string | null;
  outcome?: string | null;
}

export interface VisitorRequestInput {
  targetBibleTalkId: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone?: string;
  message: string;
  turnstileToken: string;
}
