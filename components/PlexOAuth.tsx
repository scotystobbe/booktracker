import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { PlexAuthConfig, PlexConnection, PlexLibrary, plexService } from '@/services/PlexService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  FlatList,
  Modal,
  StyleSheet,
  TouchableOpacity
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

// Storage functions
const storePlexAuth = async (auth: PlexAuthConfig) => {
  try {
    console.log('Attempting to store Plex auth:', auth);
    const authString = JSON.stringify(auth);
    console.log('Auth string to store:', authString);
    await AsyncStorage.setItem('plex_auth', authString);
    
    // Verify it was stored
    const stored = await AsyncStorage.getItem('plex_auth');
    console.log('Verification - stored data:', stored);
    
    if (stored !== authString) {
      throw new Error('Data verification failed - stored data does not match');
    }
    
    console.log('Plex auth stored successfully');
  } catch (error) {
    console.error('Failed to store Plex auth:', error);
    throw error; // Re-throw so we can show the error to the user
  }
};

const storePlexLibrary = async (library: PlexLibrary) => {
  try {
    console.log('Attempting to store Plex library:', library);
    const libraryString = JSON.stringify(library);
    console.log('Library string to store:', libraryString);
    await AsyncStorage.setItem('plex_library', libraryString);
    
    // Verify it was stored
    const stored = await AsyncStorage.getItem('plex_library');
    console.log('Verification - stored library:', stored);
    
    if (stored !== libraryString) {
      throw new Error('Library data verification failed');
    }
    
    console.log('Plex library stored successfully');
  } catch (error) {
    console.error('Failed to store Plex library:', error);
    throw error; // Re-throw so we can show the error to the user
  }
};

const loadPlexAuth = async (): Promise<PlexAuthConfig | null> => {
  try {
    const authData = await AsyncStorage.getItem('plex_auth');
    return authData ? JSON.parse(authData) : null;
  } catch (error) {
    console.error('Failed to load Plex auth:', error);
    return null;
  }
};

const loadPlexLibrary = async (): Promise<PlexLibrary | null> => {
  try {
    const libraryData = await AsyncStorage.getItem('plex_library');
    return libraryData ? JSON.parse(libraryData) : null;
  } catch (error) {
    console.error('Failed to load Plex library:', error);
    return null;
  }
};

const clearPlexAuth = async () => {
  try {
    await AsyncStorage.removeItem('plex_auth');
    await AsyncStorage.removeItem('plex_library');
  } catch (error) {
    console.error('Failed to clear Plex auth:', error);
  }
};

// Plex Logo Component
const PlexLogo = ({ size = 24 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path 
      d="M4,2C2.89,2 2,2.89 2,4V20C2,21.11 2.89,22 4,22H20C21.11,22 22,21.11 22,20V4C22,2.89 21.11,2 20,2H4M8.56,6H12.06L15.5,12L12.06,18H8.56L12,12L8.56,6Z" 
      fill="#E5A00D"
    />
  </Svg>
);

interface PlexOAuthProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (authConfig: PlexAuthConfig, selectedLibrary?: PlexLibrary) => void;
}

interface PlexPin {
  id: number;
  code: string;
  authToken?: string;
}

