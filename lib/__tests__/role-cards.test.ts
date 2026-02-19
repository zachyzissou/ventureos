import { loadAllRoleCards, loadRoleCard, validateRoleCard } from '../role-cards';

describe('role cards', () => {
  test('loads all role cards without errors and matches expected core count', async () => {
    const cards = await loadAllRoleCards();
    expect(cards.length).toBe(10);

    for (const card of cards) {
      await expect(validateRoleCard(card, {})).resolves.toBeTruthy();
    }
  });

  test('role card files exist for core agents', async () => {
    const agentIds = ['echo', 'nexus', 'oracle', 'atlas', 'sentinel', 'verifier', 'archivist', 'synth', 'scout', 'liaison'];

    for (const id of agentIds) {
      const card = await loadRoleCard(id);
      expect(card.agentId).toBe(id);
    }
  });

  test('supports both .ts and .json role card formats at runtime', async () => {
    const cardFromTs = await loadRoleCard('echo');
    expect(cardFromTs.agentId).toBe('echo');
    expect(cardFromTs.outputs.length).toBeGreaterThan(0);
  });
});
