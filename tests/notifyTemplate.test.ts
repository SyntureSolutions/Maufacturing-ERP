import { describe, it, expect } from 'vitest';
import { renderTemplate, unknownVariables, DEFAULT_TEMPLATES, EVENT_VARIABLES } from '@/lib/notifyTemplate';

describe('notification templates', () => {
  it('fills variables and blanks missing ones', () => {
    expect(renderTemplate('PO {{poNumber}} for {{ totalAmount }} {{missing}}!', { poNumber: 'PO-1', totalAmount: 500 })).toBe('PO PO-1 for 500 !');
  });

  it('reports variables an event does not provide', () => {
    expect(unknownVariables('Hi {{customerName}} {{bogus}}', 'ORDER_CONFIRMATION')).toEqual(['bogus']);
  });

  it('ships default templates that only use supported variables', () => {
    for (const t of DEFAULT_TEMPLATES) {
      expect(unknownVariables(`${t.subject || ''} ${t.body}`, t.event), `${t.event}/${t.channel}`).toEqual([]);
      expect(EVENT_VARIABLES[t.event].length).toBeGreaterThan(0);
    }
  });
});
