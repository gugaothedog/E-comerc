import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Address, Brand, Category, Coupon, Order, Product, Review, StoreSettings, UserRole } from '../src/types/store';

export interface ServerUserRecord {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  passwordHash: string; // scrypt "salt:hash"
  phone: string;
  cpf: string;
  addresses: Address[];
  createdAtMs: number;
  updatedAtMs: number;
}

interface AuthStoreSnapshot {
  usersByEmail: Record<string, ServerUserRecord>;
  orders: Record<string, Order>;
  products: Record<string, Product>;
  categories: Record<string, Category>;
  brands: Record<string, Brand>;
  coupons: Record<string, Coupon>;
  reviews: Review[];
  settings: StoreSettings | null;
}

export const ADMIN_EMAIL = 'luizgustavo14102010@gmail.com';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, keyHex] = stored.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export class ServerAuthAndDataStore {
  private data: AuthStoreSnapshot;
  private persistPath: string;
  private tokenSecret: string;

  constructor(persistPath: string, tokenSecret: string) {
    this.persistPath = persistPath;
    this.tokenSecret = tokenSecret;
    this.data = {
      usersByEmail: {},
      orders: {},
      products: {},
      categories: {},
      brands: {},
      coupons: {},
      reviews: [],
      settings: null,
    };
    if (fs.existsSync(this.persistPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.persistPath, 'utf8')) as Partial<AuthStoreSnapshot>;
        this.data = {
          usersByEmail: parsed.usersByEmail || {},
          orders: parsed.orders || {},
          products: parsed.products || {},
          categories: parsed.categories || {},
          brands: parsed.brands || {},
          coupons: parsed.coupons || {},
          reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
          settings: parsed.settings || null,
        };
      } catch {
        // Ignore corrupted file
      }
    }
  }

  private persist(): void {
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmp = `${this.persistPath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.persistPath);
    } catch {
      // Non-fatal
    }
  }

  public issueToken(user: { uid: string; email: string; name: string; role: UserRole }): string {
    const payload = {
      uid: user.uid,
      email: user.email,
      name: user.name,
      role: user.role,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', this.tokenSecret).update(encoded).digest('base64url');
    return `srv.${encoded}.${sig}`;
  }

  public verifyToken(token: string): { uid: string; email: string; name: string; role: UserRole } | null {
    if (!token.startsWith('srv.')) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [, encoded, sig] = parts;
    const expected = crypto.createHmac('sha256', this.tokenSecret).update(encoded).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    try {
      const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
        uid: string;
        email: string;
        name: string;
        role: UserRole;
        exp: number;
      };
      if (!parsed.exp || parsed.exp < Date.now()) return null;
      return { uid: parsed.uid, email: parsed.email, name: parsed.name, role: parsed.role };
    } catch {
      return null;
    }
  }

  public hasSellerClaimed(): boolean {
    return Boolean(this.data.usersByEmail[ADMIN_EMAIL]);
  }

  public registerUser(params: { name: string; email: string; password: string }): {
    user: Omit<ServerUserRecord, 'passwordHash'>;
    token: string;
  } {
    const email = normalizeEmail(params.email);
    if (!email || !email.includes('@')) {
      throw new Error('Informe um e-mail válido.');
    }
    if (!params.password || params.password.length < 6) {
      throw new Error('A senha deve ter pelo menos 6 caracteres.');
    }
    if (this.data.usersByEmail[email]) {
      throw new Error('Conta já logada ou cadastrada neste site. Use a aba "Entrar".');
    }

    const isSellerEmail = email === ADMIN_EMAIL;
    const role: UserRole = isSellerEmail ? 'admin' : 'customer';
    const uid = `srv_${crypto.createHash('sha256').update(email).digest('hex').slice(0, 20)}`;
    const now = Date.now();

    const record: ServerUserRecord = {
      uid,
      name: params.name.trim().slice(0, 120) || email.split('@')[0],
      email,
      role,
      passwordHash: hashPassword(params.password),
      phone: '',
      cpf: '',
      addresses: [],
      createdAtMs: now,
      updatedAtMs: now,
    };

    this.data.usersByEmail[email] = record;
    this.persist();

    const token = this.issueToken({
      uid: record.uid,
      email: record.email,
      name: record.name,
      role: record.role,
    });

    const { passwordHash: _omit, ...safeUser } = record;
    return { user: safeUser, token };
  }

  public loginUser(params: { email: string; password: string }): {
    user: Omit<ServerUserRecord, 'passwordHash'>;
    token: string;
  } {
    const email = normalizeEmail(params.email);
    const envAdminPass = process.env.SELLER_ADMIN_PASSCODE;

    // Se for o e-mail do administrador e houver variável de ambiente configurada
    if (email === ADMIN_EMAIL && envAdminPass && envAdminPass.length >= 6) {
      const a = Buffer.from(params.password);
      const b = Buffer.from(envAdminPass);
      const matchesEnv = a.length === b.length && crypto.timingSafeEqual(a, b);
      if (matchesEnv) {
        let rec = this.data.usersByEmail[email];
        if (!rec) {
          rec = {
            uid: `srv_${crypto.createHash('sha256').update(email).digest('hex').slice(0, 20)}`,
            name: 'Administrador Passo Urbano',
            email,
            role: 'admin',
            passwordHash: hashPassword(params.password),
            phone: '',
            cpf: '',
            addresses: [],
            createdAtMs: Date.now(),
            updatedAtMs: Date.now(),
          };
          this.data.usersByEmail[email] = rec;
          this.persist();
        }
        const token = this.issueToken({ uid: rec.uid, email: rec.email, name: rec.name, role: 'admin' });
        const { passwordHash: _omit, ...safeUser } = rec;
        return { user: safeUser, token };
      }
      throw new Error('Senha incorreta.');
    }

    const existing = this.data.usersByEmail[email];
    if (!existing) {
      if (email === ADMIN_EMAIL) {
        throw new Error('SELLER_NOT_CLAIMED');
      }
      throw new Error('Conta não encontrada. Clique em "Criar conta" para se cadastrar.');
    }

    if (!verifyPassword(params.password, existing.passwordHash)) {
      throw new Error('E-mail ou senha incorretos.');
    }

    const token = this.issueToken({
      uid: existing.uid,
      email: existing.email,
      name: existing.name,
      role: existing.role,
    });
    const { passwordHash: _omit, ...safeUser } = existing;
    return { user: safeUser, token };
  }

  public getUserByEmail(email: string): Omit<ServerUserRecord, 'passwordHash'> | null {
    const rec = this.data.usersByEmail[normalizeEmail(email)];
    if (!rec) return null;
    const { passwordHash: _omit, ...safe } = rec;
    return safe;
  }

  public updateProfile(email: string, updates: { name: string; phone: string; cpf: string; addresses: Address[] }) {
    const norm = normalizeEmail(email);
    const rec = this.data.usersByEmail[norm];
    if (!rec) throw new Error('Usuário não encontrado.');
    rec.name = updates.name.trim().slice(0, 120) || rec.name;
    rec.phone = updates.phone.trim().slice(0, 30);
    rec.cpf = updates.cpf.trim().slice(0, 20);
    rec.addresses = Array.isArray(updates.addresses) ? updates.addresses.slice(0, 10) : rec.addresses;
    rec.updatedAtMs = Date.now();
    this.persist();
    const { passwordHash: _omit, ...safe } = rec;
    return safe;
  }

  public changePassword(email: string, currentPassword: string, newPassword: string): void {
    const norm = normalizeEmail(email);
    const rec = this.data.usersByEmail[norm];
    if (!rec) {
      throw new Error('Usuário não encontrado.');
    }
    if (!verifyPassword(currentPassword, rec.passwordHash)) {
      throw new Error('Senha atual incorreta.');
    }
    if (!newPassword || newPassword.length < 6) {
      throw new Error('A nova senha deve ter pelo menos 6 caracteres.');
    }
    rec.passwordHash = hashPassword(newPassword);
    rec.updatedAtMs = Date.now();
    this.persist();
  }

  public listAllUsers(): Array<Omit<ServerUserRecord, 'passwordHash'>> {
    return Object.values(this.data.usersByEmail).map(({ passwordHash: _omit, ...safe }) => safe);
  }

  public saveOrder(order: Order): Order {
    this.data.orders[order.id] = order;
    this.persist();
    return order;
  }

  public listOrders(userId?: string): Order[] {
    const all = Object.values(this.data.orders);
    const filtered = userId ? all.filter((o) => o.userId === userId) : all;
    return filtered.sort(
      (a, b) => (b.statusHistory?.[0]?.timestampMs || 0) - (a.statusHistory?.[0]?.timestampMs || 0)
    );
  }

  public getOrder(orderId: string): Order | undefined {
    return this.data.orders[orderId];
  }

  public saveProduct(product: Product): Product {
    this.data.products[product.id] = product;
    this.persist();
    return product;
  }

  public deleteProduct(productId: string): void {
    delete this.data.products[productId];
    this.persist();
  }

  public listProducts(): Product[] {
    return Object.values(this.data.products);
  }

  public saveSettings(settings: StoreSettings): StoreSettings {
    this.data.settings = settings;
    this.persist();
    return settings;
  }

  public getSettings(): StoreSettings | null {
    return this.data.settings;
  }

  public saveCategory(cat: Category): Category {
    this.data.categories[cat.id] = cat;
    this.persist();
    return cat;
  }

  public deleteCategory(categoryId: string): void {
    delete this.data.categories[categoryId];
    this.persist();
  }

  public listCategories(): Category[] {
    return Object.values(this.data.categories).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  public saveBrand(brand: Brand): Brand {
    this.data.brands[brand.id] = brand;
    this.persist();
    return brand;
  }

  public deleteBrand(brandId: string): void {
    delete this.data.brands[brandId];
    this.persist();
  }

  public listBrands(): Brand[] {
    return Object.values(this.data.brands);
  }

  public saveCoupon(coupon: Coupon): Coupon {
    this.data.coupons[coupon.id] = coupon;
    this.persist();
    return coupon;
  }

  public deleteCoupon(couponId: string): void {
    delete this.data.coupons[couponId];
    this.persist();
  }

  public listCoupons(): Coupon[] {
    return Object.values(this.data.coupons);
  }

  public saveReview(review: Review): Review {
    this.data.reviews.unshift(review);
    if (this.data.reviews.length > 500) this.data.reviews.length = 500;
    this.persist();
    return review;
  }

  public listReviews(): Review[] {
    return [...this.data.reviews];
  }
}
