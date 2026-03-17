import { loadAllRoleCards, loadRoleCard, validateRoleCard } from '../role-cards';

describe('role cards', () => {
  test('loads all role cards without errors and matches expected core count', async () => {
    const cards = await loadAllRoleCards();
    expect(cards.length).toBe(10);

    for (const card of cards) {
      await expect(validateRoleCard(card, {})).resolves.toBeTruthy();
    }
  });

  test('canonical role card files exist and legacy aliases resolve to canonical cards', async () => {
    const agentIds: Array<[string, string]> = [
      ['echo', 'venture_strategy'],
      ['nexus', 'venture_control'],
      ['oracle', 'venture_research'],
      ['atlas', 'venture_infrastructure'],
      ['sentinel', 'venture_security'],
      ['verifier', 'venture_evidence'],
      ['archivist', 'venture_memory'],
      ['synth', 'venture_delivery'],
      ['scout', 'venture_signals'],
      ['liaison', 'venture_comms'],
    ];

    for (const [inputId, canonicalId] of agentIds) {
      const card = await loadRoleCard(inputId);
      expect(card.agentId).toBe(canonicalId);
    }
  });

  test('supports canonical and legacy role card lookup at runtime', async () => {
    const cardFromLegacy = await loadRoleCard('echo');
    const cardFromCanonical = await loadRoleCard('venture_strategy');

    expect(cardFromLegacy.agentId).toBe('venture_strategy');
    expect(cardFromCanonical.agentId).toBe('venture_strategy');
    expect(cardFromCanonical.outputs.length).toBeGreaterThan(0);
  });
});
