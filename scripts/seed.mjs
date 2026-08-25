import { hashPassword } from '../src/security/auth.js';
import { createDatabase } from '../src/db/database.js';
import { createRepository } from '../src/db/repository.js';
import { loadConfig } from '../src/config.js';

const repository = createRepository(createDatabase(loadConfig().databasePath));
const email = process.env.SEED_EMAIL ?? 'demo@saldo.real';
const password = process.env.SEED_PASSWORD ?? 'SaldoReal2026';
let user = repository.findUserByEmail(email);

if (!user) {
  user = repository.createUser({ email, name: 'Conta demonstração', passwordHash: hashPassword(password), locale: 'pt-BR' });
  const space = repository.createSpace(user.id, {
    name: 'Pessoal', kind: 'personal', currency: 'BRL', locale: 'pt-BR',
    currentBalanceCents: 385_000, emergencyBufferCents: 75_000,
  });
  const today = new Date().toISOString().slice(0, 10);
  const plus = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const entries = [
    { title: 'Aluguel', type: 'expense', amountCents: 145_000, category: 'housing', date: plus(4), recurrence: 'monthly', confidence: 1, status: 'planned', notes: '' },
    { title: 'Supermercado', type: 'expense', amountCents: 45_000, category: 'food', date: plus(2), recurrence: 'weekly', confidence: 1, status: 'planned', notes: '' },
    { title: 'Projeto freelance', type: 'income', amountCents: 180_000, category: 'income', date: plus(8), recurrence: 'none', confidence: .8, status: 'planned', notes: 'Renda variável ajustada por confiança.' },
    { title: 'Internet', type: 'expense', amountCents: 12_000, category: 'utilities', date: plus(6), recurrence: 'monthly', confidence: 1, status: 'planned', notes: '' },
  ];
  for (const entry of entries) repository.createEntry(user.id, space.id, { ...entry, recurrenceEnd: null, date: entry.date ?? today });
  repository.createGoal(user.id, space.id, { name: 'Reserva de emergência', targetCents: 600_000, currentCents: 120_000, targetDate: null, kind: 'emergency' });
  console.log(`Base demonstrativa criada: ${email} / ${password}`);
} else {
  console.log(`A conta ${email} já existe; nenhuma alteração foi feita.`);
}
repository.close();
