import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { useEffect } from 'react';

import { BookProvider } from '@/context/BookContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { plexService } from '@/services/PlexService';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Automatically refresh Plex auth from storage on app load
  useEffect(() => {
    plexService.refreshAuthFromStorage().catch((error) => {
      // Silently fail - auth will be refreshed when needed
      console.log('Background auth refresh on app load:', error.message);
    });
  }, []);

  if (!loaded) {
    // Async font loading only occurs in development.
    return null;
  }

  // Force dark mode as default
  const effectiveColorScheme = 'dark';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BookProvider>
        <ThemeProvider value={effectiveColorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" />
          </Stack>
          <StatusBar style="light" />
        </ThemeProvider>
      </BookProvider>
    </GestureHandlerRootView>
  );
}
