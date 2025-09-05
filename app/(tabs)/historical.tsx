import { BookDetailView } from '@/components/BookDetailView';
import { BookForm } from '@/components/BookForm';
import HistoricalBooks from '@/components/HistoricalBooks';
import { ThemedView } from '@/components/ThemedView';
import { useBooks } from '@/context/BookContext';
import { Book } from '@/types/Book';
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';

type ScreenState = 'list' | 'detail' | 'edit';

export default function HistoricalScreen() {
  const { books } = useBooks();
  const [currentScreen, setCurrentScreen] = useState<ScreenState>('list');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);

  const handleBookPress = (book: Book) => {
    setSelectedBook(book);
    setCurrentScreen('detail');
  };

  const handleBackToList = () => {
    setCurrentScreen('list');
    setSelectedBook(null);
  };

  const handleEditBook = () => {
    setCurrentScreen('edit');
  };

  const handleSaveBook = () => {
    setCurrentScreen('detail');
  };

  if (currentScreen === 'detail' && selectedBook) {
    return (
      <ThemedView style={styles.container}>
        <BookDetailView
          book={selectedBook}
          onBack={handleBackToList}
          onEdit={handleEditBook}
        />
      </ThemedView>
    );
  }

  if (currentScreen === 'edit' && selectedBook) {
    return (
      <ThemedView style={styles.container}>
        <BookForm
          book={selectedBook}
          onSave={handleSaveBook}
          onCancel={() => setCurrentScreen('detail')}
        />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <HistoricalBooks onBookPress={handleBookPress} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
