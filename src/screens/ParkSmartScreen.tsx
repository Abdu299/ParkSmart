import { useCallback, useEffect, useRef } from 'react';
import { BackHandler, View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { useDesignBridge } from '../design/useBridge';

const document = require('../design/document.json') as { html: string };
// Keep the source stable when navigation changes the status bar.
const source = { html: document.html, baseUrl: 'https://parksmart.local/' };

export default function ParkSmartScreen() {
  const web = useRef<WebView<object>>(null);
  const send = useCallback((packet: unknown) => {
    const json = JSON.stringify(packet).replace(/</g, '\\u003c');
    web.current?.injectJavaScript(`window.ParkSmartNative&&window.ParkSmartNative.receive(${json});true;`);
  }, []);
  const { handle, screen, activeScreen, activeTheme } = useDesignBridge(send);
  const dark = activeTheme === 'dark';
  const background = dark ? '#101820' : '#ffffff';
  const darkHeader = dark || (activeScreen !== 'home' && activeScreen !== 'welcome');

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (['home', 'welcome'].includes(screen.current)) return false;
      send({ type: 'back' });
      return true;
    });
    return () => sub.remove();
  }, [screen, send]);

  return (
    <SafeAreaView
      style={[styles.fill, { backgroundColor: dark ? (activeScreen === 'home' ? '#101820' : '#101f2c') : darkHeader ? '#043b52' : '#ffffff' }]}
      edges={['top']}
    >
      <StatusBar style={darkHeader ? 'light' : 'dark'} />
      <SafeAreaView style={[styles.content, { backgroundColor: background }]} edges={['bottom', 'left', 'right']}>
        <WebView<object>
          ref={web}
          style={[styles.content, { backgroundColor: background }]}
          source={source}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          bounces={false}
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          startInLoadingState
          renderLoading={() => (
            <View style={[styles.loading, { backgroundColor: background }]}><ActivityIndicator color={dark ? "#8bb9ff" : "#043b52"} /></View>
          )}
          onMessage={event => {
            try {
              const value = JSON.parse(event.nativeEvent.data);
              if (value && typeof value === 'object') void handle(value);
            } catch {}
          }}
          onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url.startsWith('https://parksmart.local/')}
          allowsInlineMediaPlayback
          setSupportMultipleWindows={false}
        />
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flex: 1, backgroundColor: '#ffffff' },
  loading: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
});
