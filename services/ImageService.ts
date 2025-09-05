import { Book } from '@/types/Book';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

class ImageService {
  private readonly IMAGE_DIR = FileSystem.documentDirectory + 'book_covers/';
  private readonly MAX_SIZE = 1000;

  async initialize(): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.IMAGE_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.IMAGE_DIR, { intermediates: true });
      }
    } catch (error) {
      console.error('Failed to initialize image directory:', error);
      throw error;
    }
  }

  async downloadAndResizeImage(imageUrl: string, bookId: string): Promise<string> {
    try {
      // Create a unique filename for this book
      const fileExtension = this.getFileExtension(imageUrl) || 'jpg';
      const localPath = `${this.IMAGE_DIR}${bookId}.${fileExtension}`;

      // Check if image already exists locally
      const existingFile = await FileSystem.getInfoAsync(localPath);
      if (existingFile.exists) {
        return localPath;
      }

      // Download the image
      const downloadResult = await FileSystem.downloadAsync(imageUrl, localPath);
      
      if (!downloadResult.uri) {
        throw new Error('Failed to download image');
      }

      // Get image dimensions
      const imageInfo = await ImageManipulator.manipulateAsync(
        downloadResult.uri,
        [],
        { format: ImageManipulator.SaveFormat.JPEG }
      );

      // Resize if necessary
      let finalUri = downloadResult.uri;
      if (imageInfo.width > this.MAX_SIZE || imageInfo.height > this.MAX_SIZE) {
        const resizeActions = [];
        
        if (imageInfo.width > imageInfo.height) {
          // Landscape: resize by width
          resizeActions.push({
            resize: {
              width: this.MAX_SIZE,
            },
          });
        } else {
          // Portrait or square: resize by height
          resizeActions.push({
            resize: {
              height: this.MAX_SIZE,
            },
          });
        }

        const resizedImage = await ImageManipulator.manipulateAsync(
          downloadResult.uri,
          resizeActions,
          {
            format: ImageManipulator.SaveFormat.JPEG,
            compress: 0.8,
          }
        );

        // Replace the original file with the resized version
        await FileSystem.moveAsync({
          from: resizedImage.uri,
          to: localPath,
        });

        finalUri = localPath;
      }

      return finalUri;
    } catch (error) {
      console.error('Failed to download and resize image:', error);
      // Return original URL as fallback
      return imageUrl;
    }
  }

  async getLocalImagePath(bookId: string, originalUrl: string): Promise<string> {
    try {
      const fileExtension = this.getFileExtension(originalUrl) || 'jpg';
      const localPath = `${this.IMAGE_DIR}${bookId}.${fileExtension}`;

      const fileInfo = await FileSystem.getInfoAsync(localPath);
      if (fileInfo.exists) {
        return localPath;
      }

      // If local file doesn't exist, try to download it
      return await this.downloadAndResizeImage(originalUrl, bookId);
    } catch (error) {
      console.error('Failed to get local image path:', error);
      return originalUrl; // Fallback to original URL
    }
  }

  async deleteLocalImage(bookId: string, originalUrl: string): Promise<void> {
    try {
      const fileExtension = this.getFileExtension(originalUrl) || 'jpg';
      const localPath = `${this.IMAGE_DIR}${bookId}.${fileExtension}`;

      const fileInfo = await FileSystem.getInfoAsync(localPath);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(localPath);
      }
    } catch (error) {
      console.error('Failed to delete local image:', error);
    }
  }

  async cleanupUnusedImages(books: Book[]): Promise<void> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.IMAGE_DIR);
      if (!dirInfo.exists) return;

      const files = await FileSystem.readDirectoryAsync(this.IMAGE_DIR);
      const bookIds = new Set(books.map(book => book.id));

      for (const file of files) {
        const fileName = file.split('.')[0]; // Remove extension
        if (!bookIds.has(fileName)) {
          const filePath = `${this.IMAGE_DIR}${file}`;
          await FileSystem.deleteAsync(filePath);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup unused images:', error);
    }
  }

  async getStorageInfo(): Promise<{ totalSize: number; fileCount: number }> {
    try {
      const dirInfo = await FileSystem.getInfoAsync(this.IMAGE_DIR);
      if (!dirInfo.exists) {
        return { totalSize: 0, fileCount: 0 };
      }

      const files = await FileSystem.readDirectoryAsync(this.IMAGE_DIR);
      let totalSize = 0;

      for (const file of files) {
        const filePath = `${this.IMAGE_DIR}${file}`;
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        if (fileInfo.exists && fileInfo.size) {
          totalSize += fileInfo.size;
        }
      }

      return {
        totalSize,
        fileCount: files.length,
      };
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return { totalSize: 0, fileCount: 0 };
    }
  }

  private getFileExtension(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const extension = pathname.split('.').pop()?.toLowerCase();
      
      // Validate extension
      const validExtensions = ['jpg', 'jpeg', 'png', 'webp'];
      return validExtensions.includes(extension || '') ? extension || null : null;
    } catch {
      return null;
    }
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

export const imageService = new ImageService();
