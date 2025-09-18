import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-summoner-profile',
  imports: [CommonModule],
  templateUrl: './summoner-profile.component.html',
  styleUrl: './summoner-profile.component.css'
})
export class SummonerProfileComponent implements OnInit {
  summonerName: string = '';
  region: string = '';

  constructor(private route: ActivatedRoute) {}

  ngOnInit() {
    // Get route parameters
    this.route.params.subscribe(params => {
      this.summonerName = params['name'] || '';
      this.region = params['region'] || '';
    });
  }
}
