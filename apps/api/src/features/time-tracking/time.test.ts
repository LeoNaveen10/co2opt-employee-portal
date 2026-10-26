import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration, localDate, addDays, weekStart, startedAt, toAdf, fromAdf } from './time';
test('duration inputs accept whole minutes and reject ambiguous or invalid values', () => {
  for (const [input, seconds] of [['1h 30m', 5400], ['1:30', 5400], ['90m', 5400], ['24h', 86400], ['1m', 60]] as const) assert.equal(parseDuration(input), seconds);
  for (const value of ['', '0h', '-1h', '1.5h', '1:60', 'NaN', 'Infinity', '25h', '1', '1m trailing']) assert.throws(() => parseDuration(value));
});
test('date grouping follows the work date at midnight and Sunday/year boundaries', () => {
  assert.equal(localDate('2026-12-31T18:29:00Z'), '2026-12-31');
  assert.equal(localDate('2026-12-31T18:30:00Z'), '2027-01-01');
  assert.equal(weekStart('2027-01-01'), '2026-12-27');
  assert.equal(weekStart('2027-01-03'), '2027-01-03');
  const batches = Array.from({ length: 15 }, (_, i) => addDays('2027-01-03', -7 * i));
  assert.equal(new Set(batches).size, 15);
  assert.equal(batches[5], '2026-11-29');
  assert.throws(() => startedAt('2026-02-30', '12:00'));
  assert.throws(() => startedAt('2099-01-01', '12:00'));
});
test('plain descriptions round trip through Jira rich text', () => {
  assert.equal(fromAdf(toAdf('Worked on search\n\nFixed pagination')), 'Worked on search\n\nFixed pagination');
  assert.equal(fromAdf(undefined), '');
});
