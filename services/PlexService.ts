export interface PlexBook {
  id: string;
  title: string;
  author: string;
  duration: number; // in seconds
  coverUrl: string;
  year?: number;
  summary?: string;
  progress?: number; // percentage complete (0-100)
}

export interface PlexLibrary {
  id: string;
  name: string;
  type: string;
}

export interface PlexServerConfig {
  serverUrl: string;
  token: string;
  libraryId?: string;
}

export interface PlexAuthConfig {
  token: string;
  username: string;
  email: string;
  serverUrl?: string;
}

class PlexService {
  private config: PlexServerConfig | null = null;
  private authConfig: PlexAuthConfig | null = null;
  private selectedLibraryId: string | null = null;
  private currentSearchAbortController: AbortController | null = null;
  private currentSearchId: number = 0;

  setConfig(config: PlexServerConfig) {
    this.config = config;
  }

  getConfig(): PlexServerConfig | null {
    return this.config;
  }

  setAuthConfig(authConfig: PlexAuthConfig) {
    this.authConfig = authConfig;
  }

  getAuthConfig(): PlexAuthConfig | null {
    return this.authConfig;
  }

  setSelectedLibrary(libraryId: string) {
    this.selectedLibraryId = libraryId;
  }

  getSelectedLibrary(): string | null {
    return this.selectedLibraryId;
  }

