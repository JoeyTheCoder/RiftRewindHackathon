import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SummonerService } from '../app/services/summoner.service';

@Component({
  selector: 'app-home',
  imports: [FormsModule, CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  gameName: string = '';
  tagLine: string = '';
  selectedRegion: string = 'na1';
  isLoading: boolean = false;
  errorMessage: string = '';

  constructor(
    private router: Router,
    private summonerService: SummonerService
  ) {}

  regions = [
    { code: 'na1', name: 'North America', flag: '🇺🇸' },
    { code: 'euw1', name: 'Europe West', flag: '🇪🇺' },
    { code: 'eun1', name: 'Europe Nordic & East', flag: '🇪🇺' },
    { code: 'kr', name: 'Korea', flag: '🇰🇷' },
    { code: 'jp1', name: 'Japan', flag: '🇯🇵' },
    { code: 'br1', name: 'Brazil', flag: '🇧🇷' },
    { code: 'la1', name: 'Latin America North', flag: '🌎' },
    { code: 'la2', name: 'Latin America South', flag: '🌎' },
    { code: 'oc1', name: 'Oceania', flag: '🇦🇺' },
    { code: 'tr1', name: 'Turkey', flag: '🇹🇷' },
    { code: 'ru', name: 'Russia', flag: '🇷🇺' },
    { code: 'ph2', name: 'Philippines', flag: '🇵🇭' },
    { code: 'sg2', name: 'Singapore', flag: '🇸🇬' },
    { code: 'th2', name: 'Thailand', flag: '🇹🇭' },
    { code: 'tw2', name: 'Taiwan', flag: '🇹🇼' },
    { code: 'vn2', name: 'Vietnam', flag: '🇻🇳' }
  ];

  getSelectedRegionFlag(): string {
    const region = this.regions.find(r => r.code === this.selectedRegion);
    return region ? region.flag : '🌍';
  }

  getSelectedRegionName(): string {
    const region = this.regions.find(r => r.code === this.selectedRegion);
    return region ? region.name : 'Unknown Region';
  }

  onLookupSummoner() {
    if (!this.gameName.trim() || !this.tagLine.trim()) {
      this.errorMessage = 'Both game name and tag are required';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.summonerService.searchSummoner(this.selectedRegion, this.gameName.trim(), this.tagLine.trim())
      .subscribe({
        next: (response) => {
          this.isLoading = false;
          // Navigate to summoner profile page with the summoner data
          this.router.navigate(['/summoner', this.selectedRegion, this.gameName.trim(), this.tagLine.trim()], {
            state: { summonerData: response.data }
          });
        },
        error: (error) => {
          this.isLoading = false;
          this.errorMessage = error;
        }
      });
  }
}
