export type UserRole = 'customer' | 'seller' | 'admin';

export type OrderStatus =
  | 'aguardando_pagamento'
  | 'pagamento_aprovado'
  | 'em_preparacao'
  | 'enviado'
  | 'entregue'
  | 'cancelado';

export type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';

export type ReservationStatus = 'active' | 'confirmed' | 'expired' | 'released' | 'cancelled';

export interface Address {
  id: string;
  label: string;
  recipient: string;
  cep: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  isDefault?: boolean;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  totalOrders?: number;
  totalSpent?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserPrivateInfo {
  uid: string;
  phone?: string;
  cpf?: string;
  addresses: Address[];
  updatedAt?: unknown;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  active: boolean;
  sortOrder?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  description?: string;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Product {
  id: string;
  name: string;
  brandId: string;
  brandName: string;
  model: string;
  description: string;
  originalPrice: number;
  promoPrice?: number | null;
  categoryId: string;
  categoryName: string;
  sku: string;
  images: string[];
  videoUrl?: string | null;
  colors: string[];
  sizes: string[];
  featured?: boolean;
  bestSeller?: boolean;
  isNew?: boolean;
  onSale?: boolean;
  active: boolean;
  soldCount?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface InventoryVariant {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  color: string;
  size: string;
  availableStock: number;
  reservedStock: number;
  soldStock: number;
  lowStockThreshold?: number;
  updatedAt?: unknown;
}

export interface StockMovement {
  id: string;
  variantId: string;
  productId: string;
  sku: string;
  color?: string;
  size?: string;
  type: 'entry' | 'exit' | 'adjustment' | 'reserve' | 'release' | 'confirm';
  quantityDelta: number;
  previousAvailable?: number;
  newAvailable?: number;
  previousReserved?: number;
  newReserved?: number;
  reason: string;
  actorUid: string;
  operationId: string;
  createdAt?: unknown;
}

export interface ReservationItem {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
  image?: string;
}

export interface Reservation {
  id: string;
  operationId: string;
  idempotencyKey: string;
  userId: string;
  status: ReservationStatus;
  items: ReservationItem[];
  totalAmount: number;
  expiresAtMs: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface OrderStatusHistoryEntry {
  status: OrderStatus;
  note: string;
  actor: string;
  timestampMs: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  reservationId: string;
  operationId: string;
  idempotencyKey: string;
  items: ReservationItem[];
  subtotal: number;
  discountCode?: string;
  discountAmount?: number;
  shippingCost: number;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  paymentProviderId?: string;
  lastPaymentEventId?: string;
  status: OrderStatus;
  shippingAddress: Address;
  trackingCode?: string | null;
  statusHistory: OrderStatusHistoryEntry[];
  cancellationRequested?: boolean;
  cancellationReason?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PaymentEvent {
  id: string;
  providerEventId: string;
  orderId: string;
  reservationId: string;
  userId: string;
  status: string;
  amount: number;
  verified: boolean;
  createdAt?: unknown;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  verifiedPurchase?: boolean;
  createdAt?: unknown;
}

export interface Coupon {
  id: string;
  code: string;
  discountPercent: number;
  minSubtotal: number;
  active: boolean;
  createdAt?: unknown;
}

export interface StorageFileRecord {
  id: string;
  path: string;
  name: string;
  mediaType: 'image' | 'video' | 'banner' | 'logo';
  mimeType: string;
  sizeBytes: number;
  url: string;
  productId?: string;
  uploadedBy: string;
  createdAt?: unknown;
}

export interface StoreSettings {
  storeName: string;
  logoUrl?: string;
  description?: string;
  phone?: string;
  whatsapp?: string;
  email: string;
  address?: string;
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  shippingInfo?: string;
  exchangePolicy?: string;
  privacyPolicy?: string;
  cnpj?: string;
  legalName?: string;
  storageLimitBytes: number;
  bannerTitle?: string;
  bannerSubtitle?: string;
  bannerImageUrl?: string;
  updatedAt?: unknown;
}

export interface AdminLog {
  id: string;
  actorUid: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt?: unknown;
}

export interface CartItem {
  variantId: string;
  productId: string;
  productName: string;
  brandName: string;
  sku: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
  image: string;
}
