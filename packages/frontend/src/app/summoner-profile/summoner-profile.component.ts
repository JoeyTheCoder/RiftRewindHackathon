import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SummonerService, SummonerData, DuoPartnersData } from '../services/summoner.service';
import { forkJoin, of } from 'rxjs';
import { delay, mergeMap, catchError } from 'rxjs/operators';

@Component({
  selector: 'app-summoner-profile',
  imports: [CommonModule],
  templateUrl: './summoner-profile.component.html',
  styleUrl: './summoner-profile.component.css'
})
export class SummonerProfileComponent implements OnInit {
  summonerData: SummonerData | null = null;
  duoPartners: DuoPartnersData | null = null;
  isLoading: boolean = false;
  isLoadingPartners: boolean = false;
  errorMessage: string = '';
  partnersErrorMessage: string = '';

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
      // Fetch duo partners for this summoner
      if (this.summonerData) {
        this.fetchDuoPartners(this.summonerData.region, this.summonerData.gameName, this.summonerData.tagLine);
      }
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
          // After fetching summoner data, fetch duo partners
          this.fetchDuoPartners(region, gameName, tagLine);
        },
        error: (error) => {
          this.isLoading = false;
          this.errorMessage = error;
        }
      });
  }

  private fetchDuoPartners(region: string, gameName: string, tagLine: string) {
    this.isLoadingPartners = true;
    this.partnersErrorMessage = '';

    this.summonerService.getDuoPartners(region, gameName, tagLine)
      .subscribe({
        next: (response) => {
          this.duoPartners = response.data;
          
          // Fetch names for each partner with rate limiting
          if (this.duoPartners.partners.length > 0) {
            // Fetch partner names sequentially with small delays to avoid rate limits
            this.fetchPartnerNamesSequentially(region, this.duoPartners.partners);
          } else {
            this.isLoadingPartners = false;
          }
        },
        error: (error) => {
          this.isLoadingPartners = false;
          this.partnersErrorMessage = error;
        }
      });
  }

  private fetchPartnerNamesSequentially(region: string, partners: any[]) {
    let index = 0;
    
    const fetchNext = () => {
      if (index >= partners.length) {
        this.isLoadingPartners = false;
        return;
      }

      const partner = partners[index];
      this.summonerService.getAccountByPuuid(region, partner.puuid)
        .pipe(
          catchError(error => {
            console.warn(`Failed to fetch name for partner ${index + 1}:`, error);
            return of(null);
          })
        )
        .subscribe(response => {
          if (response?.data) {
            partner.gameName = response.data.gameName;
            partner.tagLine = response.data.tagLine;
          }
          
          index++;
          // Increased delay to respect rate limits (200ms between each name fetch)
          setTimeout(() => fetchNext(), 200);
        });
    };

    fetchNext();
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