  private async makeRequest(endpoint: string, useAuthToken: boolean = false): Promise<any> {
    let token: string;
    let baseUrl: string;

    console.log('makeRequest - useAuthToken:', useAuthToken);
    console.log('makeRequest - authConfig exists:', !!this.authConfig);
    console.log('makeRequest - config exists:', !!this.config);

    if (useAuthToken && this.authConfig) {
      // Use Plex.tv API with auth token
      token = this.authConfig.token;
      baseUrl = 'https://plex.tv';
      console.log('Using Plex.tv API with auth token');
    } else if (this.authConfig?.serverUrl) {
      // Use server URL from auth config
      token = this.authConfig.token;
      baseUrl = this.authConfig.serverUrl;
      console.log('Using server URL from auth config:', baseUrl);
    } else if (this.config) {
      // Use local server with server token
      token = this.config.token;
      baseUrl = this.config.serverUrl;
      console.log('Using local server config:', baseUrl);
    } else {
      console.error('Plex not configured - no auth or config available');
      throw new Error('Plex not configured');
    }

    const url = `${baseUrl}${endpoint}`;
    const headers = {
      'X-Plex-Token': token,
      'Accept': 'application/json',
    };

    console.log('Making Plex request:', url);
    console.log('Using token:', token.substring(0, 10) + '...');

    try {
      const response = await fetch(url, { headers });
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Plex API error response:', errorText);
        throw new Error(`Plex API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Plex API response keys:', Object.keys(data));
      return data;
    } catch (error) {
      console.error('Plex API request failed:', error);
      throw error;
    }
  }

  async getServers(): Promise<any[]> {
    if (!this.authConfig) {
      throw new Error('Plex authentication required');
    }

    const data = await this.makeRequest('/api/v2/resources', true);
    return data.filter((resource: any) => resource.provides === 'server');
  }

  async getLibraries(serverId?: string): Promise<PlexLibrary[]> {
    if (this.authConfig?.serverUrl) {
      // Get libraries from server URL in auth config
      const data = await this.makeRequest(`/library/sections`, false);
      return data.MediaContainer.Directory.map((lib: any) => ({
        id: lib.key,
        name: lib.title,
        type: lib.type,
      }));
    } else if (serverId) {
      // Get libraries from specific server
      const data = await this.makeRequest(`/library/sections`);
      return data.MediaContainer.Directory.map((lib: any) => ({
        id: lib.key,
        name: lib.title,
        type: lib.type,
      }));
    } else {
      // Get libraries from authenticated user's servers
      const servers = await this.getServers();
      const allLibraries: PlexLibrary[] = [];
      
      for (const server of servers) {
        try {
          const serverUrl = server.connections.find((conn: any) => conn.local === false)?.uri || 
                           server.connections.find((conn: any) => conn.local === true)?.uri;
          
          if (serverUrl) {
            const data = await this.makeRequest(`/library/sections`, false);
            const serverLibraries = data.MediaContainer.Directory.map((lib: any) => ({
              id: lib.key,
              name: `${lib.title} (${server.name})`,
              type: lib.type,
              serverId: server.clientIdentifier,
              serverName: server.name,
            }));
            allLibraries.push(...serverLibraries);
          }
        } catch (error) {
          console.error(`Failed to get libraries from server ${server.name}:`, error);
        }
      }
      
      return allLibraries;
    }
  }

  async searchBooks(query: string, libraryId?: string, searchMode: 'title' | 'author' = 'title'): Promise<PlexBook[]> {
    const libId = libraryId || this.selectedLibraryId || this.config?.libraryId;
    if (!libId) {
      throw new Error('No library ID specified');
    }

    // Cancel any previous search
    if (this.currentSearchAbortController) {
      this.currentSearchAbortController.abort();
    }

    // Create new abort controller for this search
    this.currentSearchAbortController = new AbortController();
    this.currentSearchId++;

    const searchId = this.currentSearchId;
    const encodedQuery = encodeURIComponent(query);
    console.log(`Starting search #${searchId} for:`, query, 'mode:', searchMode);
    
    // Add a small delay to ensure previous search is fully cancelled
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Check if this search was cancelled during the delay
    if (this.currentSearchAbortController.signal.aborted) {
      console.log(`Search #${searchId} was cancelled during delay`);
      throw new Error('Search cancelled');
    }
    
    // For music libraries, we want to search albums (books) and artists (authors), not tracks
    let data;
    let searchMethod = 'album';
    
    try {
      if (searchMode === 'author') {
        // For author searches, try album search first (albums have artist info)
        console.log('Searching for author in albums:', query);
        data = await this.makeRequest(`/library/sections/${libId}/search?query=${encodedQuery}&type=9`);
        searchMethod = 'album';
        
        // Check if search was cancelled
        if (this.currentSearchAbortController.signal.aborted) {
          throw new Error('Search cancelled');
        }
        
        // If we got results, stop here
        if (data.MediaContainer?.Metadata && data.MediaContainer.size > 0) {
          console.log(`Search #${searchId}: Got ${data.MediaContainer.size} album results, stopping search`);
        } else {
          // Only try artist search if no album results
          console.log('No album results, trying artist search...');
          data = await this.makeRequest(`/library/sections/${libId}/search?query=${encodedQuery}&type=8`);
          searchMethod = 'artist';
        }
      } else {
        // For title searches, try album search first
        console.log('Searching for book title:', query);
        data = await this.makeRequest(`/library/sections/${libId}/search?query=${encodedQuery}&type=9`);
        searchMethod = 'album';
        
        // Check if search was cancelled
        if (this.currentSearchAbortController.signal.aborted) {
          throw new Error('Search cancelled');
        }
        
        // If we got results, stop here - don't try other search methods
        if (data.MediaContainer?.Metadata && data.MediaContainer.size > 0) {
          console.log(`Search #${searchId}: Got ${data.MediaContainer.size} album results, stopping search`);
        } else {
          // Only try artist search if no album results
          console.log('No album results, trying artist search...');
          data = await this.makeRequest(`/library/sections/${libId}/search?query=${encodedQuery}&type=8`);
          searchMethod = 'artist';
        }
      }
      
      // Check if search was cancelled
      if (this.currentSearchAbortController.signal.aborted) {
        throw new Error('Search cancelled');
      }
      
      // Only try all albums if we still have no results
      if (!data.MediaContainer?.Metadata || data.MediaContainer.size === 0) {
        console.log('No search results, trying all albums with client-side filtering...');
        searchMethod = 'all';
        data = await this.makeRequest(`/library/sections/${libId}/all?type=9`);
      }
    } catch (error) {
      if (error.message === 'Search cancelled') {
        throw error;
      }
      console.log('Search failed, trying all albums...');
      try {
        searchMethod = 'all';
        data = await this.makeRequest(`/library/sections/${libId}/all?type=9`);
      } catch (error2) {
        console.error('All search methods failed:', error2);
        return [];
      }
    }
    
    if (!data.MediaContainer?.Metadata) {
      console.log('No metadata found in response:', data);
      return [];
    }

    // Handle different types of search results
    let albums: any[] = [];
    
    if (searchMethod === 'artist') {
      // When searching for artists, we get artist objects, not albums
      // For now, let's limit to the first few artists to avoid too many requests
      console.log('Processing artist search results...');
      
      const artistsToProcess = data.MediaContainer.Metadata.slice(0, 3); // Limit to first 3 artists
      
      for (const artist of artistsToProcess) {
        if (artist.type === 'artist' || artist.type === '8') {
          try {
            // Check for cancellation before each artist request
            if (this.currentSearchAbortController.signal.aborted) {
              throw new Error('Search cancelled');
            }
            
            console.log(`Getting albums for artist: ${artist.title}`);
            // Get albums for this artist
            const artistAlbums = await this.makeRequest(`/library/metadata/${artist.ratingKey}/children`);
            if (artistAlbums.MediaContainer?.Metadata) {
              // Filter for albums only
              const artistAlbumList = artistAlbums.MediaContainer.Metadata.filter((item: any) => {
                return item.type === 'album' || item.type === '9';
              });
              albums.push(...artistAlbumList);
              console.log(`Found ${artistAlbumList.length} albums for ${artist.title}`);
            }
          } catch (error) {
            if (error.message === 'Search cancelled') {
              throw error;
            }
            console.error('Failed to get albums for artist:', artist.title, error);
          }
        }
      }
    } else {
      // For album searches, filter for albums directly
      albums = data.MediaContainer.Metadata.filter((item: any) => {
        return item.type === 'album' || item.type === '9';
      });
    }

    // If we got all albums (not search results), filter by query
    if (searchMethod === 'all' || data.MediaContainer.size > 100) { // Likely got all items
      albums = albums.filter((item: any) => {
        const albumTitle = item.title?.toLowerCase() || '';
        const artistName = item.parentTitle?.toLowerCase() || item.originalTitle?.toLowerCase() || '';
        const searchTerm = query.toLowerCase();
        
        // For author searches, prioritize artist name matches
        if (searchMode === 'author') {
          return artistName.includes(searchTerm);
        }
        
        // For album searches or general searches, check both
        return albumTitle.includes(searchTerm) || artistName.includes(searchTerm);
      });
    }
    
    // For author searches, also filter albums by artist name
    if (searchMode === 'author' && searchMethod === 'album') {
      albums = albums.filter((item: any) => {
        const artistName = item.parentTitle?.toLowerCase() || item.originalTitle?.toLowerCase() || '';
        const searchTerm = query.toLowerCase();
        return artistName.includes(searchTerm);
      });
    }

    console.log(`Search #${searchId}: Found ${albums.length} albums out of ${data.MediaContainer.Metadata.length} total items using ${searchMethod} search`);

    // Check if this search was cancelled before processing results
    if (this.currentSearchAbortController.signal.aborted) {
      console.log(`Search #${searchId} was cancelled before processing results`);
      throw new Error('Search cancelled');
    }

    // Get detailed album info including tracks for duration calculation
    const albumsWithDuration = await Promise.all(
      albums.map(async (item: any) => {
        // Check for cancellation before each album request
        if (this.currentSearchAbortController.signal.aborted) {
          throw new Error('Search cancelled');
        }
        
        try {
          // Get detailed album info including tracks
          const albumDetails = await this.makeRequest(`/library/metadata/${item.ratingKey}/children`);
          
          // Calculate total duration from all tracks
          let totalDuration = 0;
          if (albumDetails.MediaContainer?.Metadata) {
            totalDuration = albumDetails.MediaContainer.Metadata.reduce((sum: number, track: any) => {
              // Plex duration is in milliseconds, convert to seconds
              const trackDuration = track.duration ? Math.floor(track.duration / 1000) : 0;
              return sum + trackDuration;
            }, 0);
          }
          
          return {
            id: item.ratingKey,
            title: item.title, // Album title = book title
            author: item.parentTitle || item.originalTitle || 'Unknown Author', // Artist = author
            duration: totalDuration, // Total duration from all tracks
            coverUrl: this.buildCoverUrl(this.getBestCoverArt(item)),
            year: item.year,
            summary: item.summary,
            progress: 0, // Will be populated separately if needed
          };
        } catch (error) {
          if (error.message === 'Search cancelled') {
            throw error;
          }
          console.error('Failed to get album details:', error);
          // Return album with 0 duration if we can't get track details
          return {
            id: item.ratingKey,
            title: item.title,
            author: item.parentTitle || item.originalTitle || 'Unknown Author',
            duration: 0,
            coverUrl: this.buildCoverUrl(this.getBestCoverArt(item)),
            year: item.year,
            summary: item.summary,
            progress: 0,
          };
        }
      })
    );

    console.log(`Search #${searchId}: Returning ${albumsWithDuration.length} results`);
    return albumsWithDuration;
  }

  async getBookDetails(bookId: string): Promise<PlexBook | null> {
    const data = await this.makeRequest(`/library/metadata/${bookId}`);
    
    if (!data.MediaContainer?.Metadata?.[0]) {
      return null;
    }

    const item = data.MediaContainer.Metadata[0];
    return {
      id: item.ratingKey,
      title: item.title,
      author: item.grandparentTitle || item.originalTitle || 'Unknown Author',
      duration: item.duration || 0,
      coverUrl: this.buildCoverUrl(this.getBestCoverArt(item)),
      year: item.year,
      summary: item.summary,
    };
  }

  async getBookProgress(bookId: string): Promise<number> {
    try {
      // Get album details including tracks
      const albumData = await this.makeRequest(`/library/metadata/${bookId}/children`);
      
      if (!albumData.MediaContainer?.Metadata) {
        return 0;
      }

      // Calculate total progress from all tracks
      let totalProgress = 0;
      let totalTracks = 0;

      for (const track of albumData.MediaContainer.Metadata) {
        if (track.type === 'track' || track.type === '10') {
          totalTracks++;
          
          // Calculate progress for this track
          if (track.viewOffset && track.duration) {
            const trackProgress = (track.viewOffset / track.duration) * 100;
            totalProgress += trackProgress;
          }
        }
      }

      // Return average progress across all tracks
      return totalTracks > 0 ? Math.round(totalProgress / totalTracks) : 0;
    } catch (error) {
      console.error('Failed to get book progress:', error);
      return 0;
    }
  }

  getBestCoverArt(item: any): string {
    // For albums, prioritize album artwork over artist artwork
    // Plex stores different types of artwork with different priorities
    
    // First try: album artwork (most specific)
    if (item.art) {
      return item.art;
    }
    
    // Second try: album thumb (alternative album artwork)
    if (item.thumb) {
      return item.thumb;
    }
    
    // Third try: parent artwork (artist artwork - fallback)
    if (item.parentArt) {
      return item.parentArt;
    }
    
    // Fourth try: grandparent artwork (if available)
    if (item.grandparentArt) {
      return item.grandparentArt;
    }
    
    // Last resort: any available artwork
    return item.art || item.thumb || '';
  }

  getAllCoverArtOptions(item: any): Array<{type: string, url: string}> {
    const options: Array<{type: string, url: string}> = [];
    
    // Album artwork (primary)
    if (item.art) {
      options.push({
        type: 'Album Artwork',
        url: this.buildCoverUrl(item.art)
      });
    }
    
    // Album thumb (alternative album artwork)
    if (item.thumb && item.thumb !== item.art) {
      options.push({
        type: 'Album Thumbnail',
        url: this.buildCoverUrl(item.thumb)
      });
    }
    
    // Parent artwork (artist artwork)
    if (item.parentArt && item.parentArt !== item.art && item.parentArt !== item.thumb) {
      options.push({
        type: 'Artist Artwork',
        url: this.buildCoverUrl(item.parentArt)
      });
    }
    
    // Grandparent artwork (if different)
    if (item.grandparentArt && item.grandparentArt !== item.art && item.grandparentArt !== item.thumb && item.grandparentArt !== item.parentArt) {
      options.push({
        type: 'Additional Artwork',
        url: this.buildCoverUrl(item.grandparentArt)
      });
    }
    
    return options;
  }

  buildCoverUrl(artPath: string): string {
    if (!artPath) {
      return '';
    }
    
    let serverUrl: string;
    let token: string;
    
    if (this.authConfig?.serverUrl) {
      serverUrl = this.authConfig.serverUrl;
      token = this.authConfig.token;
    } else if (this.config) {
      serverUrl = this.config.serverUrl;
      token = this.config.token;
    } else {
      return '';
    }
    
    // Remove leading slash if present
    const cleanPath = artPath.startsWith('/') ? artPath.slice(1) : artPath;
    return `${serverUrl}/${cleanPath}?X-Plex-Token=${token}`;
  }

  async searchArtists(query: string, libraryId?: string): Promise<any[]> {
    const libId = libraryId || this.selectedLibraryId || this.config?.libraryId;
    if (!libId) {
      throw new Error('No library ID specified');
    }

    const encodedQuery = encodeURIComponent(query);
    console.log('Searching for artists:', query);
    
    const data = await this.makeRequest(`/library/sections/${libId}/search?query=${encodedQuery}&type=8`);
    
    if (!data.MediaContainer?.Metadata) {
      return [];
    }

    // Filter for artists only
    const artists = data.MediaContainer.Metadata.filter((item: any) => {
      return item.type === 'artist' || item.type === '8';
    });

    console.log(`Found ${artists.length} artists`);
    return artists;
  }

  async getBooksByArtist(artistId: string): Promise<PlexBook[]> {
    console.log('Getting books by artist:', artistId);
    
    const data = await this.makeRequest(`/library/metadata/${artistId}/children`);
    
    if (!data.MediaContainer?.Metadata) {
      return [];
    }

    // Filter for albums only
    const albums = data.MediaContainer.Metadata.filter((item: any) => {
      return item.type === 'album' || item.type === '9';
    });

    console.log(`Found ${albums.length} albums for artist`);

    // Get detailed album info including tracks for duration calculation
    const albumsWithDuration = await Promise.all(
      albums.map(async (item: any) => {
        try {
          // Get detailed album info including tracks
          const albumDetails = await this.makeRequest(`/library/metadata/${item.ratingKey}/children`);
          
          // Calculate total duration from all tracks
          let totalDuration = 0;
          if (albumDetails.MediaContainer?.Metadata) {
            totalDuration = albumDetails.MediaContainer.Metadata.reduce((sum: number, track: any) => {
              // Plex duration is in milliseconds, convert to seconds
              const trackDuration = track.duration ? Math.floor(track.duration / 1000) : 0;
              return sum + trackDuration;
            }, 0);
          }
          
          return {
            id: item.ratingKey,
            title: item.title, // Album title = book title
            author: item.parentTitle || item.originalTitle || 'Unknown Author', // Artist = author
            duration: totalDuration, // Total duration from all tracks
            coverUrl: this.buildCoverUrl(this.getBestCoverArt(item)),
            year: item.year,
            summary: item.summary,
            progress: 0, // Will be populated separately if needed
          };
        } catch (error) {
          console.error('Failed to get album details:', error);
          // Return album with 0 duration if we can't get track details
          return {
            id: item.ratingKey,
            title: item.title,
            author: item.parentTitle || item.originalTitle || 'Unknown Author',
            duration: 0,
            coverUrl: this.buildCoverUrl(this.getBestCoverArt(item)),
            year: item.year,
            summary: item.summary,
            progress: 0,
          };
        }
      })
    );

    console.log(`Returning ${albumsWithDuration.length} books for artist`);
    return albumsWithDuration;
  }

  async authenticate(): Promise<PlexAuthConfig> {
    // Plex OAuth flow
    const clientId = 'booktracker-app';
    const redirectUri = 'booktracker://auth';
    const scope = 'read';
    
    // Generate a random state for security
    const state = Math.random().toString(36).substring(7);
    
    // Build the OAuth URL
    const authUrl = `https://app.plex.tv/auth/#?clientID=${clientId}&context[device][product]=BookTracker&context[device][environment]=web&context[device][layout]=desktop&context[device][platform]=Web&context[device][screenResolution]=1920x1080&context[device][title]=BookTracker&context[device][version]=1.0.0&context[librarySectionID]=&context[secondaryIdentifier]=&flow=web&forwardUrl=${encodeURIComponent(redirectUri)}&state=${state}`;
    
    // This will be handled by the OAuth component
    throw new Error('OAuth flow should be handled by PlexOAuth component');
  }

  async testConnection(): Promise<boolean> {
    try {
      if (this.authConfig) {
        // Test with auth token
        await this.makeRequest('/api/v2/user', true);
      } else if (this.config) {
        // Test with server token
        await this.makeRequest('/');
      } else {
        return false;
      }
      return true;
    } catch (error) {
      console.error('Plex connection test failed:', error);
      return false;
    }
  }

  // Convert Plex duration (seconds) to hours
  static durationToHours(seconds: number): number {
    return seconds / 3600;
  }

  // Convert hours to Plex duration (seconds)
  static hoursToDuration(hours: number): number {
    return hours * 3600;
  }

  // Clear any cached data
  clearCache() {
    console.log('Clearing Plex service cache...');
    // Reset any cached data
    this.currentSearchAbortController = null;
    this.currentSearchId = 0;
  }
}

export const plexService = new PlexService();
