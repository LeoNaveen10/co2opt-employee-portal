import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTicketQuery } from '../jira/search-input';
test('ticket lookup recognizes full keys, numeric ticket numbers and pasted Jira URLs', () => {
  for (const value of ['TM-6456', ' tm-6456 ', 'Tm - 6456', 'https://co2opt.atlassian.net/browse/TM-6456', 'https://co2opt.atlassian.net/browse/TM-6456?focusedCommentId=123']) assert.deepEqual(parseTicketQuery(value), { type: 'key', value: 'TM-6456' });
  assert.deepEqual(parseTicketQuery('6456'), { type: 'number', value: '6456' });
  assert.deepEqual(parseTicketQuery('1'), { type: 'number', value: '1' });
  assert.deepEqual(parseTicketQuery('Customer portal'), { type: 'title', value: 'Customer portal' });
  assert.deepEqual(parseTicketQuery('fix OR project = SECRET'), { type: 'title', value: 'fix OR project   SECRET' });
});
