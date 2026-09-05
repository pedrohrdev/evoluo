// Ver env.validation.spec.ts: precisa do polyfill de metadata que em
// produção já vem carregado por main.ts importar @nestjs/common/core antes
// de qualquer módulo rodar.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GoalKind, ImportanceLevel } from '@prisma/client';
import { GoalVersionDto } from './goal-version.dto';

// Testa o pipeline real de validação (o mesmo que o ValidationPipe global
// roda em cada requisição), não só a leitura dos decorators — a interação
// entre @ValidateIf e @IsPositive é fácil de quebrar silenciosamente numa
// refatoração, e essa regra é a mesma que decide se uma meta de
// horas/quantidade pode ser avaliada como cumprida (CLAUDE.md seção 2
// "Metas" / "Cumprimento de metas").
async function validateDto(input: Partial<GoalVersionDto>) {
  const dto = plainToInstance(GoalVersionDto, input);
  return validate(dto);
}

describe('GoalVersionDto', () => {
  it('is valid for an hours goal with a positive targetValue', async () => {
    const errors = await validateDto({
      kind: GoalKind.hours,
      importance: ImportanceLevel.high,
      title: 'Estudar inglês',
      targetValue: 2,
    });

    expect(errors).toHaveLength(0);
  });

  it('is valid for a boolean goal without targetValue', async () => {
    const errors = await validateDto({
      kind: GoalKind.boolean,
      importance: ImportanceLevel.medium,
      title: 'Meditar',
    });

    expect(errors).toHaveLength(0);
  });

  it('rejects an hours/quantity goal missing targetValue', async () => {
    const errors = await validateDto({
      kind: GoalKind.quantity,
      importance: ImportanceLevel.low,
      title: 'Ler páginas',
    });

    expect(errors.some((e) => e.property === 'targetValue')).toBe(true);
  });

  it('rejects a zero or negative targetValue for hours/quantity', async () => {
    const errors = await validateDto({
      kind: GoalKind.hours,
      importance: ImportanceLevel.high,
      title: 'Estudar inglês',
      targetValue: 0,
    });

    expect(errors.some((e) => e.property === 'targetValue')).toBe(true);
  });

  // O DTO sozinho não proíbe enviar targetValue para uma meta boolean — essa
  // metade da regra fica no service (comentário no próprio DTO), então este
  // teste documenta a fronteira em vez de presumir um comportamento que não
  // existe aqui.
  it('does not by itself reject a targetValue sent alongside kind boolean', async () => {
    const errors = await validateDto({
      kind: GoalKind.boolean,
      importance: ImportanceLevel.medium,
      title: 'Meditar',
      targetValue: 5,
    });

    expect(errors).toHaveLength(0);
  });

  it('rejects an empty title', async () => {
    const errors = await validateDto({
      kind: GoalKind.boolean,
      importance: ImportanceLevel.medium,
      title: '',
    });

    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('rejects an invalid importance value', async () => {
    const errors = await validateDto({
      kind: GoalKind.boolean,
      importance: 'urgent' as ImportanceLevel,
      title: 'Meditar',
    });

    expect(errors.some((e) => e.property === 'importance')).toBe(true);
  });
});
