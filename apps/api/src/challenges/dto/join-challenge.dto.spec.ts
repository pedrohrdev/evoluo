import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { JoinChallengeDto } from './join-challenge.dto';

async function validateDto(input: Partial<JoinChallengeDto>) {
  const dto = plainToInstance(JoinChallengeDto, input);
  return validate(dto);
}

describe('JoinChallengeDto', () => {
  it('is valid with an 8-character code', async () => {
    expect(await validateDto({ joinCode: 'ABCD1234' })).toHaveLength(0);
  });

  it('rejects a code shorter than 8 characters', async () => {
    const errors = await validateDto({ joinCode: 'ABCD123' });
    expect(errors.some((e) => e.property === 'joinCode')).toBe(true);
  });

  it('rejects a code longer than 8 characters', async () => {
    const errors = await validateDto({ joinCode: 'ABCD12345' });
    expect(errors.some((e) => e.property === 'joinCode')).toBe(true);
  });

  it('rejects a missing code', async () => {
    const errors = await validateDto({});
    expect(errors.some((e) => e.property === 'joinCode')).toBe(true);
  });
});
