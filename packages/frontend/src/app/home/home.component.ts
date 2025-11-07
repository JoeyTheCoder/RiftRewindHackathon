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
  currentJobId: string = '';
  progress: number = 0;  // 0-100 percentage

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
    this.currentJobId = '';
    this.progress = 0;

    // First start the job to get the jobId
    this.riotApiService.startJob({
      gameName: this.summonerName.trim(),
      tagLine: this.tagLine.trim(),
      region: this.region,
      limit: 50  // Fetch 50 matches with parallel requests for comprehensive stats
    }).subscribe({
      next: ({ jobId, cached }) => {
        this.currentJobId = jobId;
        console.log('Job started with ID:', jobId, cached ? '(cached)' : '(new)');
        
        // Now poll for the result
        if (cached) {
          this.loadingMessage = 'Loading cached data...';
        } else {
          this.loadingMessage = 'Fetching match data...';
        }
        
        this.riotApiService.pollJobUntilComplete(jobId).subscribe({
          next: (status) => {
            console.log('Job status:', status.status, 'Progress:', status.progress);
            
            // Update progress bar
            if (status.progress !== undefined) {
              this.progress = status.progress;
            }
            if (status.progressMessage) {
              this.loadingMessage = status.progressMessage;
            }
            
            if (status.status === 'running') {
              if (!status.progressMessage) {
                this.loadingMessage = `Fetching match data... (${status.limit || 50} matches)`;
              }
            } else if (status.status === 'complete') {
              this.loadingMessage = 'Complete! Loading profile...';
              // Fetch the result
              this.riotApiService.getResult(jobId).subscribe({
                next: (summary) => {
                  // Navigate to results page with the data
                  this.router.navigate(['/profile'], {
                    state: { summary, jobId }
                  });
                },
                error: (err) => {
                  this.isLoading = false;
                  this.error = 'Failed to load player data. Please try again.';
                  console.error('Error fetching result:', err);
                }
              });
            } else if (status.status === 'error') {
              this.isLoading = false;
              this.error = status.error || 'An error occurred while fetching data';
            }
          },
          error: (err) => {
            this.isLoading = false;
            this.error = 'Failed to connect to the server. Please try again.';
            console.error('Error polling:', err);
          }
        });
      },
      error: (err) => {
        this.isLoading = false;
        this.error = 'Failed to start job. Please try again.';
        console.error('Error starting job:', err);
      }
    });
  }
}

