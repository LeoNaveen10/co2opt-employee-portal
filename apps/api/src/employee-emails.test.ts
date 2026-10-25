import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEmployeeEmails } from './employee-emails';

test('normalizes and deduplicates explicitly allowed company emails', () => {
  const emails = parseEmployeeEmails('[" Alice@CO2OPT.com ","alice@co2opt.com"]');
  assert.deepEqual([...emails], ['alice@co2opt.com']);
  assert.equal(emails.has('bob@co2opt.com'), false);
});

test('missing and empty lists deny access to everyone', () => {
  assert.equal(parseEmployeeEmails(undefined).size, 0);
  assert.equal(parseEmployeeEmails('[]').size, 0);
});

test('rejects malformed arrays, invalid emails and other domains', () => {
  for (const value of ['alice@co2opt.com', '{}', 'null', '[1]', '["alice@gmail.com"]', '["alice@sub.co2opt.com"]', '["alice@co2opt.com.evil.com"]', '["@co2opt.com"]']) {
    assert.throws(() => parseEmployeeEmails(value), /EMPLOYEE_EMAILS/);
  }
});
