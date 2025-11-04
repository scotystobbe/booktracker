import { Book } from '@/types/Book';
import { Image, ImageProps } from 'expo-image';
import React, { useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

interface BookCoverImageProps extends Omit<ImageProps, 'source'> {
  book: Book;
}

export const BookCoverImage: React.FC<BookCoverImageProps> = ({ book, ...props }) => {
  const [imageError, setImageError] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [fileExists, setFileExists] = useState(false);

  // Check if file exists when book changes
  useEffect(() => {
    let isMounted = true;
    
    const checkFileExists = async () => {
      setIsChecking(true);
      setImageError(false);
      
      if (book.local_cover_path) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(book.local_cover_path);
          if (isMounted) {
            setFileExists(fileInfo.exists);
            setImageError(!fileInfo.exists);
          }
        } catch (error) {
          if (isMounted) {
            setFileExists(false);
            setImageError(true);
          }
        }
      } else {
        if (isMounted) {
          setFileExists(false);
          setImageError(false);
        }
      }
      
      if (isMounted) {
        setIsChecking(false);
      }
    };

    checkFileExists();
    
    return () => {
      isMounted = false;
    };
  }, [book.local_cover_path, book.cover_url]);

  const getImageSource = () => {
    // Only use local images if they exist and check is complete - otherwise use placeholder
    if (!isChecking && book.local_cover_path && !imageError && fileExists) {
      return { uri: book.local_cover_path };
    }
    
    // Use placeholder for all other cases (checking, missing file, or error)
    return require('@/assets/images/cover_placeholder.png');
  };

  const handleError = () => {
    // Silently handle errors - we've already checked file existence
    setImageError(true);
    setFileExists(false);
  };

  // Use cover_url as part of key to force re-render when artwork changes
  const imageKey = `${book.id}-${book.cover_url || book.local_cover_path || ''}`;

  return (
    <Image
      {...props}
      key={imageKey}
      source={getImageSource()}
      onError={handleError}
      contentFit="cover"
      cachePolicy="memory-disk"
    />
  );
};
