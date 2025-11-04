import AsyncStorage from '@react-native-async-storage/async-storage';

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
  serverId?: string;
  serverName?: string;
  serverUrl?: string;
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
  serverId?: string;
  serverName?: string;
  serverToken?: string;
}

export interface PlexConnection {
  uri: string;
  protocol: 'http' | 'https';
  local: boolean;
  relay: boolean;
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

  async refreshAuthFromStorage(): Promise<boolean> {
    try {
      // Load auth from AsyncStorage (same as PlexOAuth does)
      const authData = await AsyncStorage.getItem('plex_auth');
      const libraryData = await AsyncStorage.getItem('plex_library');
      
      if (authData) {
        const authConfig = JSON.parse(authData);
        console.log('Refreshing Plex auth from storage:', authConfig.username);
        this.setAuthConfig(authConfig);
        
        if (libraryData) {
          const library = JSON.parse(libraryData);
          this.setSelectedLibrary(library.id);
          console.log('Refreshed Plex library:', library.name);
        }
        
        return true;
      }
      
      console.log('No stored Plex auth found');
      return false;
    } catch (error) {
      console.error('Failed to refresh Plex auth from storage:', error);
      return false;
    }
  }

  /**
   * Ensures auth is loaded from storage if not already set.
   * This should be called before any Plex operation that requires auth.
   * Returns true if auth is available (either was already set or refreshed from storage).
   * Returns false if no auth is available and refresh failed.
   */
  async ensureAuth(): Promise<boolean> {
    // If auth is already configured, we're good
    if (this.authConfig) {
      return true;
    }

    // Try to refresh from storage silently
    console.log('Auth not configured, attempting to refresh from storage...');
    const refreshed = await this.refreshAuthFromStorage();
    
    if (refreshed) {
      console.log('Auth refreshed successfully from storage');
      return true;
    }

    // Check if auth exists in storage but failed to parse
    try {
      const authData = await AsyncStorage.getItem('plex_auth');
      if (authData) {
        console.log('Auth exists in storage but failed to load - may need re-authentication');
        // Auth exists but failed to load - might need full re-auth
        return false;
      }
    } catch (error) {
      // Ignore storage read errors
    }

    console.log('No auth available in storage');
    return false;
  }

  setSelectedLibrary(libraryId: string) {
    this.selectedLibraryId = libraryId;
  }

  getSelectedLibrary(): string | null {
    return this.selectedLibraryId;
  }

  private async makeRequestWithAuthRetry(endpoint: string, useAuthToken: boolean = false, retryCount: number = 0): Promise<any> {
    try {
      return await this.makeRequest(endpoint, useAuthToken);
    } catch (error) {
      // If this is an auth error and we haven't retried yet, try refreshing auth
      if (retryCount === 0 && this.isAuthError(error)) {
        console.log('Auth error detected, attempting to refresh authentication...');
        const refreshed = await this.refreshAuthFromStorage();
        
        if (refreshed) {
          console.log('Auth refreshed, retrying request...');
          return await this.makeRequestWithAuthRetry(endpoint, useAuthToken, 1);
        }
      }
      
      // If it's a "Plex not configured" error and we haven't retried, try refreshing
      if (retryCount === 0 && error.message === 'Plex not configured') {
        console.log('Plex not configured error, attempting to refresh from storage...');
        const refreshed = await this.refreshAuthFromStorage();
        
        if (refreshed) {
          console.log('Auth refreshed, retrying request...');
          return await this.makeRequestWithAuthRetry(endpoint, useAuthToken, 1);
        }
      }
      
      throw error;
    }
  }

  private isAuthError(error: any): boolean {
    // Check for common auth error patterns
    const errorMessage = error.message || '';
    return (
      errorMessage.includes('401') ||
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('Invalid token') ||
      errorMessage.includes('Authentication failed')
    );
  }

