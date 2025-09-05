import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Image } from 'expo-image';
import React from 'react';
import { FlatList, Modal, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface CoverArtOption {
  type: string;
  url: string;
}

interface CoverArtSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  options: CoverArtOption[];
  bookTitle: string;
}

export const CoverArtSelector: React.FC<CoverArtSelectorProps> = ({
  visible,
  onClose,
  onSelect,
  options,
  bookTitle,
}) => {
  const insets = useSafeAreaInsets();

  const handleSelect = (url: string) => {
    onSelect(url);
    onClose();
  };

  const renderCoverArtOption = ({ item }: { item: CoverArtOption }) => (
    <TouchableOpacity
      style={styles.optionContainer}
      onPress={() => handleSelect(item.url)}
    >
      <Image
        source={{ uri: item.url }}
        style={styles.coverImage}
        contentFit="cover"
      />
      <ThemedText style={styles.optionType}>{item.type}</ThemedText>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ThemedView style={styles.header}>
          <ThemedText type="title" style={styles.title}>
            Select Cover Art
          </ThemedText>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <ThemedText style={styles.closeButtonText}>✕</ThemedText>
          </TouchableOpacity>
        </ThemedView>

        <ThemedText style={styles.subtitle}>
          Choose the best cover art for "{bookTitle}"
        </ThemedText>

        <FlatList
          data={options}
          renderItem={renderCoverArtOption}
          keyExtractor={(item, index) => `${item.type}-${index}`}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          numColumns={2}
          showsVerticalScrollIndicator={false}
        />
      </ThemedView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    flex: 1,
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 20,
    color: '#ECEDEE',
  },
  subtitle: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#ECEDEE',
    opacity: 0.7,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  optionContainer: {
    flex: 1,
    margin: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  coverImage: {
    width: 120,
    height: 160,
    borderRadius: 8,
    marginBottom: 8,
  },
  optionType: {
    fontSize: 14,
    color: '#ECEDEE',
    textAlign: 'center',
    fontWeight: '500',
  },
});
