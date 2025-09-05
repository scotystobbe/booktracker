import { Book } from '@/types/Book';
import { Image, ImageProps } from 'expo-image';
import React, { useState } from 'react';

interface BookCoverImageProps extends Omit<ImageProps, 'source'> {
  book: Book;
}

export const BookCoverImage: React.FC<BookCoverImageProps> = ({ book, ...props }) => {
  const [imageError, setImageError] = useState(false);

  const getImageSource = () => {
    // Only use local images or placeholder - never load from external URLs
    if (book.local_cover_path && !imageError) {
      return { uri: book.local_cover_path };
    }
    
    // Use placeholder for all other cases
    return require('@/assets/images/cover_placeholder.png');
  };

  const handleError = () => {
    setImageError(true);
  };

  return (
    <Image
      {...props}
      source={getImageSource()}
      onError={handleError}
      contentFit="cover"
    />
  );
};
