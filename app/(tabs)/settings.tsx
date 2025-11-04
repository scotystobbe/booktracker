import { CSVManager } from '@/components/CSVManager';
import { PlexOAuth } from '@/components/PlexOAuth';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useBooks } from '@/context/BookContext';
import { PlexAuthConfig, PlexLibrary, plexService } from '@/services/PlexService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

type ScreenState = 'main' | 'csvManager';

const PlexLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" id="mdi-plex" viewBox="0 0 24 24"><path fill="white" d="M4,2C2.89,2 2,2.89 2,4V20C2,21.11 2.89,22 4,22H20C21.11,22 22,21.11 22,20V4C22,2.89 21.11,2 20,2H4M8.56,6H12.06L15.5,12L12.06,18H8.56L12,12L8.56,6Z" /></svg>`;

export default function SettingsScreen() {
  const [currentScreen, setCurrentScreen] = useState<ScreenState>('main');
  const [downloadingImages, setDownloadingImages] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ 
    current: 0, 
    total: 0, 
    currentBook: '', 
    failedBooks: [] as string[] 
  });
  const [clearing, setClearing] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [calculatorData, setCalculatorData] = useState({
    speed1: '2.0',
    percent1: '35',
    speed2: '1.5',
    percent2: '50',
    speed3: '1.75',
    percent3: '15'
  });
  const [showPlexOAuth, setShowPlexOAuth] = useState(false);
  const [plexAuthConfig, setPlexAuthConfig] = useState<PlexAuthConfig | null>(null);
  const [selectedLibrary, setSelectedLibrary] = useState<PlexLibrary | null>(null);
  const [plexAdvancedExpanded, setPlexAdvancedExpanded] = useState(false);
  const [plexServerUrl, setPlexServerUrl] = useState('');
  const [plexToken, setPlexToken] = useState('');
  const { downloadMissingImages, clearAllBooks, getUserData, setUserData, updateBook, books } = useBooks();
  const insets = useSafeAreaInsets();

  // Load calculator data and Plex auth on component mount
  React.useEffect(() => {
    const loadCalculatorData = () => {
      const savedData = {
        speed1: getUserData('calc_speed1') || '2.0',
        percent1: getUserData('calc_percent1') || '35',
        speed2: getUserData('calc_speed2') || '1.5',
        percent2: getUserData('calc_percent2') || '50',
        speed3: getUserData('calc_speed3') || '1.75',
        percent3: getUserData('calc_percent3') || '15'
      };
      setCalculatorData(savedData);
    };
    
    const loadPlexAuth = async () => {
      try {
        console.log('Loading Plex auth from AsyncStorage...');
        const authData = await AsyncStorage.getItem('plex_auth');
        const libraryData = await AsyncStorage.getItem('plex_library');
        const serverUrlData = await AsyncStorage.getItem('plex_server_url');
        const tokenData = await AsyncStorage.getItem('plex_token');
        
        console.log('Raw auth data:', authData);
        console.log('Raw library data:', libraryData);
        console.log('Auth data found:', !!authData);
        console.log('Library data found:', !!libraryData);
        
        // Load stored credentials
        if (serverUrlData) {
          setPlexServerUrl(serverUrlData);
        }
        if (tokenData) {
          setPlexToken(tokenData);
        }
        
        if (authData) {
          try {
            const auth = JSON.parse(authData);
            console.log('Parsed auth config:', { 
              token: auth.token ? auth.token.substring(0, 10) + '...' : 'no token',
              username: auth.username,
              serverUrl: auth.serverUrl 
            });
            
            // Validate the auth data
            if (!auth.token || !auth.serverUrl) {
              console.error('Invalid auth data - missing token or serverUrl');
              Alert.alert('Invalid Auth Data', 'Stored Plex authentication is incomplete. Please sign in again.');
              await AsyncStorage.removeItem('plex_auth');
              return;
            }
            
            setPlexAuthConfig(auth);
            plexService.setAuthConfig(auth);
            console.log('Auth config loaded and set successfully');
          } catch (parseError) {
            console.error('Failed to parse auth data:', parseError);
            Alert.alert('Auth Data Error', 'Failed to parse stored Plex authentication. Please sign in again.');
            await AsyncStorage.removeItem('plex_auth');
          }
        }
        
        if (libraryData) {
          try {
            const library = JSON.parse(libraryData);
            console.log('Parsed library:', { id: library.id, name: library.name });
            setSelectedLibrary(library);
            plexService.setSelectedLibrary(library.id);
            console.log('Library loaded and set successfully');
          } catch (parseError) {
            console.error('Failed to parse library data:', parseError);
            await AsyncStorage.removeItem('plex_library');
          }
        }
      } catch (error) {
        console.error('Failed to load Plex auth:', error);
        Alert.alert('Load Error', `Failed to load Plex authentication: ${error.message}`);
      }
    };
    
    loadCalculatorData();
    loadPlexAuth();
  }, [getUserData]);

  const calculateThirdPercent = () => {
    const percent1 = parseFloat(calculatorData.percent1) || 0;
    const percent2 = parseFloat(calculatorData.percent2) || 0;
    const remaining = 100 - percent1 - percent2;
    return Math.max(0, remaining);
  };

  const getTotalPercent = () => {
    const percent1 = parseFloat(calculatorData.percent1) || 0;
    const percent2 = parseFloat(calculatorData.percent2) || 0;
    const percent3 = parseFloat(calculatorData.percent3) || 0;
    return percent1 + percent2 + percent3;
  };

  const formatReadingSpeed = (speed: number): string => {
    // If it's a whole number, show no decimal places
    if (speed % 1 === 0) {
      return speed.toString();
    }
    
    // If it's a perfect tenth (e.g., 1.8, 1.9), show one decimal place
    const roundedToOneDecimal = Math.round(speed * 10) / 10;
    if (Math.abs(speed - roundedToOneDecimal) < 0.001) {
      return speed.toFixed(1);
    }
    
    // Otherwise, show up to 2 decimal places
    return speed.toFixed(2);
  };

  const calculateWeightedAverage = () => {
    const speeds = [
      parseFloat(calculatorData.speed1) || 0,
      parseFloat(calculatorData.speed2) || 0,
      parseFloat(calculatorData.speed3) || 0
    ];
    const percents = [
      parseFloat(calculatorData.percent1) || 0,
      parseFloat(calculatorData.percent2) || 0,
      parseFloat(calculatorData.percent3) || 0
    ];
    
    const totalPercent = percents.reduce((sum, p) => sum + p, 0);
    if (totalPercent === 0) return 0;
    
    const weightedSum = speeds.reduce((sum, speed, i) => sum + (speed * percents[i]), 0);
    return weightedSum / totalPercent;
  };

  const handleInputChange = (field: string, value: string) => {
    setCalculatorData(prev => {
      const newData = { ...prev, [field]: value };
      
      // Auto-calculate third percent if first two are changed
      if (field === 'percent1' || field === 'percent2') {
        const percent1 = parseFloat(newData.percent1) || 0;
        const percent2 = parseFloat(newData.percent2) || 0;
        const remaining = 100 - percent1 - percent2;
        newData.percent3 = Math.max(0, remaining).toString();
      }
      
      return newData;
    });
  };

  const handleInputFocus = (field: string) => {
    setCalculatorData(prev => ({
      ...prev,
      [field]: ''
    }));
  };

  const saveCalculatorData = async () => {
    await Promise.all([
      setUserData('calc_speed1', calculatorData.speed1),
      setUserData('calc_percent1', calculatorData.percent1),
      setUserData('calc_speed2', calculatorData.speed2),
      setUserData('calc_percent2', calculatorData.percent2),
      setUserData('calc_speed3', calculatorData.speed3),
      setUserData('calc_percent3', calculatorData.percent3)
    ]);
  };

  const getCurrentBook = () => {
    if (books.length === 0) return null;
    
    // Find books that are not finished (percent_complete < 100)
    const activeBooks = books.filter(book => book.percent_complete < 100);
    if (activeBooks.length === 0) return null; // No current book if all are finished
    
    // Return the book with highest progress, or most recently started if tied
    return activeBooks.reduce((current, book) => {
      if (book.percent_complete > current.percent_complete) return book;
      if (book.percent_complete === current.percent_complete) {
        return new Date(book.start_date) > new Date(current.start_date) ? book : current;
      }
      return current;
    });
  };

  const syncToCurrentBook = async () => {
    const currentBook = getCurrentBook();
    if (!currentBook) {
      Alert.alert('No Current Book', 'There is no active book to sync the reading speed to.');
      return;
    }

    if (getTotalPercent() > 100) {
      Alert.alert('Invalid Percentages', 'Total percentage cannot exceed 100%. Please adjust your values.');
      return;
    }

    const weightedAverage = calculateWeightedAverage();
    if (weightedAverage <= 0) {
      Alert.alert('Invalid Calculation', 'Please enter valid speed and percentage values.');
      return;
    }

    try {
      await updateBook(currentBook.id, { reading_speed: weightedAverage });
      Alert.alert(
        'Speed Updated', 
        `Reading speed for "${currentBook.title}" has been updated to ${formatReadingSpeed(weightedAverage)}x.`
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to update reading speed. Please try again.');
    }
  };

  const handleOpenCSVManager = () => {
    setCurrentScreen('csvManager');
  };

  const handleBackToMain = () => {
    setCurrentScreen('main');
  };

  const handleDownloadImages = async () => {
    setDownloadingImages(true);
    setDownloadProgress({ current: 0, total: 0, currentBook: '', failedBooks: [] });
    
    try {
      const result = await downloadMissingImages((current, total, currentBook, failedBooks) => {
        setDownloadProgress({ current, total, currentBook, failedBooks });
      });
      
      if (result.failedBooks.length > 0) {
        Alert.alert(
          'Download Complete with Issues',
          `Successfully downloaded ${result.completed - result.failedBooks.length} images.\n\n${result.failedBooks.length} images failed to download:\n\n${result.failedBooks.slice(0, 5).join('\n')}${result.failedBooks.length > 5 ? `\n...and ${result.failedBooks.length - 5} more` : ''}\n\nYou can update the cover URLs for these books and try again.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Success', 'All missing images have been downloaded and stored locally.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to download images. Please try again.');
    } finally {
      setDownloadingImages(false);
      setDownloadProgress({ current: 0, total: 0, currentBook: '', failedBooks: [] });
    }
  };



  const handleClearAllBooks = async () => {
    Alert.alert(
      'Clear All Books',
      'This will permanently delete ALL books from your database. This action cannot be undone. Are you absolutely sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All Books',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              await clearAllBooks();
              Alert.alert('Success', 'All books have been cleared from the database.');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear books. Please try again.');
            } finally {
              setClearing(false);
            }
          }
        }
      ]
    );
  };

  const handleClearPlexCache = () => {
    Alert.alert(
      'Clear Plex Cache',
      'This will clear any cached Plex data and force fresh lookups for book information. This may help resolve issues with incorrect cover art or other data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Cache',
          onPress: () => {
            try {
              plexService.clearCache();
              Alert.alert('Success', 'Plex cache has been cleared. New searches will fetch fresh data.');
            } catch (error) {
              console.error('Failed to clear Plex cache:', error);
              Alert.alert('Error', 'Failed to clear cache. Please try again.');
            }
          }
        }
      ]
    );
  };

  const handleClearAllPlexData = () => {
    Alert.alert(
      'Clear All Plex Data',
      'This will completely remove all stored Plex authentication and library data. You will need to sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All Data',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('plex_auth');
              await AsyncStorage.removeItem('plex_library');
              setPlexAuthConfig(null);
              setSelectedLibrary(null);
              plexService.setAuthConfig(null);
              plexService.setSelectedLibrary(null);
              plexService.clearCache();
              Alert.alert('Success', 'All Plex data has been cleared. Please sign in again.');
            } catch (error) {
              console.error('Failed to clear Plex data:', error);
              Alert.alert('Error', 'Failed to clear data. Please try again.');
            }
          }
        }
      ]
    );
  };

  const handleTestStorage = async () => {
    try {
      console.log('Testing Plex auth storage...');
      
      // Create test auth data
      const testAuth = {
        token: 'MATAYNaSPKEPzxy5fTzs',
        username: 'Test Server',
        email: 'test@plex.local',
        serverUrl: 'http://69.162.238.198:32433'
      };
      
      console.log('Test auth data:', testAuth);
      
      // Test storing auth data
      try {
        await AsyncStorage.setItem('plex_auth', JSON.stringify(testAuth));
        console.log('Auth data stored successfully');
        
        // Test retrieving auth data
        const retrieved = await AsyncStorage.getItem('plex_auth');
        console.log('Retrieved auth data:', retrieved);
        
        if (retrieved) {
          const parsed = JSON.parse(retrieved);
          console.log('Parsed auth data:', parsed);
          
          // Test setting in service
          plexService.setAuthConfig(parsed);
          const serviceAuth = plexService.getAuthConfig();
          console.log('Service auth config:', serviceAuth);
          
          Alert.alert(
            'Storage Test Results',
            `✅ Storage Test: PASSED\n\n` +
            `Stored: ${parsed.token.substring(0, 10)}...\n` +
            `Server: ${parsed.serverUrl}\n` +
            `Service: ${serviceAuth ? 'Loaded' : 'Failed'}\n\n` +
            `Storage is working correctly. The issue is likely in the authentication flow.`
          );
        } else {
          Alert.alert('Storage Test Failed', 'Could not retrieve stored auth data');
        }
        
        // Clean up test data
        await AsyncStorage.removeItem('plex_auth');
        
      } catch (storageError) {
        console.error('Storage test failed:', storageError);
        Alert.alert('Storage Test Failed', `Error: ${storageError.message}`);
      }
      
    } catch (error) {
      console.error('Storage test failed:', error);
      Alert.alert('Storage Test Failed', `Unexpected error: ${error.message}`);
    }
  };

  const handleDirectLogin = async () => {
    if (!plexServerUrl.trim() || !plexToken.trim()) {
      Alert.alert('Missing Information', 'Please enter both server URL and token.');
      return;
    }

    try {
      console.log('Logging in to Plex server...');
      console.log('Server URL:', plexServerUrl);
      console.log('Token:', plexToken.substring(0, 10) + '...');
      
      // Store credentials for future use
      await AsyncStorage.setItem('plex_server_url', plexServerUrl.trim());
      await AsyncStorage.setItem('plex_token', plexToken.trim());
      
      // Test connection to Plex server
      const response = await fetch(`${plexServerUrl.trim()}/`, {
        headers: {
          'X-Plex-Token': plexToken.trim(),
          'Accept': 'application/json',
        },
      });
      
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (response.ok) {
        const serverData = await response.json();
        console.log('Server data received:', serverData);
        
        const auth: PlexAuthConfig = {
          token: plexToken.trim(),
          username: serverData.friendlyName || 'Plex Server',
          email: 'server@plex.local',
          serverUrl: plexServerUrl.trim(),
        };
        
        // Store the authentication data
        await AsyncStorage.setItem('plex_auth', JSON.stringify(auth));
        setPlexAuthConfig(auth);
        plexService.setAuthConfig(auth);
        
        // Get available libraries from the server
        const libs = await plexService.getLibraries();
        console.log('Libraries fetched:', libs.length);
        
        Alert.alert(
          'Login Successful!',
          `Connected to Plex server "${auth.username}"\nFound ${libs.length} libraries\n\nCredentials saved for future use.`
        );
      } else {
        const errorText = await response.text();
        console.error('Server error response:', errorText);
        
        Alert.alert(
          'Login Failed',
          `Server returned ${response.status}: ${errorText}\n\nPlease check:\n• Server URL is correct\n• Token is valid\n• Server is accessible`
        );
      }
      
    } catch (error) {
      console.error('Login failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      Alert.alert(
        'Login Failed',
        `Error: ${errorMessage}\n\nThis usually means:\n• Server URL is incorrect\n• Token is invalid\n• Server is not accessible\n• Network connectivity issues`
      );
    }
  };

  const handleTestPlexConnection = async () => {
    try {
      console.log('Testing Plex connection...');
      
      // Test AsyncStorage functionality first
      const testKey = 'plex_test_key';
      const testValue = 'test_value_' + Date.now();
      
      try {
        await AsyncStorage.setItem(testKey, testValue);
        const retrieved = await AsyncStorage.getItem(testKey);
        await AsyncStorage.removeItem(testKey);
        
        if (retrieved !== testValue) {
          Alert.alert('AsyncStorage Issue', 'AsyncStorage is not working properly on this device. This explains why Plex authentication is not persisting.');
          return;
        }
      } catch (storageError) {
        Alert.alert('AsyncStorage Error', `AsyncStorage is not available: ${storageError.message}\n\nThis explains why Plex authentication is not persisting.`);
        return;
      }
      
      // Check AsyncStorage directly
      const storedAuth = await AsyncStorage.getItem('plex_auth');
      const storedLibrary = await AsyncStorage.getItem('plex_library');
      
      console.log('Stored auth data:', storedAuth);
      console.log('Stored library data:', storedLibrary);
      
      const authConfig = plexService.getAuthConfig();
      const selectedLibrary = plexService.getSelectedLibrary();
      
      console.log('Current auth config:', authConfig);
      console.log('Current selected library:', selectedLibrary);
      
      let debugInfo = `=== PLEX DEBUG INFO ===\n\n`;
      debugInfo += `AsyncStorage Test: PASSED\n`;
      debugInfo += `AsyncStorage Auth: ${storedAuth ? 'Found' : 'Missing'}\n`;
      debugInfo += `AsyncStorage Library: ${storedLibrary ? 'Found' : 'Missing'}\n`;
      debugInfo += `Service Auth Config: ${authConfig ? 'Found' : 'Missing'}\n`;
      debugInfo += `Service Library: ${selectedLibrary || 'None'}\n\n`;
      
      if (storedAuth) {
        try {
          const parsedAuth = JSON.parse(storedAuth);
          debugInfo += `Stored Token: ${parsedAuth.token ? parsedAuth.token.substring(0, 10) + '...' : 'Missing'}\n`;
          debugInfo += `Stored Server URL: ${parsedAuth.serverUrl || 'Not set'}\n`;
          debugInfo += `Stored Username: ${parsedAuth.username || 'Not set'}\n\n`;
        } catch (e) {
          debugInfo += `Error parsing stored auth: ${e.message}\n\n`;
        }
      }
      
      if (!authConfig) {
        Alert.alert('No Auth Config', debugInfo + '\nNo Plex authentication found. Please sign in to Plex first.');
        return;
      }
      
      debugInfo += `=== CONNECTION TEST ===\n\n`;
      debugInfo += `Testing connection to: ${authConfig.serverUrl}\n`;
      
      // Test the connection
      const libraries = await plexService.getLibraries();
      console.log('Libraries found:', libraries.length);
      
      debugInfo += `Connection: SUCCESS\n`;
      debugInfo += `Libraries Found: ${libraries.length}\n`;
      
      if (libraries.length > 0) {
        debugInfo += `\nAvailable Libraries:\n`;
        libraries.forEach((lib, index) => {
          debugInfo += `${index + 1}. ${lib.name} (${lib.type})\n`;
        });
      }
      
      Alert.alert('Connection Test Results', debugInfo);
    } catch (error) {
      console.error('Plex connection test failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      Alert.alert(
        'Connection Test Failed', 
        `Error: ${errorMessage}\n\nThis usually means:\n• Server URL is incorrect\n• Token is invalid\n• Server is not accessible\n• Network connectivity issues`
      );
    }
  };

  const handlePlexLogout = async () => {
    Alert.alert(
      'Sign Out of Plex',
      'This will remove your Plex authentication and clear stored data. You will need to sign in again to use Plex features.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('plex_auth');
              await AsyncStorage.removeItem('plex_library');
              setPlexAuthConfig(null);
              setSelectedLibrary(null);
              plexService.setAuthConfig(null);
              plexService.setSelectedLibrary(null);
              Alert.alert('Success', 'You have been signed out of Plex.');
            } catch (error) {
              console.error('Failed to sign out of Plex:', error);
              Alert.alert('Error', 'Failed to sign out. Please try again.');
            }
          }
        }
      ]
    );
  };

  if (currentScreen === 'csvManager') {
    return (
      <ThemedView style={styles.container}>
        <CSVManager onClose={handleBackToMain} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <ThemedText type="title" style={styles.title}>
          Settings
        </ThemedText>
      </ThemedView>
      
      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Data Management</ThemedText>
          <TouchableOpacity style={styles.settingButton} onPress={handleOpenCSVManager}>
            <ThemedView style={styles.settingButtonContent}>
              <IconSymbol name="table" size={20} color="#ECEDEE" style={styles.settingIcon} />
              <ThemedText style={styles.settingButtonText}>Import/Export Data</ThemedText>
            </ThemedView>
            <ThemedText style={styles.settingButtonSubtext}>
              Import books from CSV or export your data
            </ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.settingButton, downloadingImages && styles.settingButtonDisabled]} 
            onPress={handleDownloadImages}
            disabled={downloadingImages}
          >
            <ThemedView style={styles.settingButtonContent}>
              <IconSymbol 
                name={downloadingImages ? "arrow.clockwise" : "arrow.down.circle"} 
                size={20} 
                color="#ECEDEE" 
                style={styles.settingIcon} 
              />
              <ThemedText style={styles.settingButtonText}>
                {downloadingImages ? 'Downloading...' : 'Download Missing Images'}
              </ThemedText>
              {downloadingImages && <ActivityIndicator size="small" color="#50b042" style={styles.loadingIndicator} />}
            </ThemedView>
            
            {downloadingImages && downloadProgress.total > 0 && (
              <ThemedView style={styles.progressContainer}>
                <ThemedText style={styles.progressText}>
                  {downloadProgress.current} of {downloadProgress.total} images processed
                  {downloadProgress.failedBooks.length > 0 && (
                    <ThemedText style={styles.failedText}>
                      {' '}({downloadProgress.failedBooks.length} failed)
                    </ThemedText>
                  )}
                </ThemedText>
                {downloadProgress.currentBook && (
                  <ThemedText style={styles.currentBookText}>
                    Currently downloading: {downloadProgress.currentBook}
                  </ThemedText>
                )}
                <ThemedView style={styles.progressBar}>
                  <ThemedView 
                    style={[
                      styles.progressFill, 
                      { width: `${(downloadProgress.current / downloadProgress.total) * 100}%` }
                    ]} 
                  />
                </ThemedView>
              </ThemedView>
            )}
            
            <ThemedText style={styles.settingButtonSubtext}>
              {downloadingImages 
                ? 'Downloading and storing book covers locally...' 
                : 'Download and store book covers locally for offline viewing'
              }
            </ThemedText>
          </TouchableOpacity>
          
        </ThemedView>



        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Reading Tools</ThemedText>
          <TouchableOpacity style={styles.settingButton} onPress={() => setShowCalculator(true)}>
            <ThemedView style={styles.settingButtonContent}>
              <IconSymbol name="function" size={20} color="#ECEDEE" style={styles.settingIcon} />
              <ThemedText style={styles.settingButtonText}>Reading Speed Calculator</ThemedText>
            </ThemedView>
            <ThemedText style={styles.settingButtonSubtext}>
              Calculate weighted average reading speed for books with multiple speeds
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>Plex Integration</ThemedText>
          
          <TouchableOpacity 
            style={styles.settingButton} 
            onPress={() => setShowPlexOAuth(true)}
          >
            <ThemedView style={styles.settingButtonContent}>
              <SvgXml 
                xml={PlexLogoSvg} 
                width={20} 
                height={20}
                style={styles.settingIcon} 
              />
              <ThemedText style={styles.settingButtonText}>
                {plexAuthConfig ? 'Manage Plex Account' : 'Sign in to Plex'}
              </ThemedText>
            </ThemedView>
            <ThemedText style={styles.settingButtonSubtext}>
              {plexAuthConfig ? `Signed in as ${plexAuthConfig.username}` : 'Sign in to your Plex account for automatic book discovery'}
            </ThemedText>
          </TouchableOpacity>

          
          {plexAuthConfig && (
            <TouchableOpacity 
              style={styles.plexSignOutButton} 
              onPress={handlePlexLogout}
            >
              <ThemedText style={styles.plexSignOutText}>Sign Out</ThemedText>
            </TouchableOpacity>
          )}
        </ThemedView>

        <ThemedView style={styles.section}>
          <TouchableOpacity 
            style={styles.sectionHeader} 
            onPress={() => setAdvancedExpanded(!advancedExpanded)}
          >
            <ThemedText style={styles.sectionTitle}>Advanced</ThemedText>
            <IconSymbol 
              name={advancedExpanded ? "chevron.up" : "chevron.down"} 
              size={16} 
              color="#ECEDEE" 
              style={styles.chevronIcon} 
            />
          </TouchableOpacity>
          
          {advancedExpanded && (
            <TouchableOpacity 
              style={[styles.settingButton, clearing && styles.settingButtonDisabled]} 
              onPress={handleClearAllBooks}
              disabled={clearing}
            >
              <ThemedView style={styles.settingButtonContent}>
                <IconSymbol 
                  name={clearing ? "arrow.clockwise" : "trash"} 
                  size={20} 
                  color="#ECEDEE" 
                  style={styles.settingIcon} 
                />
                <ThemedText style={styles.settingButtonText}>
                  {clearing ? 'Clearing...' : 'Clear All Books'}
                </ThemedText>
                {clearing && <ActivityIndicator size="small" color="#50b042" style={styles.loadingIndicator} />}
              </ThemedView>
              <ThemedText style={styles.settingButtonSubtext}>
                Permanently delete all books from the database
              </ThemedText>
            </TouchableOpacity>
          )}
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText style={styles.sectionTitle}>About</ThemedText>
          <ThemedView style={styles.aboutItem}>
            <ThemedText style={styles.aboutLabel}>Version</ThemedText>
            <ThemedText style={styles.aboutValue}>1.1.0</ThemedText>
          </ThemedView>
          <ThemedView style={styles.aboutItem}>
            <ThemedText style={styles.aboutLabel}>App</ThemedText>
            <ThemedText style={styles.aboutValue}>BookTracker</ThemedText>
          </ThemedView>
        </ThemedView>
      </ScrollView>

      {/* Reading Speed Calculator Modal */}
      <Modal
        visible={showCalculator}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCalculator(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ThemedView style={styles.modalOverlay}>
            <KeyboardAvoidingView 
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.keyboardAvoidingView}
            >
              <ScrollView 
                contentContainerStyle={styles.modalScrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <TouchableWithoutFeedback onPress={() => {}}>
                  <ThemedView style={styles.modalContent}>
            <ThemedView style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Reading Speed Calculator</ThemedText>
              <TouchableOpacity onPress={() => setShowCalculator(false)}>
                <IconSymbol name="xmark" size={24} color="#ECEDEE" />
              </TouchableOpacity>
            </ThemedView>
            
            <ThemedText style={styles.modalSubtitle}>
              Calculate weighted average reading speed for books with multiple speeds
            </ThemedText>

            <ThemedView style={styles.calculatorContainer}>
              {/* Speed 1 */}
              <ThemedView style={styles.inputRow}>
                <ThemedView style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>Speed 1</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={calculatorData.speed1}
                    onChangeText={(text) => handleInputChange('speed1', text)}
                    onFocus={() => handleInputFocus('speed1')}
                    keyboardType="numeric"
                    placeholder="2.0"
                  />
                </ThemedView>
                <ThemedView style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>% of Book</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={calculatorData.percent1}
                    onChangeText={(text) => handleInputChange('percent1', text)}
                    onFocus={() => handleInputFocus('percent1')}
                    keyboardType="numeric"
                    placeholder="35"
                  />
                </ThemedView>
              </ThemedView>

              {/* Speed 2 */}
              <ThemedView style={styles.inputRow}>
                <ThemedView style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>Speed 2</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={calculatorData.speed2}
                    onChangeText={(text) => handleInputChange('speed2', text)}
                    onFocus={() => handleInputFocus('speed2')}
                    keyboardType="numeric"
                    placeholder="1.5"
                  />
                </ThemedView>
                <ThemedView style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>% of Book</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={calculatorData.percent2}
                    onChangeText={(text) => handleInputChange('percent2', text)}
                    onFocus={() => handleInputFocus('percent2')}
                    keyboardType="numeric"
                    placeholder="50"
                  />
                </ThemedView>
              </ThemedView>

              {/* Speed 3 */}
              <ThemedView style={styles.inputRow}>
                <ThemedView style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>Speed 3</ThemedText>
                  <TextInput
                    style={styles.input}
                    value={calculatorData.speed3}
                    onChangeText={(text) => handleInputChange('speed3', text)}
                    onFocus={() => handleInputFocus('speed3')}
                    keyboardType="numeric"
                    placeholder="1.75"
                  />
                </ThemedView>
                <ThemedView style={styles.inputGroup}>
                  <ThemedText style={styles.inputLabel}>% of Book</ThemedText>
                  <TextInput
                    style={[styles.input, styles.autoCalculatedInput]}
                    value={calculateThirdPercent().toString()}
                    editable={false}
                    keyboardType="numeric"
                    placeholder="Auto"
                  />
                </ThemedView>
              </ThemedView>

              {/* Validation Message */}
              {getTotalPercent() > 100 && (
                <ThemedView style={styles.validationContainer}>
                  <ThemedText style={styles.validationText}>
                    ⚠️ Total percentage exceeds 100% ({getTotalPercent().toFixed(0)}%)
                  </ThemedText>
                </ThemedView>
              )}

              {/* Result */}
              <ThemedView style={styles.resultContainer}>
                <ThemedText style={styles.resultLabel}>Weighted Average Speed:</ThemedText>
                <ThemedText style={styles.resultValue}>{formatReadingSpeed(calculateWeightedAverage())}x</ThemedText>
              </ThemedView>

              {/* Sync Button */}
              <TouchableOpacity 
                style={styles.syncButton} 
                onPress={syncToCurrentBook}
              >
                <IconSymbol name="arrow.clockwise" size={16} color="#ECEDEE" style={styles.syncIcon} />
                <ThemedText style={styles.syncButtonText}>Sync to Current Book</ThemedText>
              </TouchableOpacity>

              {/* Buttons */}
              <ThemedView style={styles.modalButtons}>
                <TouchableOpacity 
                  style={styles.modalButton} 
                  onPress={() => setShowCalculator(false)}
                >
                  <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.modalButton, styles.modalButtonPrimary]} 
                  onPress={async () => {
                    await saveCalculatorData();
                    setShowCalculator(false);
                  }}
                >
                  <ThemedText style={styles.modalButtonPrimaryText}>Save</ThemedText>
                </TouchableOpacity>
              </ThemedView>
            </ThemedView>
                  </ThemedView>
                </TouchableWithoutFeedback>
              </ScrollView>
            </KeyboardAvoidingView>
          </ThemedView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Plex OAuth Modal */}
      <PlexOAuth
        visible={showPlexOAuth}
        onClose={() => setShowPlexOAuth(false)}
        onSuccess={(authConfig, library) => {
          setPlexAuthConfig(authConfig);
          setSelectedLibrary(library || null);
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  title: {
    color: '#ECEDEE',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 100,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ECEDEE',
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  chevronIcon: {
    marginLeft: 8,
  },
  settingIcon: {
    marginRight: 12,
  },
  settingButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 12,
  },
  settingButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ECEDEE',
    marginBottom: 4,
  },
  settingButtonSubtext: {
    fontSize: 14,
    color: '#ECEDEE',
    opacity: 0.7,
  },
  settingButtonDisabled: {
    opacity: 0.6,
  },
  settingButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingIndicator: {
    marginLeft: 8,
  },
  progressContainer: {
    marginTop: 12,
    marginBottom: 8,
  },
  progressText: {
    fontSize: 14,
    color: '#ECEDEE',
    fontWeight: '500',
    marginBottom: 4,
  },
  failedText: {
    fontSize: 14,
    color: '#ff6b6b',
    fontWeight: '500',
  },
  currentBookText: {
    fontSize: 12,
    color: '#ECEDEE',
    opacity: 0.7,
    marginBottom: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#50b042',
    borderRadius: 2,
  },
  aboutItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  aboutLabel: {
    fontSize: 16,
    color: '#ECEDEE',
  },
  aboutValue: {
    fontSize: 16,
    color: '#ECEDEE',
    opacity: 0.7,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  keyboardAvoidingView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ECEDEE',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#ECEDEE',
    opacity: 0.7,
    marginBottom: 24,
  },
  calculatorContainer: {
    gap: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 14,
    color: '#ECEDEE',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#ECEDEE',
  },
  autoCalculatedInput: {
    backgroundColor: 'rgba(80, 176, 66, 0.1)',
    borderColor: 'rgba(80, 176, 66, 0.3)',
    color: '#50b042',
  },
  validationContainer: {
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 193, 7, 0.3)',
  },
  validationText: {
    fontSize: 14,
    color: '#ffc107',
    textAlign: 'center',
    fontWeight: '500',
  },
  resultContainer: {
    backgroundColor: 'rgba(80, 176, 66, 0.1)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(80, 176, 66, 0.3)',
  },
  resultLabel: {
    fontSize: 14,
    color: '#ECEDEE',
    opacity: 0.7,
    marginBottom: 4,
  },
  resultValue: {
    fontSize: 24,
    fontWeight: '600',
    color: '#50b042',
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  syncIcon: {
    marginRight: 8,
  },
  syncButtonText: {
    fontSize: 16,
    color: '#ECEDEE',
    fontWeight: '500',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: '#50b042',
    borderColor: '#50b042',
  },
  modalButtonText: {
    fontSize: 16,
    color: '#ECEDEE',
    fontWeight: '500',
  },
  modalButtonPrimaryText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  plexFormContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 12,
  },
  plexFormTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ECEDEE',
    marginBottom: 16,
  },
  plexFormField: {
    marginBottom: 12,
  },
  plexFormLabel: {
    fontSize: 14,
    color: '#ECEDEE',
    marginBottom: 8,
    fontWeight: '500',
  },
  plexFormInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#ECEDEE',
  },
  plexLoginButton: {
    backgroundColor: '#E5A00D',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  plexLoginButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  plexSignOutButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  plexSignOutText: {
    fontSize: 14,
    color: '#8E8E93',
  },
});