export const PlexOAuth: React.FC<PlexOAuthProps> = ({ 
  visible, 
  onClose, 
  onSuccess 
}) => {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'auth' | 'server' | 'library'>('auth');
  const [authConfig, setAuthConfig] = useState<PlexAuthConfig | null>(null);
  const [servers, setServers] = useState<any[]>([]);
  const [selectedServer, setSelectedServer] = useState<any | null>(null);
  const [libraries, setLibraries] = useState<PlexLibrary[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState<PlexLibrary | null>(null);
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState<PlexPin | null>(null);
  const [polling, setPolling] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [pinCopied, setPinCopied] = useState(false);

  const addDebugInfo = (info: string) => {
    setDebugInfo(prev => prev + '\n' + new Date().toLocaleTimeString() + ': ' + info);
  };

  const addDetailedError = (error: any) => {
    addDebugInfo(`ERROR DETAILS:`);
    addDebugInfo(`- Name: ${error.name || 'Unknown'}`);
    addDebugInfo(`- Message: ${error.message || 'Unknown'}`);
    addDebugInfo(`- Stack: ${error.stack ? error.stack.substring(0, 200) + '...' : 'None'}`);
    addDebugInfo(`- Cause: ${error.cause || 'None'}`);
    
    if (error.name === 'TypeError' && error.message.includes('Network request failed')) {
      addDebugInfo(`- This is a network connectivity issue`);
      addDebugInfo(`- Likely ATS blocking HTTP or DNS resolution failure`);
    }
  };

  const copyPinToClipboard = async () => {
    if (pin?.code) {
      await Clipboard.setString(pin.code);
      setPinCopied(true);
      // Reset the copied state after 2 seconds
      setTimeout(() => setPinCopied(false), 2000);
    }
  };

  useEffect(() => {
    if (visible) {
      setStep('auth');
      setAuthConfig(null);
      setServers([]);
      setSelectedServer(null);
      setLibraries([]);
      setSelectedLibrary(null);
      setPin(null);
      setPolling(false);
      setPinCopied(false);
      
      // Try to load existing auth
      loadExistingAuth();
    }
  }, [visible]);

  const loadExistingAuth = async () => {
    try {
      const existingAuth = await loadPlexAuth();
      const existingLibrary = await loadPlexLibrary();
      
      if (existingAuth) {
        console.log('Found existing auth, attempting auto-login...');
        setAuthConfig(existingAuth);
        plexService.setAuthConfig(existingAuth);
        
        if (existingLibrary) {
          setSelectedLibrary(existingLibrary);
          plexService.setSelectedLibrary(existingLibrary.id);
          console.log('Auto-login successful with existing library');
          onSuccess(existingAuth, existingLibrary);
          onClose();
          return;
        }
        
        // Try to fetch libraries
        try {
          const libs = await plexService.getLibraries();
          console.log('Libraries fetched:', libs.length);
          setLibraries(libs);
          setStep('library');
          
          if (libs.length === 1) {
            // Auto-select if only one library
            handleLibrarySelect(libs[0]);
          }
        } catch (error) {
          console.error('Failed to fetch libraries:', error);
          // Clear invalid auth
          await clearPlexAuth();
          setAuthConfig(null);
        }
      }
    } catch (error) {
      console.error('Failed to load existing auth:', error);
    }
  };

  const createPin = async (): Promise<PlexPin> => {
    console.log('Creating Plex PIN...');
    
    const response = await fetch('https://plex.tv/api/v2/pins', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Plex-Client-Identifier': 'BookTracker-iOS',
        'X-Plex-Product': 'BookTracker',
        'X-Plex-Version': '1.0.2',
        'X-Plex-Platform': 'iOS',
        'X-Plex-Platform-Version': '17.0',
        'X-Plex-Device': 'iPhone',
        'X-Plex-Device-Name': 'iPhone',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to create PIN: ${response.status} ${response.statusText}`);
    }

    const pinData = await response.json();
    console.log('PIN created:', pinData);
    
    return {
      id: pinData.id,
      code: pinData.code,
    };
  };

  const pollPinStatus = async (pinId: number): Promise<string> => {
    console.log('Polling PIN status...');
    
    const response = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Plex-Client-Identifier': 'BookTracker-iOS',
        'X-Plex-Product': 'BookTracker',
        'X-Plex-Version': '1.0.2',
        'X-Plex-Platform': 'iOS',
        'X-Plex-Platform-Version': '17.0',
        'X-Plex-Device': 'iPhone',
        'X-Plex-Device-Name': 'iPhone',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to poll PIN: ${response.status} ${response.statusText}`);
    }

    const pinData = await response.json();
    console.log('PIN status:', pinData);
    
    return pinData.authToken;
  };

  const getUserInfo = async (authToken: string) => {
    console.log('Getting user info...');
    
    const response = await fetch('https://plex.tv/api/v2/user', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Plex-Token': authToken,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.status} ${response.statusText}`);
    }

    const userData = await response.json();
    console.log('User info:', userData);
    
    return userData;
  };

  const handleOAuthLogin = async () => {
    setLoading(true);
    
    try {
      console.log('Starting PIN-based login process...');
      
      // Create PIN
      const newPin = await createPin();
      setPin(newPin);
      setLoading(false); // PIN created successfully, stop loading
      
      // PIN is now displayed in the UI, no need for alert
      
    } catch (error) {
      console.error('PIN login error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      Alert.alert('Login Error', `Failed to start Plex login: ${errorMessage}`);
      setLoading(false);
    }
  };

  const pollForToken = async (pinId: number) => {
    setPolling(true);
    
    try {
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds max
      
      while (attempts < maxAttempts) {
        console.log(`Polling attempt ${attempts + 1}/${maxAttempts}`);
        
        const authToken = await pollPinStatus(pinId);
        
        if (authToken) {
          console.log('Auth token received:', authToken.substring(0, 10) + '...');
          
          // Get user info
          const userInfo = await getUserInfo(authToken);
          
          // Create auth config
          const auth: PlexAuthConfig = {
            token: authToken,
            username: userInfo.username,
            email: userInfo.email,
            serverUrl: '', // Will be set when server is selected
          };
          
          console.log('Created auth config:', auth);
          setAuthConfig(auth);
          plexService.setAuthConfig(auth);
          
          // Store auth
          await storePlexAuth(auth);
          
          // Get servers
          const serverList = await plexService.getServers();
          console.log('Servers fetched:', serverList.length);
          setServers(serverList);
          setStep('server');
          return;
        }
        
        // Wait 1 second before next poll
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }
      
      throw new Error('Authentication timeout - please try again');
      
    } catch (error) {
      console.error('Token polling error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      Alert.alert('Authentication Failed', `Failed to complete authentication: ${errorMessage}`);
    } finally {
      setPolling(false);
    }
  };

  const handleServerSelect = async (server: any) => {
    try {
      addDebugInfo(`Server selected: ${server.name}`);
      setSelectedServer(server);
      
      // Update auth config with server URL
      if (authConfig) {
        // Use HTTPS connection selection logic
        const connections: PlexConnection[] = server.connections.map((conn: any) => ({
          uri: conn.uri,
          protocol: conn.protocol,
          local: conn.local,
          relay: conn.relay
        }));
        
        // Pick the best HTTPS connection
        const bestConnection = plexService['pickBestConnection'](connections);
        const connection = bestConnection;
        
        
        const serverUrl = connection?.uri;
        
        if (serverUrl) {
          // Use the HTTPS connection URI as-is (remove any whitespace)
          const formattedServerUrl = serverUrl.replace(/\s+/g, '');
          
          // Use the main auth token for direct server communication
          const serverToken = authConfig.token;
          
          const updatedAuth = {
            ...authConfig,
            serverUrl: formattedServerUrl,
            serverId: server.clientIdentifier,
            serverName: server.name,
            serverToken: serverToken,
          };
          setAuthConfig(updatedAuth);
          plexService.setAuthConfig(updatedAuth);
          await storePlexAuth(updatedAuth);
          
          // Get libraries from this server
          const allLibs = await plexService.getLibraries();
          // Filter to only show music libraries
          const musicLibs = allLibs.filter(lib => lib.type === 'artist');
          setLibraries(musicLibs);
          setStep('library');
        } else {
          Alert.alert('Server Error', 'No accessible connection found for this server.');
        }
      }
      
    } catch (error) {
      console.error('Server selection error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      addDebugInfo(`ERROR: ${errorMessage}`);
      addDetailedError(error);
      Alert.alert('Server Selection Error', `Failed to connect to server: ${errorMessage}\n\nDebug Info:\n${debugInfo}`);
    }
  };

  const handleLibrarySelect = async (library: PlexLibrary) => {
    try {
      console.log('Library selected:', library);
      setSelectedLibrary(library);
      plexService.setSelectedLibrary(library.id);
      
      // Store library selection
      await storePlexLibrary(library);
      
      // Update auth config with server URL
      if (authConfig && library.serverUrl) {
        const updatedAuth = {
          ...authConfig,
          serverUrl: library.serverUrl,
        };
        setAuthConfig(updatedAuth);
        plexService.setAuthConfig(updatedAuth);
        await storePlexAuth(updatedAuth);
      }
      
      console.log('Library selection complete');
      onSuccess(authConfig!, library);
      onClose();
      
    } catch (error) {
      console.error('Library selection error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      Alert.alert('Selection Error', `Failed to select library: ${errorMessage}`);
    }
  };

  const handleSignOut = async () => {
    try {
      await clearPlexAuth();
      setAuthConfig(null);
      setSelectedLibrary(null);
      setLibraries([]);
      setStep('auth');
      console.log('Signed out successfully');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <ThemedView style={styles.modalOverlay}>
        <ThemedView style={styles.modalContent}>
          {step === 'auth' ? (
            <>
              <ThemedText type="title" style={styles.title}>
                Sign in to Plex
              </ThemedText>
              
              <ThemedText style={styles.subtitle}>
                Connect your Plex account to discover books and sync progress
              </ThemedText>

              {pin && (
                <ThemedView style={styles.pinContainer}>
                  <ThemedText style={styles.pinLabel}>PIN Code:</ThemedText>
                  <TouchableOpacity 
                    style={styles.pinCodeContainer}
                    onPress={copyPinToClipboard}
                    activeOpacity={0.7}
                  >
                    <ThemedText style={styles.pinCode}>{pin.code}</ThemedText>
                    {pinCopied && (
                      <ThemedView style={styles.copiedOverlay}>
                        <ThemedText style={styles.copiedText}>✓ Copied!</ThemedText>
                      </ThemedView>
                    )}
                  </TouchableOpacity>
                  <ThemedText style={styles.pinInstructions}>
                    1. Go to plex.tv/link in your browser{'\n'}
                    2. Tap PIN above to copy, or enter manually{'\n'}
                    3. Sign in to your Plex account{'\n'}
                    4. Tap "I've Entered the PIN" below
                  </ThemedText>
                </ThemedView>
              )}

              <ThemedView style={styles.buttonGroup}>
                <TouchableOpacity
                  style={[styles.button, styles.authButton]}
                  onPress={pin ? () => {
                    console.log('User confirmed PIN entry, starting to poll for token...');
                    pollForToken(pin.id);
                  } : handleOAuthLogin}
                  disabled={polling}
                >
                  <ThemedText style={styles.buttonText}>
                    {polling ? 'Waiting for Authentication...' : 
                     pin ? 'I\'ve Entered the PIN' :
                     loading ? 'Getting PIN...' :
                     'Sign in with Plex'}
                  </ThemedText>
                  {polling && <ActivityIndicator size="small" color="#fff" style={styles.buttonSpinner} />}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={onClose}
                >
                  <ThemedText style={styles.buttonText}>Cancel</ThemedText>
                </TouchableOpacity>
              </ThemedView>
            </>
          ) : step === 'server' ? (
            <>
              <ThemedText style={styles.loginSuccessText}>
                Login Successful!
              </ThemedText>
              
              <ThemedText style={styles.serverSelectTitle}>
                Select Server
              </ThemedText>
              
              <ThemedText style={styles.subtitle}>
                Choose which Plex server to connect to
              </ThemedText>

              {debugInfo ? (
                <ThemedView style={styles.debugContainer}>
                  <ThemedView style={styles.debugHeader}>
                    <ThemedText style={styles.debugTitle}>Debug Info:</ThemedText>
                    <TouchableOpacity onPress={() => setDebugInfo('')} style={styles.clearDebugButton}>
                      <ThemedText style={styles.clearDebugText}>Clear</ThemedText>
                    </TouchableOpacity>
                  </ThemedView>
                  <ThemedText style={styles.debugText}>{debugInfo}</ThemedText>
                </ThemedView>
              ) : null}

              <FlatList
                data={servers}
                keyExtractor={(item) => item.clientIdentifier}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.serverItem}
                    onPress={() => handleServerSelect(item)}
                  >
                    <ThemedView style={styles.serverItemContent}>
                      <PlexLogo size={28} />
                      <ThemedText style={styles.serverName}>{item.name}</ThemedText>
                    </ThemedView>
                  </TouchableOpacity>
                )}
                style={styles.serverList}
              />

              <ThemedView style={styles.buttonGroup}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={onClose}
                >
                  <ThemedText style={styles.buttonText}>Cancel</ThemedText>
                </TouchableOpacity>
              </ThemedView>
            </>
          ) : (
            <>
              <ThemedText type="title" style={styles.title}>
                Select Library
              </ThemedText>
              
              <ThemedText style={styles.subtitle}>
                Choose which music library to use for audiobook discovery
              </ThemedText>

              <FlatList
                data={libraries}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.libraryItem}
                    onPress={() => handleLibrarySelect(item)}
                  >
                    <ThemedText style={styles.libraryName}>{item.name}</ThemedText>
                  </TouchableOpacity>
                )}
                style={styles.libraryList}
              />

              <ThemedView style={styles.buttonGroup}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={onClose}
                >
                  <ThemedText style={styles.buttonText}>Cancel</ThemedText>
                </TouchableOpacity>
              </ThemedView>
            </>
          )}
        </ThemedView>
      </ThemedView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    margin: 16,
    maxWidth: 400,
    width: '90%',
    maxHeight: '90%',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: '#ECEDEE',
  },
  loginSuccessText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 8,
  },
  serverSelectTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ECEDEE',
    textAlign: 'center',
    marginBottom: 16,
  },
  debugContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  debugHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ECEDEE',
  },
  clearDebugButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  clearDebugText: {
    fontSize: 12,
    color: '#ECEDEE',
  },
  debugText: {
    fontSize: 12,
    color: '#8E8E93',
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
    color: '#8E8E93',
    lineHeight: 22,
  },
  pinContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    minHeight: 120,
  },
  pinLabel: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 8,
  },
  pinCodeContainer: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 12,
    position: 'relative',
  },
  pinCode: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#E5A00D',
    letterSpacing: 4,
    lineHeight: 40,
  },
  copiedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  copiedText: {
    fontSize: 16,
    color: '#50b042',
    fontWeight: '600',
  },
  pinInstructions: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'left',
    lineHeight: 20,
    marginTop: 8,
  },
  buttonGroup: {
    gap: 12,
  },
  button: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  authButton: {
    backgroundColor: '#E5A00D',
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  signOutButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  buttonSpinner: {
    marginLeft: 8,
  },
  libraryList: {
    maxHeight: 200,
    marginBottom: 24,
  },
  libraryItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  libraryName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ECEDEE',
  },
  libraryType: {
    fontSize: 14,
    color: '#8E8E93',
  },
  serverList: {
    maxHeight: 200,
    marginBottom: 24,
  },
  serverItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  serverItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  serverName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ECEDEE',
    flex: 1,
  },
});