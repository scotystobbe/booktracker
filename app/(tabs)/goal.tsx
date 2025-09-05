import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useBooks } from '@/context/BookContext';
import React, { useMemo, useState } from 'react';
import { Alert, Modal, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

export default function GoalScreen() {
  const { books, updateGoal, getGoal } = useBooks();
  const insets = useSafeAreaInsets();
  const currentYear = new Date().getFullYear();
  const currentGoal = getGoal(currentYear);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [tempGoal, setTempGoal] = useState('');
  const [showHighestValues, setShowHighestValues] = useState(false);

  // Get completed books for this year
  const completedBooks = books.filter(book => 
    book.percent_complete === 100 && 
    book.finish_date && 
    new Date(book.finish_date).getFullYear() === currentYear
  );

  // Calculate progress percentage
  const progressPercentage = currentGoal > 0 ? (completedBooks.length / currentGoal) * 100 : 0;

  // Calculate expected books at this point in the year
  const daysElapsedThisYear = Math.floor((new Date().getTime() - new Date(currentYear, 0, 1).getTime()) / (1000 * 60 * 60 * 24));
  const totalDaysInYear = Math.floor((new Date(currentYear, 11, 31).getTime() - new Date(currentYear, 0, 1).getTime()) / (1000 * 60 * 60 * 24));
  const expectedBooksAtThisPoint = currentGoal * (daysElapsedThisYear / totalDaysInYear);
  const booksAheadOrBehind = completedBooks.length - expectedBooksAtThisPoint;

  // Calculate average days per book this year
  const averageDaysPerBook = completedBooks.length > 0 
    ? completedBooks.reduce((sum, book) => {
        const startDate = new Date(book.start_date);
        const finishDate = new Date(book.finish_date!);
        const daysDiff = Math.ceil((finishDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        return sum + daysDiff;
      }, 0) / completedBooks.length
    : 0;

  // Calculate true hours per day this year (same as Current page)
  const totalHoursCompleted = completedBooks.reduce((sum, book) => {
    const bookHoursCompleted = (book.percent_complete / 100) * book.duration;
    return sum + (bookHoursCompleted / book.reading_speed);
  }, 0);
  const trueHoursPerDay = daysElapsedThisYear > 0 ? totalHoursCompleted / daysElapsedThisYear : 0;

  // Calculate target hours per day to reach goal
  const daysRemainingThisYear = Math.floor((new Date(currentYear, 11, 31).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
  const booksRemaining = Math.max(0, currentGoal - completedBooks.length);
  
  // Calculate average book length from completed books, or use 10 hours as default
  const averageBookLength = completedBooks.length > 0 
    ? completedBooks.reduce((sum, book) => sum + book.duration, 0) / completedBooks.length
    : 10;
  
  // Target hours per day = (books remaining * average book length) / (days remaining * reading speed)
  const targetHoursPerDay = daysRemainingThisYear > 0 && booksRemaining > 0
    ? (booksRemaining * averageBookLength) / (daysRemainingThisYear * 2.0) // 2.0x reading speed
    : 0;

  // Calculate projected values based on current pace
  const totalBookHoursCompleted = completedBooks.reduce((sum, book) => sum + book.duration, 0);
  const projectedHoursRead = daysElapsedThisYear > 0 ? (totalBookHoursCompleted / daysElapsedThisYear) * totalDaysInYear : 0;
  const projectedBooksRead = daysElapsedThisYear > 0 ? (completedBooks.length / daysElapsedThisYear) * totalDaysInYear : 0;

  // Calculate days without active book
  const daysWithoutActiveBook = useMemo(() => {
    if (completedBooks.length < 2) return 0;
    
    let totalDays = 0;
    const sortedBooks = [...completedBooks].sort((a, b) => 
      new Date(a.finish_date!).getTime() - new Date(b.finish_date!).getTime()
    );
    
    for (let i = 0; i < sortedBooks.length - 1; i++) {
      const currentFinish = new Date(sortedBooks[i].finish_date!);
      const nextStart = new Date(sortedBooks[i + 1].start_date);
      const daysBetween = (nextStart.getTime() - currentFinish.getTime()) / (1000 * 60 * 60 * 24);
      totalDays += Math.max(0, daysBetween);
    }
    
    return totalDays;
  }, [completedBooks]);

  // Calculate highest recorded values from all years (same logic as Stats table)
  const allCompletedBooks = books.filter(book => book.percent_complete === 100 && book.finish_date);
  const yearlyStats = useMemo(() => {
    const yearMap = new Map<number, { year: number; books: number; hours: number; hrsPerBook: number; hrsPerDay: number }>();

    allCompletedBooks.forEach(book => {
      const year = new Date(book.finish_date!).getFullYear();
      
      if (!yearMap.has(year)) {
        yearMap.set(year, {
          year,
          books: 0,
          hours: 0,
          hrsPerBook: 0,
          hrsPerDay: 0,
        });
      }
      
      const yearStats = yearMap.get(year)!;
      yearStats.books += 1;
      yearStats.hours += book.duration;
    });

    // Calculate averages and convert to array
    const stats = Array.from(yearMap.values()).map(yearData => {
      const hrsPerBook = yearData.books > 0 ? yearData.hours / yearData.books : 0;
      
      // Calculate true hours per day for the year
      const yearStart = new Date(yearData.year, 0, 1);
      const currentDate = new Date();
      const yearEnd = yearData.year === currentDate.getFullYear() 
        ? currentDate 
        : new Date(yearData.year, 11, 31);
      const daysInYear = Math.floor((yearEnd.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24));
      
      // Calculate total true hours (book hours / reading speed)
      const totalTrueHours = books
        .filter(book => 
          book.percent_complete === 100 && 
          book.finish_date && 
          new Date(book.finish_date).getFullYear() === yearData.year
        )
        .reduce((sum, book) => sum + (book.duration / book.reading_speed), 0);
      
      const hrsPerDay = daysInYear > 0 ? totalTrueHours / daysInYear : 0;

      return {
        ...yearData,
        hrsPerBook,
        hrsPerDay,
      };
    });

    return stats;
  }, [books]);

  // Find highest values
  const highestHours = Math.max(...yearlyStats.map(s => s.hours), 0);
  const highestBooks = Math.max(...yearlyStats.map(s => s.books), 0);

  // Format hours and minutes
  const formatHoursAndMinutes = (hours: number) => {
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    if (wholeHours === 0) {
      return `${minutes}m`;
    }
    return `${wholeHours}h ${minutes}m`;
  };

  const handleSaveGoal = () => {
    const newGoal = parseInt(tempGoal);
    if (isNaN(newGoal) || newGoal <= 0) {
      Alert.alert('Error', 'Please enter a valid goal number');
      return;
    }
    
    updateGoal(currentYear, newGoal);
    setShowGoalModal(false);
  };

  const DonutChart = ({ progress, size = 200, strokeWidth = 20 }: { progress: number; size?: number; strokeWidth?: number }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDasharray = circumference;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
      <ThemedView style={styles.donutContainer}>
        <Svg width={size} height={size} style={styles.donutChartSvg}>
          <Circle 
            cx={size / 2} 
            cy={size / 2} 
            r={radius} 
            stroke="rgba(255, 255, 255, 0.2)" 
            strokeWidth={strokeWidth} 
            fill="transparent" 
          />
          <Circle 
            cx={size / 2} 
            cy={size / 2} 
            r={radius} 
            stroke="#3b82f6" 
            strokeWidth={strokeWidth} 
            fill="transparent" 
            strokeDasharray={strokeDasharray} 
            strokeDashoffset={strokeDashoffset} 
            strokeLinecap="round" 
            transform={`rotate(-90 ${size / 2} ${size / 2})`} 
          />
        </Svg>
        <ThemedView style={styles.donutTextContainer}>
          <ThemedText style={styles.donutPercentage}>
            {progress.toFixed(0)}%
          </ThemedText>
        </ThemedView>
      </ThemedView>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <ThemedText type="title" style={styles.title}>
          Reading Goal {currentYear}
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.content}>
        <ThemedView style={styles.goalSection}>
          <TouchableOpacity style={styles.goalButton} onPress={() => setShowGoalModal(true)}>
            <ThemedText style={styles.goalValue}>{currentGoal}</ThemedText>
            <ThemedText style={styles.goalLabel}>books</ThemedText>
          </TouchableOpacity>
        </ThemedView>

        <ThemedView style={styles.donutSection}>
          <DonutChart progress={Math.min(progressPercentage, 100)} size={200} strokeWidth={20} />
        </ThemedView>

        <ThemedView style={styles.booksSummary}>
          <ThemedText style={styles.booksSummaryText}>
            {completedBooks.length} of {currentGoal} books read
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.statusSection}>
          <ThemedView 
            style={[
              styles.statusBar, 
              { backgroundColor: booksAheadOrBehind >= 0 ? '#50b042' : '#f44336' }
            ]}
          >
            <ThemedText style={styles.statusBarText}>
              {booksAheadOrBehind >= 0 
                ? `Ahead by ${Math.abs(booksAheadOrBehind) <= 2 ? booksAheadOrBehind.toFixed(1) : Math.round(booksAheadOrBehind)} books`
                : `Behind by ${Math.abs(booksAheadOrBehind) <= 2 ? Math.abs(booksAheadOrBehind).toFixed(1) : Math.round(Math.abs(booksAheadOrBehind))} books`
              }
            </ThemedText>
          </ThemedView>
        </ThemedView>

        {/* Metadata Cards */}
        <ThemedView style={styles.metadataContainer}>
          <ThemedView style={styles.metadataCard}>
            <ThemedText style={styles.metadataLabel}>Average{'\n'}days/bk</ThemedText>
            <ThemedText style={styles.metadataValue}>{averageDaysPerBook.toFixed(1)}</ThemedText>
          </ThemedView>
          
          <ThemedView style={styles.metadataCard}>
            <ThemedText style={styles.metadataLabel}>True Hours per Day</ThemedText>
            <ThemedText style={styles.metadataValue}>{formatHoursAndMinutes(trueHoursPerDay)}</ThemedText>
          </ThemedView>
          
          <ThemedView style={styles.metadataCard}>
            <ThemedText style={styles.metadataLabel}>Target Hrs{'\n'}per Day</ThemedText>
            <ThemedText style={styles.metadataValue}>{targetHoursPerDay.toFixed(1)}</ThemedText>
          </ThemedView>
        </ThemedView>

        {/* Projected Values */}
        <ThemedView style={styles.projectedContainer}>
          <TouchableOpacity 
            style={styles.projectedCard} 
            onPress={() => setShowHighestValues(!showHighestValues)}
            activeOpacity={0.7}
          >
            <ThemedText style={styles.projectedLabel}>
              {showHighestValues ? 'Highest Hours Read' : 'Projected Hours Read'}
            </ThemedText>
            <ThemedText style={styles.projectedValue}>
              {showHighestValues ? highestHours.toFixed(1) : projectedHoursRead.toFixed(1)}
            </ThemedText>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.projectedCard} 
            onPress={() => setShowHighestValues(!showHighestValues)}
            activeOpacity={0.7}
          >
            <ThemedText style={styles.projectedLabel}>
              {showHighestValues ? 'Highest Books Read' : 'Projected Books Read'}
            </ThemedText>
            <ThemedText style={styles.projectedValue}>
              {showHighestValues ? highestBooks.toFixed(1) : projectedBooksRead.toFixed(1)}
            </ThemedText>
          </TouchableOpacity>
        </ThemedView>

        {/* Additional Stats */}
        <ThemedView style={styles.additionalStatsContainer}>
          <ThemedView style={styles.projectedCard}>
            <ThemedText style={styles.projectedLabel}>Days w/o Active Book</ThemedText>
            <ThemedText style={styles.projectedValue}>{daysWithoutActiveBook.toFixed(0)}</ThemedText>
          </ThemedView>
          
          <ThemedView style={styles.projectedCard}>
            <ThemedText style={styles.projectedLabel}></ThemedText>
            <ThemedText style={styles.projectedValue}></ThemedText>
          </ThemedView>
        </ThemedView>
      </ThemedView>

      {/* Goal Edit Modal */}
      <Modal
        visible={showGoalModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGoalModal(false)}
      >
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>Set Reading Goal</ThemedText>
            <TextInput
              style={styles.modalInput}
              value={tempGoal}
              onChangeText={setTempGoal}
              keyboardType="numeric"
              autoFocus
            />
            <ThemedView style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.modalButton} 
                onPress={() => setShowGoalModal(false)}
              >
                <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonPrimary]} 
                onPress={handleSaveGoal}
              >
                <ThemedText style={[styles.modalButtonText, styles.modalButtonPrimaryText]}>Save</ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
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
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  goalSection: {
    alignItems: 'center',
    marginTop: 0,
  },
  goalButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    padding: 12,
    borderRadius: 12,
    width: '100%',
    maxWidth: 300,
    minHeight: 110,
  },

  goalValue: {
    fontSize: 44,
    fontWeight: 'bold',
    color: '#ECEDEE',
    textAlign: 'center',
    lineHeight: 48,
  },
  goalLabel: {
    fontSize: 16,
    color: '#ECEDEE',
    opacity: 0.7,
    marginTop: -2,
    textAlign: 'center',
  },
  donutSection: {
    alignItems: 'center',
    marginTop: 0,
  },
  donutContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutChartSvg: {
    alignSelf: 'center',
  },
  donutTextContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 200,
    height: 200,
  },
  donutPercentage: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#ECEDEE',
    textAlign: 'center',
    lineHeight: 36,
  },
  statusSection: {
    marginTop: 20,
  },
  statusBar: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: 'center',
  },
  statusBarText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
  booksSummary: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  booksSummaryText: {
    fontSize: 18,
    color: '#ECEDEE',
    opacity: 0.7,
  },
  metadataContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 20,
  },
  metadataCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  metadataLabel: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 12,
    paddingTop: 4,
    textAlign: 'center',
  },
  metadataValue: {
    fontSize: 30,
    fontWeight: '600',
    paddingTop: 4,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 300,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ECEDEE',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#ECEDEE',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  modalButtonPrimary: {
    backgroundColor: '#007AFF',
  },
  modalButtonText: {
    fontSize: 16,
    color: '#ECEDEE',
  },
  modalButtonPrimaryText: {
    color: '#fff',
    fontWeight: '600',
  },
  projectedContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 8,
  },
  additionalStatsContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 8,
  },
  projectedCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
  },
  projectedLabel: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 8,
    textAlign: 'center',
  },
  projectedValue: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
});
