import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useBooks } from '@/context/BookContext';
import { imageService } from '@/services/ImageService';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface CSVManagerProps {
  onClose: () => void;
}

export const CSVManager: React.FC<CSVManagerProps> = ({ onClose }) => {
  const { importFromCSV, exportToCSV, books, loadBooks } = useBooks();
  const insets = useSafeAreaInsets();
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, currentBook: '' });
  const [storageInfo, setStorageInfo] = useState({ totalSize: 0, fileCount: 0 });

  useEffect(() => {
    loadStorageInfo();
  }, [books]);

  const loadStorageInfo = async () => {
    try {
      const info = await imageService.getStorageInfo();
      setStorageInfo(info);
    } catch (error) {
      console.error('Failed to load storage info:', error);
    }
  };

  const handleImportCSV = async () => {
    try {
      setImporting(true);
      setImportProgress({ current: 0, total: 0, currentBook: '' });
      
      const result = await DocumentPicker.getDocumentAsync({
        type: 'text/csv',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setImporting(false);
        return;
      }

      const fileUri = result.assets[0].uri;
      let csvContent: string;
      
      try {
        csvContent = await FileSystem.readAsStringAsync(fileUri);
      } catch (fileError) {
        throw new Error(`Failed to read CSV file: ${fileError instanceof Error ? fileError.message : 'Unknown error'}`);
      }
      
      if (!csvContent || csvContent.trim() === '') {
        throw new Error('CSV file is empty. Please select a file with data.');
      }
      
      // Parse CSV to get total count for progress tracking
      const lines = csvContent.split('\n').filter(line => line.trim());
      const totalBookCount = Math.max(0, lines.length - 1); // Subtract header row
      setImportProgress({ current: 0, total: totalBookCount, currentBook: 'Starting import...' });
      
      // Create a progress callback for the import
      const onProgress = (current: number, total: number, currentBook: string) => {
        setImportProgress({ current, total, currentBook });
      };
      
      const importResult = await importFromCSVWithProgress(csvContent, onProgress);
      
      // Reload books to show the newly imported ones
      await loadBooks();
      
      const totalBooks = importResult.success + importResult.errors.length;
      const errorMessage = importResult.errors.length > 0 
        ? `\n\n${importResult.errors.length} error(s) occurred:\n\n${importResult.errors.slice(0, 8).join('\n\n')}${
            importResult.errors.length > 8 ? `\n\n... and ${importResult.errors.length - 8} more errors` : ''
          }`
        : '';

      const summaryMessage = `Processed ${totalBooks} book${totalBooks !== 1 ? 's' : ''} total.\nSuccessfully imported: ${importResult.success} book${importResult.success !== 1 ? 's' : ''}.${errorMessage}`;

      Alert.alert(
        'Import Complete',
        summaryMessage,
        [{ text: 'OK', onPress: onClose }]
      );
    } catch (error) {
      Alert.alert(
        'Import Failed',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    } finally {
      setImporting(false);
      setImportProgress({ current: 0, total: 0, currentBook: '' });
    }
  };

  // Custom import function with progress tracking
  const importFromCSVWithProgress = async (csvData: string, onProgress: (current: number, total: number, currentBook: string) => void) => {
    const lines = csvData.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      throw new Error('CSV file is empty or contains only headers. Please ensure the file has at least one data row.');
    }
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    console.log('CSV Headers:', headers);
    
    let success = 0;
    const errors: string[] = [];

    // Validate required headers
    const requiredHeaders = ['title', 'author', 'duration', 'start_date', 'finish_date', 'reading_speed'];
    const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
    
    if (missingHeaders.length > 0) {
      throw new Error(`Missing required CSV headers: ${missingHeaders.join(', ')}.\n\nRequired headers: ${requiredHeaders.join(', ')}\n\nOptional headers: cover_url, percent_complete`);
    }

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = parseCSVLine(lines[i]);
        const bookData: any = {};
        
        headers.forEach((header, index) => {
          bookData[header] = values[index]?.trim().replace(/"/g, '') || '';
        });

        // Update progress
        onProgress(i, lines.length - 1, bookData.title || `Book ${i}`);

        // Parse percent_complete if provided, otherwise default to 100%
        let percentComplete = 100;
        if (bookData.percent_complete) {
          const percentStr = bookData.percent_complete.toString().replace('%', '');
          const parsed = parseFloat(percentStr);
          if (!isNaN(parsed)) {
            percentComplete = parsed;
          }
        }

        // Validate required fields with specific messages
        const missingFields = [];
        if (!bookData.title || bookData.title.trim() === '') missingFields.push('title');
        if (!bookData.author || bookData.author.trim() === '') missingFields.push('author');
        if (!bookData.duration || bookData.duration.trim() === '') missingFields.push('duration');
        if (!bookData.start_date || bookData.start_date.trim() === '') missingFields.push('start_date');
        if (!bookData.finish_date || bookData.finish_date.trim() === '') missingFields.push('finish_date');
        if (!bookData.reading_speed || bookData.reading_speed.trim() === '') missingFields.push('reading_speed');
        
        if (missingFields.length > 0) {
          errors.push(`Row ${i + 1}: Missing required fields: ${missingFields.join(', ')}`);
          continue;
        }

        // Parse dates with specific error messages
        const startDate = parseDateTime(bookData.start_date);
        const finishDate = parseDateTime(bookData.finish_date);
        
        if (!startDate) {
          errors.push(`Row ${i + 1}: Invalid start_date format: "${bookData.start_date}". Supported formats: YYYY-MM-DDTHH:mm:ssZ, YYYY-MM-DDTHH:mm:ss.000Z, YYYY-MM-DDTHH:mm:ss-07:00, or MM/DD/YYYY - HH:MM AM/PM`);
          continue;
        }
        
        if (!finishDate) {
          errors.push(`Row ${i + 1}: Invalid finish_date format: "${bookData.finish_date}". Supported formats: YYYY-MM-DDTHH:mm:ssZ, YYYY-MM-DDTHH:mm:ss.000Z, YYYY-MM-DDTHH:mm:ss-07:00, or MM/DD/YYYY - HH:MM AM/PM`);
          continue;
        }

        // Validate numeric fields with specific messages
        console.log(`Row ${i + 1}: Raw duration value: "${bookData.duration}", type: ${typeof bookData.duration}`);
        
        // Clean the duration value - remove any quotes and trim whitespace
        const cleanDuration = bookData.duration.toString().replace(/"/g, '').trim();
        console.log(`Row ${i + 1}: Cleaned duration: "${cleanDuration}"`);
        
        const duration = parseFloat(cleanDuration);
        console.log(`Row ${i + 1}: Parsed duration: ${duration}, isNaN: ${isNaN(duration)}`);
        
        if (isNaN(duration) || duration <= 0) {
          errors.push(`Row ${i + 1}: Invalid duration: "${bookData.duration}". Must be a positive number (hours).`);
          continue;
        }
        
        // Clean and parse reading_speed
        const cleanReadingSpeed = bookData.reading_speed.toString().replace(/"/g, '').trim();
        console.log(`Row ${i + 1}: Raw reading_speed: "${bookData.reading_speed}" -> cleaned: "${cleanReadingSpeed}"`);
        
        const readingSpeed = parseFloat(cleanReadingSpeed);
        console.log(`Row ${i + 1}: Parsed reading_speed: ${readingSpeed}, isNaN: ${isNaN(readingSpeed)}`);
        
        if (isNaN(readingSpeed) || readingSpeed <= 0) {
          errors.push(`Row ${i + 1}: Invalid reading_speed: "${bookData.reading_speed}". Must be a positive number.`);
          continue;
        }

        if (percentComplete < 0 || percentComplete > 100) {
          errors.push(`Row ${i + 1}: Invalid percent_complete: ${percentComplete}. Must be between 0 and 100.`);
          continue;
        }

        // Create book object with validated values
        const book: any = {
          id: Date.now().toString() + i,
          title: bookData.title.trim(),
          author: bookData.author.trim(),
          duration: duration, // Use the validated duration value
          start_date: startDate.toISOString(),
          finish_date: finishDate.toISOString(),
          reading_speed: readingSpeed, // Use the validated reading_speed value
          cover_url: bookData.cover_url || '',
          percent_complete: percentComplete || 100, // Ensure percent_complete is never null/undefined
        };
        
        console.log(`Row ${i + 1}: Book object created:`, {
          title: book.title,
          duration: book.duration,
          reading_speed: book.reading_speed,
          percent_complete: book.percent_complete
        });

        // Download cover image if URL is provided
        if (book.cover_url && book.cover_url.trim()) {
          try {
            const localImagePath = await imageService.downloadAndResizeImage(
              book.cover_url,
              book.id
            );
            book.local_cover_path = localImagePath;
          } catch (imageError) {
            console.error(`Failed to download image for book ${book.title}:`, imageError);
          }
        }

        // Add the book directly to the database
        try {
          const { databaseService } = await import('@/services/DatabaseService');
          await databaseService.createBook(book);
          success++;
        } catch (dbError) {
          errors.push(`Row ${i + 1}: Database error - ${dbError instanceof Error ? dbError.message : 'Unknown database error'}`);
          continue;
        }
      } catch (error) {
        errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { success, errors };
  };

  // Helper functions for CSV parsing
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    
    console.log(`Parsed CSV line: [${result.join(' | ')}]`);
    return result;
  };

  const parseDateTime = (dateStr: string): Date | null => {
    // Try multiple date formats
    const formats = [
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, // UTC
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, // UTC with milliseconds
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/, // With timezone
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/, // With timezone and milliseconds
      /^\d{1,2}\/\d{1,2}\/\d{4} - \d{1,2}:\d{2} (AM|PM)$/, // Google Sheets format
    ];
    
    for (const format of formats) {
      if (format.test(dateStr)) {
        try {
          return new Date(dateStr);
        } catch (e) {
          continue;
        }
      }
    }
    
    // If no format matches, try direct Date constructor as fallback
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch (e) {
      // Continue to return null
    }
    
    return null;
  };

  const handleExportCSV = async () => {
    try {
      setExporting(true);
      
      const csvContent = await exportToCSV();
      const fileName = `booktracker_export_${new Date().toISOString().split('T')[0]}.csv`;
      
      // Create a temporary file in the cache directory
      const tempFileUri = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(tempFileUri, csvContent);
      
      // Check if sharing is available
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(tempFileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export Book Data',
          UTI: 'public.comma-separated-values-text'
        });
      } else {
        // Fallback to old method if sharing is not available
        const fileUri = FileSystem.documentDirectory + fileName;
        await FileSystem.writeAsStringAsync(fileUri, csvContent);
        
        Alert.alert(
          'Export Complete',
          `CSV file saved as ${fileName}\n\nLocation: ${fileUri}`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      Alert.alert(
        'Export Failed',
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
    } finally {
      setExporting(false);
    }
  };

  const handleCleanupImages = async () => {
    try {
      await imageService.cleanupUnusedImages(books);
      await loadStorageInfo();
      Alert.alert('Cleanup Complete', 'Unused images have been removed.');
    } catch (error) {
      Alert.alert('Cleanup Failed', 'Failed to cleanup unused images.');
    }
  };

  const showCSVFormat = () => {
    Alert.alert(
      'CSV Format',
      'CSV import expects completed books with required fields:\n• title\n• author\n• duration (hours)\n• start_date (Mountain Time)\n• finish_date (Mountain Time)\n• reading_speed (positive number)\n\nSupported date formats:\n• Google Sheets: "01/01/2025 - 11:40 AM"\n• ISO 8601: "2025-01-01T11:40:00-07:00"\n• UTC: "2025-01-01T11:40:00Z"\n\nOptional fields:\n• cover_url (will use placeholder if empty)\n• percent_complete (defaults to 100% if not provided, accepts "100%" or "100" format)\n\nNote: Imported books are assumed to be completed (100% progress).',
      [{ text: 'OK' }]
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <ThemedText type="title" style={styles.title}>
          Data Management
        </ThemedText>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <IconSymbol name="xmark" size={20} color="#ECEDEE" />
        </TouchableOpacity>
      </ThemedView>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Import Data
          </ThemedText>
          <ThemedText style={styles.sectionDescription}>
            Import books from a CSV file. The file must include the required columns.
          </ThemedText>
          
          <TouchableOpacity 
            style={[styles.actionButton, importing && styles.disabledButton]} 
            onPress={handleImportCSV}
            disabled={importing}
          >
            <ThemedText style={styles.actionButtonText}>
              {importing ? 'Importing...' : 'Import from CSV'}
            </ThemedText>
          </TouchableOpacity>
          
          {importing && importProgress.total > 0 && (
            <ThemedView style={styles.progressContainer}>
              <ThemedView style={styles.progressBar}>
                <ThemedView 
                  style={[
                    styles.progressFill, 
                    { width: `${(importProgress.current / importProgress.total) * 100}%` }
                  ]} 
                />
              </ThemedView>
              <ThemedText style={styles.progressText}>
                {importProgress.current} of {importProgress.total} books
              </ThemedText>
              {importProgress.currentBook && (
                <ThemedText style={styles.currentBookText}>
                  Currently importing: {importProgress.currentBook}
                </ThemedText>
              )}
            </ThemedView>
          )}
          
          <TouchableOpacity style={styles.helpButton} onPress={showCSVFormat}>
            <ThemedText style={styles.helpButtonText}>View CSV Format</ThemedText>
          </TouchableOpacity>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Export Data
          </ThemedText>
          <ThemedText style={styles.sectionDescription}>
            Export all your books to a CSV file for backup or sharing.
          </ThemedText>
          
          <TouchableOpacity 
            style={[styles.actionButton, exporting && styles.disabledButton]} 
            onPress={handleExportCSV}
            disabled={exporting}
          >
            <ThemedText style={styles.actionButtonText}>
              {exporting ? 'Exporting...' : 'Export to CSV'}
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Storage Management
          </ThemedText>
          <ThemedText style={styles.sectionDescription}>
            Book covers are stored locally and automatically resized to 1000x1000px max resolution.
          </ThemedText>
          
          <ThemedView style={styles.storageInfo}>
            <ThemedText style={styles.storageText}>
              Images: {storageInfo.fileCount} files ({imageService.formatFileSize(storageInfo.totalSize)})
            </ThemedText>
          </ThemedView>
          
          <TouchableOpacity 
            style={styles.cleanupButton} 
            onPress={handleCleanupImages}
          >
            <ThemedText style={styles.cleanupButtonText}>Cleanup Unused Images</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </ScrollView>
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
  title: {
    flex: 1,
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 18,
    color: '#50b042',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    marginBottom: 8,
  },
  sectionDescription: {
    opacity: 0.7,
    marginBottom: 16,
    lineHeight: 20,
  },
  actionButton: {
    backgroundColor: '#50b042',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  disabledButton: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  helpButton: {
    padding: 12,
    alignItems: 'center',
  },
  helpButtonText: {
    color: '#50b042',
    fontSize: 14,
  },
  storageInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  storageText: {
    fontSize: 14,
    opacity: 0.8,
  },
  cleanupButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cleanupButtonText: {
    color: '#50b042',
    fontSize: 14,
  },
  progressContainer: {
    marginTop: 16,
    marginBottom: 12,
  },
  progressBar: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#50b042',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
    opacity: 0.8,
  },
  currentBookText: {
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.6,
    fontStyle: 'italic',
  },
});
