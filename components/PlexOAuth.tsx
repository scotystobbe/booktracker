import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { PlexAuthConfig, PlexLibrary, plexService } from '@/services/PlexService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  TouchableOpacity
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

interface PlexOAuthProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (authConfig: PlexAuthConfig, selectedLibrary?: PlexLibrary) => void;
}

export const PlexOAuth: React.FC<PlexOAuthProps> = ({ 
  visible, 
  onClose, 
  onSuccess 
}) => {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'auth' | 'library'>('auth');
  const [authConfig, setAuthConfig] = useState<PlexAuthConfig | null>(null);
  const [libraries, setLibraries] = useState<PlexLibrary[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState<PlexLibrary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setStep('auth');
      setAuthConfig(null);
      setLibraries([]);
      setSelectedLibrary(null);
    }
  }, [visible]);

  // Load stored auth data on mount
  useEffect(() => {
    const loadStoredAuth = async () => {
      const storedAuth = await loadPlexAuth();
      const storedLibrary = await loadPlexLibrary();
      
      if (storedAuth) {
        setAuthConfig(storedAuth);
        plexService.setAuthConfig(storedAuth);
        
        // Try to get libraries
        try {
          const libs = await plexService.getLibraries();
          setLibraries(libs);
          
          // If we have a stored library, use it
          if (storedLibrary) {
            setSelectedLibrary(storedLibrary);
            plexService.setSelectedLibrary(storedLibrary.id);
            // Skip library selection and go directly to success
            onSuccess(storedAuth, storedLibrary);
            onClose();
          } else {
            setStep('library');
          }
        } catch (error) {
          console.error('Failed to load libraries with stored auth:', error);
          // Clear invalid stored auth
          await clearPlexAuth();
        }
      }
    };
    
    loadStoredAuth();
  }, []);

  const handleOAuthSuccess = async (token: string) => {
    try {
      // Get user info using the token
      const userResponse = await fetch('https://plex.tv/api/v2/user', {
        headers: {
          'X-Plex-Token': token,
          'Accept': 'application/json',
        },
      });
      
      if (userResponse.ok) {
        const userData = await userResponse.json();
        const auth: PlexAuthConfig = {
          token: token,
          username: userData.username,
          email: userData.email,
        };
        
        setAuthConfig(auth);
        plexService.setAuthConfig(auth);
        
        // Get available libraries
        const libs = await plexService.getLibraries();
        setLibraries(libs);
        setStep('library');
      } else {
        throw new Error('Failed to get user information');
      }
    } catch (error) {
      console.error('OAuth success error:', error);
      Alert.alert('Authentication Failed', 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async () => {
    setLoading(true);
    
    try {
      console.log('Starting authentication process...');
      
      // Use direct token input - most reliable approach
      Alert.prompt(
        'Enter Plex Token',
        'Please enter your Plex authentication token. You can find this by:\n\n1. Go to your Plex server in a browser\n2. Click any media item → three dots → Get Info\n3. Click "View XML" in bottom left\n4. Copy the token from the URL (far right)',
        [
          {
            text: 'Cancel',
            onPress: () => {
              console.log('Authentication cancelled by user');
              setLoading(false);
            }
          },
          {
            text: 'Connect',
            onPress: async (token) => {
              console.log('Token entered:', token ? token.substring(0, 10) + '...' : 'empty');
              
              if (!token) {
                Alert.alert('Error', 'Please enter a valid token');
                setLoading(false);
                return;
              }
              
              try {
                console.log('Getting server URL from user...');
                
                // For server tokens, we need to test against the server directly
                // First, let's get the server URL from the user
                Alert.prompt(
                  'Enter Server URL',
                  'Please enter your Plex server URL (e.g., http://192.168.1.100:32400 or https://your-server.com:32400)',
                  [
                    {
                      text: 'Cancel',
                      onPress: () => {
                        console.log('Server URL entry cancelled');
                        setLoading(false);
                      }
                    },
                    {
                      text: 'Test Connection',
                      onPress: async (serverUrl) => {
                        console.log('Server URL entered:', serverUrl);
                        if (!serverUrl) {
                          Alert.alert('Error', 'Please enter a server URL');
                          setLoading(false);
                          return;
                        }
                        
                        try {
                          console.log('Testing connection to:', serverUrl);
                          console.log('Using token:', token.substring(0, 10) + '...');
                          
                          // Test the token against the server directly
                          const testUrl = `${serverUrl}/`;
                          console.log('Full test URL:', testUrl);
                          
                          // Try HTTPS first if the URL is HTTP
                          let serverResponse;
                          let finalUrl = testUrl;
                          
                          if (serverUrl.startsWith('http://')) {
                            const httpsUrl = serverUrl.replace('http://', 'https://');
                            console.log('Trying HTTPS first:', httpsUrl);
                            
                            try {
                              serverResponse = await fetch(`${httpsUrl}/`, {
                                method: 'GET',
                                headers: {
                                  'X-Plex-Token': token,
                                  'Accept': 'application/json',
                                  'User-Agent': 'BookTracker/1.0.2',
                                },
                              });
                              finalUrl = `${httpsUrl}/`;
                              console.log('HTTPS connection successful');
                            } catch (httpsError) {
                              console.log('HTTPS failed, falling back to HTTP:', httpsError.message);
                              serverResponse = await fetch(testUrl, {
                                method: 'GET',
                                headers: {
                                  'X-Plex-Token': token,
                                  'Accept': 'application/json',
                                  'User-Agent': 'BookTracker/1.0.2',
                                },
                              });
                            }
                          } else {
                            serverResponse = await fetch(testUrl, {
                              method: 'GET',
                              headers: {
                                'X-Plex-Token': token,
                                'Accept': 'application/json',
                                'User-Agent': 'BookTracker/1.0.2',
                              },
                            });
                          }
                          
                          console.log('Server response status:', serverResponse.status);
                          console.log('Server response headers:', Object.fromEntries(serverResponse.headers.entries()));
                          
                          if (serverResponse.ok) {
                            const serverData = await serverResponse.json();
                            console.log('Server data received:', serverData);
                            
                            // Use the final URL that worked (HTTPS or HTTP)
                            const workingServerUrl = finalUrl.endsWith('/') ? finalUrl.slice(0, -1) : finalUrl;
                            
                            const auth: PlexAuthConfig = {
                              token: token,
                              username: serverData.friendlyName || 'Plex Server',
                              email: 'server@plex.local',
                              serverUrl: workingServerUrl,
                            };
                            
                            console.log('Created auth config:', auth);
                            setAuthConfig(auth);
                            plexService.setAuthConfig(auth);
                            
                            // Store the authentication data
                            console.log('Storing auth data...');
                            try {
                              await storePlexAuth(auth);
                              console.log('Auth data stored successfully');
                            } catch (storageError) {
                              console.error('Storage failed:', storageError);
                              Alert.alert(
                                'Storage Error', 
                                `Failed to store authentication data: ${storageError.message}\n\nThis may be due to device storage restrictions.`
                              );
                              setLoading(false);
                              return;
                            }
                            
                            // Get available libraries from the server
                            console.log('Fetching libraries...');
                            const libs = await plexService.getLibraries();
                            console.log('Libraries fetched:', libs.length);
                            setLibraries(libs);
                            setStep('library');
                            
                            Alert.alert('Success!', `Connected to Plex server "${auth.username}"\nFound ${libs.length} libraries`);
                          } else {
                            const errorText = await serverResponse.text();
                            console.error('Server error response:', errorText);
                            throw new Error(`Server returned ${serverResponse.status}: ${errorText}`);
                          }
                        } catch (error) {
                          console.error('Server auth error:', error);
                          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                          
                          // Provide more specific error information
                          let detailedMessage = `Error: ${errorMessage}\n\n`;
                          
                          if (errorMessage.includes('Network request failed')) {
                            detailedMessage += 'This usually means:\n• ATS is blocking HTTP requests to public IP\n• Server is not accessible from internet\n• Firewall blocking connection\n• Server requires HTTPS instead of HTTP';
                          } else if (errorMessage.includes('401') || errorMessage.includes('403')) {
                            detailedMessage += 'This usually means:\n• Token is invalid or expired\n• Server requires authentication\n• Token format is incorrect';
                          } else if (errorMessage.includes('404')) {
                            detailedMessage += 'This usually means:\n• Server URL is incorrect\n• Server is not running\n• Wrong port number';
                          } else {
                            detailedMessage += 'Please check:\n• Server URL is correct (e.g., http://192.168.1.100:32400)\n• Token is valid\n• Server is accessible from your network';
                          }
                          
                          Alert.alert('Authentication Failed', detailedMessage);
                        } finally {
                          setLoading(false);
                        }
                      }
                    }
                  ],
                  'plain-text'
                );
              } catch (error) {
                console.error('Token auth error:', error);
                Alert.alert('Authentication Failed', 'Please check your token and try again');
              } finally {
                setLoading(false);
              }
            }
          }
        ],
        'secure-text'
      );
    } catch (error) {
      console.error('Auth error:', error);
      Alert.alert('Authentication Failed', 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  const handleLibrarySelect = async (library: PlexLibrary) => {
    try {
      setSelectedLibrary(library);
      plexService.setSelectedLibrary(library.id);
      await storePlexLibrary(library);
      console.log('Library selected and stored successfully');
    } catch (error) {
      console.error('Failed to store library selection:', error);
      Alert.alert(
        'Storage Error', 
        `Failed to store library selection: ${error.message}\n\nYou can still use Plex features, but you'll need to select a library each time.`
      );
    }
  };

  const handleComplete = () => {
    if (authConfig) {
      onSuccess(authConfig, selectedLibrary || undefined);
      onClose();
    }
  };

  const handleSkipLibrary = () => {
    if (authConfig) {
      onSuccess(authConfig);
      onClose();
    }
  };

  const renderLibraryItem = ({ item }: { item: PlexLibrary }) => (
    <TouchableOpacity
      style={[
        styles.libraryItem,
        selectedLibrary?.id === item.id && styles.selectedLibraryItem
      ]}
      onPress={() => handleLibrarySelect(item)}
    >
      <ThemedText style={styles.libraryName}>{item.name}</ThemedText>
      <ThemedText style={styles.libraryType}>{item.type}</ThemedText>
    </TouchableOpacity>
  );


  
  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
      >
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={[styles.modalContent, { paddingTop: insets.top + 20 }]}>
            {step === 'auth' ? (
              <>
                <ThemedText type="title" style={styles.title}>
                  Sign in to Plex
                </ThemedText>
                
                <ThemedText style={styles.subtitle}>
                  Enter your Plex authentication token
                </ThemedText>

                <ThemedView style={styles.authInfo}>
                  <ThemedText style={styles.infoText}>
                    • Go to your Plex server in a browser{'\n'}
                    • Click any media item → three dots → Get Info{'\n'}
                    • Click "View XML" in bottom left{'\n'}
                    • Copy the token from the URL (far right)
                  </ThemedText>
                </ThemedView>

                <ThemedView style={styles.buttonGroup}>
                  <TouchableOpacity
                    style={[styles.button, styles.authButton]}
                    onPress={handleAuth}
                    disabled={loading}
                  >
                    <ThemedText style={styles.buttonText}>
                      {loading ? 'Connecting...' : 'Enter Token'}
                    </ThemedText>
                    {loading && <ActivityIndicator size="small" color="#fff" style={styles.buttonSpinner} />}
                  </TouchableOpacity>

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
                  Choose which library to search for books
                </ThemedText>

                <FlatList
                  data={libraries}
                  renderItem={renderLibraryItem}
                  keyExtractor={(item) => item.id}
                  style={styles.libraryList}
                  showsVerticalScrollIndicator={false}
                  ListEmptyComponent={
                    <ThemedView style={styles.emptyState}>
                      <ThemedText style={styles.emptyText}>
                        No libraries found
                      </ThemedText>
                    </ThemedView>
                  }
                />

                <ThemedView style={styles.buttonGroup}>
                  <TouchableOpacity
                    style={[styles.button, styles.completeButton]}
                    onPress={handleComplete}
                    disabled={!selectedLibrary}
                  >
                    <ThemedText style={styles.buttonText}>
                      Continue with {selectedLibrary?.name || 'Library'}
                    </ThemedText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.button, styles.skipButton]}
                    onPress={handleSkipLibrary}
                  >
                    <ThemedText style={styles.buttonText}>Skip Library Selection</ThemedText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.button, styles.backButton]}
                    onPress={() => setStep('auth')}
                  >
                    <ThemedText style={styles.buttonText}>Back to Auth</ThemedText>
                  </TouchableOpacity>
                </ThemedView>
              </>
            )}
          </ThemedView>
        </ThemedView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
    opacity: 0.7,
    fontSize: 14,
  },
  authInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  infoText: {
    fontSize: 14,
    color: '#ECEDEE',
    lineHeight: 20,
  },
  buttonGroup: {
    gap: 12,
  },
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  authButton: {
    backgroundColor: '#007AFF',
  },
  completeButton: {
    backgroundColor: '#50b042',
  },
  skipButton: {
    backgroundColor: '#6c757d',
  },
  backButton: {
    backgroundColor: '#6c757d',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSpinner: {
    marginLeft: 8,
  },
  libraryList: {
    maxHeight: 300,
    marginBottom: 16,
  },
  libraryItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedLibraryItem: {
    backgroundColor: 'rgba(80, 176, 66, 0.2)',
    borderColor: '#50b042',
  },
  libraryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ECEDEE',
    marginBottom: 4,
  },
  libraryType: {
    fontSize: 14,
    color: '#ECEDEE',
    opacity: 0.7,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#ECEDEE',
    opacity: 0.6,
    textAlign: 'center',
  },
});
