import { BookDetail } from '@/components/BookDetail';
import { BookDetailView } from '@/components/BookDetailView';
import { BookForm } from '@/components/BookForm';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useBooks } from '@/context/BookContext';
import { Book } from '@/types/Book';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ScreenState = 'list' | 'add' | 'edit' | 'detail' | 'detailView';

export default function HomeScreen() {
  const { books, loading } = useBooks();
  const [currentScreen, setCurrentScreen] = useState<ScreenState>('list');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const insets = useSafeAreaInsets();

  // Get the current book (books with percent_complete < 100)
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

  const currentBook = getCurrentBook();

  const handleAddBook = () => {
    setSelectedBook(null);
    setCurrentScreen('add');
  };

  const handleBookPress = (book: Book) => {
    setSelectedBook(book);
    setCurrentScreen('detailView');
  };

  const handleEditBook = () => {
    setCurrentScreen('edit');
  };

  const handleBackToList = () => {
    setCurrentScreen('list');
    setSelectedBook(null);
  };

  const handleSaveBook = () => {
    setCurrentScreen('list');
    setSelectedBook(null);
  };



  const renderCurrentScreen = () => {
    switch (currentScreen) {
      case 'add':
        return (
          <BookForm
            onSave={handleSaveBook}
            onCancel={handleBackToList}
          />
        );
      case 'edit':
        return (
          <BookForm
            book={selectedBook!}
            onSave={handleSaveBook}
            onCancel={handleBackToList}
          />
        );
      case 'detail':
        return (
          <BookDetail
            book={selectedBook!}
            onEdit={handleEditBook}
            onBack={handleBackToList}
          />
        );
      case 'detailView':
        return (
          <BookDetailView
            book={selectedBook!}
            onBack={handleBackToList}
            onEdit={handleEditBook}
          />
        );

      default:
        // Show current book by default if available, otherwise show "no current book" message
        if (currentBook) {
          return (
            <BookDetailView
              book={currentBook}
              onEdit={() => {
                setSelectedBook(currentBook);
                setCurrentScreen('edit');
              }}
            />
          );
        }
        return (
          <ThemedView style={styles.container}>
            <ThemedView style={[styles.header, { paddingTop: insets.top + 16 }]}>
              <ThemedText type="title" style={styles.title}>
                Current Book
              </ThemedText>
            </ThemedView>
            {loading ? (
              <ThemedView style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#50b042" />
                <ThemedText style={styles.loadingText}>Loading books...</ThemedText>
              </ThemedView>
            ) : (
              <ThemedView style={styles.noCurrentBookContainer}>
                <ThemedText style={styles.noCurrentBookText}>
                  No current book
                </ThemedText>
                <ThemedText style={styles.noCurrentBookSubtext}>
                  Start a new book to see it here
                </ThemedText>
                <TouchableOpacity style={styles.addBookButton} onPress={handleAddBook}>
                  <ThemedText style={styles.addBookButtonText}>+ Start New Book</ThemedText>
                </TouchableOpacity>
              </ThemedView>
            )}
          </ThemedView>
        );
    }
  };

  return renderCurrentScreen();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  title: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    opacity: 0.7,
  },
  noCurrentBookContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  noCurrentBookText: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
  noCurrentBookSubtext: {
    fontSize: 16,
    opacity: 0.7,
    textAlign: 'center',
  },
  addBookButton: {
    backgroundColor: '#50b042',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  addBookButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
