import { describe, expect, it } from 'vitest';
import { coldProductsQuerySchema, rankingProductsQuerySchema } from '@/modules/stats/stats.validators';

describe('paginación de stats', () => {
  it('usa valores predeterminados para el ranking y productos fríos', () => {
    expect(rankingProductsQuerySchema.parse({ view: 'historical' })).toMatchObject({ page: 1, limit: 10 });
    expect(coldProductsQuerySchema.parse({})).toMatchObject({ page: 1, limit: 10 });
  });

  it.each(['10', '24', '48'])('acepta el límite permitido %s', (limit) => {
    expect(coldProductsQuerySchema.parse({ limit }).limit).toBe(Number(limit));
  });

  it.each(['0', '-1', '12', '49', '1.5', 'invalid'])('usa el límite predeterminado para %s', (limit) => {
    expect(coldProductsQuerySchema.parse({ limit }).limit).toBe(10);
  });

  it('acepta páginas positivas enteras', () => {
    expect(coldProductsQuerySchema.parse({ page: '3' }).page).toBe(3);
  });

  it.each(['0', '-1', '1.5', 'invalid'])('rechaza page inválida %s', (page) => {
    expect(coldProductsQuerySchema.safeParse({ page }).success).toBe(false);
  });
});
