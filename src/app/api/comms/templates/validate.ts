import type { TemplateInput } from '@/lib/repos/comms';

const MAX_NAME = 100;
const MAX_SUBJECT = 200;
const MAX_BODY = 10_000;

export function validateTemplateBody(
  body: unknown,
): TemplateInput | { error: string } {
  const b = (body ?? {}) as Partial<TemplateInput>;
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const subject = typeof b.subject === 'string' ? b.subject.trim() : '';
  const templateBody = typeof b.body === 'string' ? b.body.trim() : '';

  if (!name || name.length > MAX_NAME) return { error: 'invalid_name' };
  if (!subject || subject.length > MAX_SUBJECT) return { error: 'invalid_subject' };
  if (!templateBody || templateBody.length > MAX_BODY) return { error: 'invalid_body' };
  return { name, subject, body: templateBody };
}
