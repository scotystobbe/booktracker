import { BookCoverImage } from '@/components/BookCoverImage';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useBooks } from '@/context/BookContext';
import { Book } from '@/types/Book';
import React from 'react';
import { Alert, FlatList, StyleSheet, TouchableOpacity } from 'react-native';

interface BookListProps {
  onBookPress: (book: Book) => void;
  onAddBook: () => void;
}

export const BookList: React.FC<BookListProps> = ({ onBookPress, onAddBook }) => {
  const { books, deleteBook } = useBooks();

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

  const renderBookItem = ({ item }: { item: Book }) => (
    <TouchableOpacity
      style={styles.bookItem}
      onPress={() => onBookPress(item)}
      onLongPress={() => handleDeleteBook(item)}
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
  );

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
});
