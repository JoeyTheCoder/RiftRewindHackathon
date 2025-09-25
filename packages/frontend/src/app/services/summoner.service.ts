import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface RankedInfo {
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface ChampionMastery {
  championId: number;
  championLevel: number;
  championPoints: number;
  lastPlayTime: number;
}

export interface RecentMatch {
  matchId: string;
  gameCreation: number;
  gameDuration: number;
  gameMode: string;
  win: boolean;
  championId: number;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  totalDamageDealtToChampions: number;
  visionScore: number;
  cs: number;
  gold: number;
  teamPosition: string;
}

export interface RecentPerformance {
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  averageKDA: number;
  averageKills: number;
  averageDeaths: number;
  averageAssists: number;
}

export interface SummonerData {
  id: string;
  accountId: string;
  puuid: string;
  name: string;
  profileIconId: number;
  revisionDate: number;
  summonerLevel: number;
  region: string;
  gameName: string;
  tagLine: string;
  rankedInfo: RankedInfo | null;
  championMastery: ChampionMastery[];
  recentMatches: RecentMatch[];
  recentPerformance: RecentPerformance | null;
}

export interface SummonerResponse {
  success: boolean;
  data: SummonerData;
}

export interface ApiError {
  error: string;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class SummonerService {
  private readonly baseUrl = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  searchSummoner(region: string, gameName: string, tagLine: string): Observable<SummonerResponse> {
    const url = `${this.baseUrl}/summoner/${region}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    
    return this.http.get<SummonerResponse>(url).pipe(
      catchError(this.handleError)
    );
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An unknown error occurred';
    
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Error: ${error.error.message}`;
    } else {
      // Server-side error
      if (error.status === 404) {
        errorMessage = error.error?.message || 'Summoner not found';
      } else if (error.status === 429) {
        errorMessage = 'Rate limit exceeded. Please try again later.';
      } else if (error.status === 403) {
        errorMessage = 'API key invalid or expired';
      } else if (error.status === 400) {
        errorMessage = error.error?.message || 'Invalid request';
      } else if (error.status === 0) {
        errorMessage = 'Cannot connect to server. Make sure the backend is running.';
      } else {
        errorMessage = error.error?.message || 'Server error occurred';
      }
    }
    
    return throwError(() => errorMessage);
  }

  // Helper method to get profile icon URL
  getProfileIconUrl(iconId: number): string {
    return `https://ddragon.leagueoflegends.com/cdn/14.1.1/img/profileicon/${iconId}.png`;
  }
}
