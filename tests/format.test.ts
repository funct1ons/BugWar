import { expect, it } from 'vitest';
import { formatUnits } from '../src/ui/format';
it('keeps normal garrisons exact and extreme HUD totals compact',()=>{expect(formatUnits(19.9)).toBe('19');expect(formatUnits(44600)).toBe('44.6K');expect(formatUnits(1234567)).toBe('1.2M');expect(formatUnits(2e9)).toBe('2.0B');expect(formatUnits(NaN)).toBe('0');});
