import { BookCoverImage } from '@/components/BookCoverImage';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useBooks } from '@/context/BookContext';
import { plexService } from '@/services/PlexService';
import { Book } from '@/types/Book';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Mask, Polygon, Rect } from 'react-native-svg';

interface BookDetailViewProps {
  book: Book;
  onBack?: () => void;
  onEdit?: () => void;
}

export const BookDetailView: React.FC<BookDetailViewProps> = ({ book, onBack, onEdit }) => {
  const { updateBook } = useBooks();
  const insets = useSafeAreaInsets();
  const [showSpeedModal, setShowSpeedModal] = useState(false);
  const [tempSpeed, setTempSpeed] = useState('');
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [tempProgress, setTempProgress] = useState('');
  const [showMinutesNeeded, setShowMinutesNeeded] = useState(false);
  const [showStartDate, setShowStartDate] = useState(false);
  const [showETADetails, setShowETADetails] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionDate, setCompletionDate] = useState(new Date());
  const [hoursPerDay, setHoursPerDay] = useState(0);
  const [eta, setEta] = useState<Date | null>(null);
  const [daysSinceStart, setDaysSinceStart] = useState(0);
  const [showBufferTime, setShowBufferTime] = useState(false);
  const [showEditConfirmation, setShowEditConfirmation] = useState(false);
  const [showAdditionalStats, setShowAdditionalStats] = useState(false);
  const [syncingProgress, setSyncingProgress] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [syncError, setSyncError] = useState(false);

  // Recalculate values when book changes
  useEffect(() => {
    const startDate = new Date(book.start_date);
    const endDate = book.percent_complete === 100 && book.finish_date 
      ? new Date(book.finish_date) 
      : new Date();
    const daysSinceStartValue = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);

    setDaysSinceStart(daysSinceStartValue);
    
    const calculatedHoursPerDay = calculateTrueHoursPerDay();
    setHoursPerDay(calculatedHoursPerDay);
    
    const calculatedETA = calculateETA();
    setEta(calculatedETA);
  }, [book.percent_complete, book.reading_speed, book.duration, book.start_date, book.finish_date]);

  // Also run calculation on mount
  useEffect(() => {
    const startDate = new Date(book.start_date);
    const endDate = book.percent_complete === 100 && book.finish_date 
      ? new Date(book.finish_date) 
      : new Date();
    const daysSinceStartValue = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);

    setDaysSinceStart(daysSinceStartValue);
    
    const calculatedHoursPerDay = calculateTrueHoursPerDay();
    setHoursPerDay(calculatedHoursPerDay);
    
    const calculatedETA = calculateETA();
    setEta(calculatedETA);
  }, []); // Run only on mount

  const calculateTrueHoursPerDay = () => {
    const startDate = new Date(book.start_date);
    const endDate = book.percent_complete === 100 && book.finish_date 
      ? new Date(book.finish_date) 
      : new Date();
    const daysElapsed = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysElapsed <= 0) return 0;
    
    // Calculate book hours completed
    const bookHoursCompleted = (book.percent_complete / 100) * book.duration;
    
    // Calculate book hours per day
    let bookHoursPerDay;
    if (daysElapsed < 1.0) {
      bookHoursPerDay = bookHoursCompleted;
    } else {
      bookHoursPerDay = bookHoursCompleted / daysElapsed;
    }
    
    // Calculate true hours per day
    let trueHoursPerDay;
    if (daysElapsed < 1.0) {
      trueHoursPerDay = bookHoursCompleted / book.reading_speed;
    } else {
      trueHoursPerDay = bookHoursPerDay / book.reading_speed;
    }
    
    return trueHoursPerDay;
  };

  const calculateETA = () => {
    const bookHoursCompleted = (book.percent_complete / 100) * book.duration;
    const bookHoursRemaining = book.duration - bookHoursCompleted;
    
    if (bookHoursRemaining <= 0) return null;
    
    // Always use 1 hour per day for ETA calculation
    const trueHoursPerDay = 1.0;
    
    // Calculate days remaining based on consistent 1 hour per day pace
    const trueHoursRemaining = bookHoursRemaining / book.reading_speed;
    const daysRemaining = trueHoursRemaining / trueHoursPerDay;
    const etaDate = new Date(new Date().getTime() + (daysRemaining * 24 * 60 * 60 * 1000));
    
    return etaDate;
  };

  const formatHoursPerDay = (hours: number) => {
    if (hours >= 0.9 && hours < 1.0) {
      return hours.toFixed(2);
    }
    return hours.toFixed(1);
  };

  const getHoursPerDayColor = (hours: number) => {
    return hours < 1.0 ? '#f44336' : '#50b042';
  };

  const CircularProgress = ({ progress, size = 35, strokeWidth = 4 }: { progress: number; size?: number; strokeWidth?: number }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDasharray = circumference;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
      <Svg width={size} height={size} style={{ position: 'absolute', top: 5, right: 5 }}>
        {/* Background circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255, 255, 255, 0.3)"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="white"
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
    );
  };

  const AngledBanner = ({ size = 80 }: { size?: number }) => {
    return (
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          <Mask id="angledMask">
            <Rect width={size} height={size} fill="white" />
            <Polygon points={`0,0 ${size},${size} 0,${size}`} fill="black" />
          </Mask>
        </Defs>
        <Rect
          width={size}
          height={size}
          fill="rgba(80, 176, 66, 0.8)"
          mask="url(#angledMask)"
        />
      </Svg>
    );
  };

  const formatDuration = (hours: number) => {
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    
    // Use "hrs" for books longer than 1 hour 59 minutes, "hr" otherwise
    const hourLabel = (wholeHours > 1 || (wholeHours === 1 && minutes > 59)) ? 'hrs' : 'hr';
    
    if (wholeHours === 0) {
      return `${minutes} min`;
    } else if (minutes === 0) {
      return `${wholeHours} ${hourLabel}`;
    } else {
      return `${wholeHours} ${hourLabel} ${minutes} min`;
    }
  };

  const formatStartDate = () => {
    const startDate = new Date(book.start_date);
    return startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatStartDateTime = () => {
    const startDate = new Date(book.start_date);
    const date = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const time = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return { date, time };
  };

  const formatETADetails = () => {
    if (!eta) return { date: 'N/A', time: '' };
    const date = eta.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const time = eta.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return { date, time };
  };

  const calculateMinutesNeeded = () => {
    if (daysSinceStart <= 0) {
      return 60; // Haven't started yet, need full hour
    }
    
    const bookHoursCompleted = (book.percent_complete / 100) * book.duration;
    
    if (daysSinceStart < 1.0) {
      // Less than a day - need to reach 1 hour total by end of first day
      const trueHoursCompleted = bookHoursCompleted / book.reading_speed;
      const minutesCompleted = trueHoursCompleted * 60;
      const minutesNeeded = Math.max(0, 60 - minutesCompleted);
      return Math.ceil(minutesNeeded);
    }
    
    // After first day - calculate based on current progress
    const bookHoursPerDay = bookHoursCompleted / daysSinceStart;
    const trueHoursPerDay = bookHoursPerDay / book.reading_speed;
    
    if (trueHoursPerDay >= 1.0) {
      return 0; // Already at or above 1.0 hours per day
    }
    
    // Calculate how many more minutes needed today to reach 1.0 hours per day average
    const targetTotalTrueHours = daysSinceStart * 1.0;
    const currentTotalTrueHours = bookHoursCompleted / book.reading_speed;
    const additionalTrueHoursNeeded = targetTotalTrueHours - currentTotalTrueHours;
    const minutesNeeded = additionalTrueHoursNeeded * 60;
    
    return Math.ceil(Math.max(0, minutesNeeded));
  };

  const calculateBufferTime = (): string => {
    const currentHoursPerDay = calculateTrueHoursPerDay();
    
    if (currentHoursPerDay <= 1.0) {
      return '';
    }
    
    // Calculate how many days until Hours Per Day falls below 1.0
    const startDate = new Date(book.start_date);
    const currentDate = new Date();
    const daysSinceStart = (currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    
    // Current true hours completed
    const bookHoursCompleted = (book.percent_complete / 100) * book.duration;
    const trueHoursCompleted = bookHoursCompleted / book.reading_speed;
    
    // Calculate days until Hours Per Day falls below 1.0
    // Formula: trueHoursCompleted / (daysSinceStart + bufferDays) = 1.0
    // Solving for bufferDays: bufferDays = trueHoursCompleted - daysSinceStart
    const bufferDays = trueHoursCompleted - daysSinceStart;
    
    if (bufferDays <= 0) {
      return '';
    }
    
    // Calculate the exact time when buffer runs out
    const bufferTime = new Date(currentDate.getTime() + (bufferDays * 24 * 60 * 60 * 1000));
    
    // Format as "Buffer until Sat @ 8:23 AM"
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayName = dayNames[bufferTime.getDay()];
    const timeString = bufferTime.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    
    return `Buffer until ${dayName} @ ${timeString}`;
  };

  const handleEditRequest = () => {
    setShowEditConfirmation(true);
  };

  const handleEditConfirm = () => {
    setShowEditConfirmation(false);
    onEdit?.();
  };

  const calculateMinutesPerPercent = () => {
    // Minutes per % = (total book minutes) / 100
    const totalMinutes = book.duration * 60;
    return totalMinutes / 100;
  };

  const calculatePercentPerTrueHour = () => {
    // % per true hour = (100% of book) / (total true hours to read book)
    const totalTrueHours = book.duration / book.reading_speed;
    return 100 / totalTrueHours;
  };

  const calculateTotalTrueHoursCompleted = () => {
    // Total true hours completed = (book hours completed) / reading speed
    const bookHoursCompleted = (book.percent_complete / 100) * book.duration;
    return bookHoursCompleted / book.reading_speed;
  };

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

  const handleSpeedUpdate = async () => {
    const newSpeed = parseFloat(tempSpeed);
    if (isNaN(newSpeed) || newSpeed <= 0) {
      Alert.alert('Error', 'Please enter a valid reading speed');
      return;
    }
    
    try {
      await updateBook(book.id, { reading_speed: newSpeed });
      setShowSpeedModal(false);
      // Values will be recalculated automatically via useEffect
    } catch (error) {
      Alert.alert('Error', 'Failed to update reading speed. Please try again.');
    }
  };

  const handleProgressUpdate = async () => {
    setSyncingProgress(true);
    setSyncSuccess(false);
    setSyncError(false);
    
    try {
      // Ensure auth is refreshed from storage (silently)
      await plexService.ensureAuth();
      
      // Check if Plex is configured
      const authConfig = plexService.getAuthConfig();
      if (!authConfig) {
        console.log('Plex not configured, falling back to manual update');
        setSyncingProgress(false);
        setShowProgressModal(true);
        return;
      }

      console.log('Searching for book in Plex:', book.title, 'by', book.author);
      
      // Search for the book in Plex to get its ID
      // Search by both title and author to ensure we get the right book
      const searchResults = await plexService.searchBooks(book.title, undefined, 'title');
      console.log('Plex search results:', searchResults.length, 'books found');
      
      // Find exact match by both title AND author (case-insensitive)
      // This ensures we get the correct book even if multiple books are in progress
      const matchingBook = searchResults.find(plexBook => {
        const titleMatch = plexBook.title.toLowerCase().trim() === book.title.toLowerCase().trim();
        const authorMatch = plexBook.author.toLowerCase().trim() === book.author.toLowerCase().trim();
        
        if (titleMatch && authorMatch) {
          console.log('Found exact match:', plexBook.title, 'by', plexBook.author);
          return true;
        }
        return false;
      });

      if (!matchingBook) {
        console.log('No matching book found in Plex');
        console.log('Looking for:', book.title, 'by', book.author);
        console.log('Search results:', searchResults.map(b => ({ title: b.title, author: b.author })));
        setSyncingProgress(false);
        setSyncError(true);
        // Clear error state after 1 second
        setTimeout(() => setSyncError(false), 1000);
        return;
      }

      console.log('Found matching book in Plex:', matchingBook.id, matchingBook.title, 'by', matchingBook.author);

      // Get progress from Plex (now includes completion detection)
      const progress = await plexService.getBookProgress(matchingBook.id);
      console.log('Synced progress from Plex:', progress + '%');

      // If progress is 100%, show completion modal to get finish date
      if (progress === 100) {
        setSyncingProgress(false);
        setShowCompletionModal(true);
        setCompletionDate(new Date()); // Default to current time
        return;
      }

      // Update the book with synced progress
      await updateBook(book.id, { percent_complete: progress });
      
      setSyncingProgress(false);
      setSyncSuccess(true);
      // Clear success state after 1 second
      setTimeout(() => setSyncSuccess(false), 1000);
    } catch (error) {
      console.error('Failed to sync progress from Plex:', error);
      setSyncingProgress(false);
      setSyncError(true);
      // Clear error state after 1 second
      setTimeout(() => setSyncError(false), 1000);
    }
  };

  const handleProgressSave = async () => {
    const newProgress = parseFloat(tempProgress || '0');
    if (isNaN(newProgress) || newProgress < 0 || newProgress > 100) {
      Alert.alert('Error', 'Please enter a valid progress percentage (0-100)');
      return;
    }
    
    // If setting to 100%, show completion confirmation
    if (newProgress === 100) {
      setShowProgressModal(false);
      setShowCompletionModal(true);
      setCompletionDate(new Date()); // Default to current time
      return;
    }
    
    try {
      await updateBook(book.id, { percent_complete: newProgress });
      setShowProgressModal(false);
      setTempProgress('');
    } catch (error) {
      Alert.alert('Error', 'Failed to update progress. Please try again.');
    }
  };

  const handleCompletionConfirm = async () => {
    try {
      await updateBook(book.id, { 
        percent_complete: 100,
        finish_date: completionDate.toISOString()
      });
      setShowCompletionModal(false);
      setTempProgress('');
      // Values will be recalculated automatically via useEffect
    } catch (error) {
      Alert.alert('Error', 'Failed to mark book as complete. Please try again.');
    }
  };

  const handleCompletionCancel = () => {
    setShowCompletionModal(false);
    setShowProgressModal(true); // Return to progress modal
  };

  // Values are now stored in state and updated via useEffect

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={[styles.header, { paddingTop: insets.top + 16 }]}>
        {onBack ? (
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <IconSymbol name="chevron.left" size={24} color="#50b042" />
          </TouchableOpacity>
        ) : (
          <ThemedView style={styles.backButton} />
        )}
      </ThemedView>

      <ThemedView style={styles.content}>
        {/* Book Cover with Progress */}
        <ThemedView style={styles.coverContainer}>
          <BookCoverImage
            book={book}
            style={styles.cover}
          />
          <TouchableOpacity 
            style={styles.progressOverlay} 
            onPress={handleProgressUpdate}
            disabled={syncingProgress}
          >
            <AngledBanner size={80} />
            <CircularProgress progress={book.percent_complete} size={35} strokeWidth={4} />
            {syncingProgress ? (
              <View style={[styles.progressText, { position: 'absolute', top: 5, right: 5, width: 35, height: 35, justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="small" color="#ffffff" />
              </View>
            ) : syncSuccess ? (
              <View style={[styles.progressText, { position: 'absolute', top: 5, right: 5, width: 35, height: 35, justifyContent: 'center', alignItems: 'center' }]}>
                <IconSymbol name="checkmark.circle.fill" size={24} color="#ffffff" />
              </View>
            ) : syncError ? (
              <View style={[styles.progressText, { position: 'absolute', top: 5, right: 5, width: 35, height: 35, justifyContent: 'center', alignItems: 'center' }]}>
                <IconSymbol name="exclamationmark.circle.fill" size={24} color="#FF3B30" />
              </View>
            ) : (
              <ThemedText style={[styles.progressText, { position: 'absolute', top: 5, right: 5, width: 35, height: 35, textAlign: 'center', lineHeight: 35, paddingTop: 3 }]}>
                {`${book.percent_complete}%`}
              </ThemedText>
            )}
          </TouchableOpacity>
        </ThemedView>

        {/* Book Info */}
        <ThemedView style={styles.bookInfo}>
          <TouchableOpacity onPress={handleEditRequest} activeOpacity={0.7}>
            <ThemedText type="title" style={styles.title}>
              {book.title}
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleEditRequest} activeOpacity={0.7}>
            <ThemedText type="subtitle" style={styles.author}>
              By {book.author}
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleEditRequest} activeOpacity={0.7}>
            <ThemedText style={styles.duration}>
              {formatDuration(book.duration)}
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>

        {/* Hours Per Day Display */}
        <TouchableOpacity 
          style={[styles.hoursPerDayButton, { backgroundColor: getHoursPerDayColor(hoursPerDay) }]}
          onPress={() => {
            if (hoursPerDay > 1.0) {
              setShowBufferTime(!showBufferTime);
              setShowMinutesNeeded(false);
            } else {
              setShowMinutesNeeded(!showMinutesNeeded);
              setShowBufferTime(false);
            }
          }}
          activeOpacity={1}
        >
          <ThemedText style={styles.hoursPerDayText}>
            {showBufferTime ? 
              calculateBufferTime() :
              showMinutesNeeded ? 
                `Read for ${calculateMinutesNeeded()} minutes to catch up` : 
                `Hours Per Day: ${formatHoursPerDay(hoursPerDay)}`
            }
          </ThemedText>
        </TouchableOpacity>

        {/* Metadata Cards */}
        <ThemedView style={styles.metadataContainer}>
          <TouchableOpacity 
            style={styles.metadataCard}
            onPress={() => setShowStartDate(!showStartDate)}
            activeOpacity={1}
          >
            {!showStartDate && <ThemedText style={styles.metadataLabel}>Days</ThemedText>}
            {showStartDate ? (
              <>
                <ThemedText style={styles.metadataValue}>{formatStartDateTime().date}</ThemedText>
                <ThemedText style={styles.dateTime}>{formatStartDateTime().time}</ThemedText>
              </>
            ) : (
              <ThemedText style={styles.metadataValue}>{daysSinceStart.toFixed(1)}</ThemedText>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.metadataCard}
            onPress={() => setShowSpeedModal(true)}
            activeOpacity={1}
          >
            <ThemedText style={styles.metadataLabel}>Speed</ThemedText>
            <ThemedText style={styles.metadataValue}>{formatReadingSpeed(book.reading_speed)}x</ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.metadataCard}
            onPress={() => setShowETADetails(!showETADetails)}
            activeOpacity={1}
          >
            {!showETADetails && <ThemedText style={styles.metadataLabel}>ETA</ThemedText>}
            {showETADetails ? (
              <>
                <ThemedText style={styles.metadataValue}>{formatETADetails().date}</ThemedText>
                <ThemedText style={styles.dateTime}>{formatETADetails().time}</ThemedText>
              </>
            ) : (
              <ThemedText style={styles.metadataValue}>
                {eta ? eta.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'N/A'}
              </ThemedText>
            )}
          </TouchableOpacity>
        </ThemedView>

        {/* Additional Stats Toggle */}
        <TouchableOpacity 
          style={styles.statsToggleButton}
          onPress={() => setShowAdditionalStats(!showAdditionalStats)}
        >
          <ThemedText style={styles.statsToggleText}>
            {showAdditionalStats ? 'Show Less' : 'Show More'}
          </ThemedText>
        </TouchableOpacity>

        {/* Additional Stats */}
        {showAdditionalStats && (
          <ThemedView style={styles.additionalStatsContainer}>
            <ThemedView style={styles.additionalStatsCard}>
              <ThemedText style={styles.additionalStatsLabel}>Minutes per %</ThemedText>
              <ThemedText style={styles.additionalStatsValue}>{calculateMinutesPerPercent().toFixed(0)}</ThemedText>
            </ThemedView>
            
            <ThemedView style={styles.additionalStatsCard}>
              <ThemedText style={styles.additionalStatsLabel}>% per True Hour</ThemedText>
              <ThemedText style={styles.additionalStatsValue}>{Math.round(calculatePercentPerTrueHour())}</ThemedText>
            </ThemedView>
            
            <ThemedView style={styles.additionalStatsCard}>
              <ThemedText style={styles.additionalStatsLabel}>True Hours Done</ThemedText>
              <ThemedText style={styles.additionalStatsValue}>{calculateTotalTrueHoursCompleted().toFixed(1)}</ThemedText>
            </ThemedView>
          </ThemedView>
        )}
      </ThemedView>

      {/* Speed Edit Modal */}
      <Modal
        visible={showSpeedModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSpeedModal(false)}
      >
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={styles.modalContent}>
            <ThemedText type="title" style={styles.modalTitle}>Edit Reading Speed</ThemedText>
            <TextInput
              style={styles.speedInput}
              value={tempSpeed}
              onChangeText={setTempSpeed}
              keyboardType="numeric"
              autoFocus={true}
            />
            <ThemedView style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.modalCancelButton} 
                onPress={() => setShowSpeedModal(false)}
              >
                <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.modalSaveButton} 
                onPress={handleSpeedUpdate}
              >
                <ThemedText style={styles.modalButtonText}>Save</ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </Modal>

      {/* Progress Edit Modal */}
      <Modal
        visible={showProgressModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowProgressModal(false)}
      >
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={styles.modalContent}>
            <ThemedText type="title" style={styles.modalTitle}>Update Progress</ThemedText>
            <TextInput
              style={styles.progressInput}
              value={tempProgress}
              onChangeText={setTempProgress}
              keyboardType="numeric"
              autoFocus={true}
            />
            <ThemedView style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.modalCancelButton} 
                onPress={() => setShowProgressModal(false)}
              >
                <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.modalSaveButton} 
                onPress={handleProgressSave}
              >
                <ThemedText style={styles.modalButtonText}>Update</ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </Modal>

      {/* Book Completion Modal */}
      <Modal
        visible={showCompletionModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCompletionCancel}
      >
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={styles.completionModalContent}>
            <ThemedView style={styles.modalTitleContainer}>
              <IconSymbol name="checkmark.circle.fill" size={24} color="#50b042" style={styles.modalTitleIcon} />
              <ThemedText type="title" style={styles.modalTitle}>Book Complete!</ThemedText>
            </ThemedView>
            <ThemedText style={styles.completionSubtitle}>
              Congratulations on finishing "{book.title}"!
            </ThemedText>
            <ThemedText style={styles.completionLabel}>
              When did you finish reading?
            </ThemedText>
            <View style={styles.completionDateContainer}>
              <DateTimePicker
                value={completionDate}
                mode="datetime"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, selectedDate) => {
                  if (selectedDate) {
                    setCompletionDate(selectedDate);
                  }
                }}
              />
            </View>
            <ThemedView style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.modalCancelButton} 
                onPress={handleCompletionCancel}
              >
                <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.modalSaveButton} 
                onPress={handleCompletionConfirm}
              >
                <ThemedText style={styles.modalButtonText}>Complete Book</ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </Modal>

      {/* Edit Confirmation Modal */}
      <Modal
        visible={showEditConfirmation}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowEditConfirmation(false)}
      >
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={styles.modalContent}>
            <ThemedText type="title" style={styles.modalTitle}>Edit Book Details</ThemedText>
            <ThemedText style={styles.modalSubtitle}>
              Do you want to edit the title, author, or duration of this book?
            </ThemedText>
            <ThemedView style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.modalCancelButton} 
                onPress={() => setShowEditConfirmation(false)}
              >
                <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.modalSaveButton} 
                onPress={handleEditConfirm}
              >
                <ThemedText style={styles.modalButtonText}>Edit</ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </Modal>
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
    padding: 8,
  },
  editButton: {
    backgroundColor: 'transparent',
    padding: 8,
    borderRadius: 8,
  },
  content: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
  },
  coverContainer: {
    position: 'relative',
    marginBottom: 24,
  },
  cover: {
    width: 250,
    height: 250,
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
  progressOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopRightRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  angledBanner: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 100,
    height: 100,
    overflow: 'hidden',
  },
  bannerSquare: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 100,
    height: 100,
    backgroundColor: '#50b042',
    transform: [{ rotate: '45deg' }],
    transformOrigin: 'bottom left',
  },
  bannerCut: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 50,
    height: 50,
    backgroundColor: 'transparent',
    borderTopWidth: 50,
    borderTopColor: 'transparent',
    borderRightWidth: 50,
    borderRightColor: 'transparent',
    borderBottomWidth: 0,
    borderLeftWidth: 0,
  },
  progressText: {
    color: '#fff',
    fontSize: 10.5,
    fontWeight: '700',
    zIndex: 1,
  },
  bookInfo: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  author: {
    textAlign: 'center',
    opacity: 0.7,
  },
  duration: {
    textAlign: 'center',
    opacity: 0.6,
    fontSize: 16,
    marginTop: 4,
  },
  hoursPerDayButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginBottom: 32,
    width: '100%',
    alignItems: 'center',
  },
  hoursPerDayText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
  metadataContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  metadataCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metadataLabel: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 12,
    paddingTop: 4,
  },
  metadataValue: {
    fontSize: 30,
    fontWeight: '600',
    paddingTop: 4,
  },
  dateTime: {
    fontSize: 20,
    fontWeight: '500',
    paddingTop: 2,
    opacity: 0.8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 300,
    alignItems: 'center',
  },
  modalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitleIcon: {
    marginRight: 8,
  },
  modalTitle: {
    textAlign: 'center',
  },
  modalSubtitle: {
    textAlign: 'center',
    marginBottom: 20,
    opacity: 0.8,
  },
  speedInput: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    fontSize: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#ECEDEE',
    marginBottom: 20,
    width: 80,
    textAlign: 'center',
  },
  progressInput: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    fontSize: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#ECEDEE',
    marginBottom: 20,
    width: 80,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#6c757d',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalSaveButton: {
    flex: 1,
    backgroundColor: '#50b042',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  completionModalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 350,
    alignItems: 'center',
  },
  completionSubtitle: {
    fontSize: 16,
    color: '#ECEDEE',
    textAlign: 'center',
    marginBottom: 20,
    opacity: 0.8,
  },
  completionLabel: {
    fontSize: 16,
    color: '#ECEDEE',
    marginBottom: 16,
    fontWeight: '600',
  },
  completionDateContainer: {
    marginBottom: 20,
    width: '100%',
    alignItems: 'center',
  },
  additionalStatsContainer: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    marginTop: 12,
  },
  additionalStatsCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
  },
  additionalStatsLabel: {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 6,
    textAlign: 'center',
  },
  additionalStatsValue: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  statsToggleButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 12,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statsToggleText: {
    fontSize: 14,
    color: '#8a8a8a',
    fontWeight: '500',
  },
});
