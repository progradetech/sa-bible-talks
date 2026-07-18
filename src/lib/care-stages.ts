export type CareType = 'prayer_request' | 'interested' | 'move_in' | 'restore';

export const CARE_TYPES: CareType[] = ['prayer_request', 'interested', 'move_in', 'restore'];

export const ARCHIVED_STAGE = 'archived';

// Every type shares the terminal archived stage in addition to the pipeline
// below — kept out of these lists and appended by isValidStage/allStagesFor.
export const CARE_STAGES: Record<CareType, string[]> = {
  prayer_request: ['open', 'answered'],
  interested: ['new', 'invited', 'attending', 'studying', 'baptized'],
  move_in: ['potential', 'confirmed', 'arrived', 'connected'],
  restore: ['identified', 'contacted', 'meeting', 'studying', 'restored'],
};

export const CARE_TYPE_LABELS: Record<CareType, string> = {
  prayer_request: 'Prayer request',
  interested: 'Interested',
  move_in: 'Potential move-in',
  restore: 'Restore',
};

export const CARE_STAGE_LABELS: Record<string, string> = {
  open: 'Open',
  answered: 'Answered',
  new: 'New',
  invited: 'Invited',
  attending: 'Attending',
  studying: 'Studying',
  baptized: 'Baptized',
  potential: 'Potential',
  confirmed: 'Confirmed',
  arrived: 'Arrived',
  connected: 'Connected',
  identified: 'Identified',
  contacted: 'Contacted',
  meeting: 'Meeting',
  restored: 'Restored',
  archived: 'Archived',
};

export function allStagesFor(type: CareType): string[] {
  return [...CARE_STAGES[type], ARCHIVED_STAGE];
}

export function isValidStage(type: CareType, stage: string): boolean {
  return allStagesFor(type).includes(stage);
}

export function initialStage(type: CareType): string {
  return CARE_STAGES[type][0];
}

export function isCareType(value: unknown): value is CareType {
  return typeof value === 'string' && (CARE_TYPES as string[]).includes(value);
}
