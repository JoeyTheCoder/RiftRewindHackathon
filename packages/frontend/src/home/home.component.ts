import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [FormsModule, CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  summonerName: string = '';
  selectedRegion: string = 'na1';

  constructor(private router: Router) {}

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
    if (this.summonerName.trim()) {
      // Navigate to summoner profile page with region and name as route parameters
      this.router.navigate(['/summoner', this.selectedRegion, this.summonerName.trim()]);
    }
  }
}
