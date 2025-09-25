import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SummonerService, SummonerData } from '../services/summoner.service';

@Component({
  selector: 'app-summoner-profile',
  imports: [CommonModule],
  templateUrl: './summoner-profile.component.html',
  styleUrl: './summoner-profile.component.css'
})
export class SummonerProfileComponent implements OnInit {
  summonerData: SummonerData | null = null;
  isLoading: boolean = false;
  errorMessage: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private summonerService: SummonerService
  ) {}

  ngOnInit() {
    // Check if summoner data was passed via navigation state
    const navigation = this.router.getCurrentNavigation();
    if (navigation?.extras.state?.['summonerData']) {
      this.summonerData = navigation.extras.state['summonerData'];
    } else {
      // Fallback: fetch data using route parameters
      this.route.params.subscribe(params => {
        const region = params['region'];
        const gameName = params['gameName'];
        const tagLine = params['tagLine'];
        if (region && gameName && tagLine) {
          this.fetchSummonerData(region, gameName, tagLine);
        }
      });
    }
  }

  private fetchSummonerData(region: string, gameName: string, tagLine: string) {
    this.isLoading = true;
    this.errorMessage = '';

    this.summonerService.searchSummoner(region, gameName, tagLine)
      .subscribe({
        next: (response) => {
          this.isLoading = false;
          this.summonerData = response.data;
        },
        error: (error) => {
          this.isLoading = false;
          this.errorMessage = error;
        }
      });
  }

  // Getter properties for template compatibility
  get summonerName(): string {
    return this.summonerData?.name || '';
  }

  get region(): string {
    return this.summonerData?.region || '';
  }

  getProfileIconUrl(): string {
    if (!this.summonerData) return '';
    return this.summonerService.getProfileIconUrl(this.summonerData.profileIconId);
  }

  goBack() {
    this.router.navigate(['/']);
  }
}
