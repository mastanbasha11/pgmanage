/**
 * In-app Razorpay checkout, Expo-friendly (no bare native module): a full-screen
 * modal WebView that runs Razorpay's hosted checkout.js against a server-created
 * order, then posts the result back to RN. The backend webhook is the source of
 * truth, so even if the modal is closed after paying, the payment still lands.
 */
import { useMemo } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

import { colors, space } from '../lib/theme';

export interface CheckoutOrder {
  orderId: string;
  keyId: string;
  amountPaise: number;
  name: string;
  description: string;
  prefillName?: string;
  prefillContact?: string;
}

export interface CheckoutResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/** JSON.stringify keeps every value safely quoted/escaped inside the HTML. */
function buildHtml(o: CheckoutOrder): string {
  const opts = {
    key: o.keyId,
    order_id: o.orderId,
    amount: o.amountPaise,
    currency: 'INR',
    name: o.name,
    description: o.description,
    prefill: { name: o.prefillName ?? '', contact: o.prefillContact ?? '' },
    theme: { color: '#1C443A' },
  };
  return `<!DOCTYPE html><html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
    <style>html,body{margin:0;height:100%;background:#F4F7F5;font-family:system-ui}</style>
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script></head>
    <body><script>
      function post(m){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
      try {
        var options = ${JSON.stringify(opts)};
        options.handler = function(r){ post({ type:'success', payload:r }); };
        options.modal = { ondismiss: function(){ post({ type:'dismiss' }); }, escape:false, backdropclose:false };
        var rzp = new Razorpay(options);
        rzp.on('payment.failed', function(r){ post({ type:'failed', error:(r.error&&r.error.description)||'Payment failed' }); });
        rzp.open();
      } catch (e) { post({ type:'failed', error:String(e) }); }
    </script></body></html>`;
}

export function RazorpayCheckout({
  order,
  onSuccess,
  onClose,
  onFailure,
}: {
  order: CheckoutOrder | null;
  onSuccess: (r: CheckoutResult) => void;
  onClose: () => void;
  onFailure?: (msg: string) => void;
}) {
  const html = useMemo(() => (order ? buildHtml(order) : ''), [order]);

  function handleMessage(e: WebViewMessageEvent) {
    let msg: { type: string; payload?: CheckoutResult; error?: string };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'success' && msg.payload) {
      onSuccess({
        razorpay_order_id: msg.payload.razorpay_order_id,
        razorpay_payment_id: msg.payload.razorpay_payment_id,
        razorpay_signature: msg.payload.razorpay_signature,
      });
    } else if (msg.type === 'failed') {
      onFailure?.(msg.error ?? 'Payment failed');
      onClose();
    } else if (msg.type === 'dismiss') {
      onClose();
    }
  }

  return (
    <Modal visible={!!order} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={styles.wrap}>
        <View style={styles.bar}>
          <TouchableOpacity onPress={onClose} style={styles.close} hitSlop={10}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Secure payment</Text>
          <View style={{ width: 22 }} />
        </View>
        {order ? (
          <WebView
            originWhitelist={['*']}
            source={{ html }}
            javaScriptEnabled
            domStorageEnabled
            onMessage={handleMessage}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.forest} />
              </View>
            )}
            style={{ flex: 1, backgroundColor: colors.bg }}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.xxl,
    paddingBottom: space.md,
    paddingHorizontal: space.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  close: { width: 22, alignItems: 'flex-start' },
  title: { fontSize: 15, fontWeight: '800', color: colors.text },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
