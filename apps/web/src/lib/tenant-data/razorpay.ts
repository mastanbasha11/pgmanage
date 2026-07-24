/**
 * Razorpay Checkout loader for the tenant portal.
 *
 * checkout.js is loaded on demand (not in index.html) so tenants whose PG hasn't
 * enabled online payments never fetch it. The script is external, so the site
 * CSP must allow it — see the go-live checklist:
 *   script-src  https://checkout.razorpay.com
 *   frame-src   https://api.razorpay.com https://checkout.razorpay.com
 *   connect-src https://*.razorpay.com  (lumberjack/analytics)
 */

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

interface RazorpayInstance {
  open: () => void;
}
interface RazorpayCtor {
  new (options: RazorpayOptions): RazorpayInstance;
}
type WindowWithRazorpay = Window & { Razorpay?: RazorpayCtor };

export interface RazorpayHandlerResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number; // paise
  currency: 'INR';
  name: string;
  description?: string;
  prefill?: { name?: string; contact?: string; email?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (resp: RazorpayHandlerResponse) => void;
  modal?: { ondismiss?: () => void };
}

let loadPromise: Promise<boolean> | null = null;

export function loadRazorpayCheckout(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if ((window as WindowWithRazorpay).Razorpay) return Promise.resolve(true);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<boolean>((resolve) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      loadPromise = null; // allow a retry on the next attempt
      resolve(false);
    };
    document.body.appendChild(script);
  });
  return loadPromise;
}

export async function openRazorpayCheckout(options: RazorpayOptions): Promise<void> {
  const ok = await loadRazorpayCheckout();
  const ctor = (window as WindowWithRazorpay).Razorpay;
  if (!ok || !ctor) {
    throw new Error('Could not load the payment window. Check your connection and try again.');
  }
  new ctor(options).open();
}
