import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useBooks } from '@/context/BookContext';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useMemo, useState } from 'react';
import { Alert, Modal, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function StatsScreen() {
  const { books, getUserData, setUserData } = useBooks();
  const insets = useSafeAreaInsets();
  const [activeView, setActiveView] = useState<'highLevel' | 'lifetime'>('highLevel');
  const [showLifeExpectancyModal, setShowLifeExpectancyModal] = useState(false);
  const [tempLifeExpectancy, setTempLifeExpectancy] = useState('');
  const [showBirthdayModal, setShowBirthdayModal] = useState(false);
  const [tempBirthday, setTempBirthday] = useState(new Date());

  const formatHoursAndMinutes = (decimalHours: number): string => {
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    return `${hours}h ${minutes}m`;
  };

  // High Level Stats calculations
  const highLevelStats = useMemo(() => {
    const completedBooks = books.filter(book => book.percent_complete === 100 && book.finish_date);
    
    // Calculate years tracked
    const startDates = completedBooks.map(book => new Date(book.start_date));
    const earliestStart = new Date(Math.min(...startDates.map(date => date.getTime())));
    const now = new Date();
    const yearsTracked = (now.getTime() - earliestStart.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    
    // Calculate average books per year
    const yearsWithBooks = new Set(completedBooks.map(book => new Date(book.finish_date!).getFullYear())).size;
    const averageBooksPerYear = yearsWithBooks > 0 ? completedBooks.length / yearsWithBooks : 0;
    
    // Calculate average hours per day (true hours)
    let totalTrueHours = 0;
    let totalDays = 0;
    
    completedBooks.forEach(book => {
      if (book.start_date && book.finish_date) {
        const startDate = new Date(book.start_date);
        const finishDate = new Date(book.finish_date);
        const daysDiff = (finishDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
        const trueHours = book.duration / book.reading_speed;
        totalTrueHours += trueHours;
        totalDays += daysDiff;
      }
    });
    
    const averageHoursPerDay = totalDays > 0 ? totalTrueHours / totalDays : 0;
    
    // Calculate total books
    const totalBooks = completedBooks.length;
    
    // Calculate average hours per book
    const totalBookHours = completedBooks.reduce((sum, book) => sum + book.duration, 0);
    const averageHoursPerBook = totalBooks > 0 ? totalBookHours / totalBooks : 0;
    
    // Calculate average days per book
    let totalDaysForBooks = 0;
    let booksWithDates = 0;
    
    completedBooks.forEach(book => {
      if (book.start_date && book.finish_date) {
        const startDate = new Date(book.start_date);
        const finishDate = new Date(book.finish_date);
        const daysDiff = (finishDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
        totalDaysForBooks += daysDiff;
        booksWithDates++;
      }
    });
    
    const averageDaysPerBook = booksWithDates > 0 ? totalDaysForBooks / booksWithDates : 0;
    
    return {
      yearsTracked,
      averageBooksPerYear,
      averageHoursPerDay,
      totalBooks,
      averageHoursPerBook,
      averageDaysPerBook
    };
  }, [books]);

  // Lifetime Projection calculations
  const lifetimeProjectionStats = useMemo(() => {
    const birthdayStr = getUserData('birthday');
    const birthday = birthdayStr ? new Date(birthdayStr) : null;
    const now = new Date();
    
    // Calculate current age in years (with decimal) - only if birthday is set
    const ageInYears = birthday ? (now.getTime() - birthday.getTime()) / (1000 * 60 * 60 * 24 * 365.25) : 0;
    
    // Get life expectancy from user data (default to 80 if not set)
    const lifeExpectancyStr = getUserData('lifeExpectancy');
    const lifeExpectancy = lifeExpectancyStr ? parseInt(lifeExpectancyStr) : 80;
    
    // Calculate years left - only if birthday is set
    const yearsLeft = birthday ? Math.max(0, lifeExpectancy - ageInYears) : 0;
    
    // Calculate average books per year
    const completedBooks = books.filter(book => book.percent_complete === 100 && book.finish_date);
    const yearsWithBooks = new Set(completedBooks.map(book => new Date(book.finish_date!).getFullYear())).size;
    const averageBooksPerYear = yearsWithBooks > 0 ? completedBooks.length / yearsWithBooks : 0;
    
    // Calculate average days per book
    let totalDays = 0;
    let booksWithDates = 0;
    
    completedBooks.forEach(book => {
      if (book.start_date && book.finish_date) {
        const startDate = new Date(book.start_date);
        const finishDate = new Date(book.finish_date);
        const daysDiff = (finishDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
        totalDays += daysDiff;
        booksWithDates++;
      }
    });
    
    const averageDaysPerBook = booksWithDates > 0 ? totalDays / booksWithDates : 0;
    
    // Calculate projected books - only if birthday is set
    const projectedBooks = birthday ? Math.round(yearsLeft * averageBooksPerYear) : 0;
    
    return {
      lifeExpectancy,
      yearsLeft,
      currentAge: ageInYears,
      averageBooksPerYear,
      averageDaysPerBook,
      projectedBooks,
      hasBirthday: !!birthday
    };
  }, [books, getUserData]);

  const handleSaveLifeExpectancy = () => {
    const value = parseInt(tempLifeExpectancy);
    if (isNaN(value) || value < 1 || value > 150) {
      Alert.alert('Invalid Input', 'Please enter a valid life expectancy between 1 and 150 years.');
      return;
    }
    
    setUserData('lifeExpectancy', value.toString());
    setShowLifeExpectancyModal(false);
    setTempLifeExpectancy('');
  };

  const handleEditLifeExpectancy = () => {
    setTempLifeExpectancy(lifetimeProjectionStats.lifeExpectancy.toString());
    setShowLifeExpectancyModal(true);
  };

  const handleEditBirthday = () => {
    const birthdayStr = getUserData('birthday');
    if (birthdayStr) {
      setTempBirthday(new Date(birthdayStr));
    } else {
      setTempBirthday(new Date());
    }
    setShowBirthdayModal(true);
  };

  const handleSaveBirthday = () => {
    setUserData('birthday', tempBirthday.toISOString());
    setShowBirthdayModal(false);
  };

  // Group books by year and calculate stats
  const yearlyStats = React.useMemo(() => {
    const yearMap = new Map<number, {
      year: number;
      books: number;
      hours: number;
      hrsPerBook: number;
      hrsPerDay: number;
    }>();

    books.forEach(book => {
      if (book.percent_complete === 100 && book.finish_date) {
        const year = new Date(book.finish_date).getFullYear();
        
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
      }
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

    // Sort by year (oldest first)
    const sortedStats = stats.sort((a, b) => a.year - b.year);

    // Find max values for each column
    const maxBooks = Math.max(...sortedStats.map(s => s.books));
    const maxHours = Math.max(...sortedStats.map(s => s.hours));
    const maxHrsPerBook = Math.max(...sortedStats.map(s => s.hrsPerBook));
    const maxHrsPerDay = Math.max(...sortedStats.map(s => s.hrsPerDay));

    // Add max flags to each stat
    return sortedStats.map(stat => ({
      ...stat,
      isMaxBooks: stat.books === maxBooks,
      isMaxHours: stat.hours === maxHours,
      isMaxHrsPerBook: stat.hrsPerBook === maxHrsPerBook,
      isMaxHrsPerDay: stat.hrsPerDay === maxHrsPerDay,
    }));
  }, [books]);

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <ThemedText type="title" style={styles.title}>
          Stats
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.content}>
        <ThemedView style={styles.table}>
          {/* Table Header */}
          <ThemedView style={styles.tableHeader}>
            <ThemedText style={[styles.headerCell, styles.yearColumn]}>Year</ThemedText>
            <ThemedText style={[styles.headerCell, styles.booksColumn]}>Books</ThemedText>
            <ThemedText style={[styles.headerCell, styles.hoursColumn]}>Hours</ThemedText>
            <ThemedText style={[styles.headerCell, styles.hrsPerBookColumn]}>Hrs/book</ThemedText>
            <ThemedText style={[styles.headerCell, styles.hrsPerDayColumn]}>Hrs/day</ThemedText>
          </ThemedView>

          {/* Table Rows */}
          {yearlyStats.map((yearData, index) => (
            <ThemedView key={yearData.year} style={[styles.tableRow, index % 2 === 0 && styles.evenRow]}>
              <ThemedText style={[styles.cell, styles.yearColumn]}>{yearData.year}</ThemedText>
              <ThemedText style={[styles.cell, styles.booksColumn, yearData.isMaxBooks && styles.boldCell]}>{yearData.books}</ThemedText>
              <ThemedText style={[styles.cell, styles.hoursColumn, yearData.isMaxHours && styles.boldCell]}>{yearData.hours.toFixed(0)}</ThemedText>
              <ThemedText style={[styles.cell, styles.hrsPerBookColumn, yearData.isMaxHrsPerBook && styles.boldCell]}>{yearData.hrsPerBook.toFixed(1)}</ThemedText>
              <ThemedText style={[styles.cell, styles.hrsPerDayColumn, yearData.isMaxHrsPerDay && styles.boldCell]}>{formatHoursAndMinutes(yearData.hrsPerDay)}</ThemedText>
            </ThemedView>
          ))}

          {yearlyStats.length === 0 && (
            <ThemedView style={styles.emptyState}>
              <ThemedText style={styles.emptyText}>No completed books found</ThemedText>
            </ThemedView>
          )}
        </ThemedView>

        {/* Toggle Section */}
        <ThemedView style={styles.toggleSection}>
          <ThemedView style={styles.toggleContainer}>
            <TouchableOpacity 
              style={[styles.toggleButton, activeView === 'highLevel' && styles.activeToggle]}
              onPress={() => setActiveView('highLevel')}
            >
              <ThemedText style={[styles.toggleText, activeView === 'highLevel' && styles.activeToggleText]}>
                High Level Stats
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.toggleButton, activeView === 'lifetime' && styles.activeToggle]}
              onPress={() => setActiveView('lifetime')}
            >
              <ThemedText style={[styles.toggleText, activeView === 'lifetime' && styles.activeToggleText]}>
                Lifetime Projection
              </ThemedText>
            </TouchableOpacity>
          </ThemedView>

          {/* Metadata Boxes Grid */}
          <ThemedView style={styles.metadataGrid}>
            {activeView === 'highLevel' ? (
              <>
                {/* Row 1 */}
                <ThemedView style={styles.metadataBox}>
                  <ThemedText style={styles.metadataLabel}>Years Tracked</ThemedText>
                  <ThemedText style={styles.metadataValue}>{highLevelStats.yearsTracked.toFixed(1)}</ThemedText>
                </ThemedView>
                
                <ThemedView style={styles.metadataBox}>
                  <ThemedText style={styles.metadataLabel}>Total Books</ThemedText>
                  <ThemedText style={styles.metadataValue}>{highLevelStats.totalBooks}</ThemedText>
                </ThemedView>
                
                {/* Row 2 */}
                <ThemedView style={styles.metadataBox}>
                  <ThemedText style={styles.metadataLabel}>Average Hours/Day</ThemedText>
                  <ThemedText style={styles.metadataValue}>{formatHoursAndMinutes(highLevelStats.averageHoursPerDay)}</ThemedText>
                </ThemedView>
                
                <ThemedView style={styles.metadataBox}>
                  <ThemedText style={styles.metadataLabel}>Average Books/Year</ThemedText>
                  <ThemedText style={styles.metadataValue}>{Math.floor(highLevelStats.averageBooksPerYear)}</ThemedText>
                </ThemedView>
                
                {/* Row 3 */}
                <ThemedView style={styles.metadataBox}>
                  <ThemedText style={styles.metadataLabel}>Average Days/Book</ThemedText>
                  <ThemedText style={styles.metadataValue}>{highLevelStats.averageDaysPerBook.toFixed(1)}</ThemedText>
                </ThemedView>
                
                <ThemedView style={styles.metadataBox}>
                  <ThemedText style={styles.metadataLabel}>Average Hours/Book</ThemedText>
                  <ThemedText style={styles.metadataValue}>{highLevelStats.averageHoursPerBook.toFixed(1)}</ThemedText>
                </ThemedView>
              </>
            ) : (
              <>
                {/* Left Column */}
                <ThemedView style={styles.metadataBox}>
                  <ThemedText style={styles.metadataLabel}>Life Expectancy</ThemedText>
                  <TouchableOpacity onPress={handleEditLifeExpectancy}>
                    <ThemedText style={styles.metadataValue}>{lifetimeProjectionStats.lifeExpectancy}</ThemedText>
                  </TouchableOpacity>
                </ThemedView>
                
                <ThemedView style={styles.metadataBox}>
                  <ThemedText style={styles.metadataLabel}>Average Days/Book</ThemedText>
                  <ThemedText style={styles.metadataValue}>{lifetimeProjectionStats.averageDaysPerBook.toFixed(1)}</ThemedText>
                </ThemedView>
                
                <ThemedView style={styles.metadataBox}>
                  <ThemedText style={styles.metadataLabel}>Current Age</ThemedText>
                  <TouchableOpacity onPress={handleEditBirthday}>
                    <ThemedText style={styles.metadataValue}>
                      {lifetimeProjectionStats.hasBirthday ? lifetimeProjectionStats.currentAge.toFixed(1) : 'Tap to set'}
                    </ThemedText>
                  </TouchableOpacity>
                </ThemedView>
                
                {/* Right Column */}
                <ThemedView style={styles.metadataBox}>
                  <ThemedText style={styles.metadataLabel}>Average Books/Year</ThemedText>
                  <ThemedText style={styles.metadataValue}>{Math.floor(lifetimeProjectionStats.averageBooksPerYear)}</ThemedText>
                </ThemedView>
                
                <ThemedView style={styles.metadataBox}>
                  <ThemedText style={styles.metadataLabel}>Years Left</ThemedText>
                  <ThemedText style={styles.metadataValue}>{lifetimeProjectionStats.yearsLeft.toFixed(1)}</ThemedText>
                </ThemedView>
                
                <ThemedView style={styles.metadataBox}>
                  <ThemedText style={styles.metadataLabel}>Projected Books</ThemedText>
                  <ThemedText style={styles.metadataValue}>{lifetimeProjectionStats.projectedBooks.toLocaleString()}</ThemedText>
                </ThemedView>
              </>
            )}
          </ThemedView>
        </ThemedView>
      </ThemedView>

      {/* Life Expectancy Edit Modal */}
      <Modal visible={showLifeExpectancyModal} transparent animationType="fade" onRequestClose={() => setShowLifeExpectancyModal(false)}>
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>Edit Life Expectancy</ThemedText>
            <TextInput
              style={styles.modalInput}
              value={tempLifeExpectancy}
              onChangeText={setTempLifeExpectancy}
              placeholder="Enter life expectancy"
              keyboardType="numeric"
              autoFocus
            />
            <ThemedView style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButton} onPress={() => setShowLifeExpectancyModal(false)}>
                <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonPrimary]} onPress={handleSaveLifeExpectancy}>
                <ThemedText style={[styles.modalButtonText, styles.modalButtonPrimaryText]}>Save</ThemedText>
              </TouchableOpacity>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </Modal>

      {/* Birthday Edit Modal */}
      <Modal visible={showBirthdayModal} transparent animationType="fade" onRequestClose={() => setShowBirthdayModal(false)}>
        <ThemedView style={styles.modalOverlay}>
          <ThemedView style={styles.modalContent}>
            <ThemedText style={styles.modalTitle}>Set Your Birthday</ThemedText>
            <DateTimePicker
              value={tempBirthday}
              mode="date"
              display="default"
              onChange={(event, selectedDate) => {
                if (selectedDate) {
                  setTempBirthday(selectedDate);
                }
              }}
              maximumDate={new Date()}
              style={styles.datePicker}
            />
            <ThemedView style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalButton} onPress={() => setShowBirthdayModal(false)}>
                <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.modalButtonPrimary]} onPress={handleSaveBirthday}>
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
  table: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  evenRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  headerCell: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ECEDEE',
    textAlign: 'center',
  },
  cell: {
    fontSize: 16,
    color: '#ECEDEE',
    textAlign: 'center',
  },
  boldCell: {
    fontWeight: 'bold',
    color: '#50b042',
  },
  yearColumn: {
    flex: 0.8,
  },
  booksColumn: {
    flex: 0.6,
  },
  hoursColumn: {
    flex: 0.8,
  },
  hrsPerBookColumn: {
    flex: 0.8,
  },
  hrsPerDayColumn: {
    flex: 0.8,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#ECEDEE',
    opacity: 0.7,
  },
  toggleSection: {
    marginTop: 24,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  activeToggle: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  toggleText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ECEDEE',
    opacity: 0.7,
  },
  activeToggleText: {
    opacity: 1,
    fontWeight: '600',
  },
  metadataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metadataBox: {
    width: '48%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  metadataBoxText: {
    fontSize: 16,
    color: '#ECEDEE',
    opacity: 0.7,
    textAlign: 'center',
  },
  metadataLabel: {
    fontSize: 16,
    color: '#ECEDEE',
    opacity: 0.7,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 6,
  },
  metadataValue: {
    fontSize: 28,
    fontWeight: '600',
    color: '#ECEDEE',
    textAlign: 'center',
    lineHeight: 32,
    flex: 0,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 24,
    width: '80%',
    maxWidth: 300,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ECEDEE',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#ECEDEE',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: '#50b042',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ECEDEE',
  },
  modalButtonPrimaryText: {
    color: '#fff',
  },
  datePicker: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    marginBottom: 20,
    alignSelf: 'center',
  },
});
