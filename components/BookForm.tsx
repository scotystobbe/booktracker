import { CoverArtSelector } from '@/components/CoverArtSelector';
import { PlexBookSearch } from '@/components/PlexBookSearch';
import { PlexOAuth } from '@/components/PlexOAuth';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useBooks } from '@/context/BookContext';
import { PlexAuthConfig, PlexBook, PlexLibrary, plexService } from '@/services/PlexService';
import { Book } from '@/types/Book';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface BookFormProps {
  book?: Book;
  onSave: () => void;
  onCancel: () => void;
}

export const BookForm: React.FC<BookFormProps> = ({ book, onSave, onCancel }) => {
  const { addBook, updateBook } = useBooks();
  const insets = useSafeAreaInsets();
  const [formData, setFormData] = useState({
    title: '',
    author: '',
    duration_hours: '',
    duration_minutes: '',
    start_date: new Date(),
    finish_date: new Date(),
    reading_speed: '2.0',
    cover_url: '',
    percent_complete: '0',
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showFinishDatePicker, setShowFinishDatePicker] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState<'start' | 'finish'>('start');
  
  // Plex integration state
  const [showPlexSearch, setShowPlexSearch] = useState(false);
  const [showPlexOAuth, setShowPlexOAuth] = useState(false);
  const [plexAuthConfig, setPlexAuthConfig] = useState<PlexAuthConfig | null>(null);
  const [selectedLibrary, setSelectedLibrary] = useState<PlexLibrary | null>(null);
  const [showCoverArtSelector, setShowCoverArtSelector] = useState(false);
  const [coverArtOptions, setCoverArtOptions] = useState<Array<{type: string, url: string}>>([]);
  const [selectedBookTitle, setSelectedBookTitle] = useState('');

  useEffect(() => {
    if (book) {
      const totalMinutes = Math.round(book.duration * 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      
      setFormData({
        title: book.title,
        author: book.author,
        duration_hours: hours.toString(),
        duration_minutes: minutes.toString(),
        start_date: new Date(book.start_date),
        finish_date: book.finish_date ? new Date(book.finish_date) : new Date(),
        reading_speed: book.reading_speed.toString(),
        cover_url: book.cover_url,
        percent_complete: book.percent_complete.toString(),
      });
    }
  }, [book]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Plex integration functions
  const handlePlexBookSelect = async (plexBook: PlexBook) => {
    console.log('PlexBookSelect called with:', plexBook);
    
    const durationHours = Math.floor(plexBook.duration / 3600);
    const durationMinutes = Math.floor((plexBook.duration % 3600) / 60);
    
    console.log('Calculated duration:', { hours: durationHours, minutes: durationMinutes });
    
    // Get all cover art options for this book
    try {
      const options = plexService.getAllCoverArtOptions(plexBook as any);
      console.log('Cover art options:', options);
      
      if (options.length > 1) {
        // Show cover art selector if multiple options available
        setCoverArtOptions(options);
        setSelectedBookTitle(plexBook.title);
        setShowCoverArtSelector(true);
        
        // Set form data without cover URL initially
        setFormData(prev => ({
          ...prev,
          title: plexBook.title,
          author: plexBook.author,
          duration_hours: durationHours.toString(),
          duration_minutes: durationMinutes.toString(),
        }));
      } else {
        // Use the default cover art if only one option
        setFormData(prev => ({
          ...prev,
          title: plexBook.title,
          author: plexBook.author,
          duration_hours: durationHours.toString(),
          duration_minutes: durationMinutes.toString(),
          cover_url: plexBook.coverUrl,
        }));
      }
    } catch (error) {
      console.error('Failed to get cover art options:', error);
      // Fall back to default behavior
      setFormData(prev => ({
        ...prev,
        title: plexBook.title,
        author: plexBook.author,
        duration_hours: durationHours.toString(),
        duration_minutes: durationMinutes.toString(),
        cover_url: plexBook.coverUrl,
      }));
    }
    
    console.log('Form data updated with Plex book');
    
    // Close the search modal after selection
    setShowPlexSearch(false);
  };

  const handlePlexOAuthSuccess = (authConfig: PlexAuthConfig, library?: PlexLibrary) => {
    setPlexAuthConfig(authConfig);
    setSelectedLibrary(library || null);
    // Don't automatically open search - wait for user to tap the button
  };

  const handleCoverArtSelect = (url: string) => {
    setFormData(prev => ({
      ...prev,
      cover_url: url,
    }));
    setShowCoverArtSelector(false);
  };

  const handlePlexSearch = () => {
    if (!plexAuthConfig) {
      setShowPlexOAuth(true);
    } else {
      setShowPlexSearch(true);
    }
  };



  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'ios') {
      // On iOS, keep the picker open and update the date
      if (selectedDate) {
        if (datePickerMode === 'start') {
          setFormData(prev => ({ ...prev, start_date: selectedDate }));
        } else {
          setFormData(prev => ({ ...prev, finish_date: selectedDate }));
        }
      }
    } else {
      // On Android, close the picker after selection
      setShowDatePicker(false);
      setShowFinishDatePicker(false);
      if (selectedDate) {
        if (datePickerMode === 'start') {
          setFormData(prev => ({ ...prev, start_date: selectedDate }));
        } else {
          setFormData(prev => ({ ...prev, finish_date: selectedDate }));
        }
      }
    }
  };



  const validateForm = (): boolean => {
    if (!formData.title.trim()) {
      Alert.alert('Error', 'Title is required');
      return false;
    }
    if (!formData.author.trim()) {
      Alert.alert('Error', 'Author is required');
      return false;
    }
    const hours = parseInt(formData.duration_hours) || 0;
    const minutes = parseInt(formData.duration_minutes) || 0;
    if (hours === 0 && minutes === 0) {
      Alert.alert('Error', 'Please enter a valid duration');
      return false;
    }
    // Cover URL is optional - will use placeholder if empty
    const readingSpeed = parseFloat(formData.reading_speed);
    if (isNaN(readingSpeed) || readingSpeed <= 0) {
      Alert.alert('Error', 'Please enter a valid reading speed');
      return false;
    }
    const percentComplete = parseFloat(formData.percent_complete);
    if (isNaN(percentComplete) || percentComplete < 0 || percentComplete > 100) {
      Alert.alert('Error', 'Please enter a valid progress percentage (0-100)');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    const hours = parseInt(formData.duration_hours) || 0;
    const minutes = parseInt(formData.duration_minutes) || 0;
    const totalDuration = hours + (minutes / 60);

    const percentComplete = parseFloat(formData.percent_complete);
    const bookData = {
      title: formData.title.trim(),
      author: formData.author.trim(),
      duration: totalDuration,
      start_date: formData.start_date.toISOString(),
      reading_speed: parseFloat(formData.reading_speed),
      cover_url: formData.cover_url.trim() || '', // Allow empty cover URL
      percent_complete: percentComplete,
      // Only include finish_date if book is 100% complete
      ...(percentComplete === 100 && { finish_date: formData.finish_date.toISOString() }),
    };

    try {
      if (book) {
        // Update existing book
        await updateBook(book.id, bookData);
      } else {
        // Add new book
        await addBook(bookData);
      }
      onSave();
    } catch (error) {
      Alert.alert('Error', 'Failed to save book. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <ThemedView style={[styles.form, { paddingTop: insets.top + 20 }]}>
          <ThemedText type="title" style={styles.title}>
            {book ? 'Edit Book' : 'Add New Book'}
          </ThemedText>

          <ThemedView style={styles.inputGroup}>
            <ThemedText type="defaultSemiBold" style={styles.label}>
              Title
            </ThemedText>
            <TextInput
              style={styles.input}
              value={formData.title}
              onChangeText={(value) => handleInputChange('title', value)}
            />
            <TouchableOpacity
              style={styles.plexButton}
              onPress={handlePlexSearch}
            >
              <ThemedText style={styles.plexButtonText}>
                Search Plex Library
              </ThemedText>
            </TouchableOpacity>
          </ThemedView>

          <ThemedView style={styles.inputGroup}>
            <ThemedText type="defaultSemiBold" style={styles.label}>
              Author
            </ThemedText>
            <TextInput
              style={styles.input}
              value={formData.author}
              onChangeText={(value) => handleInputChange('author', value)}
            />
          </ThemedView>

          <ThemedView style={styles.inputGroup}>
            <ThemedText type="defaultSemiBold" style={styles.label}>
              Duration
            </ThemedText>
            <View style={styles.durationRow}>
              <View style={styles.durationField}>
                <TextInput
                  style={styles.durationInput}
                  value={formData.duration_hours}
                  onChangeText={(value) => handleInputChange('duration_hours', value)}
                  keyboardType="numeric"
                />
                <ThemedText style={styles.durationLabel}>Hours</ThemedText>
              </View>
              <View style={styles.durationField}>
                <TextInput
                  style={styles.durationInput}
                  value={formData.duration_minutes}
                  onChangeText={(value) => handleInputChange('duration_minutes', value)}
                  keyboardType="numeric"
                />
                <ThemedText style={styles.durationLabel}>Minutes</ThemedText>
              </View>
            </View>
          </ThemedView>

          <ThemedView style={styles.inputGroup}>
            <ThemedText type="defaultSemiBold" style={styles.label}>
              Start Date & Time
            </ThemedText>
            <TouchableOpacity 
              style={styles.dateButton} 
              onPress={() => {
                setDatePickerMode('start');
                setShowDatePicker(true);
              }}
            >
              <ThemedText style={styles.dateButtonText}>
                {formData.start_date.toLocaleDateString()} at {formData.start_date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </ThemedText>
            </TouchableOpacity>
            {showDatePicker && (
              <View>
                <DateTimePicker
                  value={formData.start_date}
                  mode="datetime"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleDateChange}
                />
                {Platform.OS === 'ios' && (
                  <TouchableOpacity 
                    style={styles.doneButton} 
                    onPress={() => setShowDatePicker(false)}
                  >
                    <ThemedText style={styles.doneButtonText}>Done</ThemedText>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </ThemedView>

          {/* Only show finish date if book is 100% complete */}
          {parseFloat(formData.percent_complete) === 100 && (
            <ThemedView style={styles.inputGroup}>
              <ThemedText type="defaultSemiBold" style={styles.label}>
                Finish Date & Time
              </ThemedText>
              <TouchableOpacity 
                style={styles.dateButton} 
                onPress={() => {
                  setDatePickerMode('finish');
                  setShowFinishDatePicker(true);
                }}
              >
                <ThemedText style={styles.dateButtonText}>
                  {formData.finish_date.toLocaleDateString()} at {formData.finish_date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </ThemedText>
              </TouchableOpacity>
              {showFinishDatePicker && (
                <View>
                  <DateTimePicker
                    value={formData.finish_date}
                    mode="datetime"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleDateChange}
                  />
                  {Platform.OS === 'ios' && (
                    <TouchableOpacity 
                      style={styles.doneButton} 
                      onPress={() => setShowFinishDatePicker(false)}
                    >
                      <ThemedText style={styles.doneButtonText}>Done</ThemedText>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ThemedView>
          )}

          <ThemedView style={styles.inputGroup}>
            <ThemedText type="defaultSemiBold" style={styles.label}>
              Reading Speed & Progress
            </ThemedText>
            <View style={styles.speedProgressRow}>
              <View style={styles.speedField}>
                <TextInput
                  style={styles.speedInput}
                  value={formData.reading_speed}
                  onChangeText={(value) => handleInputChange('reading_speed', value)}
                  keyboardType="numeric"
                  placeholder="2"
                />
                <ThemedText style={styles.fieldLabel}>Speed (x)</ThemedText>
              </View>
              <View style={styles.progressField}>
                <TextInput
                  style={styles.progressInput}
                  value={formData.percent_complete}
                  onChangeText={(value) => handleInputChange('percent_complete', value)}
                  keyboardType="numeric"
                  placeholder="0-100"
                />
                <ThemedText style={styles.fieldLabel}>Progress (%)</ThemedText>
              </View>
            </View>
          </ThemedView>

          <ThemedView style={styles.inputGroup}>
            <ThemedText type="defaultSemiBold" style={styles.label}>
              Cover URL
            </ThemedText>
            <TextInput
              style={styles.input}
              value={formData.cover_url}
              onChangeText={(value) => handleInputChange('cover_url', value)}
              autoCapitalize="none"
            />
          </ThemedView>

          <ThemedView style={styles.buttonContainer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <ThemedText style={styles.saveButtonText}>
                {book ? 'Update' : 'Add'} Book
              </ThemedText>
            </TouchableOpacity>
          </ThemedView>
        </ThemedView>
      </ScrollView>

      {/* Plex Integration Components */}
      <PlexBookSearch
        visible={showPlexSearch}
        onClose={() => setShowPlexSearch(false)}
        onSelectBook={handlePlexBookSelect}
      />
      
      <PlexOAuth
        visible={showPlexOAuth}
        onClose={() => setShowPlexOAuth(false)}
        onSuccess={handlePlexOAuthSuccess}
      />
      
      <CoverArtSelector
        visible={showCoverArtSelector}
        onClose={() => setShowCoverArtSelector(false)}
        onSelect={handleCoverArtSelect}
        options={coverArtOptions}
        bookTitle={selectedBookTitle}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  form: {
    paddingHorizontal: 20,
    paddingBottom: 100, // Add extra padding to prevent buttons from being hidden behind tab bar
  },
  title: {
    marginBottom: 24,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    marginBottom: 8,
    fontSize: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#ECEDEE',
  },
  durationRow: {
    flexDirection: 'row',
    gap: 12,
  },
  durationField: {
    flex: 0.15,
  },
  durationInput: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#ECEDEE',
    textAlign: 'center',
  },
  speedProgressRow: {
    flexDirection: 'row',
    gap: 12,
  },
  speedField: {
    flex: 0.25,
  },
  speedInput: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#ECEDEE',
    textAlign: 'center',
  },
  progressField: {
    flex: 0.25,
  },
  progressInput: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#ECEDEE',
    textAlign: 'center',
  },
  durationLabel: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
    textAlign: 'center',
  },
  fieldLabel: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
    textAlign: 'center',
  },


  dateButton: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    maxWidth: 300,
  },
  dateButtonText: {
    fontSize: 16,
    color: '#ECEDEE',
  },
  doneButton: {
    backgroundColor: '#50b042',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#6c757d',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#50b042',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  plexButton: {
    backgroundColor: '#E5A00D',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  plexButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
});
