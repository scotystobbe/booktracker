import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { PlexServerConfig, plexService } from '@/services/PlexService';
import React, { useState } from 'react';
import {
    Alert,
    Modal,
    StyleSheet,
    TextInput,
    TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PlexConfigProps {
  visible: boolean;
  onClose: () => void;
  onSave: (config: PlexServerConfig) => void;
}

export const PlexConfig: React.FC<PlexConfigProps> = ({ visible, onClose, onSave }) => {
  const insets = useSafeAreaInsets();
  const [config, setConfig] = useState<PlexServerConfig>({
    serverUrl: '',
    token: '',
    libraryId: '',
  });
  const [testing, setTesting] = useState(false);

  const handleInputChange = (field: keyof PlexServerConfig, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const testConnection = async () => {
    if (!config.serverUrl || !config.token) {
      Alert.alert('Error', 'Please enter both server URL and token');
      return;
    }

    setTesting(true);
    try {
      plexService.setConfig(config);
      const isConnected = await plexService.testConnection();
      
      if (isConnected) {
        Alert.alert('Success', 'Successfully connected to Plex server!');
      } else {
        Alert.alert('Error', 'Failed to connect to Plex server. Please check your settings.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to connect to Plex server. Please check your settings.');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    if (!config.serverUrl || !config.token) {
      Alert.alert('Error', 'Please enter both server URL and token');
      return;
    }
    onSave(config);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <ThemedView style={styles.modalOverlay}>
        <ThemedView style={[styles.modalContent, { paddingTop: insets.top + 20 }]}>
          <ThemedText type="title" style={styles.title}>
            Plex Server Configuration
          </ThemedText>

          <ThemedText style={styles.subtitle}>
            Enter your Plex server details to enable automatic book discovery
          </ThemedText>

          <ThemedView style={styles.inputGroup}>
            <ThemedText type="defaultSemiBold" style={styles.label}>
              Server URL
            </ThemedText>
            <TextInput
              style={styles.input}
              value={config.serverUrl}
              onChangeText={(value) => handleInputChange('serverUrl', value)}
              placeholder="https://your-plex-server.com:32400"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </ThemedView>

          <ThemedView style={styles.inputGroup}>
            <ThemedText type="defaultSemiBold" style={styles.label}>
              Plex Token
            </ThemedText>
            <TextInput
              style={styles.input}
              value={config.token}
              onChangeText={(value) => handleInputChange('token', value)}
              placeholder="Your Plex token"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
          </ThemedView>

          <ThemedView style={styles.inputGroup}>
            <ThemedText type="defaultSemiBold" style={styles.label}>
              Library ID (Optional)
            </ThemedText>
            <TextInput
              style={styles.input}
              value={config.libraryId}
              onChangeText={(value) => handleInputChange('libraryId', value)}
              placeholder="Leave empty to use default"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </ThemedView>

          <ThemedView style={styles.buttonGroup}>
            <TouchableOpacity
              style={[styles.button, styles.testButton]}
              onPress={testConnection}
              disabled={testing}
            >
              <ThemedText style={styles.buttonText}>
                {testing ? 'Testing...' : 'Test Connection'}
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={handleSave}
            >
              <ThemedText style={styles.buttonText}>Save</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
            >
              <ThemedText style={styles.buttonText}>Cancel</ThemedText>
            </TouchableOpacity>
          </ThemedView>

          <ThemedView style={styles.helpSection}>
            <ThemedText style={styles.helpTitle}>How to get your Plex token:</ThemedText>
            <ThemedText style={styles.helpText}>
              1. Go to plex.tv and sign in{'\n'}
              2. Go to Account Settings → Server → Show Advanced{'\n'}
              3. Copy your Plex Token{'\n'}
              4. For Server URL, use your Plex server's address with port 32400
            </ThemedText>
          </ThemedView>
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
  },
  testButton: {
    backgroundColor: '#007AFF',
  },
  saveButton: {
    backgroundColor: '#50b042',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  helpSection: {
    marginTop: 24,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
  },
  helpTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ECEDEE',
    marginBottom: 8,
  },
  helpText: {
    fontSize: 12,
    color: '#ECEDEE',
    opacity: 0.8,
    lineHeight: 18,
  },
});
