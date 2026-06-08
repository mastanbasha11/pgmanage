/**
 * Top-level error boundary.
 *
 * Wraps the whole app at the root layout so any thrown error in render
 * shows up as a readable message on the device. Without this, a JS error
 * during cold boot silently closes the app on Android and you can only
 * see what happened through `adb logcat` — painful when sideloading APKs
 * to a phone with no dev tools.
 *
 * Renders the message + the first ~40 lines of the stack, plus a Retry
 * button that re-mounts the children (resets the boundary's state).
 */
import { Component, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Also push to console.error so adb logcat picks it up if a tester
    // does happen to have logcat attached.
    // eslint-disable-next-line no-console
    console.error('PGManage app crashed:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    const e = this.state.error;
    return (
      <View style={styles.container}>
        <Text style={styles.title}>⚠️ PGManage crashed</Text>
        <Text style={styles.subtitle}>{e.name}: {e.message}</Text>

        <ScrollView style={styles.stackBox} contentContainerStyle={{ paddingBottom: 12 }}>
          <Text selectable style={styles.stack}>
            {e.stack ?? '(no stack)'}
          </Text>
        </ScrollView>

        <Pressable onPress={this.reset} style={styles.btn}>
          <Text style={styles.btnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: 16,
    paddingTop: 64,
  },
  title: { color: '#FECACA', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: '#FCA5A5', fontSize: 14, marginBottom: 16 },
  stackBox: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  stack: { color: '#E5E7EB', fontFamily: 'monospace', fontSize: 12 },
  btn: {
    marginTop: 12,
    backgroundColor: '#0D9488',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  btnText: { color: 'white', fontWeight: '700', fontSize: 15 },
});
