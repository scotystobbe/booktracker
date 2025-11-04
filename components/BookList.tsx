import { BookCoverImage } from '@/components/BookCoverImage';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useBooks } from '@/context/BookContext';
import { Book } from '@/types/Book';
import { imageService } from '@/services/ImageService';
import { plexService, PlexBook } from '@/services/PlexService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, StyleSheet, TextInput, TouchableOpacity, Keyboard } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

interface BookListProps {
  onBookPress: (book: Book) => void;
  onAddBook: () => void;
}

export const BookList: React.FC<BookListProps> = ({ onBookPress, onAddBook }) => {
  const { books, deleteBook, updateBook } = useBooks();
  const insets = useSafeAreaInsets();
  const [refreshingBookId, setRefreshingBookId] = useState<string | null>(null);
  const [showRefreshModal, setShowRefreshModal] = useState(false);
  const [refreshBook, setRefreshBook] = useState<Book | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlexBook[]>([]);
  const [searching, setSearching] = useState(false);
  const [useCustomUrl, setUseCustomUrl] = useState(false);
  const [customImageUrl, setCustomImageUrl] = useState('');
  const swipeableRefs = React.useRef<{ [key: string]: Swipeable | null }>({});

  const handleDeleteBook = (book: Book) => {
    Alert.alert(
      'Delete Book',
      `Are you sure you want to delete "${book.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteBook(book.id),
        },
      ]
    );
  };

  const handleRefreshArtwork = async (book: Book) => {
    // Close the swipeable
    swipeableRefs.current[book.id]?.close();
    
    // Ensure auth is refreshed from storage (silently)
    const hasAuth = await plexService.ensureAuth();
    
    // Check if Plex is configured
    const authConfig = plexService.getAuthConfig();
    if (!authConfig) {
      // Only show alert if auth doesn't exist in storage at all
      const authData = await AsyncStorage.getItem('plex_auth');
      if (!authData) {
        Alert.alert(
          'Plex Not Configured',
          'Please configure Plex in settings to refresh artwork from your server.',
          [{ text: 'OK' }]
        );
      } else {
        // Auth exists but failed to load - might need re-auth, but don't show alert
        console.log('Auth exists but failed to load - user may need to refresh in settings');
      }
      return;
    }

    // Set up the refresh modal with initial search
    setRefreshBook(book);
    setSearchQuery(book.title);
    setSearchResults([]);
    setShowRefreshModal(true);
    
    // Perform initial search
    await performSearch(book.title);
  };

  const performSearch = async (query: string) => {
    if (!query.trim() || !refreshBook) return;

    Keyboard.dismiss();
    setSearching(true);
    setSearchResults([]);

    try {
      const results = await plexService.searchBooks(query.trim(), undefined, 'title');
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectBookForRefresh = async (plexBook: PlexBook) => {
    if (!refreshBook || !plexBook.coverUrl) return;

    setRefreshingBookId(refreshBook.id);
    setShowRefreshModal(false);

    try {
      console.log('Updating artwork with cover URL:', plexBook.coverUrl);

      // Delete old local image if it exists
      if (refreshBook.local_cover_path) {
        try {
          await imageService.deleteLocalImage(refreshBook.id, refreshBook.cover_url);
        } catch (error) {
          console.error('Failed to delete old local image:', error);
          // Continue even if deletion fails
        }
      }

      // Download new image (force download)
      const newLocalPath = await imageService.downloadAndResizeImage(
        plexBook.coverUrl,
        refreshBook.id,
        true // force download
      );

      console.log('Downloaded new image to:', newLocalPath);

      // Update the book with new cover URL and local path
      await updateBook(refreshBook.id, {
        cover_url: plexBook.coverUrl,
        local_cover_path: newLocalPath,
      });

      console.log('Book updated in database, reloading books...');
    } catch (error) {
      console.error('Failed to refresh artwork:', error);
      Alert.alert(
        'Error',
        `Failed to refresh artwork: ${error instanceof Error ? error.message : 'Unknown error'}`,
        [{ text: 'OK' }]
      );
    } finally {
      setRefreshingBookId(null);
      setRefreshBook(null);
      setSearchQuery('');
      setSearchResults([]);
    }
  };

  const handleCustomUrlSubmit = async () => {
    if (!refreshBook || !customImageUrl.trim()) return;

    // Validate URL
    try {
      new URL(customImageUrl.trim());
    } catch (error) {
      Alert.alert(
        'Invalid URL',
        'Please enter a valid image URL (e.g., https://example.com/image.jpg)',
        [{ text: 'OK' }]
      );
      return;
    }

    setRefreshingBookId(refreshBook.id);
    setShowRefreshModal(false);

    try {
      console.log('Updating artwork with custom URL:', customImageUrl);

      // Delete old local image if it exists
      if (refreshBook.local_cover_path) {
        try {
          await imageService.deleteLocalImage(refreshBook.id, refreshBook.cover_url);
        } catch (error) {
          console.error('Failed to delete old local image:', error);
          // Continue even if deletion fails
        }
      }

      // Download new image (force download)
      const newLocalPath = await imageService.downloadAndResizeImage(
        customImageUrl.trim(),
        refreshBook.id,
        true // force download
      );

      console.log('Downloaded new image to:', newLocalPath);

      // Update the book with new cover URL and local path
      await updateBook(refreshBook.id, {
        cover_url: customImageUrl.trim(),
        local_cover_path: newLocalPath,
      });

      console.log('Book updated in database, reloading books...');
    } catch (error) {
      console.error('Failed to update artwork:', error);
      Alert.alert(
        'Error',
        `Failed to update artwork: ${error instanceof Error ? error.message : 'Unknown error'}`,
        [{ text: 'OK' }]
      );
    } finally {
      setRefreshingBookId(null);
      setRefreshBook(null);
      setSearchQuery('');
      setSearchResults([]);
      setUseCustomUrl(false);
      setCustomImageUrl('');
    }
  };

  const handleCloseRefreshModal = () => {
    setShowRefreshModal(false);
    setRefreshBook(null);
    setSearchQuery('');
    setSearchResults([]);
    setSearching(false);
    setUseCustomUrl(false);
    setCustomImageUrl('');
  };

  const renderBookItem = ({ item }: { item: Book }) => {
    const renderRightActions = (progress: any, dragX: any) => {
      const scale = dragX.interpolate({
        inputRange: [-80, 0],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      });

      return (
        <TouchableOpacity
          style={[styles.deleteAction, { transform: [{ scale }] }]}
          onPress={() => handleDeleteBook(item)}
        >
          <IconSymbol name="trash" size={24} color="#ffffff" />
          <ThemedText style={styles.deleteActionText}>Delete</ThemedText>
        </TouchableOpacity>
      );
    };

    const renderLeftActions = (progress: any, dragX: any) => {
      const scale = dragX.interpolate({
        inputRange: [0, 80],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      });

      const isRefreshing = refreshingBookId === item.id;

      return (
        <TouchableOpacity
          style={[styles.refreshAction, { transform: [{ scale }] }]}
          onPress={() => handleRefreshArtwork(item)}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <IconSymbol name="arrow.clockwise" size={24} color="#ffffff" />
              <ThemedText style={styles.refreshActionText}>Refresh Artwork</ThemedText>
            </>
          )}
        </TouchableOpacity>
      );
    };

    return (
      <Swipeable
        ref={(ref) => {
          swipeableRefs.current[item.id] = ref;
        }}
        renderRightActions={renderRightActions}
        renderLeftActions={renderLeftActions}
        rightThreshold={40}
        leftThreshold={40}
        overshootRight={false}
        overshootLeft={false}
        friction={1}
        enableTrackpadTwoFingerGesture={true}
        useNativeAnimations={true}
      >
        <TouchableOpacity
          style={styles.bookItem}
          onPress={() => onBookPress(item)}
          activeOpacity={0.7}
        >
          <BookCoverImage
            book={item}
            style={styles.bookCover}
          />
          <ThemedView style={styles.bookInfo}>
            <ThemedText type="defaultSemiBold" numberOfLines={2}>
              {item.title}
            </ThemedText>
            <ThemedText style={styles.author} numberOfLines={1}>
              by {item.author}
            </ThemedText>
            <ThemedText style={styles.duration}>
              {(() => {
                const wholeHours = Math.floor(item.duration);
                const minutes = Math.round((item.duration - wholeHours) * 60);
                const hourLabel = (wholeHours > 1 || (wholeHours === 1 && minutes > 59)) ? 'hrs' : 'hr';
                
                if (wholeHours === 0) {
                  return `${minutes} min`;
                } else if (minutes === 0) {
                  return `${wholeHours} ${hourLabel}`;
                } else {
                  return `${wholeHours} ${hourLabel} ${minutes} min`;
                }
              })()}
            </ThemedText>
            <ThemedText style={styles.status}>
              {item.finish_date ? 'Completed' : 'In Progress'}
            </ThemedText>
          </ThemedView>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  const renderEmptyState = () => (
    <ThemedView style={styles.emptyState}>
      <ThemedText type="subtitle">No books yet</ThemedText>
      <ThemedText style={styles.emptyText}>
        Tap the + button to add your first book
      </ThemedText>
    </ThemedView>
  );

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={books}
        renderItem={renderBookItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={books.length === 0 ? styles.emptyContainer : styles.listContainer}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />
      
      {/* Refresh Artwork Modal */}
      <Modal
        visible={showRefreshModal}
        animationType="slide"
        onRequestClose={handleCloseRefreshModal}
      >
        <ThemedView style={[styles.refreshModalContainer, { paddingTop: insets.top }]}>
          <ThemedView style={styles.refreshModalHeader}>
            <ThemedText style={styles.refreshModalTitle}>Refresh Artwork</ThemedText>
            <TouchableOpacity onPress={handleCloseRefreshModal}>
              <IconSymbol name="xmark" size={24} color="#ECEDEE" />
            </TouchableOpacity>
          </ThemedView>
          
          {refreshBook && (
            <ThemedView style={styles.refreshBookInfo}>
              <ThemedText style={styles.refreshBookTitle}>{refreshBook.title}</ThemedText>
              <ThemedText style={styles.refreshBookAuthor}>by {refreshBook.author}</ThemedText>
            </ThemedView>
          )}

          {/* Mode Toggle */}
          <ThemedView style={styles.modeToggleContainer}>
            <TouchableOpacity
              style={[styles.modeToggleButton, !useCustomUrl && styles.modeToggleButtonActive]}
              onPress={() => setUseCustomUrl(false)}
            >
              <ThemedText style={[styles.modeToggleText, !useCustomUrl && styles.modeToggleTextActive]}>
                Search Plex
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeToggleButton, useCustomUrl && styles.modeToggleButtonActive]}
              onPress={() => setUseCustomUrl(true)}
            >
              <ThemedText style={[styles.modeToggleText, useCustomUrl && styles.modeToggleTextActive]}>
                Custom URL
              </ThemedText>
            </TouchableOpacity>
          </ThemedView>

          {useCustomUrl ? (
            <ThemedView style={styles.searchContainer}>
              <ThemedView style={styles.searchInputWrapper}>
                <TextInput
                  style={styles.searchInput}
                  value={customImageUrl}
                  onChangeText={setCustomImageUrl}
                  placeholder="Enter image URL..."
                  placeholderTextColor="#666"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  returnKeyType="done"
                  onSubmitEditing={handleCustomUrlSubmit}
                />
                {customImageUrl.length > 0 && (
                  <TouchableOpacity
                    style={styles.clearButton}
                    onPress={() => setCustomImageUrl('')}
                  >
                    <ThemedText style={styles.clearButtonText}>✕</ThemedText>
                  </TouchableOpacity>
                )}
              </ThemedView>
              <TouchableOpacity
                style={[styles.searchButton, !customImageUrl.trim() && styles.searchButtonDisabled]}
                onPress={handleCustomUrlSubmit}
                disabled={!customImageUrl.trim() || refreshingBookId === refreshBook?.id}
              >
                <ThemedText style={styles.searchButtonText}>
                  {refreshingBookId === refreshBook?.id ? 'Updating...' : 'Update Artwork'}
                </ThemedText>
              </TouchableOpacity>
            </ThemedView>
          ) : (
            <ThemedView style={styles.searchContainer}>
              <ThemedView style={styles.searchInputWrapper}>
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search for book..."
                  placeholderTextColor="#666"
                  autoCapitalize="words"
                  returnKeyType="search"
                  onSubmitEditing={() => performSearch(searchQuery)}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity
                    style={styles.clearButton}
                    onPress={() => setSearchQuery('')}
                  >
                    <ThemedText style={styles.clearButtonText}>✕</ThemedText>
                  </TouchableOpacity>
                )}
              </ThemedView>
              <TouchableOpacity
                style={[styles.searchButton, !searchQuery.trim() && styles.searchButtonDisabled]}
                onPress={() => performSearch(searchQuery)}
                disabled={!searchQuery.trim() || searching}
              >
                <ThemedText style={styles.searchButtonText}>Search</ThemedText>
              </TouchableOpacity>
            </ThemedView>
          )}

          {searching && !useCustomUrl && (
            <ThemedView style={styles.searchingContainer}>
              <ActivityIndicator size="small" color="#50b042" />
              <ThemedText style={styles.searchingText}>Searching...</ThemedText>
            </ThemedView>
          )}

          {!useCustomUrl && (
            <FlatList
              data={searchResults}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.resultItem}
                  onPress={() => handleSelectBookForRefresh(item)}
                >
                  <Image
                    source={{ uri: item.coverUrl }}
                    style={styles.resultCover}
                    contentFit="cover"
                  />
                  <ThemedView style={styles.resultInfo}>
                    <ThemedText style={styles.resultTitle} numberOfLines={2}>
                      {item.title}
                    </ThemedText>
                    <ThemedText style={styles.resultAuthor} numberOfLines={1}>
                      {item.author}
                    </ThemedText>
                    {item.duration > 0 && (
                      <ThemedText style={styles.resultDuration}>
                        {Math.floor(item.duration / 3600)}h {Math.round((item.duration % 3600) / 60)}m
                      </ThemedText>
                    )}
                  </ThemedView>
                </TouchableOpacity>
              )}
              keyExtractor={(item) => item.id}
              style={styles.resultsList}
              contentContainerStyle={styles.resultsContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                searchQuery.trim() && !searching ? (
                  <ThemedView style={styles.emptyResults}>
                    <ThemedText style={styles.emptyResultsText}>
                      No books found for "{searchQuery}"
                    </ThemedText>
                    <ThemedText style={styles.emptyResultsSubtext}>
                      Try a different search term
                    </ThemedText>
                  </ThemedView>
                ) : !searchQuery.trim() ? (
                  <ThemedView style={styles.emptyResults}>
                    <ThemedText style={styles.emptyResultsText}>
                      Enter a search term to find books
                    </ThemedText>
                  </ThemedView>
                ) : null
              }
            />
          )}
        </ThemedView>
      </Modal>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContainer: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  bookItem: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  bookCover: {
    width: 60,
    height: 90,
    borderRadius: 8,
    marginRight: 12,
  },
  bookInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  author: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 4,
  },
  duration: {
    fontSize: 12,
    opacity: 0.6,
    marginTop: 4,
  },
  status: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    color: '#4CAF50',
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.7,
  },
  deleteAction: {
    backgroundColor: '#d63031',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
    marginLeft: 8,
  },
  deleteActionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  refreshAction: {
    backgroundColor: '#50b042',
    justifyContent: 'center',
    alignItems: 'center',
    width: 120,
    height: '100%',
    marginRight: 8,
  },
  refreshActionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  refreshModalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  refreshModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  refreshModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ECEDEE',
  },
  refreshBookInfo: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  refreshBookTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ECEDEE',
    marginBottom: 4,
  },
  refreshBookAuthor: {
    fontSize: 14,
    color: '#ECEDEE',
    opacity: 0.7,
  },
  modeToggleContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 2,
  },
  modeToggleButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  modeToggleButtonActive: {
    backgroundColor: '#50b042',
  },
  modeToggleText: {
    fontSize: 14,
    color: '#ECEDEE',
    opacity: 0.7,
  },
  modeToggleTextActive: {
    color: '#ffffff',
    fontWeight: '600',
    opacity: 1,
  },
  searchContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    height: 44,
    color: '#ECEDEE',
    fontSize: 16,
  },
  clearButton: {
    padding: 4,
  },
  clearButtonText: {
    color: '#ECEDEE',
    fontSize: 18,
    opacity: 0.7,
  },
  searchButton: {
    backgroundColor: '#50b042',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  searchButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    opacity: 0.5,
  },
  searchButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  searchingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  searchingText: {
    color: '#ECEDEE',
    fontSize: 14,
    opacity: 0.7,
  },
  resultsList: {
    flex: 1,
  },
  resultsContent: {
    padding: 16,
  },
  resultItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  resultCover: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  resultInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ECEDEE',
    marginBottom: 4,
  },
  resultAuthor: {
    fontSize: 14,
    color: '#ECEDEE',
    opacity: 0.7,
    marginBottom: 4,
  },
  resultDuration: {
    fontSize: 12,
    color: '#ECEDEE',
    opacity: 0.6,
  },
  emptyResults: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyResultsText: {
    fontSize: 16,
    color: '#ECEDEE',
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyResultsSubtext: {
    fontSize: 14,
    color: '#ECEDEE',
    opacity: 0.5,
    textAlign: 'center',
  },
});
