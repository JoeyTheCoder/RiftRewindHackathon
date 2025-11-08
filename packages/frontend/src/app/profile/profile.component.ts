import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { RiotApiService } from '../services/riot-api.service';
import { NavbarComponent } from '../../shared/navbar/navbar.component';
import { PlayerSummary } from '../services/riot-api.service';

@Component({
  selector: 'app-profile',
  imports: [CommonModule, NavbarComponent],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css'
})
export class ProfileComponent implements OnInit {
  summary: PlayerSummary | null = null;
  selectedTeammate: any = null;
  duoSummary: any = null;
  loadingDuo: boolean = false;
  duoError: string = '';
  
  // AI Insights state
  playerAIInsights: string = '';
  loadingPlayerAI: boolean = false;
  playerAIError: string = '';
  
  duoAIInsights: string = '';
  loadingDuoAI: boolean = false;
  duoAIError: string = '';
  
  jobId: string = '';

  constructor(
    private router: Router,
    private riotApiService: RiotApiService
  ) {
    // Get data from navigation state
    const navigation = this.router.getCurrentNavigation();
    if (navigation?.extras.state) {
      this.summary = navigation.extras.state['summary'];
      this.jobId = navigation.extras.state['jobId'] || '';
    }
  }

  ngOnInit() {
    // Redirect to home if no data
    if (!this.summary) {
      this.router.navigate(['/']);
      return;
    }
    
    // Auto-generate AI insights when profile loads
    if (this.jobId) {
      this.generatePlayerInsights();
    }
  }

  getWinRate(): number {
    if (!this.summary) return 0;
    const { wins, matches } = this.summary.profile.recentWinrate;
    return matches > 0 ? Math.round((wins / matches) * 100) : 0;
  }

  getChampionWinRate(champion: any): number {
    return champion.games > 0 ? Math.round((champion.wins / champion.games) * 100) : 0;
  }

  getTeammateWinRate(teammate: any): number {
    return teammate.gamesTogether > 0 
      ? Math.round((teammate.winsTogether / teammate.gamesTogether) * 100) 
      : 0;
  }

  formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  }

  getRoleIconUrl(role: string): string {
    // Using Riot's official position icons from Data Dragon
    const positions: { [key: string]: string } = {
      'TOP': 'Top',
      'JUNGLE': 'Jungle',
      'MIDDLE': 'Middle',
      'BOTTOM': 'Bottom',
      'UTILITY': 'Utility',
      'SUPPORT': 'Utility',
      'UNKNOWN': 'Fill'
    };
    const positionName = positions[role] || 'Fill';
    return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-champ-select/global/default/svg/position-${positionName.toLowerCase()}.svg`;
  }

  getRoleName(role: string): string {
    const names: { [key: string]: string } = {
      'TOP': 'Top',
      'JUNGLE': 'Jungle',
      'MIDDLE': 'Mid',
      'BOTTOM': 'ADC',
      'UTILITY': 'Support',
      'SUPPORT': 'Support',
      'UNKNOWN': 'Unknown'
    };
    return names[role] || role;
  }

  getProfileIconUrl(iconId: number): string {
    // Using the latest patch - you might want to make this dynamic
    return `https://ddragon.leagueoflegends.com/cdn/14.23.1/img/profileicon/${iconId}.png`;
  }

  getChampionIconUrl(championName: string): string {
    // Riot's Data Dragon champion images
    // Note: Some champion names need special handling (spaces, apostrophes, etc.)
    const formattedName = championName.replace(/[^a-zA-Z]/g, '');
    return `https://ddragon.leagueoflegends.com/cdn/14.23.1/img/champion/${formattedName}.png`;
  }

  async selectTeammate(teammate: any) {
    console.log('🎯 Selecting teammate:', teammate);
    console.log('👤 Player PUUID:', this.summary!.puuid);
    console.log('🤝 Teammate PUUID:', teammate.puuid);
    console.log('🌍 Region:', this.summary!.region);
    
    this.selectedTeammate = teammate;
    this.duoSummary = null;
    this.duoError = '';
    this.loadingDuo = true;

    try {
      this.duoSummary = await this.riotApiService.fetchDuoSummary(
        this.summary!.puuid,
        teammate.puuid,
        this.summary!.region
      );
      console.log('✅ Duo summary loaded:', this.duoSummary);
      
      // Auto-generate AI insights after duo summary loads
      this.generateDuoInsights();
    } catch (error: any) {
      this.duoError = error.message || 'Failed to load duo summary';
      console.error('❌ Error loading duo summary:', error);
    } finally {
      this.loadingDuo = false;
    }
  }

  clearTeammate() {
    this.selectedTeammate = null;
    this.duoSummary = null;
    this.duoError = '';
    this.duoAIInsights = '';
    this.duoAIError = '';
  }

  generatePlayerInsights() {
    if (!this.summary || !this.jobId) {
      this.playerAIError = 'Missing job ID. Please search for the player again.';
      return;
    }

    this.loadingPlayerAI = true;
    this.playerAIError = '';
    this.playerAIInsights = '';

    this.riotApiService.fetchPlayerAIInsights(this.jobId).subscribe({
      next: (response) => {
        this.playerAIInsights = response.text;
        this.loadingPlayerAI = false;
        console.log('✅ Player AI insights loaded');
      },
      error: (error) => {
        this.playerAIError = error.error?.message || error.message || 'Failed to generate AI insights';
        this.loadingPlayerAI = false;
        console.error('❌ Error generating player AI insights:', error);
      }
    });
  }

  generateDuoInsights() {
    if (!this.summary || !this.selectedTeammate) {
      this.duoAIError = 'Missing duo information';
      return;
    }

    this.loadingDuoAI = true;
    this.duoAIError = '';
    this.duoAIInsights = '';

    this.riotApiService.fetchDuoAIInsights({
      puuidA: this.summary.puuid,
      puuidB: this.selectedTeammate.puuid,
      region: this.summary.region
    }).subscribe({
      next: (response) => {
        this.duoAIInsights = response.text;
        this.loadingDuoAI = false;
        console.log('✅ Duo AI insights loaded');
      },
      error: (error) => {
        this.duoAIError = error.error?.message || error.message || 'Failed to generate AI insights';
        this.loadingDuoAI = false;
        console.error('❌ Error generating duo AI insights:', error);
      }
    });
  }

  getDuoWinRate(): number {
    if (!this.duoSummary || this.duoSummary.sampleSize === 0) return 0;
    return Math.round((this.duoSummary.wins / this.duoSummary.sampleSize) * 100);
  }

  getQueueName(queueId: number): string {
    return queueId === 420 ? 'Ranked Solo/Duo' : 'Ranked Flex';
  }

  // Helper for template to access Object.keys
  Object = Object;
  Math = Math;
}

