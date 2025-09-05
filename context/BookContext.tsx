import { databaseService } from '@/services/DatabaseService';
import { imageService } from '@/services/ImageService';
import { Book, CreateBookData, UpdateBookData } from '@/types/Book';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';

interface BookContextType {
  books: Book[];
  loading: boolean;
  addBook: (bookData: CreateBookData) => Promise<void>;
  updateBook: (id: string, bookData: UpdateBookData) => Promise<void>;
  deleteBook: (id: string) => Promise<void>;
  getBook: (id: string) => Book | undefined;
  importFromCSV: (csvData: string) => Promise<{ success: number; errors: string[] }>;
  exportToCSV: () => Promise<string>;
  downloadMissingImages: (onProgress?: (current: number, total: number, currentBook: string, failedBooks: string[]) => void) => Promise<{ completed: number; total: number; failedBooks: string[] }>;
  retryFailedImages: (failedBookTitles: string[]) => Promise<void>;
  clearAllBooks: () => Promise<void>;
  loadBooks: () => Promise<void>;
  updateGoal: (year: number, goal: number) => Promise<void>;
  getGoal: (year: number) => number;
  getUserData: (key: string) => string | null;
  setUserData: (key: string, value: string) => Promise<void>;
}

const BookContext = createContext<BookContextType | undefined>(undefined);

export const useBooks = () => {
  const context = useContext(BookContext);
  if (!context) {
    throw new Error('useBooks must be used within a BookProvider');
  }
  return context;
};

interface BookProviderProps {
  children: ReactNode;
}