  private async makeRequest(endpoint: string, useAuthToken: boolean = false): Promise<any> {
    // Automatically refresh auth from storage if not configured
    // Only refresh if we need auth (not for local server config)
    if (!this.authConfig && !this.config) {
      const refreshed = await this.refreshAuthFromStorage();
      if (!refreshed) {
        console.error('Plex not configured - no auth or config available, and refresh failed');
        throw new Error('Plex not configured');
      }
    }

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
      // Use server URL from auth config with server-specific token
      token = this.authConfig.serverToken || this.authConfig.token;
      baseUrl = this.authConfig.serverUrl;
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
    console.log('Making request to URL:', url);
    console.log('Using token:', token ? `${token.substring(0, 8)}...` : 'none');
    const headers: any = {
      'X-Plex-Token': token,
      'Accept': 'application/json',
    };

    // Add required headers for plex.tv API requests
    if (useAuthToken && baseUrl === 'https://plex.tv') {
      headers['X-Plex-Client-Identifier'] = 'BookTracker-iOS';
      headers['X-Plex-Product'] = 'BookTracker';
      headers['X-Plex-Version'] = '1.0.2';
      headers['X-Plex-Platform'] = 'iOS';
      headers['X-Plex-Platform-Version'] = '17.0';
      headers['X-Plex-Device'] = 'iPhone';
      headers['X-Plex-Device-Name'] = 'iPhone';
    }


    try {
      // Try fetch first
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Plex API error response:', errorText);
        console.error('Request URL:', url);
        console.error('Response status:', response.status, response.statusText);
        console.error('Response headers:', Object.fromEntries(response.headers.entries()));
        throw new Error(`Plex API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Plex API request failed:', error);
      console.error('Request URL:', url);
      console.error('Request headers:', headers);
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('Error cause:', error.cause);
      
      // Try to get more details about the network error
      if (error.name === 'TypeError' && error.message.includes('Network request failed')) {
        console.error('This is a network connectivity issue - likely ATS or DNS');
        console.error('URL being requested:', url);
        console.error('Is HTTPS:', url.startsWith('https://'));
        console.error('Is HTTP:', url.startsWith('http://'));
        
        // Try XMLHttpRequest as fallback
        console.error('Trying XMLHttpRequest as fallback...');
        try {
          const xhrData = await this.makeXHRRequest(url, headers);
          console.error('XMLHttpRequest succeeded!');
          return xhrData;
        } catch (xhrError) {
          console.error('XMLHttpRequest also failed:', xhrError);
          throw error; // Throw original error
        }
      }
      
      throw error;
    }
  }

  private async makeXHRRequest(url: string, headers: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              resolve(data);
            } catch (parseError) {
              reject(new Error(`Failed to parse response: ${parseError.message}`));
            }
          } else {
            reject(new Error(`XMLHttpRequest failed: ${xhr.status} - ${xhr.statusText}`));
          }
        }
      };
      
      xhr.onerror = () => {
        reject(new Error(`XMLHttpRequest network error`));
      };
      
      xhr.ontimeout = () => {
        reject(new Error(`XMLHttpRequest timeout`));
      };
      
      xhr.open('GET', url, true);
      xhr.timeout = 10000; // 10 second timeout
      
      // Set headers
      Object.keys(headers).forEach(key => {
        xhr.setRequestHeader(key, headers[key]);
      });
      
      xhr.send();
    });
  }

  private pickBestConnection(connections: PlexConnection[]): PlexConnection | null {
    if (!connections || connections.length === 0) {
      return null;
    }

    // Filter HTTPS connections
    const httpsConnections = connections.filter(c => c.protocol === 'https');
    
    if (httpsConnections.length === 0) {
      console.warn('No HTTPS connections available - this may cause ATS issues in EAS builds');
      return connections[0]; // Fallback to first connection
    }

    // Rank HTTPS connections by preference:
    // 1. HTTPS + not local + not relay (public HTTPS) - prefer public connections
    // 2. HTTPS + local + not relay (direct LAN HTTPS)
    // 3. HTTPS + relay (relay HTTPS)
    const ranked = [
      ...httpsConnections.filter(c => !c.local && !c.relay),
      ...httpsConnections.filter(c => c.local && !c.relay),
      ...httpsConnections.filter(c => c.relay),
    ];

    return ranked[0];
  }

  async getServers(): Promise<any[]> {
    if (!this.authConfig) {
      throw new Error('Plex authentication required');
    }

    // Request HTTPS connections and relay connections
    const data = await this.makeRequestWithAuthRetry('/api/v2/resources?includeHttps=1&includeRelay=1', true);
    return data.filter((resource: any) => resource.provides === 'server');
  }

  async getLibraries(serverId?: string): Promise<PlexLibrary[]> {
    if (this.authConfig?.serverUrl) {
      // Get libraries from server URL in auth config
      const data = await this.makeRequestWithAuthRetry(`/library/sections`, false);
      return data.MediaContainer.Directory.map((lib: any) => ({
        id: lib.key,
        name: lib.title,
        type: lib.type,
        serverId: this.authConfig?.serverId,
        serverName: this.authConfig?.serverName,
        serverUrl: this.authConfig.serverUrl,
      }));
    } else {
      throw new Error('No server URL configured - cannot get libraries');
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
        data = await this.makeRequestWithAuthRetry(`/library/sections/${libId}/search?query=${encodedQuery}&type=9`);
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
          data = await this.makeRequestWithAuthRetry(`/library/sections/${libId}/search?query=${encodedQuery}&type=8`);
          searchMethod = 'artist';
        }
      } else {
        // For title searches, try album search first
        console.log('Searching for book title:', query);
        data = await this.makeRequestWithAuthRetry(`/library/sections/${libId}/search?query=${encodedQuery}&type=9`);
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
      // Get album details including tracks first
      const albumData = await this.makeRequestWithAuthRetry(`/library/metadata/${bookId}/children`);
      
      if (!albumData.MediaContainer?.Metadata) {
        // No tracks found, check album-level completion
        const albumInfo = await this.makeRequestWithAuthRetry(`/library/metadata/${bookId}`);
        if (albumInfo.MediaContainer?.Metadata?.[0]) {
          const album = albumInfo.MediaContainer.Metadata[0];
          if (album.viewedAt || (album.viewCount && album.viewCount > 0)) {
            console.log(`Album "${album.title}" marked as watched/completed at album level (no tracks)`);
            return 100;
          }
        }
        return 0;
      }

      // Calculate total progress from all tracks
      let totalProgress = 0;
      let totalTracks = 0;
      let completedTracks = 0;
      let tracksWithProgress = 0;

      for (const track of albumData.MediaContainer.Metadata) {
        if (track.type === 'track' || track.type === '10') {
          totalTracks++;
          
          // Check if track has been marked as watched (completed)
          if (track.viewedAt) {
            completedTracks++;
            totalProgress += 100; // Count as 100% complete
            tracksWithProgress++;
            console.log(`Track "${track.title}" marked as watched at ${track.viewedAt}`);
          } else if (track.viewOffset && track.duration) {
            // Calculate progress for this track based on playback position
            const trackProgress = (track.viewOffset / track.duration) * 100;
            totalProgress += trackProgress;
            tracksWithProgress++;
            console.log(`Track "${track.title}" progress: ${trackProgress.toFixed(1)}%`);
          }
        }
      }

      // If we have track-level progress data, use it (even if album has viewedAt)
      if (tracksWithProgress > 0) {
        // If all tracks are completed, return 100%
        if (completedTracks === totalTracks && totalTracks > 0) {
          console.log(`All ${totalTracks} tracks completed - returning 100%`);
          return 100;
        }

        // Return average progress across all tracks
        const averageProgress = totalTracks > 0 ? Math.round(totalProgress / totalTracks) : 0;
        console.log(`Book progress: ${averageProgress}% (${completedTracks}/${totalTracks} tracks completed)`);
        return averageProgress;
      }

      // No track-level progress found, check album-level completion as fallback
      const albumInfo = await this.makeRequestWithAuthRetry(`/library/metadata/${bookId}`);
      if (albumInfo.MediaContainer?.Metadata?.[0]) {
        const album = albumInfo.MediaContainer.Metadata[0];
        
        // Check if album is marked as watched/completed at the album level
        if (album.viewedAt || (album.viewCount && album.viewCount > 0)) {
          console.log(`Album "${album.title}" marked as watched/completed at album level (no track progress)`);
          return 100;
        }
      }

      return 0;
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
