import { BookCoverImage } from '@/components/BookCoverImage';
import { BookForm } from '@/components/BookForm';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useBooks } from '@/context/BookContext';
import { Book } from '@/types/Book';
import { imageService } from '@/services/ImageService';
import { plexService, PlexBook } from '@/services/PlexService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, Keyboard } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

interface HistoricalBooksProps {
  onBookPress: (book: Book) => void;
}

interface BookGroup {
  year: string;
  books: Book[];
}

export default function HistoricalBooks({ onBookPress }: HistoricalBooksProps) {
  const { books, loading, deleteBook, updateBook } = useBooks();
  const insets = useSafeAreaInsets();
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [refreshingBookId, setRefreshingBookId] = useState<string | null>(null);
  const [showRefreshModal, setShowRefreshModal] = useState(false);
  const [refreshBook, setRefreshBook] = useState<Book | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlexBook[]>([]);
  const [searching, setSearching] = useState(false);
  const [useCustomUrl, setUseCustomUrl] = useState(false);
  const [customImageUrl, setCustomImageUrl] = useState('');
  const [showBookForm, setShowBookForm] = useState(false);
  const [bookListSearchQuery, setBookListSearchQuery] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const swipeableRefs = useRef<{ [key: string]: Swipeable | null }>({});

  // Group books by year and sort by oldest first within each year
  const getGroupedBooks = (): BookGroup[] => {
    // Include both completed books and current books (percent_complete < 100)
    const allBooks = books.filter(book => book.percent_complete === 100 || book.percent_complete < 100);

    // Group by year first
    const grouped = allBooks.reduce((groups, book) => {
      // For current books (not finished), use start_date year
      // For completed books, use finish_date year
      const dateToUse = book.percent_complete === 100 ? book.finish_date : book.start_date;
      if (!dateToUse) return groups;
      
      const year = new Date(dateToUse).getFullYear().toString();
      if (!groups[year]) {
        groups[year] = [];
      }
      groups[year].push(book);
      return groups;
    }, {} as Record<string, Book[]>);

    // Sort books within each year based on sortOrder
    Object.keys(grouped).forEach(year => {
      grouped[year].sort((a, b) => {
        // For completed books, use finish_date; for current books, use start_date
        const aDate = a.percent_complete === 100 ? a.finish_date : a.start_date;
        const bDate = b.percent_complete === 100 ? b.finish_date : b.start_date;
        
        if (!aDate || !bDate) return 0;
        const aTime = new Date(aDate).getTime();
        const bTime = new Date(bDate).getTime();
        return sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
      });
    });

    // Convert to array and sort years (most recent first)
    return Object.entries(grouped)
      .map(([year, books]) => ({ year, books }))
      .sort((a, b) => parseInt(b.year) - parseInt(a.year));
  };

  const getAvailableYears = (): string[] => {
    const groupedBooks = getGroupedBooks();
    return groupedBooks.map(group => group.year);
  };

  const getCurrentYearData = (): BookGroup | null => {
    const groupedBooks = getGroupedBooks();
    if (selectedYear) {
      return groupedBooks.find(group => group.year === selectedYear) || null;
    }
    return groupedBooks.length > 0 ? groupedBooks[0] : null;
  };

  // Filter books by search query (title or author) across all years
  const getSearchResults = (): Book[] => {
    if (!bookListSearchQuery.trim()) {
      return [];
    }

    const query = bookListSearchQuery.toLowerCase().trim();
    const allBooks = books.filter(book => book.percent_complete === 100 || book.percent_complete < 100);
    
    const filtered = allBooks.filter(book => {
      const titleMatch = book.title.toLowerCase().includes(query);
      const authorMatch = book.author.toLowerCase().includes(query);
      return titleMatch || authorMatch;
    });

    // Sort results based on sortOrder
    return filtered.sort((a, b) => {
      const aDate = a.percent_complete === 100 ? a.finish_date : a.start_date;
      const bDate = b.percent_complete === 100 ? b.finish_date : b.start_date;
      
      if (!aDate || !bDate) return 0;
      const aTime = new Date(aDate).getTime();
      const bTime = new Date(bDate).getTime();
      return sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
    });
  };

  // Scroll to top when year, sort order, or search query changes
  useEffect(() => {
    if (flatListRef.current) {
      flatListRef.current.scrollToOffset({ offset: 0, animated: true });
    }
  }, [selectedYear, sortOrder, bookListSearchQuery]);

  // Auto-search when refresh modal opens with a book
  useEffect(() => {
    if (showRefreshModal && refreshBook && searchQuery.trim() && !useCustomUrl) {
      // Only auto-search if we don't already have results and aren't currently searching
      if (searchResults.length === 0 && !searching) {
        performSearch(searchQuery);
      }
    }
  }, [showRefreshModal, refreshBook, searchQuery]);

  const handleDeleteBook = (book: Book) => {
    Alert.alert(
      'Delete Book',
      `Are you sure you want to delete "${book.title}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteBook(book.id);
          },
        },
      ]
    );
  };

  const handleRefreshArtwork = async (book: Book) => {
    // Close the swipeable
    swipeableRefs.current[book.id]?.close();
    
    // Ensure auth is refreshed from storage (silently)
    await plexService.ensureAuth();
    
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
    setUseCustomUrl(false);
    setShowRefreshModal(true);
    
    // Perform initial search - use a small delay to ensure state is set
    setTimeout(() => {
      performSearch(book.title);
    }, 100);
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
      // Only pass local_cover_path to avoid double-downloading in updateBook
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

  const handleCloseRefreshModal = () => {
    setShowRefreshModal(false);
    setRefreshBook(null);
    setSearchQuery('');
    setSearchResults([]);
    setSearching(false);
    setUseCustomUrl(false);
    setCustomImageUrl('');
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

  const calculateHoursPerDay = (book: Book): number => {
    const startDate = new Date(book.start_date);
    const endDate = book.percent_complete === 100 && book.finish_date 
      ? new Date(book.finish_date) 
      : new Date(); // Use current date for ongoing books
    
    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysDiff <= 0) return 0;
    
    // Calculate book hours completed (not adjusted for reading speed)
    const bookHoursCompleted = (book.duration * book.percent_complete) / 100;
    
    // Calculate book hours per day
    const bookHoursPerDay = bookHoursCompleted / daysDiff;
    
    // Calculate true hours per day (adjusted for reading speed)
    const trueHoursPerDay = bookHoursPerDay / book.reading_speed;
    
    return trueHoursPerDay;
  };

  const calculateDays = (book: Book): number => {
    const startDate = new Date(book.start_date);
    const endDate = book.percent_complete === 100 && book.finish_date 
      ? new Date(book.finish_date) 
      : new Date(); // Use current date for ongoing books
    
    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    
    return Math.max(0, daysDiff);
  };

  const formatDateRange = (book: Book): string => {
    const startDate = new Date(book.start_date);
    const endDate = book.percent_complete === 100 && book.finish_date 
      ? new Date(book.finish_date) 
      : new Date(); // Use current date for ongoing books
    
    const formatDate = (date: Date) => {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const year = date.getFullYear().toString().slice(-2);
      return `${month}/${day}/${year}`;
    };
    
    if (book.percent_complete === 100) {
      return `${formatDate(startDate)} - ${formatDate(endDate)}`;
    } else {
      return `${formatDate(startDate)} - ongoing`;
    }
  };

  const renderBookItem = ({ item: book, index }: { item: Book; index: number }) => {
    const hoursPerDay = calculateHoursPerDay(book);
    const days = calculateDays(book);
    const dateRange = formatDateRange(book);

    // Calculate chronological position (always oldest = 1, regardless of sort order)
    const currentYearData = getCurrentYearData();
    const chronologicalIndex = currentYearData ? 
      currentYearData.books
        .slice()
        .sort((a, b) => {
          // For completed books, use finish_date; for current books, use start_date
          const aDate = a.percent_complete === 100 ? a.finish_date : a.start_date;
          const bDate = b.percent_complete === 100 ? b.finish_date : b.start_date;
          
          if (!aDate || !bDate) return 0;
          return new Date(aDate).getTime() - new Date(bDate).getTime();
        })
        .findIndex(b => b.id === book.id) + 1 : index + 1;

    const renderRightActions = (progress: any, dragX: any) => {
      const scale = dragX.interpolate({
        inputRange: [-80, 0],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      });

      return (
        <TouchableOpacity
          style={[styles.deleteAction, { transform: [{ scale }] }]}
          onPress={() => handleDeleteBook(book)}
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

      const isRefreshing = refreshingBookId === book.id;

      return (
        <TouchableOpacity
          style={[styles.refreshAction, { transform: [{ scale }] }]}
          onPress={() => handleRefreshArtwork(book)}
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
          swipeableRefs.current[book.id] = ref;
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
          style={[styles.bookItem, index % 2 === 1 && styles.bookItemAlternate]}
          onPress={() => onBookPress(book)}
          activeOpacity={0.7}
        >
          <ThemedText style={styles.bookNumber}>{chronologicalIndex}</ThemedText>
          <BookCoverImage 
            book={book} 
            style={styles.bookCover}
          />
          
          <ThemedView style={styles.bookInfo}>
            <ThemedText style={styles.bookTitle}>{book.title}</ThemedText>
            <ThemedText style={styles.bookAuthor}>{book.author}</ThemedText>
            <ThemedText style={styles.duration}>
              {Math.floor(book.duration)}h {Math.round((book.duration % 1) * 60)}m
            </ThemedText>
          </ThemedView>
          
          <ThemedView style={styles.bookStats}>
            <ThemedText style={styles.hoursPerDay}>
              {hoursPerDay.toFixed(1)} hrs/day
            </ThemedText>
            <ThemedText style={styles.days}>
              {days.toFixed(1)} days
            </ThemedText>
            <ThemedText style={styles.dateRange}>
              {dateRange}
            </ThemedText>
          </ThemedView>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  const renderYearPicker = () => {
    const availableYears = getAvailableYears();
    const currentYear = selectedYear || (availableYears.length > 0 ? availableYears[0] : null);

    return (
      <ThemedView style={styles.headerContent}>
        <ThemedView style={styles.yearPickerContainer}>
          <TouchableOpacity 
            style={styles.yearPickerButton}
            onPress={() => setShowYearPicker(true)}
          >
            <ThemedText style={styles.yearPickerText}>{currentYear}</ThemedText>
            <IconSymbol name="chevron.down" size={16} color="#ECEDEE" />
          </TouchableOpacity>
        </ThemedView>
        
        <ThemedView style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => setShowBookForm(true)}
          >
            <IconSymbol name="plus" size={20} color="#50b042" />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.sortButton}
            onPress={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
          >
            <IconSymbol 
              name={sortOrder === 'newest' ? "arrow.down" : "arrow.up"} 
              size={16} 
              color="#ECEDEE" 
            />
          </TouchableOpacity>
        </ThemedView>
      </ThemedView>
    );
  };

  const renderYearPickerModal = () => {
    const availableYears = getAvailableYears();

    return (
      <Modal
        visible={showYearPicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowYearPicker(false)}
      >
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>Select Year</ThemedText>
            <ScrollView style={styles.yearList}>
              {availableYears.map((year) => (
                <TouchableOpacity
                  key={year}
                  style={[
                    styles.yearOption,
                    selectedYear === year && styles.yearOptionSelected
                  ]}
                  onPress={() => {
                    setSelectedYear(year);
                    setShowYearPicker(false);
                  }}
                >
                  <ThemedText style={[
                    styles.yearOptionText,
                    selectedYear === year && styles.yearOptionTextSelected
                  ]}>
                    {year}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowYearPicker(false)}
            >
              <ThemedText style={styles.modalCloseText}>Cancel</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        </ThemedView>
      </Modal>
    );
  };

  if (loading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#50b042" />
        <ThemedText style={styles.loadingText}>Loading books...</ThemedText>
      </ThemedView>
    );
  }

  const currentYearData = getCurrentYearData();

  if (!currentYearData) {
    return (
      <ThemedView style={styles.emptyContainer}>
        <ThemedText style={styles.emptyText}>No books yet</ThemedText>
        <ThemedText style={styles.emptySubtext}>
          Start a book to see it in your list
        </ThemedText>
      </ThemedView>
    );
  }

  const bookListSearchResults = getSearchResults();
  const isSearching = bookListSearchQuery.trim().length > 0;
  const displayBooks = isSearching ? bookListSearchResults : (currentYearData?.books || []);

  // Clear search when user clears the input
  const handleClearSearch = () => {
    setBookListSearchQuery('');
    setShowSearchInput(false);
  };

  // Handle search button press
  const handleSearchButtonPress = () => {
    setShowSearchInput(true);
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={[styles.header, { paddingTop: insets.top + 16 }]}>
        {showSearchInput || isSearching ? (
          /* Search Input */
          <ThemedView style={styles.bookListSearchContainer}>
            <ThemedView style={styles.bookListSearchInputWrapper}>
              <IconSymbol name="magnifyingglass" size={18} color="#666" style={styles.searchIcon} />
              <TextInput
                style={styles.bookListSearchInput}
                value={bookListSearchQuery}
                onChangeText={setBookListSearchQuery}
                placeholder="Search by title or author..."
                placeholderTextColor="#666"
                autoCapitalize="words"
                returnKeyType="search"
                autoFocus={showSearchInput}
              />
              <TouchableOpacity
                style={styles.bookListSearchClearButton}
                onPress={handleClearSearch}
              >
                <IconSymbol name="xmark" size={18} color="#ECEDEE" />
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        ) : (
          /* Year Picker with Action Buttons */
          <ThemedView style={styles.headerContent}>
            <ThemedView style={styles.yearPickerContainer}>
              <TouchableOpacity 
                style={styles.yearPickerButton}
                onPress={() => setShowYearPicker(true)}
              >
                <ThemedText style={styles.yearPickerText}>{selectedYear || (getAvailableYears().length > 0 ? getAvailableYears()[0] : null)}</ThemedText>
                <IconSymbol name="chevron.down" size={16} color="#ECEDEE" />
              </TouchableOpacity>
            </ThemedView>
            
            <ThemedView style={styles.headerActions}>
              <TouchableOpacity 
                style={styles.searchToggleButton}
                onPress={handleSearchButtonPress}
              >
                <IconSymbol name="magnifyingglass" size={20} color="#ECEDEE" />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.addButton}
                onPress={() => setShowBookForm(true)}
              >
                <IconSymbol name="plus" size={20} color="#50b042" />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.sortButton}
                onPress={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
              >
                <IconSymbol 
                  name={sortOrder === 'newest' ? "arrow.down" : "arrow.up"} 
                  size={16} 
                  color="#ECEDEE" 
                />
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        )}
      </ThemedView>
      
      <FlatList
        ref={flatListRef}
        data={displayBooks}
        renderItem={renderBookItem}
        keyExtractor={(book) => book.id}
        contentContainerStyle={[styles.listContainer, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <ThemedView style={styles.separator} />}
        ListEmptyComponent={
          isSearching ? (
            <ThemedView style={styles.emptyContainer}>
              <ThemedText style={styles.emptyText}>No books found</ThemedText>
              <ThemedText style={styles.emptySubtext}>
                Try searching by title or author name
              </ThemedText>
            </ThemedView>
          ) : null
        }
      />
      
      {renderYearPickerModal()}
      
      {/* Book Form Modal */}
      {showBookForm && (
        <Modal
          visible={showBookForm}
          animationType="slide"
          onRequestClose={() => setShowBookForm(false)}
        >
          <BookForm
            onSave={() => setShowBookForm(false)}
            onCancel={() => setShowBookForm(false)}
          />
        </Modal>
      )}
      
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
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchToggleButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButton: {
    backgroundColor: 'rgba(80, 176, 66, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookListSearchContainer: {
    marginBottom: 12,
  },
  bookListSearchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  bookListSearchInput: {
    flex: 1,
    height: 44,
    color: '#ECEDEE',
    fontSize: 16,
    paddingLeft: 8,
  },
  bookListSearchClearButton: {
    padding: 4,
  },
  searchIcon: {
    marginRight: 4,
  },
  listContainer: {
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,

  },
  loadingText: {
    opacity: 0.7,
    color: '#ECEDEE',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 16,

  },
  emptyText: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    color: '#ECEDEE',
  },
  emptySubtext: {
    fontSize: 16,
    opacity: 0.7,
    textAlign: 'center',
    color: '#ECEDEE',
  },
  yearPickerContainer: {
    alignItems: 'center',
  },
  yearPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  yearPickerText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ECEDEE',
    marginRight: 8,
  },
  yearPickerArrow: {
    fontSize: 16,
    color: '#ECEDEE',
    opacity: 0.7,
  },
  sortButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortButtonText: {
    fontSize: 18,
    color: '#50b042',
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxHeight: '60%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ECEDEE',
    textAlign: 'center',
    marginBottom: 16,
  },
  yearList: {
    maxHeight: 300,
  },
  yearOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 4,
  },
  yearOptionSelected: {
    backgroundColor: '#50b042',
  },
  yearOptionText: {
    fontSize: 18,
    color: '#ECEDEE',
    textAlign: 'center',
  },
  yearOptionTextSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },
  modalCloseButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalCloseText: {
    fontSize: 16,
    color: '#ECEDEE',
    textAlign: 'center',
  },
  bookItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: 'transparent',
  },
  bookItemAlternate: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  bookCover: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  bookNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ECEDEE',
    width: 40,
    textAlign: 'center',
    marginRight: 12,
  },
  bookInfo: {
    flex: 1,
    marginRight: 12,
  },
  bookTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ECEDEE',
    marginBottom: 4,
  },
  bookAuthor: {
    fontSize: 14,
    color: '#ECEDEE',
    opacity: 0.7,
  },
  duration: {
    fontSize: 14,
    color: '#ECEDEE',
    opacity: 0.7,
    marginTop: 2,
  },
  bookStats: {
    alignItems: 'flex-end',
  },
  hoursPerDay: {
    fontSize: 14,
    color: '#ECEDEE',
    opacity: 0.8,
    marginBottom: 2,
  },
  days: {
    fontSize: 14,
    color: '#ECEDEE',
    opacity: 0.8,
    marginBottom: 2,
  },
  dateRange: {
    fontSize: 12,
    color: '#ECEDEE',
    opacity: 0.6,
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
  separator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginLeft: 102, // Align with book content
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
