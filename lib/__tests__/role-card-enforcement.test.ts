import { enforceHeuristicBans, enforceInfrastructureBans, logQualityViolations } from '../role-card-enforcement';

describe('role card enforcement', () => {
  test('Tier 1 infrastructure ban blocks tagged action', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const allowed = await enforceInfrastructureBans('sentinel', 'deploy');
    expect(allowed).toBe(false);

    warnSpy.mockRestore();
  });

  test('Tier 2 heuristic bans produce warnings for uncited claims', async () => {
    const warnings = await enforceHeuristicBans('oracle', 'The new model is 25% faster than the baseline.');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.enforcement === 'citation_detector')).toBe(true);
  });

  test('Tier 3 quality violations are logged (non-blocking)', async () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    logQualityViolations('oracle', 'This is probably correct, but might be incomplete.');

    // logQualityViolations loads role card asynchronously
    await new Promise((r) => setTimeout(r, 25));

    expect(infoSpy).toHaveBeenCalled();
    infoSpy.mockRestore();
  });
});
