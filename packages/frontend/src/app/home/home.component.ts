import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NavbarComponent } from '../../shared/navbar/navbar.component';
import { RiotApiService } from '../services/riot-api.service';

@Component({
  selector: 'app-home',
  imports: [CommonModule, FormsModule, NavbarComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent {
  summonerName: string = '';
  tagLine: string = '';
  region: string = 'EUW';
  
  isLoading: boolean = false;
  error: string = '';
  loadingMessage: string = '';

  regions = [
    { code: 'EUW', name: 'Europe West' },
    { code: 'EUNE', name: 'Europe Nordic & East' },
    { code: 'NA', name: 'North America' },
    { code: 'KR', name: 'Korea' },
    { code: 'BR', name: 'Brazil' },
    { code: 'JP', name: 'Japan' },
    { code: 'LAN', name: 'Latin America North' },
    { code: 'LAS', name: 'Latin America South' },
    { code: 'OCE', name: 'Oceania' },
    { code: 'TR', name: 'Turkey' }
  ];

  constructor(
    private riotApiService: RiotApiService,
    private router: Router
  ) {}

  onSubmit() {
    // Validate inputs
    if (!this.summonerName.trim() || !this.tagLine.trim()) {
      this.error = 'Please enter both summoner name and tagline';
      return;
    }

    this.isLoading = true;
    this.error = '';
    this.loadingMessage = 'Starting search...';

    this.riotApiService.fetchPlayerData({
      gameName: this.summonerName.trim(),
      tagLine: this.tagLine.trim(),
      region: this.region,
      limit: 50
    }).subscribe({
      next: ({ status, summary }) => {
        if (status.status === 'running') {
          this.loadingMessage = `Fetching match data... (${status.progress.limit} matches)`;
        } else if (status.status === 'complete' && summary) {
          this.loadingMessage = 'Complete! Loading profile...';
          // Navigate to results page with the data
          this.router.navigate(['/profile'], {
            state: { summary }
          });
        } else if (status.status === 'error') {
          this.isLoading = false;
          this.error = status.error || 'An error occurred while fetching data';
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.error = 'Failed to connect to the server. Please try again.';
        console.error('Error:', err);
      }
    });
  }
}

