import { loadAllRoleCards, loadRoleCard, validateRoleCard } from '../role-cards';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('role cards', () => {
  test('loads all role cards and validates against schema', async () => {
    const cards = await loadAllRoleCards();
    expect(cards.length).toBe(8);

    for (const card of cards) {
      // validateRoleCard is already run inside loadAllRoleCards via loadRoleCard, but keep explicit.
      await expect(validateRoleCard(card)).resolves.toBeTruthy();
    }
  });

  test('role card JSON files exist for the 8 core agents', async () => {
    const agentIds = ['echo', 'nexus', 'sentinel', 'verifier', 'archivist', 'oracle', 'atlas', 'synth'];

    for (const id of agentIds) {
      const card = await loadRoleCard(id);
      expect(card.agentId).toBe(id);
    }
  });

  test('schema.json is present next to role cards', async () => {
    const cardsDir = path.resolve(__dirname, '../../../agents/role-cards');
    const schemaPath = path.join(cardsDir, 'schema.json');
    const raw = await fs.readFile(schemaPath, 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.title).toMatch(/Role Card Schema/);
  });
});
