import { Book } from '@/types/Book';
import * as SQLite from 'expo-sqlite';

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;

  async init(): Promise<void> {
    try {
      this.db = await SQLite.openDatabaseAsync('booktracker.db');
      await this.createTables();
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        duration REAL NOT NULL,
        start_date TEXT NOT NULL,
        finish_date TEXT,
        reading_speed REAL NOT NULL DEFAULT 2.0,
        cover_url TEXT NOT NULL,
        local_cover_path TEXT,
        percent_complete REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS annual_goals (
        year INTEGER PRIMARY KEY,
        goal INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS user_data (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migration: Rename book_title to title if the old column exists
    try {
      await this.db.execAsync(`
        ALTER TABLE books RENAME COLUMN book_title TO title;
      `);
    } catch (error) {
      // Column doesn't exist or already renamed, that's fine
    }

    // Migration: Add local_cover_path column if it doesn't exist
    try {
      await this.db.execAsync(`
        ALTER TABLE books ADD COLUMN local_cover_path TEXT;
      `);
    } catch (error) {
      // Column already exists, that's fine
    }

    // Create index for better performance
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_books_start_date ON books(start_date);
    `);
  }

  async getAllBooks(): Promise<Book[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getAllAsync(`
      SELECT * FROM books ORDER BY start_date DESC
    `);

    return result.map(this.mapRowToBook);
  }

  async getBookById(id: string): Promise<Book | null> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync(`
      SELECT * FROM books WHERE id = ?
    `, [id]);

    return result ? this.mapRowToBook(result) : null;
  }

  async createBook(book: Book): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(`
      INSERT INTO books (
        id, title, author, duration, start_date, finish_date,
        reading_speed, cover_url, local_cover_path, percent_complete, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      book.id,
      book.title,
      book.author,
      book.duration,
      book.start_date,
      book.finish_date || null,
      book.reading_speed,
      book.cover_url,
      book.local_cover_path || null,
      book.percent_complete,
      new Date().toISOString(),
      new Date().toISOString()
    ]);
  }

  async updateBook(id: string, updates: Partial<Book>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const fields = Object.keys(updates).filter(key => key !== 'id');
    if (fields.length === 0) return;

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => (updates as any)[field]);
    values.push(new Date().toISOString()); // updated_at
    values.push(id);

    await this.db.runAsync(`
      UPDATE books SET ${setClause}, updated_at = ? WHERE id = ?
    `, values);
  }

  async deleteBook(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(`
      DELETE FROM books WHERE id = ?
    `, [id]);
  }

  async importBooksFromCSV(csvData: string): Promise<{ success: number; errors: string[] }> {
    if (!this.db) throw new Error('Database not initialized');

    const lines = csvData.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    
    let success = 0;
    const errors: string[] = [];

    // Validate required headers (cover_url and percent_complete are optional)
    const requiredHeaders = ['title', 'author', 'duration', 'start_date', 'finish_date', 'reading_speed'];
    const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
    
    if (missingHeaders.length > 0) {
      throw new Error(`Missing required CSV headers: ${missingHeaders.join(', ')}`);
    }

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = this.parseCSVLine(lines[i]);
        const bookData: any = {};
        
        headers.forEach((header, index) => {
          bookData[header] = values[index]?.trim().replace(/"/g, '') || '';
        });

        // Parse percent_complete if provided, otherwise default to 100% for imported books
        let percentComplete = 100; // Default to 100% for imported books
        if (bookData.percent_complete) {
          // Handle both "100%" and "100" formats
          const percentStr = bookData.percent_complete.toString().replace('%', '');
          const parsed = parseFloat(percentStr);
          if (!isNaN(parsed)) {
            percentComplete = parsed;
          }
        }

        // Validate required fields (cover_url and percent_complete are optional)
        if (!bookData.title || !bookData.author || !bookData.duration || !bookData.finish_date || !bookData.reading_speed) {
          errors.push(`Row ${i + 1}: Missing required fields (cover_url and percent_complete are optional)`);
          continue;
        }

        // Parse and validate datetime fields (supports multiple formats)
        const startDate = this.parseDateTime(bookData.start_date);
        const finishDate = this.parseDateTime(bookData.finish_date);
        
        if (!startDate || !finishDate) {
          errors.push(`Row ${i + 1}: Invalid date format. Start: "${bookData.start_date}", Finish: "${bookData.finish_date}". Supported formats: YYYY-MM-DDTHH:mm:ssZ (UTC), YYYY-MM-DDTHH:mm:ss-07:00 (Mountain Time), or MM/DD/YYYY - HH:MM AM/PM (Mountain Time)`);
          continue;
        }

        // Validate and convert data
        const book: Book = {
          id: Date.now().toString() + i, // Simple ID generation
          title: bookData.title,
          author: bookData.author,
          duration: parseFloat(bookData.duration) || 0,
          start_date: startDate.toISOString(),
          finish_date: finishDate.toISOString(),
          reading_speed: parseFloat(bookData.reading_speed) || 2.0,
          cover_url: bookData.cover_url || '', // Default to empty string if no cover URL
          percent_complete: percentComplete,
        };

        // Download and resize cover image if URL is provided
        if (book.cover_url && book.cover_url.trim()) {
          try {
            const { imageService } = await import('./ImageService');
            const localImagePath = await imageService.downloadAndResizeImage(
              book.cover_url,
              book.id
            );
            book.local_cover_path = localImagePath;
          } catch (imageError) {
            console.error(`Failed to download image for book ${book.title}:`, imageError);
            // Continue without local image - will use placeholder
          }
        }

        // Validate numeric fields
        if (isNaN(book.reading_speed) || book.reading_speed <= 0) {
          errors.push(`Row ${i + 1}: Invalid reading_speed (must be a positive number)`);
          continue;
        }

        if (book.percent_complete < 0 || book.percent_complete > 100) {
          errors.push(`Row ${i + 1}: Invalid percent_complete (must be between 0 and 100)`);
          continue;
        }

        await this.createBook(book);
        success++;
      } catch (error) {
        errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { success, errors };
  }

  async exportBooksToCSV(): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');

    const books = await this.getAllBooks();
    
    const headers = [
      'title', 'author', 'duration', 'start_date', 'cover_url',
      'finish_date', 'reading_speed', 'percent_complete'
    ];

    const csvLines = [headers.join(',')];
    
    books.forEach(book => {
      const values = [
        this.escapeCSVValue(book.title),
        this.escapeCSVValue(book.author),
        book.duration.toString(),
        new Date(book.start_date).toISOString(),
        this.escapeCSVValue(book.cover_url),
        new Date(book.finish_date!).toISOString(),
        book.reading_speed.toString(),
        book.percent_complete.toString()
      ];
      csvLines.push(values.join(','));
    });

    return csvLines.join('\n');
  }

  private mapRowToBook(row: any): Book {
    return {
      id: row.id,
      title: row.title,
      author: row.author,
      duration: row.duration,
      start_date: row.start_date,
      finish_date: row.finish_date || undefined,
      reading_speed: row.reading_speed,
      cover_url: row.cover_url,
      local_cover_path: row.local_cover_path || undefined,
      percent_complete: row.percent_complete,
    };
  }

  private parseDateTime(dateString: string): Date | null {
    if (!dateString || !dateString.trim()) {
      return null;
    }
    
    const trimmed = dateString.trim().replace(/"/g, ''); // Remove quotes if present
    
    // Parse ISO 8601 format (including UTC with Z suffix)
    const date = new Date(trimmed);
    
    if (isNaN(date.getTime())) {
      return null;
    }
    
    return date;
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current);
    return result;
  }

  private escapeCSVValue(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }



  async clearAllBooks(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      console.log('Clearing all books from database...');
      await this.db.runAsync('DELETE FROM books');
      console.log('All books cleared successfully.');
    } catch (error) {
      console.error('Failed to clear books:', error);
      throw error;
    }
  }

  async getGoal(year: number): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync(`
      SELECT goal FROM annual_goals WHERE year = ?
    `, [year]);

    return result ? (result as any).goal : 0;
  }

  async setGoal(year: number, goal: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(`
      INSERT OR REPLACE INTO annual_goals (year, goal, updated_at) 
      VALUES (?, ?, ?)
    `, [year, goal, new Date().toISOString()]);
  }

  async getAllGoals(): Promise<{ year: number; goal: number }[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getAllAsync(`
      SELECT year, goal FROM annual_goals ORDER BY year
    `);

    return result.map((row: any) => ({
      year: row.year,
      goal: row.goal
    }));
  }

  async getUserData(key: string): Promise<string | null> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync(`
      SELECT value FROM user_data WHERE key = ?
    `, [key]);

    return result ? (result as any).value : null;
  }

  async setUserData(key: string, value: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(`
      INSERT OR REPLACE INTO user_data (key, value, updated_at) 
      VALUES (?, ?, ?)
    `, [key, value, new Date().toISOString()]);
  }

  async getAllUserData(): Promise<{ key: string; value: string }[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getAllAsync(`
      SELECT key, value FROM user_data ORDER BY key
    `);

    return result.map((row: any) => ({
      key: row.key,
      value: row.value
    }));
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
    }
  }
}

export const databaseService = new DatabaseService();
