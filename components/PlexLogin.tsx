import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { PlexAuthConfig, PlexLibrary, plexService } from '@/services/PlexService';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    StyleSheet,
    TextInput,
    TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PlexLoginProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (authConfig: PlexAuthConfig, selectedLibrary?: PlexLibrary) => void;
}

export const PlexLogin: React.FC<PlexLoginProps> = ({ 
  visible, 
  onClose, 
  onSuccess 
}) => {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'login' | 'library'>('login');
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
  });
  const [libraries, setLibraries] = useState<PlexLibrary[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState<PlexLibrary | null>(null);
  const [loading, setLoading] = useState(false);
  const [authConfig, setAuthConfig] = useState<PlexAuthConfig | null>(null);

  const handleLogin = async () => {
    if (!credentials.username || !credentials.password) {
      Alert.alert('Error', 'Please enter both username and password');
      return;
    }

    setLoading(true);
    try {
      const auth = await plexService.authenticate(credentials.username, credentials.password);
      setAuthConfig(auth);
      
      // Get available libraries
      const libs = await plexService.getLibraries();
      setLibraries(libs);
      setStep('library');
    } catch (error) {
      Alert.alert('Login Failed', 'Please check your username and password');
    } finally {
      setLoading(false);
    }
  };

  const handleLibrarySelect = (library: PlexLibrary) => {
    setSelectedLibrary(library);
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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <ThemedView style={styles.modalOverlay}>
        <ThemedView style={[styles.modalContent, { paddingTop: insets.top + 20 }]}>
          {step === 'login' ? (
            <>
              <ThemedText type="title" style={styles.title}>
                Sign in to Plex
              </ThemedText>
              
              <ThemedText style={styles.subtitle}>
                Use your Plex account to access your libraries
              </ThemedText>

              <ThemedView style={styles.inputGroup}>
                <ThemedText type="defaultSemiBold" style={styles.label}>
                  Username or Email
                </ThemedText>
                <TextInput
                  style={styles.input}
                  value={credentials.username}
                  onChangeText={(value) => setCredentials(prev => ({ ...prev, username: value }))}
                  placeholder="Enter your Plex username or email"
                  placeholderTextColor="#666"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </ThemedView>

              <ThemedView style={styles.inputGroup}>
                <ThemedText type="defaultSemiBold" style={styles.label}>
                  Password
                </ThemedText>
                <TextInput
                  style={styles.input}
                  value={credentials.password}
                  onChangeText={(value) => setCredentials(prev => ({ ...prev, password: value }))}
                  placeholder="Enter your Plex password"
                  placeholderTextColor="#666"
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
              </ThemedView>

              <ThemedView style={styles.buttonGroup}>
                <TouchableOpacity
                  style={[styles.button, styles.loginButton]}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  <ThemedText style={styles.buttonText}>
                    {loading ? 'Signing in...' : 'Sign In'}
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
                  onPress={() => setStep('login')}
                >
                  <ThemedText style={styles.buttonText}>Back to Login</ThemedText>
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
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 8,
    color: '#ECEDEE',
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
  buttonGroup: {
    gap: 12,
    marginTop: 24,
  },
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  loginButton: {
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
