import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { PlexBook, plexService } from '@/services/PlexService';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Keyboard,
    Modal,
    StyleSheet,
    TextInput,
    TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

const PlexWordmarkSvg = `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>Plex</title><path d="M3.987 8.409c-.96 0-1.587.28-2.12.933v-.72H0v8.88s.038.018.127.037c.138.03.821.187 1.331-.249.441-.377.542-.814.542-1.318v-1.283c.533.573 1.147.813 2 .813 1.84 0 3.253-1.493 3.253-3.48 0-2.12-1.36-3.613-3.266-3.613Zm16.748 5.595.406.591c.391.614.894.906 1.492.908.621-.012 1.064-.562 1.226-.755 0 0-.307-.27-.686-.72-.517-.614-1.214-1.755-1.24-1.803l-1.198 1.779Zm-3.205-1.955c0-2.08-1.52-3.64-3.52-3.64s-3.467 1.587-3.467 3.573a3.48 3.48 0 0 0 3.507 3.52c1.413 0 2.626-.84 3.253-2.293h-2.04l-.093.093c-.427.4-.72.533-1.227.533-.787 0-1.373-.506-1.453-1.266h4.986c.04-.214.054-.307.054-.52Zm-7.671-.219c0 .769.11 1.701.868 2.722l.056.069c-.306.526-.742.88-1.248.88-.399 0-.814-.211-1.138-.579a2.177 2.177 0 0 1-.538-1.441V6.409H9.86l-.001 5.421Zm9.283 3.46h-2.39l2.247-3.332-2.247-3.335h2.39l2.248 3.335-2.248 3.332Zm1.593-1.286Zm-17.162-.342c-.933 0-1.68-.773-1.68-1.72s.76-1.666 1.68-1.666c.92 0 1.68.733 1.68 1.68 0 .946-.733 1.706-1.68 1.706Zm18.361-1.974L24 8.622h-2.391l-.87 1.293 1.195 1.773Zm-9.404-.466c.16-.706.72-1.133 1.493-1.133.773 0 1.373.467 1.507 1.133h-3Z"/></svg>`;

interface PlexBookSearchProps {
  visible: boolean;
  onClose: () => void;
  onSelectBook: (book: PlexBook) => void;
}

