import { describe, expect, it } from 'vitest';
import { getAppBasePath, isValidSafeUrl, resolveAssetUrl } from '../src/lib/formatters';
import { stripBasePath, toAppUrl } from '../src/lib/router';

describe('GitHub Pages /E-comerc/ base path resolution', () => {
  it('normalizes base path consistently', () => {
    expect(getAppBasePath('/E-comerc/')).toBe('/E-comerc/');
    expect(getAppBasePath('/E-comerc')).toBe('/E-comerc/');
    expect(getAppBasePath('/')).toBe('/');
  });

  it('resolves local asset URLs under /E-comerc/ without double-prefixing or mutating external URLs', () => {
    expect(resolveAssetUrl('/src/assets/images/hero.jpg', '/E-comerc/')).toBe(
      '/E-comerc/src/assets/images/hero.jpg'
    );
    expect(resolveAssetUrl('/E-comerc/src/assets/images/hero.jpg', '/E-comerc/')).toBe(
      '/E-comerc/src/assets/images/hero.jpg'
    );
    expect(resolveAssetUrl('https://cdn.example.com/shoe.jpg', '/E-comerc/')).toBe(
      'https://cdn.example.com/shoe.jpg'
    );
    expect(resolveAssetUrl('data:image/png;base64,abc', '/E-comerc/')).toBe(
      'data:image/png;base64,abc'
    );
    expect(resolveAssetUrl('/src/assets/images/hero.jpg', '/')).toBe('/src/assets/images/hero.jpg');
  });

  it('validates both /src/assets/ and /E-comerc/src/assets/ asset URLs', () => {
    expect(isValidSafeUrl('/src/assets/images/a.jpg')).toBe(true);
    expect(isValidSafeUrl('/E-comerc/src/assets/images/a.jpg')).toBe(true);
    expect(isValidSafeUrl('javascript:alert(1)')).toBe(false);
  });

  it('strips and prepends /E-comerc/ cleanly in SPA router helpers', () => {
    expect(stripBasePath('/E-comerc/', '/E-comerc/')).toBe('/');
    expect(stripBasePath('/E-comerc', '/E-comerc/')).toBe('/');
    expect(stripBasePath('/E-comerc/catalogo', '/E-comerc/')).toBe('/catalogo');
    expect(stripBasePath('/E-comerc/produto/prod-1', '/E-comerc/')).toBe('/produto/prod-1');

    expect(toAppUrl('/', '/E-comerc/')).toBe('/E-comerc/');
    expect(toAppUrl('/catalogo?ofertas=1', '/E-comerc/')).toBe('/E-comerc/catalogo?ofertas=1');
    expect(toAppUrl('/E-comerc/catalogo', '/E-comerc/')).toBe('/E-comerc/catalogo');
  });
});
