import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { Observable, interval, switchMap, takeWhile, map } from 'rxjs';

export interface StartJobRequest {
  gameName: string;
  tagLine: string;
  region: string;
  limit?: number;
}

export interface StartJobResponse {
  jobId: string;
  cached?: boolean;
}

export interface JobStatusResponse {
  status: 'queued' | 'running' | 'complete' | 'error';
  progress?: number;  // 0-100 percentage
  progressMessage?: string;  // e.g. "Fetching matches: 25/50"
  gameName?: string;
  tagLine?: string;
  region?: string;
  limit?: number;
  resultPath?: string;
  result?: any;
  error?: string;
}

export interface PlayerSummary {
  riotId: {
    gameName: string;
    tagLine: string;
  };
  region: string;
  puuid: string;
  profile: {
    profileIconId: number;
    summonerLevel: number;
    rank?: any;
    recentWinrate: {
      matches: number;
      wins: number;
    };
  };
  topChampions: Array<{
    champion: string;
    games: number;
    wins: number;
  }>;
  roles: Array<{
    teamPosition: string;
    games: number;
  }>;
  frequentTeammates: Array<{
    puuid: string;
    summonerName: string;
    tagLine: string;
    gamesTogether: number;
    winsTogether: number;
    lastPlayedAt: number;
    topRolePairs: string[][];
    topChampionPairs: string[][];
  }>;
  meta: {
    queueFilter: number[];
    sampleSize: number;
    generatedAt: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class RiotApiService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Start a new job to fetch player data
   */
  startJob(request: StartJobRequest): Observable<StartJobResponse> {
    return this.http.post<StartJobResponse>(`${this.apiUrl}/start`, request);
  }

  /**
   * Get job status
   */
  getJobStatus(jobId: string): Observable<JobStatusResponse> {
    return this.http.get<JobStatusResponse>(`${this.apiUrl}/status/${jobId}`);
  }

  /**
   * Get player summary result
   */
  getResult(jobId: string): Observable<PlayerSummary> {
    return this.http.get<PlayerSummary>(`${this.apiUrl}/result/${jobId}`);
  }

  /**
   * Poll job status until complete or error
   * Returns the final status response
   */
  pollJobUntilComplete(jobId: string, pollIntervalMs: number = 2000): Observable<JobStatusResponse> {
    return interval(pollIntervalMs).pipe(
      switchMap(() => this.getJobStatus(jobId)),
      takeWhile((status) => 
        status.status === 'queued' || status.status === 'running',
        true // inclusive - emit the final value
      )
    );
  }

  /**
   * Start job and wait for completion, then return result
   * This is a convenience method that combines start + poll + get result
   */
  fetchPlayerData(request: StartJobRequest): Observable<{ 
    status: JobStatusResponse, 
    summary?: PlayerSummary 
  }> {
    return this.startJob(request).pipe(
      switchMap(({ jobId, cached }) => {
        // If cached, skip polling and directly fetch result
        if (cached) {
          console.log('✅ Using cached data, fetching result directly...');
          return this.getResult(jobId).pipe(
            map(summary => ({ 
              status: { 
                status: 'complete' as const,
                progress: 100,
                progressMessage: 'Complete',
                gameName: request.gameName,
                tagLine: request.tagLine,
                region: request.region,
                limit: request.limit || 50,
                resultPath: `/api/result/${jobId}`
              }, 
              summary 
            }))
          );
        }
        
        // Otherwise, poll until complete
        return this.pollJobUntilComplete(jobId).pipe(
          switchMap((status) => {
            if (status.status === 'complete') {
              return this.getResult(jobId).pipe(
                map(summary => ({ status, summary }))
              );
            }
            return [{ status }];
          })
        );
      })
    );
  }

  /**
   * Fetch duo summary for two players
   */
  async fetchDuoSummary(puuidA: string, puuidB: string, region: string): Promise<any> {
    try {
      const url = `${this.apiUrl}/duo/${puuidA}/${puuidB}?region=${region}`;
      console.log('🔍 Fetching duo summary from:', url);
      
      const response = await fetch(url);
      console.log('📡 Response status:', response.status, response.statusText);
      
      // Check content type before parsing
      const contentType = response.headers.get('content-type');
      console.log('📋 Content-Type:', contentType);
      
      if (!response.ok) {
        // Try to parse as JSON, but fallback to text if it's HTML
        let errorMessage = 'Failed to fetch duo summary';
        if (contentType && contentType.includes('application/json')) {
          const error = await response.json();
          errorMessage = error.message || errorMessage;
        } else {
          const text = await response.text();
          console.error('❌ Non-JSON response:', text.substring(0, 200));
          errorMessage = `Server returned ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      return await response.json();
    } catch (error: any) {
      console.error('❌ Error fetching duo summary:', error);
      throw error;
    }
  }

  /**
   * Fetch AI insights for duo analysis
   */
  fetchDuoAIInsights(params: { puuidA: string; puuidB: string; region: string }): Observable<{ text: string }> {
    return this.http.post<{ text: string }>(`${this.apiUrl}/duo/ai`, params);
  }

  /**
   * Fetch AI insights for a player based on their job ID
   */
  fetchPlayerAIInsights(jobId: string): Observable<{ text: string }> {
    return this.http.post<{ text: string }>(`${this.apiUrl}/player/ai`, { jobId });
  }
}