export const BookProvider: React.FC<BookProviderProps> = ({ children }) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<Record<number, number>>({});
  const [userData, setUserData] = useState<Record<string, string>>({});

  useEffect(() => {
    initializeDatabase();
  }, []);

  const initializeDatabase = async () => {
    try {
      await databaseService.init();
      await imageService.initialize();
      await loadBooks();
      await loadGoals();
      await loadUserData();
    } catch (error) {
      console.error('Failed to initialize database:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBooks = async () => {
    try {
      const allBooks = await databaseService.getAllBooks();
      setBooks(allBooks);
    } catch (error) {
      console.error('Failed to load books:', error);
    }
  };

  const loadGoals = async () => {
    try {
      const allGoals = await databaseService.getAllGoals();
      const goalsMap: Record<number, number> = {};
      allGoals.forEach(goal => {
        goalsMap[goal.year] = goal.goal;
      });
      setGoals(goalsMap);
    } catch (error) {
      console.error('Failed to load goals:', error);
    }
  };

  const loadUserData = async () => {
    try {
      const allUserData = await databaseService.getAllUserData();
      const userDataMap: Record<string, string> = {};
      allUserData.forEach(data => {
        userDataMap[data.key] = data.value;
      });
      setUserData(userDataMap);
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  };

  const addBook = async (bookData: CreateBookData) => {
    try {
      const newBook: Book = {
        id: Date.now().toString(), // Simple ID generation
        finish_date: bookData.finish_date || new Date().toISOString(), // Default to current time if not provided
        percent_complete: bookData.percent_complete || 0, // Default to 0 if not provided
        ...bookData,
      };

      // Download and resize the cover image (only if cover URL is provided)
      if (bookData.cover_url) {
        const localImagePath = await imageService.downloadAndResizeImage(
          bookData.cover_url,
          newBook.id
        );
        newBook.local_cover_path = localImagePath;
      }
      
      await databaseService.createBook(newBook);
      await loadBooks(); // Reload books from database
    } catch (error) {
      console.error('Failed to add book:', error);
      throw error;
    }
  };

  const updateBook = async (id: string, bookData: UpdateBookData) => {
    try {
      // If cover URL is being updated, download the new image (only if URL is provided)
      if (bookData.cover_url && bookData.cover_url.trim()) {
        const localImagePath = await imageService.downloadAndResizeImage(
          bookData.cover_url,
          id
        );
        bookData.local_cover_path = localImagePath;
      }

      await databaseService.updateBook(id, bookData);
      await loadBooks(); // Reload books from database
    } catch (error) {
      console.error('Failed to update book:', error);
      throw error;
    }
  };

  const deleteBook = async (id: string) => {
    try {
      // Get the book to find its cover URL for cleanup
      const book = books.find(b => b.id === id);
      if (book) {
        await imageService.deleteLocalImage(book.id, book.cover_url);
      }

      await databaseService.deleteBook(id);
      await loadBooks(); // Reload books from database
    } catch (error) {
      console.error('Failed to delete book:', error);
      throw error;
    }
  };

  const getBook = (id: string) => {
    return books.find(book => book.id === id);
  };

  const importFromCSV = async (csvData: string) => {
    try {
      const result = await databaseService.importBooksFromCSV(csvData);
      await loadBooks(); // Reload books from database
      return result;
    } catch (error) {
      console.error('Failed to import CSV:', error);
      throw error;
    }
  };

  const exportToCSV = async () => {
    try {
      return await databaseService.exportBooksToCSV();
    } catch (error) {
      console.error('Failed to export CSV:', error);
      throw error;
    }
  };

  const retryFailedImages = async (failedBookTitles: string[]) => {
    try {
      const booksToRetry = books.filter(book => 
        failedBookTitles.includes(book.title) && 
        book.cover_url && 
        book.cover_url.trim()
      );

      for (const book of booksToRetry) {
        try {
          const localImagePath = await imageService.downloadAndResizeImage(
            book.cover_url,
            book.id
          );
          
          await databaseService.updateBook(book.id, { local_cover_path: localImagePath });
        } catch (error) {
          console.error(`Failed to retry download for book ${book.title}:`, error);
        }
      }

      await loadBooks();
    } catch (error) {
      console.error('Failed to retry failed images:', error);
      throw error;
    }
  };

  const downloadMissingImages = async (
    onProgress?: (current: number, total: number, currentBook: string, failedBooks: string[]) => void
  ) => {
    try {
      const booksNeedingImages = books.filter(book => 
        book.cover_url && book.cover_url.trim() && !book.local_cover_path
      );

      const total = booksNeedingImages.length;
      let completed = 0;
      const failedBooks: string[] = [];

      for (const book of booksNeedingImages) {
        try {
          // Report progress
          if (onProgress) {
            onProgress(completed, total, book.title, failedBooks);
          }

          // Add timeout to prevent hanging on problematic URLs
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Download timeout')), 30000); // 30 second timeout
          });

          const downloadPromise = imageService.downloadAndResizeImage(
            book.cover_url,
            book.id
          );

          const localImagePath = await Promise.race([downloadPromise, timeoutPromise]) as string;
          
          // Update the book with the local image path
          await databaseService.updateBook(book.id, { local_cover_path: localImagePath });
          completed++;
        } catch (error) {
          console.error(`Failed to download image for book ${book.title}:`, error);
          failedBooks.push(book.title);
          completed++; // Still count as completed even if failed
        }
      }

      // Final progress update
      if (onProgress) {
        onProgress(completed, total, '', failedBooks);
      }

      // Reload books to get updated local_cover_path values
      await loadBooks();
      
      return { completed, total, failedBooks };
    } catch (error) {
      console.error('Failed to download missing images:', error);
      throw error;
    }
  };



  const clearAllBooks = async () => {
    try {
      await databaseService.clearAllBooks();
      await loadBooks(); // Reload books from database (will be empty)
    } catch (error) {
      console.error('Failed to clear all books:', error);
      throw error;
    }
  };

  const updateGoal = async (year: number, goal: number) => {
    try {
      await databaseService.setGoal(year, goal);
      setGoals(prev => ({ ...prev, [year]: goal }));
    } catch (error) {
      console.error('Failed to update goal:', error);
      throw error;
    }
  };

  const getGoal = (year: number): number => {
    return goals[year] || 0;
  };

  const getUserData = (key: string): string | null => {
    return userData[key] || null;
  };

  const setUserDataValue = async (key: string, value: string) => {
    try {
      await databaseService.setUserData(key, value);
      setUserData(prev => ({ ...prev, [key]: value }));
    } catch (error) {
      console.error('Failed to set user data:', error);
      throw error;
    }
  };

  const value: BookContextType = {
    books,
    loading,
    addBook,
    updateBook,
    deleteBook,
    getBook,
    importFromCSV,
    exportToCSV,
    downloadMissingImages,
    retryFailedImages,
    clearAllBooks,
    loadBooks,
    updateGoal,
    getGoal,
    getUserData,
    setUserData: setUserDataValue,
  };

  return (
    <BookContext.Provider value={value}>
      {children}
    </BookContext.Provider>
  );
};
