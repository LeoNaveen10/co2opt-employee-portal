import { z } from 'zod';

export function parseEmployeeEmails(value: string | undefined): Set<string> {
  let emails: unknown;
  try {
    emails = JSON.parse(value ?? '[]');
  } catch {
    throw new Error('EMPLOYEE_EMAILS must be a JSON array of co2opt.com email addresses');
  }
  const parsed = z.array(z.string().trim().toLowerCase().email().refine((email) => email.split('@')[1] === 'co2opt.com')).safeParse(emails);
  if (!parsed.success) throw new Error('EMPLOYEE_EMAILS must be a JSON array of co2opt.com email addresses');
  return new Set(parsed.data);
}
