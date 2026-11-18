import { expect, it } from 'vitest';
import { createFilterQuery, countFilterRules } from '@/components/reui/filters/filters-query';
it('starts with zero filter rules', () => { expect(countFilterRules(createFilterQuery())).toBe(0); });
