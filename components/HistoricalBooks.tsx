import { BookCoverImage } from '@/components/BookCoverImage';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useBooks } from '@/context/BookContext';
import { Book } from '@/types/Book';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface HistoricalBooksProps {
  onBookPress: (book: Book) => void;
}

interface BookGroup {
  year: string;
  books: Book[];
}

export default function HistoricalBooks({ onBookPress }: HistoricalBooksProps) {
  const { books, loading, deleteBook } = useBooks();
  const insets = useSafeAreaInsets();
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
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

  // Scroll to top when year or sort order changes
  useEffect(() => {
    if (flatListRef.current) {
      flatListRef.current.scrollToOffset({ offset: 0, animated: true });
    }
  }, [selectedYear, sortOrder]);

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

  const calculateHoursPerDay = (book: Book): number => {
    const startDate = new Date(book.start_date);
    const endDate = book.percent_complete === 100 && book.finish_date 
      ? new Date(book.finish_date) 
      : new Date(); // Use current date for ongoing books
    
    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysDiff <= 0) return 0;
    
    // Calculate book hours completed (not adjusted for reading speed)
    const bookHoursCompleted = (book.duration * book.percent_complete) / 100;
    
    return bookHoursCompleted / daysDiff;
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

    return (
      <Swipeable
        ref={(ref) => {
          swipeableRefs.current[book.id] = ref;
        }}
        renderRightActions={renderRightActions}
        rightThreshold={40}
        overshootRight={false}
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

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={[styles.header, { paddingTop: insets.top + 16 }]}>
        {renderYearPicker()}
      </ThemedView>
      
      <FlatList
        ref={flatListRef}
        data={currentYearData.books}
        renderItem={renderBookItem}
        keyExtractor={(book) => book.id}
        contentContainerStyle={[styles.listContainer, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <ThemedView style={styles.separator} />}
      />
      
      {renderYearPickerModal()}
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
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
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
    position: 'absolute',
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    minWidth: 50,
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
  separator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginLeft: 102, // Align with book content
  },
});
