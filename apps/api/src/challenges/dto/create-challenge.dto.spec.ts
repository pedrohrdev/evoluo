import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateChallengeDto } from './create-challenge.dto';

// Duração é uma regra de negócio fixa (CLAUDE.md seção 1: "30, 50, 100 ou
// 365 dias") — este teste garante que o valor é rejeitado no nível de
// validação da API, antes mesmo de chegar ao check constraint do banco.
// Tipado como Record (não Partial<CreateChallengeDto>) de propósito: o que
// chega numa requisição real é JSON não tipado, incluindo valores
// inválidos que o DTO deve rejeitar em tempo de execução.
async function validateDto(input: Record<string, unknown>) {
  const dto = plainToInstance(CreateChallengeDto, input);
  return validate(dto);
}

describe('CreateChallengeDto', () => {
  const valid = { name: 'Desafio de 30 dias', durationDays: 30, startDate: '2026-01-01' };

  it('is valid with a fixed duration and no description', async () => {
    expect(await validateDto(valid)).toHaveLength(0);
  });

  it.each([30, 50, 100, 365])('accepts every fixed duration value (%i)', async (durationDays) => {
    expect(await validateDto({ ...valid, durationDays })).toHaveLength(0);
  });

  it('rejects a duration outside the fixed set', async () => {
    const errors = await validateDto({ ...valid, durationDays: 45 });
    expect(errors.some((e) => e.property === 'durationDays')).toBe(true);
  });

  it('rejects a non-integer duration', async () => {
    const errors = await validateDto({ ...valid, durationDays: 30.5 as unknown as number });
    expect(errors.some((e) => e.property === 'durationDays')).toBe(true);
  });

  it('rejects an empty name', async () => {
    const errors = await validateDto({ ...valid, name: '' });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejects an invalid startDate', async () => {
    const errors = await validateDto({ ...valid, startDate: 'not-a-date' });
    expect(errors.some((e) => e.property === 'startDate')).toBe(true);
  });

  it('accepts an optional description within the length limit', async () => {
    expect(await validateDto({ ...valid, description: 'Um desafio entre amigos.' })).toHaveLength(0);
  });
});