export const PlexBookSearch: React.FC<PlexBookSearchProps> = ({ 
  visible, 
  onClose, 
  onSelectBook 
}) => {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'title' | 'author'>('title');
  const [searching, setSearching] = useState(false);
  const [books, setBooks] = useState<PlexBook[]>([]);
  const [artists, setArtists] = useState<any[]>([]);
  const [selectedArtist, setSelectedArtist] = useState<any>(null);
  const [artistBooks, setArtistBooks] = useState<PlexBook[]>([]);
  const [showArtistFilter, setShowArtistFilter] = useState(false);

  const searchBooks = async () => {
    if (!query.trim()) return;

    // Dismiss keyboard when search starts
    Keyboard.dismiss();

    setSearching(true);
    setBooks([]);
    setArtists([]);
    setSelectedArtist(null);
    setArtistBooks([]);
    setShowArtistFilter(false);

    try {
      if (searchMode === 'title') {
        // Search for albums (books) by title
        const results = await plexService.searchBooks(query.trim(), undefined, 'title');
        setBooks(results);
      } else {
        // Search for artists (authors) only
        const results = await plexService.searchArtists(query.trim());
        setArtists(results);
      }
    } catch (error) {
      console.error('Search failed:', error);
      setBooks([]);
      setArtists([]);
    } finally {
      setSearching(false);
    }
  };

  const handleArtistSelect = async (artist: any) => {
    setSelectedArtist(artist);
    setShowArtistFilter(true);
    setSearching(true);

    try {
      // Get all books by this artist
      const results = await plexService.getBooksByArtist(artist.ratingKey);
      setArtistBooks(results);
    } catch (error) {
      console.error('Failed to load books:', error);
      setArtistBooks([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectBook = (book: PlexBook) => {
    onSelectBook(book);
  };



  const handleBackToArtists = () => {
    setSelectedArtist(null);
    setShowArtistFilter(false);
    setArtistBooks([]);
  };

  const cleanup = () => {
    setSearching(false);
    setBooks([]);
    setArtists([]);
    setSelectedArtist(null);
    setArtistBooks([]);
    setShowArtistFilter(false);
    setQuery('');
  };

  React.useEffect(() => {
    if (!visible) {
      cleanup();
    }
  }, [visible]);

  const renderBookItem = ({ item }: { item: PlexBook }) => (
    <TouchableOpacity
      style={styles.bookItem}
      onPress={() => handleSelectBook(item)}
    >
      <Image
        source={{ uri: item.coverUrl }}
        style={styles.bookCover}
        contentFit="cover"
      />
      <ThemedView style={styles.bookInfo}>
        <ThemedText style={styles.bookTitle} numberOfLines={2}>
          {item.title}
        </ThemedText>
        <ThemedText style={styles.bookAuthor} numberOfLines={1}>
          {item.author}
        </ThemedText>
        <ThemedText style={styles.bookDuration}>
          {formatDuration(item.duration)}
        </ThemedText>
      </ThemedView>
    </TouchableOpacity>
  );

  const renderArtistItem = ({ item }: { item: any }) => {
    // Extract initials from artist name
    const initials = item.title
      .split(' ')
      .map((word: string) => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);

    return (
      <TouchableOpacity
        style={styles.artistItem}
        onPress={() => handleArtistSelect(item)}
      >
        <ThemedView style={styles.artistImageContainer}>
          <ThemedText style={styles.artistInitials}>{initials}</ThemedText>
        </ThemedView>
        <ThemedView style={styles.artistInfo}>
          <ThemedText style={styles.artistName}>{item.title}</ThemedText>
          <ThemedText style={styles.artistSubtitle}>Tap to see all books</ThemedText>
        </ThemedView>
      </TouchableOpacity>
    );
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const renderContent = () => {
    if (searchMode === 'author' && showArtistFilter) {
      // Show books by selected artist
      return (
        <ThemedView style={styles.artistFilterContainer}>
          <ThemedView style={styles.artistFilterHeader}>
            <TouchableOpacity onPress={handleBackToArtists} style={styles.backButton}>
              <ThemedText style={styles.backButtonText}>← Back to Authors</ThemedText>
            </TouchableOpacity>
            <ThemedText style={styles.artistFilterTitle}>Books by {selectedArtist.title}</ThemedText>
          </ThemedView>
          <FlatList
            data={artistBooks}
            renderItem={renderBookItem}
            keyExtractor={(item) => item.id}
            style={styles.resultsList}
            contentContainerStyle={styles.resultsContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              !searching ? (
                <ThemedView style={styles.emptyState}>
                  <ThemedText style={styles.emptyText}>
                    No books found for this author
                  </ThemedText>
                </ThemedView>
              ) : null
            }
          />
        </ThemedView>
      );
    }

    if (searchMode === 'author' && artists.length > 0) {
      // Show artist search results
      return (
        <FlatList
          data={artists}
          renderItem={renderArtistItem}
          keyExtractor={(item) => item.ratingKey.toString()}
          style={styles.resultsList}
          contentContainerStyle={styles.resultsContent}
          showsVerticalScrollIndicator={false}
        />
      );
    }

    // Show book search results (for title mode or empty results)
    return (
      <FlatList
        data={books}
        renderItem={renderBookItem}
        keyExtractor={(item) => item.id}
        style={styles.resultsList}
        contentContainerStyle={styles.resultsContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          query.trim() && !searching ? (
            <ThemedView style={styles.emptyState}>
              <ThemedText style={styles.emptyText}>
                No {searchMode === 'title' ? 'books' : 'artists'} found for "{query}"
              </ThemedText>
            </ThemedView>
          ) : null
        }
      />
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={() => {
        cleanup();
        onClose();
      }}
    >
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ThemedView style={styles.header}>
          <ThemedView style={styles.plexWordmark}>
            <SvgXml 
              xml={PlexWordmarkSvg} 
              width={240} 
              height={72} 
              fill="#ECEDEE"
            />
          </ThemedView>
          <ThemedView style={styles.closeButtonSpacer} />
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <ThemedText style={styles.closeButtonText}>✕</ThemedText>
          </TouchableOpacity>
        </ThemedView>

        <ThemedView style={styles.searchContainer}>
          <ThemedView style={styles.searchModeToggle}>
            <TouchableOpacity
              style={[
                styles.modeButton,
                searchMode === 'title' && styles.modeButtonActive
              ]}
              onPress={() => {
                setSearchMode('title');
                cleanup();
              }}
            >
              <ThemedText style={[
                styles.modeButtonText,
                searchMode === 'title' && styles.modeButtonTextActive
              ]}>
                Book Title
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modeButton,
                searchMode === 'author' && styles.modeButtonActive
              ]}
              onPress={() => {
                setSearchMode('author');
                cleanup();
              }}
            >
              <ThemedText style={[
                styles.modeButtonText,
                searchMode === 'author' && styles.modeButtonTextActive
              ]}>
                Author
              </ThemedText>
            </TouchableOpacity>
          </ThemedView>
          
          <ThemedView style={styles.searchInputContainer}>
            <ThemedView style={styles.searchInputWrapper}>
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder={searchMode === 'title' ? "Search by book title..." : "Search by author name..."}
                placeholderTextColor="#666"
                autoCapitalize="words"
                returnKeyType="search"
                onSubmitEditing={searchBooks}
                blurOnSubmit={false}
              />
              {query.length > 0 && (
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={() => setQuery('')}
                >
                  <ThemedText style={styles.clearButtonText}>✕</ThemedText>
                </TouchableOpacity>
              )}
            </ThemedView>
            <TouchableOpacity
              style={[styles.searchButton, !query.trim() && styles.searchButtonDisabled]}
              onPress={searchBooks}
              disabled={!query.trim() || searching}
            >
              <ThemedText style={styles.searchButtonText}>Search</ThemedText>
            </TouchableOpacity>
          </ThemedView>

          {searching && (
            <ThemedView style={styles.loadingContainer}>
              <ActivityIndicator style={styles.searchIndicator} color="#E5A00D" />
              <ThemedText style={styles.loadingText}>Searching...</ThemedText>
            </ThemedView>
          )}
        </ThemedView>

        {renderContent()}
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
  plexWordmark: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 55,
  },
  closeButtonSpacer: {
    width: 40,
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 20,
    color: '#ECEDEE',
  },
  searchContainer: {
    padding: 16,
  },
  searchModeToggle: {
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 2,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#E5A00D',
  },
  modeButtonText: {
    color: '#ECEDEE',
    fontSize: 14,
    fontWeight: '500',
    opacity: 0.7,
  },
  modeButtonTextActive: {
    color: '#000000',
    opacity: 1,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    color: '#ECEDEE',
  },
  clearButton: {
    padding: 8,
    marginRight: 8,
  },
  clearButtonText: {
    color: '#ECEDEE',
    fontSize: 16,
    opacity: 0.7,
  },
  searchButton: {
    backgroundColor: '#E5A00D',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  searchButtonDisabled: {
    backgroundColor: 'rgba(229, 160, 13, 0.3)',
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  searchIndicator: {
    marginRight: 8,
  },
  loadingText: {
    color: '#ECEDEE',
    fontSize: 14,
  },
  resultsList: {
    flex: 1,
  },
  resultsContent: {
    padding: 16,
  },
  bookItem: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  bookCover: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 12,
  },
  bookInfo: {
    flex: 1,
    justifyContent: 'space-between',
  },
  bookTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ECEDEE',
    marginBottom: 4,
  },
  bookAuthor: {
    fontSize: 14,
    color: '#ECEDEE',
    opacity: 0.7,
    marginBottom: 4,
  },
  bookDuration: {
    fontSize: 12,
    color: '#E5A00D',
    fontWeight: '500',
  },
  artistItem: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  artistImageContainer: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: '#E5A00D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  artistInitials: {
    color: '#000000',
    fontSize: 20,
    fontWeight: '600',
  },
  artistInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  artistName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ECEDEE',
    marginBottom: 4,
  },
  artistSubtitle: {
    fontSize: 14,
    color: '#ECEDEE',
    opacity: 0.6,
  },
  artistFilterContainer: {
    flex: 1,
  },
  artistFilterHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  backButton: {
    marginBottom: 8,
  },
  backButtonText: {
    color: '#E5A00D',
    fontSize: 14,
    fontWeight: '500',
  },
  artistFilterTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ECEDEE',
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
