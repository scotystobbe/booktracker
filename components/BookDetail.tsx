import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useBooks } from '@/context/BookContext';
import { Book } from '@/types/Book';
import { Image } from 'expo-image';
import React from 'react';
import { Alert, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface BookDetailProps {
  book: Book;
  onEdit: () => void;
  onBack: () => void;
}

export const BookDetail: React.FC<BookDetailProps> = ({ book, onEdit, onBack }) => {
  const { updateBook, deleteBook } = useBooks();
  const insets = useSafeAreaInsets();

  const formatReadingSpeed = (speed: number): string => {
    // If it's a whole number, show no decimal places
    if (speed % 1 === 0) {
      return speed.toString();
    }
    
    // If it's a perfect tenth (e.g., 1.8, 1.9), show one decimal place
    const roundedToOneDecimal = Math.round(speed * 10) / 10;
    if (Math.abs(speed - roundedToOneDecimal) < 0.001) {
      return speed.toFixed(1);
    }
    
    // Otherwise, show up to 2 decimal places
    return speed.toFixed(2);
  };

  const handleMarkAsFinished = () => {
    Alert.alert(
      'Mark as Finished',
      `Mark "${book.book_title}" as completed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Finished',
          onPress: () => {
            updateBook(book.id, { finish_date: new Date().toISOString() });
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Book',
      `Are you sure you want to delete "${book.book_title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteBook(book.id);
            onBack();
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getReadingProgress = () => {
    if (book.finish_date) {
      return 'Completed';
    }
    
    const startDate = new Date(book.start_date);
    const currentDate = new Date();
    const daysSinceStart = Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    return `In Progress (${daysSinceStart} days)`;
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <IconSymbol name="chevron.left" size={16} color="#ECEDEE" style={styles.backIcon} />
          <ThemedText style={styles.backButtonText}>Back</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity style={styles.editButton} onPress={onEdit}>
          <ThemedText style={styles.editButtonText}>Edit</ThemedText>
        </TouchableOpacity>
      </ThemedView>

      <ThemedView style={styles.content}>
        <ThemedView style={styles.coverContainer}>
          <Image
            source={{ uri: book.cover_url }}
            style={styles.cover}
            contentFit="cover"
          />
        </ThemedView>

        <ThemedView style={styles.bookInfo}>
          <ThemedText type="title" style={styles.title}>
            {book.book_title}
          </ThemedText>
          <ThemedText type="subtitle" style={styles.author}>
            by {book.author}
          </ThemedText>

          <ThemedView style={styles.detailsContainer}>
            <ThemedView style={styles.detailRow}>
              <ThemedText type="defaultSemiBold" style={styles.detailLabel}>
                Duration:
              </ThemedText>
              <ThemedText style={styles.detailValue}>
                {(() => {
                  const wholeHours = Math.floor(book.duration);
                  const minutes = Math.round((book.duration - wholeHours) * 60);
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
            </ThemedView>

            <ThemedView style={styles.detailRow}>
              <ThemedText type="defaultSemiBold" style={styles.detailLabel}>
                Start Date:
              </ThemedText>
              <ThemedText style={styles.detailValue}>
                {formatDate(book.start_date)}
              </ThemedText>
            </ThemedView>

            {book.finish_date && (
              <ThemedView style={styles.detailRow}>
                <ThemedText type="defaultSemiBold" style={styles.detailLabel}>
                  Finish Date:
                </ThemedText>
                <ThemedText style={styles.detailValue}>
                  {formatDate(book.finish_date)}
                </ThemedText>
              </ThemedView>
            )}

            <ThemedView style={styles.detailRow}>
              <ThemedText type="defaultSemiBold" style={styles.detailLabel}>
                Reading Speed:
              </ThemedText>
              <ThemedText style={styles.detailValue}>
                {formatReadingSpeed(book.reading_speed)}x
              </ThemedText>
            </ThemedView>

            <ThemedView style={styles.detailRow}>
              <ThemedText type="defaultSemiBold" style={styles.detailLabel}>
                Status:
              </ThemedText>
              <ThemedText style={[
                styles.detailValue,
                book.finish_date ? styles.completedStatus : styles.inProgressStatus
              ]}>
                {getReadingProgress()}
              </ThemedText>
            </ThemedView>
          </ThemedView>

          <ThemedView style={styles.actionButtons}>
            {!book.finish_date && (
              <TouchableOpacity style={styles.finishButton} onPress={handleMarkAsFinished}>
                <ThemedText style={styles.finishButtonText}>
                  Mark as Finished
                </ThemedText>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
              <ThemedText style={styles.deleteButtonText}>
                Delete Book
              </ThemedText>
            </TouchableOpacity>
          </ThemedView>
        </ThemedView>
      </ThemedView>
    </ThemedView>
  );
};

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
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  backIcon: {
    marginRight: 4,
  },
  backButtonText: {
    fontSize: 16,
    color: '#50b042',
  },
  editButton: {
    padding: 8,
  },
  editButtonText: {
    fontSize: 16,
    color: '#50b042',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  coverContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  cover: {
    width: 200,
    height: 300,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  bookInfo: {
    flex: 1,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  author: {
    textAlign: 'center',
    marginBottom: 24,
    opacity: 0.7,
  },
  detailsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailLabel: {
    flex: 1,
  },
  detailValue: {
    flex: 1,
    textAlign: 'right',
  },
  completedStatus: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  inProgressStatus: {
    color: '#FF9800',
    fontWeight: '600',
  },
  actionButtons: {
    gap: 12,
  },
  finishButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  finishButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#f44336',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
